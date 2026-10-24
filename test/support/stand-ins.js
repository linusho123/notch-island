'use strict';
// Stand-in pages for youtube.com, soundcloud.com, a news site and Gmail,
// served from a local HTTPS server that only the test Chrome reaches (its
// host-resolver rules map those hostnames here). Their media are generated
// stand-ins (players.movie, players.wav), never a real video or track.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const players = require('./players');
const { root } = require('./paths');

const CERT_DIR = path.join(root, 'build', 'test-chrome');
const HOSTS = ['www.youtube.com', 'youtube.com', 'soundcloud.com', 'www.soundcloud.com',
  'www.example-news.com', 'mail.google.com'];

/** The videos and tracks the stand-in pages play. */
const VIDEOS = {
  'lecture-4': { title: 'Lecture 4: Fourier Series', seconds: 1800 },
  'lecture-5': { title: 'Lecture 5: Laplace Transforms', seconds: 900 },
};
const TRACKS = {
  'late-night-mix': { title: 'late night mix', seconds: 1200 },
  'sunrise-mix': { title: 'sunrise mix', seconds: 1200 },
};
/** A youtube.com playlist: its videos in order, played on one after another. */
const PLAYLISTS = { 'PL-lectures': ['lecture-4', 'lecture-5'] };
/** soundcloud.com's "next up": the track that plays on in the same page. */
const NEXT_UP = { 'late-night-mix': 'sunrise-mix' };
const NEWS_CLIP = { title: 'Morning headlines', seconds: 300 };

/** A self-signed certificate for the stand-in hosts (the test Chrome ignores its issuer). */
function certificate() {
  const key = path.join(CERT_DIR, 'key.pem');
  const cert = path.join(CERT_DIR, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
      '-subj', '/CN=notch-island stand-ins', '-addext', `subjectAltName=${HOSTS.map((h) => `DNS:${h}`).join(',')}`,
      '-keyout', key, '-out', cert], { stdio: 'ignore' });
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px -apple-system,sans-serif;margin:24px;background:#fff}video,audio{width:480px;display:block}</style>
</head><body>${body}</body></html>`;
}

/** Media session metadata, as the real sites set it while their player plays. */
const session = (title, artist) => `<script>
  function nowPlaying() { if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata(${JSON.stringify({ title, artist })}); }
</script>`;

/** A youtube.com watch page: the video plays on load from `t` (the real site's behaviour). */
function watchPage(id, url) {
  const v = VIDEOS[id];
  if (!v) return null;
  const t = Number(String(url.searchParams.get('t') || '0').replace(/s$/, '')) || 0;
  // In a playlist, the next video's watch page opens when this one ends.
  const list = url.searchParams.get('list');
  const order = PLAYLISTS[list] || [];
  const next = order[order.indexOf(id) + 1];
  const onEnd = order.includes(id) && next
    ? `m.addEventListener('ended', () => { location.assign(${JSON.stringify(`/watch?v=${next}&list=${list}`)}); });`
    : '';
  return page(`${v.title} - YouTube`, `${session(v.title, 'notch-island stand-in')}
<h1>${esc(v.title)}</h1>
<video id="player" src="/media/${id}.mov#t=${t}" autoplay playsinline></video>
<script>
  const m = document.getElementById('player');
  m.addEventListener('playing', nowPlaying);
  m.addEventListener('loadedmetadata', () => { if (${t} > 0 && m.currentTime < ${t} - 1) m.currentTime = ${t}; });
  ${onEnd}
</script>`);
}

/** The YouTube home feed: a muted hover preview of a lecture plays in the grid. */
function homeFeed() {
  const v = VIDEOS['lecture-5'];
  return page('YouTube', `${session(v.title, 'notch-island stand-in')}
<h1>Home</h1>
<div class="preview"><video id="preview" src="/media/lecture-5.mov" autoplay muted loop playsinline></video>
<button id="unmute" onclick="unmute()">Unmute</button><p>${esc(v.title)}</p></div>
<script>
  const m = document.getElementById('preview');
  m.addEventListener('playing', nowPlaying);
  function unmute() { m.muted = false; m.volume = 1; }
