'use strict';
// Apple Music, read and driven through its own AppleScript dictionary. The
// tests play stand-in tracks only: generated, near-silent tones tagged as
// three Oasis songs, in a test playlist ("notch-island test") whose tracks
// carry the album "notch-island test". Nothing else in the library is touched.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { testAudio } = require('./paths');

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLAYLIST = 'notch-island test';
const ALBUM = 'notch-island test';
// In queue order: back from Wonderwall reaches the first, skip the third.
const TRACKS = [
  { title: "Don't Look Back in Anger", file: 'dont-look-back-in-anger.m4a', seconds: 300, hz: 196 },
  { title: 'Wonderwall', file: 'wonderwall.m4a', seconds: 300, hz: 220 },
  { title: 'Champagne Supernova', file: 'champagne-supernova.m4a', seconds: 300, hz: 247 },
];

async function osa(script) {
  const { stdout } = await run('osascript', ['-e', script], { encoding: 'utf8', timeout: 30000 });
  return stdout.trim();
}

const q = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** What Music itself says it is doing. */
async function state() {
  const out = await osa(`tell application "Music"
    set ps to player state as string
    if ps is "stopped" then return ps
    try
      set t to current track
    on error
      return "changing"
    end try
    return ps & "\\n" & (name of t) & "\\n" & (artist of t) & "\\n" & (player position as string) & "\\n" & (duration of t as string)
  end tell`);
  const [st, name, artist, position, duration] = out.split('\n');
  return {
    state: st,
    name: name ?? null,
    artist: artist ?? null,
    position: position === undefined ? null : Number(position.replace(',', '.')),
    duration: duration === undefined ? null : Number(duration.replace(',', '.')),
  };
}

function wav(seconds, hz) {
  const rate = 22050;
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 160), 44 + i * 2);
  }
  return buf;
}

async function audioFile(track) {
  fs.mkdirSync(testAudio, { recursive: true });
  const out = path.join(testAudio, track.file);
  if (!fs.existsSync(out)) {
    const tmp = out.replace(/\.m4a$/, '.wav');
    fs.writeFileSync(tmp, wav(track.seconds, track.hz));
    await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '32000', tmp, out]);
    fs.unlinkSync(tmp);
  }
  return out;
}

let ready = false;

async function playlistIsGood() {
  const listing = await osa(`tell application "Music"
    if not (exists user playlist ${q(PLAYLIST)}) then return ""
    set out to ""
    repeat with t in tracks of user playlist ${q(PLAYLIST)}
      set loc to ""
      try
        set loc to POSIX path of (location of t as alias)
      end try
      set out to out & (name of t) & "|" & (album of t) & "|" & loc & linefeed
    end repeat
    return out
  end tell`);
  const rows = listing.split('\n').filter(Boolean).map((r) => r.split('|'));
  return rows.length === TRACKS.length
    && rows.every((r, i) => r[0] === TRACKS[i].title && r[1] === ALBUM && r[2] && fs.existsSync(r[2]));
}

/** Make sure the test playlist holds the three stand-in tracks, in order. */
async function ensurePlaylist() {
  if (ready) return;
  const files = [];
  for (const t of TRACKS) files.push(await audioFile(t));
  if (!(await playlistIsGood())) {
    // Only the test playlist's own tracks are ever removed.
    await osa(`tell application "Music"
      if exists user playlist ${q(PLAYLIST)} then
        set pids to {}
        try
          set pids to persistent ID of every track of user playlist ${q(PLAYLIST)}
        end try
        repeat with pid in pids
          try
            delete (some track of library playlist 1 whose persistent ID is (pid as string))
          end try
        end repeat
        delete user playlist ${q(PLAYLIST)}
      end if
      make new user playlist with properties {name:${q(PLAYLIST)}}
    end tell`);
    // One track at a time: Music hands back the added track before it can
    // take new tags, so tagging is retried for a moment.
    for (let i = 0; i < TRACKS.length; i++) {
      const t = TRACKS[i];
      await osa(`set f to (POSIX file ${q(files[i])}) as alias
      tell application "Music"
        set t to add f to user playlist ${q(PLAYLIST)}
        repeat 20 times
          try
            set name of t to ${q(t.title)}
            set artist of t to "Oasis"
            set album of t to ${q(ALBUM)}
            exit repeat
          on error
            delay 0.25
          end try
        end repeat
      end tell`);
    }
    if (!(await playlistIsGood())) throw new Error(`could not build the test playlist "${PLAYLIST}" in Music`);
  }
  ready = true;
}

let saved = null;
/** Queue order needs shuffle and repeat off; put them back when done. */
async function orderedQueue() {
  if (!saved) {
    const [shuffle, repeat] = (await osa('tell application "Music" to return (shuffle enabled as string) & "," & (song repeat as string)')).split(',');
    saved = { shuffle, repeat };
    process.on('exit', () => {
      try {
        require('node:child_process').execFileSync('osascript', ['-e',
          `tell application "Music" to set shuffle enabled to ${saved.shuffle}`, '-e',
          `tell application "Music" to set song repeat to ${saved.repeat}`]);
      } catch { /* Music gone */ }
    });
  }
  await osa('tell application "Music"\nset shuffle enabled to false\nset song repeat to off\nend tell');
}

/** Play a stand-in track from the test playlist, from `position` seconds. */
async function play(title, position = 0) {
  await ensurePlaylist();
  await orderedQueue();
  // Playing the playlist itself makes it Music's queue, so skip and back
  // move through its order; then step on to the wanted track.
  await osa(`tell application "Music" to play user playlist ${q(PLAYLIST)}`);
  await until(async () => {
    const s = await state();
    return s.state === 'playing' && s.name === TRACKS[0].title && s.position < 3;
  }, 5000, `Music did not start the test playlist`);
  const steps = TRACKS.findIndex((t) => t.title === title);
  for (let i = 1; i <= steps; i++) {
    await osa('tell application "Music" to next track');
    await until(async () => {
      const s = await state();
      return s.state === 'playing' && s.name === TRACKS[i].title;
    }, 5000, `Music did not move on to ${TRACKS[i].title}`);
  }
  if (position > 0) await seek(position);
}

/** Move Music's own playback to `position` seconds, retried until it holds. */
async function seek(position) {
  await until(async () => {
    try {
      await osa(`tell application "Music" to set player position to ${position}`);
    } catch { return false; }
    const s = await state();
    return s.position !== null && Math.abs(s.position - position) < 1;
  }, 5000, `Music would not move to ${position} s`);
}

async function pause() { await osa('tell application "Music" to pause'); }
async function stop() {
  await osa('tell application "Music" to if it is running then stop');
}

async function until(pred, ms, message) {
  const end = Date.now() + ms;
  for (;;) {
    if (await pred().catch(() => false)) return;
    if (Date.now() > end) throw new Error(message);
    await sleep(100);
  }
}

module.exports = { state, play, seek, pause, stop, ensurePlaylist, osa, TRACKS, PLAYLIST };
