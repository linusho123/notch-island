'use strict';
// The other players the island follows (D5), each read from its own far side:
// IINA through the system now-playing service, read by the harness's own
// reader (build/now-playing-reader.dylib, independent of the island's
// adapter); QuickTime Player through its AppleScript dictionary; Music playing
// a downloaded file through Music's. The tests play generated stand-in files
// only, made in build/test-media, never the visionary's own files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const harness = require('./harness');
const procs = require('./procs');
const music = require('./music');
const { root } = require('./paths');

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = path.join(root, 'build', 'test-media');
const READER = path.join(root, 'build', 'now-playing-reader.dylib');
const IINA_BINARY = '/Applications/IINA.app/Contents/MacOS/IINA';
const IINA_ID = 'com.colliderli.iina';
const QUICKTIME_ID = 'com.apple.QuickTimePlayerX';

async function until(pred, ms, message) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    last = await pred().catch((e) => { last = e; return null; });
    if (last) return last;
    if (Date.now() > end) throw new Error(message);
    await sleep(150);
  }
}

// ------------------------------------------------------------ the files

/**
 * A stand-in video file with a quiet tone, `seconds` long (mov inside), alone
 * in its own folder: IINA plays on into the other files of a folder, and a
 * stand-in must never lead it to another.
 */
async function movie(name, seconds) {
  const dir = path.join(MEDIA, `${name.replace(/[^\w.-]/g, '_')}-${seconds}s`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const tmp = path.join(MEDIA, `.making-${process.pid}-${name}.mov`);
    await harness.h('make-movie', tmp, seconds, 'sound');
    fs.renameSync(tmp, file);
  }
  return file;
}

/** An untagged, silent MPEG-1 Layer III file: 128 kbit/s, 44.1 kHz frames. */
function mp3(name, seconds) {
  fs.mkdirSync(path.join(MEDIA, 'music-files'), { recursive: true });
  const file = path.join(MEDIA, 'music-files', name);
  if (!fs.existsSync(file)) {
    const frame = Buffer.alloc(417);
    frame.writeUInt32BE(0xfffb9004, 0); // sync, MPEG-1 L3, 128k, 44.1 kHz, no padding, stereo
    const frames = Math.ceil((seconds * 44100) / 1152);
    fs.writeFileSync(file, Buffer.concat(Array(frames).fill(frame)));
  }
  return file;
}

/** An untagged wav file with a quiet tone. */
function wav(name, seconds) {
  fs.mkdirSync(path.join(MEDIA, 'music-files'), { recursive: true });
  const file = path.join(MEDIA, 'music-files', name);
  if (!fs.existsSync(file)) {
    const rate = 8000;
    const n = seconds * rate;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 120), 44 + i * 2);
    fs.writeFileSync(file, buf);
  }
  return file;
}

/** h:mm:ss or m:ss as seconds. */
function seconds(text) {
  return text.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
}

// ------------------------------------------- the system now-playing service