</script>`);
}

/** A soundcloud.com track page: the track plays on load from `#t=m:ss`. */
function trackPage(id) {
  const tr = TRACKS[id];
  if (!tr) return null;
  return page(`${tr.title} | Listen online for free on SoundCloud`, `${session(tr.title, 'notch-island stand-in')}
<h1>${esc(tr.title)}</h1>
<audio id="player" src="/media/${id}.wav" autoplay controls></audio>
<script>
  const m = document.getElementById('player');
  m.addEventListener('playing', nowPlaying);
  const h = /t=(\\d+):(\\d\\d)/.exec(location.hash);
  if (h) m.addEventListener('loadedmetadata', () => { m.currentTime = Number(h[1]) * 60 + Number(h[2]); }, { once: true });
  ${NEXT_UP[id] ? `// Next up: the following track plays on in the same page, as on the real site.
  m.addEventListener('ended', () => {
    const next = ${JSON.stringify({ id: NEXT_UP[id], title: TRACKS[NEXT_UP[id]].title })};
    document.title = next.title + ' | Listen online for free on SoundCloud';
    document.querySelector('h1').textContent = next.title;
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: next.title, artist: 'notch-island stand-in' });
    m.src = '/media/' + next.id + '.wav';
    m.play();
  }, { once: true });` : ''}
</script>`);
}

/** A news site whose article autoplays a clip, muted or with sound. */
function newsPage(withSound) {
  return page('Example News', `<h1>${esc(NEWS_CLIP.title)}</h1>
<video id="clip" src="/media/news-clip.mov" autoplay ${withSound ? '' : 'muted'} loop playsinline></video>`);
}

function gmail() {
  return page('Inbox (3) - notch-island stand-in - Gmail', '<h1>Inbox</h1><p>Three unread messages.</p>');
}

/** The stand-in media files, made once (players.movie, players.wav). */
async function mediaFile(name) {
  const id = name.replace(/\.[^.]+$/, '');
  if (VIDEOS[id]) return players.movie(`${id}.mov`, VIDEOS[id].seconds);
  if (id === 'news-clip') return players.movie('news-clip.mov', NEWS_CLIP.seconds);
  if (TRACKS[id]) return players.wav(`${id}.wav`, TRACKS[id].seconds);
  return null;
}

/** Serve a file with byte ranges, so the media element can seek. */
function sendFile(req, res, file, type) {
  const size = fs.statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  }
}

async function handle(req, res) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  const url = new URL(req.url, `https://${host}`);
  const html = (body) => {
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (url.pathname.startsWith('/media/')) {
    const file = await mediaFile(path.basename(url.pathname));
    if (!file) { res.writeHead(404); res.end(); return; }
    sendFile(req, res, file, file.endsWith('.wav') ? 'audio/wav' : 'video/mp4');
  } else if (/(^|\.)youtube\.com$/.test(host)) {
    html(url.pathname === '/watch' ? watchPage(url.searchParams.get('v'), url) : url.pathname === '/' ? homeFeed() : null);
  } else if (/(^|\.)soundcloud\.com$/.test(host)) {
    html(trackPage(url.pathname.split('/').pop()));
  } else if (host === 'www.example-news.com') {
    html(newsPage(url.pathname === '/with-sound'));
  } else if (host === 'mail.google.com') {
    html(gmail());
  } else {
    res.writeHead(404);
    res.end();
  }
}

let server = null;

/** Start the stand-in server once per run; resolves to its port. */
async function start() {
  if (server) return server.address().port;
  // Make the media first, so a page never waits on a file being made.
  for (const id of [...Object.keys(VIDEOS), 'news-clip']) await mediaFile(`${id}.mov`);
  for (const id of Object.keys(TRACKS)) await mediaFile(`${id}.wav`);
  server = https.createServer(certificate(), (req, res) => {
    handle(req, res).catch(() => { try { res.writeHead(500); res.end(); } catch { /* gone */ } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  return server.address().port;
}

/** The test Chrome's host-resolver rules: the stand-in hosts here, nothing else anywhere. */
function resolverRules(port) {
  return [...HOSTS.map((h) => `MAP ${h} 127.0.0.1:${port}`), 'MAP * ~NOTFOUND'].join(', ');
}

const urls = {
  watch: (id, list) => `https://www.youtube.com/watch?v=${id}${list ? `&list=${list}` : ''}`,
  home: () => 'https://www.youtube.com/',
  track: (id) => `https://soundcloud.com/notch-island-stand-in/${id}`,
  news: (withSound) => `https://www.example-news.com/${withSound ? 'with-sound' : 'muted'}`,
  gmail: () => 'https://mail.google.com/mail/u/0/#inbox',
};

module.exports = { start, resolverRules, urls, VIDEOS, TRACKS, PLAYLISTS };
