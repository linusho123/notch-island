// notch-island's now-playing adapter: the IINA part's door into the system
// now-playing service. Since macOS 15.4 the service refuses third-party
// clients, so this library is loaded by the Apple-signed /usr/bin/perl (the
// approach of ungive's mediaremote-adapter) and talks to the island over
// stdin and stdout: one JSON line per change of the now-playing app or its
// info, and one command per input line ("play", "pause", "next", "previous",
// "seek <seconds>", "get"). It is event-driven: nothing runs on a timer.
#import <Foundation/Foundation.h>
#include <dlfcn.h>
#include <libproc.h>

typedef void (*MRGetInfo)(dispatch_queue_t, void (^)(NSDictionary *));
typedef void (*MRGetPid)(dispatch_queue_t, void (^)(int));
typedef void (*MRGetIsPlaying)(dispatch_queue_t, void (^)(BOOL));
typedef void (*MRRegister)(dispatch_queue_t);
typedef Boolean (*MRSendCommand)(int, NSDictionary *);
typedef void (*MRSetElapsed)(double);

static MRGetInfo getInfo;
static MRGetPid getPid;
static MRGetIsPlaying getIsPlaying;
static MRSendCommand sendCommand;
static MRSetElapsed setElapsed;
static dispatch_queue_t queue;

static id plain(id value) {
  if ([value isKindOfClass:[NSString class]] || [value isKindOfClass:[NSNumber class]]) return value;
  if ([value isKindOfClass:[NSDate class]]) return @([(NSDate *)value timeIntervalSince1970]);
  return nil;
}

static void emit(NSDictionary *message) {
  NSData *json = [NSJSONSerialization dataWithJSONObject:message options:0 error:nil];
  if (!json) return;
  @synchronized([NSFileHandle class]) {
    fwrite(json.bytes, 1, json.length, stdout);
    fputc('\n', stdout);
    fflush(stdout);
  }
}

/// Read the now-playing info and then its app, and write them as one line.
/// The info is read first: should the app change in between, the line names
/// the new app with the old info, and the island, seeing another app, gives
/// the old one no face, rather than giving the old app the new app's song.
static void report(void) {
  getInfo(queue, ^(NSDictionary *info) {
    getPid(queue, ^(int pid) {
      getIsPlaying(queue, ^(BOOL playing) {
        NSMutableDictionary *out = [NSMutableDictionary dictionary];
        out[@"type"] = @"nowPlaying";
        out[@"pid"] = @(pid);
        char path[PROC_PIDPATHINFO_MAXSIZE] = {0};
        if (pid > 0 && proc_pidpath(pid, path, sizeof(path)) > 0) out[@"path"] = @(path);
        out[@"playing"] = @(playing);
        out[@"now"] = @([[NSDate date] timeIntervalSince1970]);
        NSDictionary *keys = @{
          @"kMRMediaRemoteNowPlayingInfoTitle" : @"title",
          @"kMRMediaRemoteNowPlayingInfoArtist" : @"artist",
          @"kMRMediaRemoteNowPlayingInfoAlbum" : @"album",
          @"kMRMediaRemoteNowPlayingInfoDuration" : @"duration",
          @"kMRMediaRemoteNowPlayingInfoElapsedTime" : @"elapsed",
          @"kMRMediaRemoteNowPlayingInfoPlaybackRate" : @"rate",
          @"kMRMediaRemoteNowPlayingInfoTimestamp" : @"timestamp",
        };
        for (NSString *key in keys) {
          id value = plain(info[key]);
          if (value) out[keys[key]] = value;
        }
        emit(out);
      });
    });
  });
}

static void observe(NSString *symbol) {
  void *handle = dlopen(NULL, RTLD_NOW);
  CFStringRef *name = (CFStringRef *)dlsym(handle, symbol.UTF8String);
  if (!name) return;
  [[NSNotificationCenter defaultCenter] addObserverForName:(__bridge NSString *)*name
                                                    object:nil
                                                     queue:nil
                                                usingBlock:^(NSNotification *note) { report(); }];
}

static void readCommands(void) {
  dispatch_async(dispatch_get_global_queue(0, 0), ^{
    char line[256];
    while (fgets(line, sizeof(line), stdin)) {
      NSString *command = [[NSString stringWithUTF8String:line]
          stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
      // MRMediaRemoteCommand: play 0, pause 1, toggle 2, stop 3, next 4, previous 5.
      if ([command isEqualToString:@"play"]) sendCommand(0, nil);
      else if ([command isEqualToString:@"pause"]) sendCommand(1, nil);
      else if ([command isEqualToString:@"next"]) sendCommand(4, nil);
      else if ([command isEqualToString:@"previous"]) sendCommand(5, nil);
      else if ([command hasPrefix:@"seek "]) setElapsed([[command substringFromIndex:5] doubleValue]);
      else if ([command isEqualToString:@"get"]) report();
    }
    exit(0);  // the island closed the pipe: it is gone
  });
}

/// The entry point perl calls; it never returns.
__attribute__((visibility("default"))) void notch_island_now_playing_run(void) {
  void *mr = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW);
  if (!mr) {
    emit(@{@"type" : @"error", @"message" : @"MediaRemote could not be loaded"});
    exit(2);
  }
  getInfo = (MRGetInfo)dlsym(mr, "MRMediaRemoteGetNowPlayingInfo");
  getPid = (MRGetPid)dlsym(mr, "MRMediaRemoteGetNowPlayingApplicationPID");
  getIsPlaying = (MRGetIsPlaying)dlsym(mr, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
  sendCommand = (MRSendCommand)dlsym(mr, "MRMediaRemoteSendCommand");
  setElapsed = (MRSetElapsed)dlsym(mr, "MRMediaRemoteSetElapsedTime");
  MRRegister registerFor = (MRRegister)dlsym(mr, "MRMediaRemoteRegisterForNowPlayingNotifications");
  if (!getInfo || !getPid || !getIsPlaying || !sendCommand || !setElapsed || !registerFor) {
    emit(@{@"type" : @"error", @"message" : @"MediaRemote lacks a function the adapter needs"});
    exit(2);
  }
  queue = dispatch_queue_create("notch-island.now-playing", DISPATCH_QUEUE_SERIAL);
  registerFor(queue);
  observe(@"kMRMediaRemoteNowPlayingInfoDidChangeNotification");
  observe(@"kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification");
  observe(@"kMRMediaRemoteNowPlayingApplicationDidChangeNotification");
  observe(@"kMRMediaRemoteNowPlayingApplicationClientStateDidChange");
  readCommands();
  report();
  CFRunLoopRun();
}