/** What the system now-playing service shows now, read by the harness's own reader. */
async function nowPlaying() {
  const script = 'use DynaLoader; my $l = DynaLoader::dl_load_file($ARGV[0], 0) or die DynaLoader::dl_error();'
    + ' DynaLoader::dl_install_xsub("main::d", DynaLoader::dl_find_symbol($l, "harness_now_playing_dump")); &main::d();';
  const { stdout } = await run('/usr/bin/perl', ['-e', script, READER], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(stdout.trim().split('\n').pop());
}

const running = (id) => {
  try {
    return execFileSync('osascript', ['-e', `tell application "System Events" to count (every process whose bundle identifier is "${id}")`],
      { encoding: 'utf8' }).trim() !== '0';
  } catch { return false; }
};

// ----------------------------------------------------------------- IINA

/** IINA's own entry for a file in its resume list (watch_later), by path. */
function iinaWatchLater(file) {
  const hash = crypto.createHash('md5').update(file).digest('hex').toUpperCase();
  return path.join(os.homedir(), 'Library', 'Application Support', 'com.colliderli.iina', 'watch_later', hash);
}

/** Forget where IINA itself left a test file, so only the island can resume it. */
function forgetIINAResume(file) {
  for (const f of [file, fs.realpathSync(file)]) fs.rmSync(iinaWatchLater(f), { force: true });
}

/**
 * IINA plays `file` from `at` seconds. IINA must not be running already: the
 * tests never touch the visionary's own IINA session.
 */
async function playInIINA(w, file, at = 0) {
  if (!w.iina) {
    if (running(IINA_ID)) throw new Error('IINA is already running; quit it before the tests so they never touch it');
    w.defer(async () => {
      await quitIINA(w).catch(() => {});
      for (const f of w.iinaFiles || []) forgetIINAResume(f);
    });
  }
  (w.iinaFiles ||= []).push(file);
  forgetIINAResume(file);
  w.iina = procs.start('IINA', IINA_BINARY, [`--mpv-start=${at}`, file]);
  const title = path.basename(file);
  await until(async () => {
    const np = await nowPlaying();
    return np.bundleID === IINA_ID && np.title === title && np.playing ? np : null;
  }, 20000, `IINA never showed "${title}" playing on the system now-playing service`);
}

/** The visionary quits IINA (its own Quit, the quit Apple event). */
async function quitIINA(w) {
  if (!running(IINA_ID)) return;
  await run('osascript', ['-e', 'tell application "IINA" to quit'], { timeout: 15000 }).catch(() => {});
  await until(async () => !running(IINA_ID), 10000, 'IINA did not quit').catch(async () => {
    if (w.iina) await procs.stop(w.iina);
  });
}

/** IINA's own state from the now-playing service, when IINA is the app it shows. */
async function iinaState() {
  const np = await nowPlaying();
  return np.bundleID === IINA_ID ? np : null;
}

// ------------------------------------------------------- QuickTime Player

const qt = (script) => run('osascript', ['-e', `tell application "QuickTime Player"\n${script}\nend tell`],
  { encoding: 'utf8', timeout: 20000 }).then((r) => r.stdout.trim());

/** QuickTime Player plays `file` from `at` seconds (QuickTime must be quit before). */
async function playInQuickTime(w, file, at = 0) {
  if (!w.quickTime) {
    if (running(QUICKTIME_ID)) throw new Error('QuickTime Player is already running; quit it before the tests');
    w.quickTime = true;
    w.defer(() => quitQuickTime().catch(() => {}));
  }
  const q = JSON.stringify(file);
  await qt(`set d to open (POSIX file ${q})\nset current time of d to ${at}\nplay d`);
  await until(async () => (await quickTimeState())?.playing, 10000, 'QuickTime Player did not play the file');
}

async function quickTimeState() {
  if (!running(QUICKTIME_ID)) return null;
  const out = await qt(`if (count of documents) is 0 then return ""
    set d to front document
    return (playing of d as string) & "|" & (current time of d as string) & "|" & (duration of d as string) & "|" & (name of d)`);
  if (!out) return null;
  const [playing, time, duration, name] = out.split('|');
  return { playing: playing === 'true', time: Number(time.replace(',', '.')), duration: Number(duration.replace(',', '.')), name };
}

async function quitQuickTime() {
  if (!running(QUICKTIME_ID)) return;
  await qt('close every document saving no\nquit').catch(() => {});
  await until(async () => !running(QUICKTIME_ID), 10000, 'QuickTime Player did not quit');
}

// ------------------------------------------------- Music playing a file

/**
 * Music plays a downloaded file, opened as the visionary's default app opens
 * it (D5: mp3 and wav open in Music). Music adds it to its library; the test
 * removes that track again (and only that track) when the scenario ends.
 */
async function playFileInMusic(w, file) {
  music.keepMusic();
  await run('open', ['-a', 'Music', file]);
  const base = path.basename(file);
  w.defer(() => removeFileTracks(base, fs.statSync(file).size));
  await until(async () => {
    const out = await music.osa(`tell application "Music"
      if player state is not playing then return ""
      try
        set l to location of current track
        return POSIX path of l
      end try
      return ""
    end tell`);
    return path.basename(out) === base;
  }, 15000, `Music did not play "${base}"`);
}

/**
 * Remove the library tracks that came from the stand-in file `base`, and the
 * copy Music made of it in its media folder (only a file of the stand-in's
 * own name and size).
 */
async function removeFileTracks(base, size) {
  const out = await music.osa(`tell application "Music"
    try
      stop
    end try
    set gone to ""
    repeat with t in (every file track of library playlist 1 whose name is ${JSON.stringify(base.replace(/\.[^.]+$/, ''))})
      try
        set l to location of t
        set loc to POSIX path of l
        if loc ends with ${JSON.stringify(`/${base}`)} then
          delete t
          set gone to gone & loc & linefeed
        end if
      end try
    end repeat
    return gone
  end tell`).catch(() => '');
  const media = path.join(os.homedir(), 'Music', 'Music', 'Media.localized');
  for (const loc of out.split('\n').filter(Boolean)) {
    if (loc.startsWith(media + path.sep) && path.basename(loc) === base && fs.existsSync(loc) && fs.statSync(loc).size === size) {
      fs.rmSync(loc);
    }
  }
}

module.exports = {
  movie, mp3, wav, seconds, nowPlaying, playInIINA, quitIINA, iinaState, forgetIINAResume,
  playInQuickTime, quickTimeState, quitQuickTime, playFileInMusic, removeFileTracks, until, running,
  IINA_ID, QUICKTIME_ID, MEDIA,
};
