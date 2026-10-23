// The harness's own reader of the system now-playing service, independent of
// the island's adapter: the far side for IINA (BUILD-PLAN acceptance bars).
// Loaded by the Apple-signed /usr/bin/perl (the service refuses third-party
// clients since macOS 15.4); one call prints one JSON object and returns.
#import <AppKit/AppKit.h>
#include <dlfcn.h>

__attribute__((visibility("default"))) void harness_now_playing_dump(void) {
  void *mr = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW);
  void (*info)(dispatch_queue_t, void (^)(NSDictionary *)) = dlsym(mr, "MRMediaRemoteGetNowPlayingInfo");
  void (*pid)(dispatch_queue_t, void (^)(int)) = dlsym(mr, "MRMediaRemoteGetNowPlayingApplicationPID");
  void (*playing)(dispatch_queue_t, void (^)(BOOL)) = dlsym(mr, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
  if (!info || !pid || !playing) { printf("{\"error\":\"MediaRemote unavailable\"}\n"); return; }
  dispatch_queue_t q = dispatch_queue_create("reader", DISPATCH_QUEUE_SERIAL);
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  NSMutableDictionary *out = [NSMutableDictionary dictionary];
  pid(q, ^(int p) { out[@"pid"] = @(p); dispatch_semaphore_signal(done); });
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
  playing(q, ^(BOOL b) { out[@"playing"] = @(b); dispatch_semaphore_signal(done); });
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
  info(q, ^(NSDictionary *d) {
    NSString *title = d[@"kMRMediaRemoteNowPlayingInfoTitle"];
    if (title) out[@"title"] = title;
    NSNumber *duration = d[@"kMRMediaRemoteNowPlayingInfoDuration"];
    if (duration) out[@"duration"] = duration;
    NSNumber *elapsed = d[@"kMRMediaRemoteNowPlayingInfoElapsedTime"];
    NSNumber *rate = d[@"kMRMediaRemoteNowPlayingInfoPlaybackRate"];
    NSDate *stamp = d[@"kMRMediaRemoteNowPlayingInfoTimestamp"];
    if (elapsed) {
      double now = elapsed.doubleValue;
      if (stamp && rate) now += rate.doubleValue * [[NSDate date] timeIntervalSinceDate:stamp];
      out[@"elapsed"] = @(now);
    }
    if (rate) out[@"rate"] = rate;
    dispatch_semaphore_signal(done);
  });
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
  NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:[out[@"pid"] intValue]];
  if (app.bundleIdentifier) out[@"bundleID"] = app.bundleIdentifier;
  NSData *json = [NSJSONSerialization dataWithJSONObject:out options:0 error:nil];
  fwrite(json.bytes, 1, json.length, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}
