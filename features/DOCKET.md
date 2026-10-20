docket: 1

# Docket of the /scope interview for notch-island, a module living in the camera notch of a MacBook Air (opened 2026-10-18).
# Need weights are guesses until the Phase 1.5 readback.

N0 2026-10-18 [I>V] visionary 5
  need:  I need a module for my own MacBook Air, built so others might install it later, that turns the dead space around the camera notch into something useful: hovering over it gives me the current song and its controls, faster than clicking through the menu bar; it pops out by itself when a new song starts; and it holds a quick-access shelf [I>V]

D1 2026-10-18 [V]
  resp:  of the interviewer's suggested other uses, only a quick-access shelf joins music; live countdowns, device status and incoming alerts are not part of the vision [V]
  ->     fence-declined other-island-uses
  touches: N0
# roads not taken: live countdowns (timers, next meeting, download progress); device status (charging, AirPods, volume, Focus, camera or mic in use); incoming alerts (calls, messages, reminders)
# provenance note: the four groups were the interviewer's priors, labelled as such; the pick was the visionary's

N1 2026-10-18 [I] visionary 5
  need:  I need to control my music faster than clicking the play button in the menu bar [V]
  means: hovering the trackpad pointer over the notch shows the current song with pause or resume, skip and back [V]

N2 2026-10-18 [I] visionary 4
  need:  I need to see what is playing when a new song starts, without doing anything [I]
  means: the notch pops out by itself when a new song begins, whether in the queue or on the device [V]

N3 2026-10-18 [I] visionary 3
  need:  I need a quick-access shelf in the notch [V]
# a means wearing a need's clothing: picked from the interviewer's list without a why; to be laddered before the Phase 1.5 readback

N4 2026-10-18 [I] visionary 2
  need:  I need other people to be able to install this on their own Macs, maybe, someday [V]
# "maybe" in the visionary's words; weight is the interviewer's guess

N5 2026-10-18 [V] visionary 4
  need:  I want the space around the camera put to use for something useful instead of sitting dead [V]

N6 2026-10-18 [I] visionary 3 amends N3
  need:  I need a quick place to park things I am moving or want to keep in mind: screenshots and files I want to drag somewhere else quickly, ideas in super short note form, and reminders [V]
  means: a quick-access shelf in the notch [V]
# laddered in Phase 1; weight still the interviewer's guess

D2 2026-10-18 [I>V]
  resp:  a reminder is a short note marked as a to-do; it sits on the shelf until the visionary checks it off and never pops out or draws attention on its own [I>V]
  ->     need N6
  touches: D1 N6
# rule 7: D1 declined "a reminder going off" as an incoming alert; this keeps D1 standing as is
# roads not taken: a timed reminder that pops the island out when due (would partly reverse D1); a quiet marker on the closed island while a reminder is open

D3 2026-10-18 [V]
  resp:  the music the island follows comes from Apple Music, youtube.com in Chrome, possibly soundcloud.com in Chrome, and individual downloaded `mp4`, `mp3`, `wav`, `mov` and `mkv` files [V]
  ->     need N1
  serves: N2
  touches: N1 N2
# open: which app plays the downloaded files; whether a YouTube video that is not music counts

D4 2026-10-18 [V]
  resp:  music still counts as playing when the Mac is sending its sound over Bluetooth to another speaker [V]
  ->     need N1
  serves: N2
  touches: D3 N1 N2

D5 2026-10-18 [I>V]
  resp:  a downloaded file counts as playing music whichever of IINA, QuickTime Player or Music is playing it; the visionary's default apps stay as they are [I>V]
  ->     need N1
  serves: N2
  touches: D3
# rule 6 check: the visionary recalled IINA for mov and mp4; the macOS default-app lookup on this Mac said `mov` and `mp4` open in QuickTime Player, `mkv` in IINA, `mp3` and `wav` in Music (NSWorkspace urlForApplication, run 2026-10-18). Refuted, then put back as this decision.
# roads not taken: IINA and Music only, QuickTime never followed; any app that reports it is playing media

D6 2026-10-18 [I>V]
  trig:  the technology-preferences step at the end of the interview opens [I>V]
  resp:  how the island learns what a Chrome tab is playing is an implementation question, held for that step [I>V]
  ->     fence-deferred chrome-tracking-mechanism
  touches: D3
# the visionary asked "how will you track websites in chrome?"; rule 3 holds it to Phase 5.5

D7 2026-10-18 [I>V]
  trig:  the visionary takes a screenshot [I>V]
  resp:  the new screenshot appears on the shelf by itself, ready to drag, and still saves wherever screenshots save today [I>V]
  serves: N6
  touches: N6
# roads not taken: the visionary drags screenshots in by hand; both automatic screenshots and drag-in

D8 2026-10-18 [I>V]
  trig:  the visionary drags a file from Finder, the desktop or a browser download onto the notch [I>V]
  resp:  the file parks on the shelf [I>V]
  serves: N6
  touches: D7 N6
# roads not taken: new downloads land on the shelf by themselves; the shelf holds screenshots, notes and reminders and no other files

D9 2026-10-18 [I>V]
  resp:  four behavior areas and no other actors: the visionary hovering for the current song; a player starting a new song; screenshots and dragged files parking on the shelf; notes and reminders on the shelf [I>V]
  ->     boundary
  serves: N0
  touches: D1 D2 D3 D4 D5 D7 D8

D10 2026-10-18 [V] ratifies N1
  resp:  at the intent readback the visionary confirmed N1 as stated, weight included [V]
  touches: N1

D11 2026-10-18 [V] ratifies N2
  resp:  at the intent readback the visionary confirmed N2 as stated, weight included [V]
  touches: N2

D12 2026-10-18 [V] ratifies N4
  resp:  at the intent readback the visionary confirmed N4 as stated, weight included [V]
  touches: N4

D13 2026-10-18 [V] ratifies N5
  resp:  at the intent readback the visionary confirmed N5 as stated, weight included [V]
  touches: N5

D14 2026-10-18 [V] ratifies N6
  resp:  at the intent readback the visionary confirmed N6 as stated, weight included [V]
  touches: N6

D15 2026-10-18 [I]
  pre:   the visionary sometimes adds an external monitor; it is an extended display, never mirrored, and it has no notch [V]
  trig:  the visionary starts mirroring onto an external display, or uses one that has a notch [I]
  resp:  the scope treats an external monitor as an extra screen without a notch beside the built-in one [V]
  ->     fence-assumption external-monitor-extended
  touches: D9 N5
# answer to the Phase 1.5 boundary question; the reopening condition is the interviewer's, until ratified

D16 2026-10-18 [I>V]
  resp:  while an external monitor is connected, even with the visionary working on it, the island lives only around the built-in notch; nothing of it appears on the external monitor, and a new-song pop-out still happens on the built-in screen [I>V]
  ->     need N5
  serves: N1 N2
  touches: D15 N2 N5
# tension accepted: with eyes on the external monitor a new-song pop-out can go unseen (N2)
# roads not taken: an island drawn on both screens; one island that follows the screen the visionary is working on

D17 2026-10-18 [V]
  pre:   the visionary never closes the lid while working on the external monitor [V]
  trig:  the visionary starts working with the lid closed on an external monitor alone [V]
  resp:  no behaviour is ruled for a closed lid; the case reopens if the visionary starts working that way [V]
  ->     fence-assumption lid-never-closed
  touches: D15 D16
# roads not taken: no island at all while the lid is closed; a drawn island on the external monitor only while the lid is closed

D18 2026-10-18 [I>V]
  pre:   Apple Music is playing "Wonderwall" by Oasis and the island is closed to the plain notch [I>V]
  trig:  the visionary moves the pointer onto the notch [I>V]
  resp:  the island opens downward and shows "Wonderwall", "Oasis" and three buttons: back, pause, skip [I>V]
  serves: N1
  sib:   D99
  touches: N1 D3

D19 2026-10-18 [I>V]
  pre:   the island is open over a playing song [I>V]
  trig:  the visionary clicks pause [I>V]
  resp:  the music stops and the pause button becomes play; clicking play resumes from the same spot [I>V]
  serves: N1
  sib:   D124
  touches: D18

D20 2026-10-18 [I>V]
  pre:   the island is open over a playing song with another song next in the queue [I>V]
  trig:  the visionary clicks skip [I>V]
  resp:  the next song in the queue plays and the island shows that song [I>V]
  serves: N1
  sib:   none -- nothing next in the queue is ruled in D46
  touches: D18
# what back does is held for its own question

D21 2026-10-18 [I>V]
  pre:   the island is open because the pointer is on it [I>V]
  trig:  the visionary moves the pointer away from the island [I>V]
  resp:  the island closes back to the plain notch [I>V]
  serves: N1 N5
  touches: D18

D22 2026-10-18 [I>V]
  resp:  a new-song pop-out shows as small wings beside the notch inside the menu bar strip, cover art and a short title on the left and a playing indicator on the right, for {TBD seconds}; hovering always opens downward with the full controls [I>V]
  ->     means N2
  serves: N1
  touches: D18 D16 N2 N5
# the visionary asked for the interviewer's honest opinion; the hybrid was put as the interviewer's labelled pick among three and chosen
# stress case rendered: Chrome frontmost, the busiest menu bar the visionary uses; the wings cover the end of Chrome's left-hand menus
# not rendered: a long song title, exact sizes
# roads not taken: down always (pop-out also opens downward); sideways always (title left, buttons right, all inside the menu bar strip)

D23 2026-10-18 [I>V]
  pre:   the island is open over "Wonderwall" playing at {1:40} [I>V]
  trig:  the visionary clicks back [I>V]
  resp:  "Wonderwall" restarts from {0:00}; a second click within the first {TBD seconds} of the song goes to the previous song [I>V]
  why:   {1:40} is the interviewer's example position, mid-song [I>V]
  serves: N1
  touches: D18 D20
# roads not taken: back always goes to the previous song; back passes through to the playing app's own behaviour

D24 2026-10-18 [I>V]
  pre:   IINA is playing the downloaded file `concert_2019_final_v2.mkv`, with no cover art and no artist, at {1:12:05} of {2:03:40}, out through a Bluetooth speaker named `JBL Flip 5` [I>V]
  trig:  the visionary hovers the notch and the island opens [I>V]
  resp:  the island shows a music-note placeholder where art would be, the filename cut short with an ellipsis, a source line `IINA · JBL Flip 5`, a progress bar with elapsed {1:12:05} and total {2:03:40}, and back, pause, skip [I>V]
  why:   the file, times and speaker name are the interviewer's stress case for the mockup: no art, no artist, long name, long video, Bluetooth out [I>V]
  serves: N1
  spread: Moving the progress dot by <how> to <target> jumps the concert file there
  sib:   none -- missing art and a missing artist are ruled in this response
  touches: D18 D4 D5
# not rendered: a YouTube title cluttered with "(Official Video)"
# open: whether the bar can be dragged to seek; whether clicking the source line brings the app forward
# roads not taken: just the song (art, title, artist, buttons); song and progress without a source line

D25 2026-10-18 [I>V]
  pre:   the island is open over `concert_2019_final_v2.mkv` playing in IINA at {1:12:05} of {2:03:40} [I>V]
  trig:  the visionary drags the progress dot to {1:45:00}, or clicks the bar at that spot [I>V]
  resp:  playback jumps to {1:45:00} and the elapsed time reads {1:45:00} [I>V]
  why:   the positions are the interviewer's example, continuing the stress case of D24 [I>V]
  serves: N1
  spread: Moving the progress dot by <how> to <target> jumps the concert file there
  sib:   D124
  touches: D24
# roads not taken: the bar is display only

D26 2026-10-18 [I>V]
  pre:   the island is open over a song playing from youtube.com in a Chrome tab that is not in front [I>V]
  trig:  the visionary clicks the source line or the cover art [I>V]
  resp:  the playing app comes to the front; for YouTube or SoundCloud that is the exact Chrome tab that is playing [I>V]
  serves: N1
  sib:   D124
  touches: D24 D3 D5
# roads not taken: the source line is a label only; the speaker part opens a sound-output switch while the app part brings the app forward

D27 2026-10-18 [I>V]
  pre:   the island is closed and Apple Music is near the end of "Wonderwall" with "Champagne Supernova" next [I>V]
  trig:  "Wonderwall" ends and "Champagne Supernova" starts [I>V]
  resp:  small wings slide out beside the notch with the cover art and "Champagne Su…" on the left and a playing indicator on the right, and fold back into the plain notch on their own after {TBD seconds} [I>V]
  serves: N2
  touches: D22 N2

D28 2026-10-18 [I>V]
  pre:   the new-song wings are out [I>V]
  trig:  the visionary moves the pointer onto the notch [I>V]
  resp:  the island opens downward into the full panel, the same as any hover [I>V]
  serves: N1 N2
  sib:   none -- no failure case was ruled for hovering the wings
  touches: D22 D24 D27

D29 2026-10-18 [V]
  pre:   the island is open on the music page [V]
  trig:  the visionary makes a simple scroll motion on it [V]
  resp:  the hover panel stays the size of the music panel and shows the music page first; the scroll moves it to a shelf page of the same size [V]
  serves: N1 N3 N6
  sib:   none -- no failure case was ruled for the scroll between pages
  touches: D18 D24 N6
# the visionary interrupted the side-by-side pick with this reframe; the reframe is the ruling
# roads not taken: music on top with a sideways-scrolling shelf row below; side by side in a wider panel (picked, then replaced by this reframe); two tabs at the top

D30 2026-10-18 [I>V]
  pre:   the island is open on the music page [I>V]
  trig:  the visionary scrolls down with two fingers [I>V]
  resp:  the music page slides up and out and the shelf page comes up from below; scrolling up brings the music page back; a small bar on the side shows which page is showing [I>V]
  serves: N6
  sib:   none -- no failure case was ruled for scrolling between the pages
  touches: D29
# stress case rendered: a full shelf of eight items (three screenshots, two files, two notes, one open reminder) fitted into the music-panel size
# roads not taken: a two-finger sideways swipe with page dots; either motion

D31 2026-10-18 [I>V]
  pre:   nothing is playing or paused, and the last song the visionary played was "Wonderwall" in Apple Music [I>V]
  trig:  the visionary hovers the notch [I>V]
  resp:  the island opens on the music page showing "Wonderwall", paused and ready; clicking play starts it again; scrolling down reaches the shelf as usual [I>V]
  serves: N1
  sib:   none -- the never-played case is ruled in D90
  touches: D29 D30 D18
# roads not taken: open straight on the shelf when there is no song; an empty music page reading "Nothing playing" with greyed buttons

D32 2026-10-18 [I>V]
  pre:   the shelf is empty [I>V]
  trig:  the visionary takes a screenshot [I>V]
  resp:  the screenshot saves to the Desktop as usual and a thumbnail of it appears on the shelf page [I>V]
  serves: N6
  sib:   D105
  touches: D7

D33 2026-10-18 [I>V]
  pre:   the island is closed [I>V]
  trig:  the visionary drags `tax-return.pdf` from Finder onto the notch and lets go [I>V]
  resp:  the island opens straight to the shelf page as a drop target, and on release the pdf is parked on the shelf [I>V]
  serves: N6
  sib:   D102
  touches: D8 D29 D30

D34 2026-10-18 [I>V]
  pre:   a screenshot is parked on the shelf [I>V]
  trig:  the visionary hovers, scrolls down to the shelf and drags the screenshot out into a Messages chat or a Gmail draft in Chrome [I>V]
  resp:  the screenshot is attached there as if dragged from the Desktop [I>V]
  serves: N6
  sib:   D103
  touches: D32
# open: what becomes of the shelf item after it is dragged out; whether parking a file moves it out of its folder

D35 2026-10-18 [I>V]
  pre:   a screenshot is parked on the shelf and its original is on the Desktop [I>V]
  trig:  the visionary drags it out of the shelf into a Messages chat [I>V]
  resp:  it leaves the shelf once dropped; the original stays on the Desktop [I>V]
  serves: N6
  touches: D34 D32
# roads not taken: it stays until the visionary removes it; it stays and the shelf clears it after a while

D36 2026-10-18 [I>V]
  pre:   `tax-return.pdf` sits in the Documents folder [I>V]
  trig:  the visionary parks it on the shelf [I>V]
  resp:  the file stays in Documents and the shelf only points to it; dragging it out of the shelf behaves as if dragged from Documents [I>V]
  serves: N6
  sib:   D106
  touches: D33 D35
# roads not taken: the file moves onto the shelf until dragged somewhere; the shelf keeps its own copy

D37 2026-10-18 [I>V]
  pre:   the island is open on the shelf page [I>V]
  trig:  the visionary clicks + note, types "idea: notch app shows lyrics" and presses Return [I>V]
  resp:  the note sits on the shelf as "✎ idea: notch app shows lyrics" [I>V]
  serves: N6
  sib:   D98
  touches: D2 D29

D38 2026-10-18 [I>V]
  pre:   a reminder "renew passport" is on the shelf with an empty box [I>V]
  trig:  the visionary clicks its box [I>V]
  resp:  the reminder is checked off [I>V]
  serves: N6
  touches: D2
# open: how a note becomes a reminder; what checked off leaves behind; how a plain note is removed

D39 2026-10-18 [I>V]
  pre:   a plain note "idea: notch app shows lyrics" is on the shelf [I>V]
  trig:  the visionary clicks the small box beside it [I>V]
  resp:  the note becomes a reminder with an empty box; clicking the pencil beside a reminder turns it back into a plain note [I>V]
  serves: N6
  sib:   none -- no failure case was ruled for the note and reminder toggle
  touches: D37 D38 D2
# roads not taken: separate + note and + reminder buttons; a typed prefix such as a dash making a reminder

D40 2026-10-18 [I>V] amends D38
  pre:   a reminder "renew passport" is on the shelf with an empty box [I>V]
  trig:  the visionary clicks its box [I>V]
  resp:  the reminder is checked off and removed from the shelf at once [I>V]
  serves: N6
  sib:   none -- a misclick has no undo, by the choice recorded in this entry
  touches: D38 D2
# roads not taken: shown struck through for a moment so a misclick can be undone, then gone; stays checked until removed by hand

D41 2026-10-18 [I>V]
  pre:   a plain note, a parked file or a parked screenshot is on the shelf [I>V]
  trig:  the visionary clicks the small x that appears when hovering the item, or drags the item off and drops it on empty space rather than into an app [I>V]
  resp:  the item is removed from the shelf; a parked file or screenshot itself stays where it is [I>V]
  serves: N6
  touches: D35 D36 D37
# open for coverage: what counts as empty space, since the Desktop is also a place a file can be dropped
# roads not taken: the x on hover alone; dragging off alone

D42 2026-10-18 [I>V] amends D27
  pre:   the island is closed and Apple Music is near the end of "Wonderwall" with "Champagne Supernova" next [I>V]
  trig:  "Wonderwall" ends and "Champagne Supernova" starts [I>V]
  resp:  small wings slide out beside the notch with the cover art and "Champagne Su…" on the left and a playing indicator on the right, and fold back into the plain notch on their own after {4 seconds} [I>V]
  why:   the interviewer's labelled pick among {2 | 4 | 6} seconds: about a second to notice and one to two to read a short title, under the roughly five seconds macOS keeps a notification banner, since the wings cover the end of the menus [I>V]
  serves: N2
  spread: The wings checked <after> after a new song starts
  sib:   D100
  touches: D27 D22 N2

D43 2026-10-18 [I>V] amends D22
  resp:  a new-song pop-out shows as small wings beside the notch inside the menu bar strip, cover art and a short title on the left and a playing indicator on the right, for {4 seconds}; hovering always opens downward with the full controls [I>V]
  why:   the duration is the ruling of D42, carried into the means it belongs to [I>V]
  ->     means N2
  serves: N1
  touches: D22 D42 D16 N2 N5

D44 2026-10-18 [I>V]
  pre:   the island is closed and the wings are out for a new song [I>V]
  trig:  {5} songs start in a row about {1 second} apart [I>V]
  resp:  the wings stay out and the title changes with each song, folding back {4 seconds} after the last change, never flickering in and out [I>V]
  why:   five songs a second apart is the interviewer's stress case for rapid skipping; the four seconds is D42 [I>V]
  sib:   none -- flicker is ruled out in this same response
  serves: N2
  spread: <count> songs starting about a second apart keep the wing out
  touches: D42 D43
# roads not taken: the wings fold and pop again for each song; nothing pops until a song has played for a moment

D45 2026-10-18 [I>V] amends D23
  pre:   the island is open over "Wonderwall" playing at {1:40} [I>V]
  trig:  the visionary clicks back [I>V]
  resp:  "Wonderwall" restarts from {0:00}; a click on back within the first {3 seconds} of a song goes to the previous song instead [I>V]
  why:   {1:40} is the interviewer's example position; {3 seconds} was put as roughly what Apple Music and car stereos use, recalled rather than measured, among {2 | 3 | 5} seconds [I>V]
  serves: N1
  spread: Back at <position> into Wonderwall plays <song> from the start
  sib:   none -- nothing before the first song is ruled in D47
  touches: D23 D18 D20

D46 2026-10-18 [I>V]
  pre:   a lone file is playing in QuickTime Player with nothing next in its queue [I>V]
  trig:  the visionary clicks skip on the island [I>V]
  resp:  the click goes to the playing app and the island shows whatever that app does: nothing, a suggested video, or a stop [I>V]
  sib:   none -- the app's own response is the ruled outcome
  serves: N1
  touches: D20 D45
# roads not taken: skip greyed out when nothing is next; skip ends the song and shows it paused and ready

D47 2026-10-18 [I>V]
  pre:   the first song in the queue is playing with nothing before it [I>V]
  trig:  the visionary clicks back twice within the first {3 seconds} [I>V]
  resp:  the click goes to the playing app and the island shows whatever that app does [I>V]
  why:   the three seconds is D45 [I>V]
  sib:   none -- the app's own response is the ruled outcome
  serves: N1
  spread: With nothing <where> it, <button> on the island goes to <app>
  touches: D45 D46
# roads not taken: back always restarts the current song when nothing is before it

D48 2026-10-18 [I>V]
  pre:   Apple Music is playing "Wonderwall" [I>V]
  trig:  the visionary starts a YouTube video in Chrome while it plays [I>V]
  resp:  the music page shows the newest source, the YouTube video, with a small control that flips the card like a mirror to the other source so it can be controlled instead [V]
  serves: N1
  sib:   none -- a source leaving the card is ruled in D72
  touches: D18 D24 D29 D30 D3
# the visionary picked "show both, switchable" and added the mirror flip; the interviewer's opinion, asked for: the flip suits exactly two faces, turns on a different axis from the scroll to the shelf, and should be quick
# roads not taken: follow whichever started most recently; pause the source already playing so only one plays

D49 2026-10-18 [I>V]
  pre:   Apple Music, a YouTube tab in Chrome and an IINA file are all playing, the YouTube tab started last [I>V]
  trig:  the visionary uses the flip control repeatedly [I>V]
  resp:  each flip shows the next source in turn, YouTube then IINA then Apple Music then YouTube again, with a small `2 of 3` style count showing which one is up [I>V]
  serves: N1
  sib:   none -- a source leaving the card is ruled in D72
  touches: D48
# roads not taken: the flip only swaps the two most recently started; with three or more the control opens a picker list

D50 2026-10-18 [I>V]
  pre:   Chrome is playing a YouTube lecture in one tab and a muted autoplay clip on a news site in another [I>V]
  trig:  either starts playing [I>V]
  resp:  in Chrome only youtube.com and soundcloud.com count; the news-site clip never shows on the island, while every YouTube video counts as a song, music or not [I>V]
  serves: N1 N2
  touches: D3 D42 D48
# open for the adversarial pass: muted YouTube previews that play while hovering thumbnails would count under this ruling
# roads not taken: anything playing in a followed source counts; the named sites only and nothing muted or soundless ever counts

D51 2026-10-18 [I>V]
  pre:   the island is closed [I>V]
  trig:  the pointer rests on the notch for {0.3 seconds TBR}, or sweeps across it without resting on its way from Chrome's Help menu to the Wi-Fi icon [I>V]
  resp:  a rest of about {0.3 seconds TBR} opens the island; a sweep across that does not rest opens nothing [I>V]
  why:   the interviewer's middle option among {0 | 0.3 | 0.7} seconds, chosen to stay faster than a menu-bar click while ignoring pass-throughs; held TBR until felt on the real machine [I>V]
  sib:   none -- the sweep case is ruled in this response
  serves: N1
  spread: Resting the pointer on the notch for <rest> opens the island
  touches: D18 D21
# roads not taken: opens on any contact; must rest about seven tenths of a second

D52 2026-10-18 [I>V] amends D21
  pre:   the island is open because the pointer is on it [I>V]
  trig:  the pointer leaves the island [I>V]
  resp:  the island waits about {0.5 seconds TBR} and stays open if the pointer comes back within that time, else closes back to the plain notch; while a drag is under way, of the progress dot or of an item out of the shelf, it never closes until the drag is let go, however far the pointer goes [I>V]
  why:   the interviewer's option, half a second as long enough to forgive a slip past the edge and short enough that a real move away still closes quickly; held TBR until felt on the real machine [I>V]
  serves: N1 N5 N6
  spread: The pointer leaving the open island for <away>
  sib:   none -- the slip back within the grace is ruled in this response
  touches: D21 D25 D34 D51
# roads not taken: a short grace that also applies during drags; closes the instant the pointer leaves

D53 2026-10-18 [I>V]
  pre:   IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black [I>V]
  trig:  a new song starts in Apple Music [I>V]
  resp:  while any app is fullscreen a new song never pops the wings; hovering the notch still opens the panel [I>V]
  serves: N1
  sib:   D100
  touches: D42 D43 D16 N2
# tension accepted: a new song during fullscreen goes unannounced (N2)
# roads not taken: wings pop the same as always; the island is fully off in fullscreen

D54 2026-10-18 [I>V]
  pre:   the shelf holds no screenshots [I>V]
  trig:  the visionary takes {30} screenshots in a row while documenting a bug [I>V]
  resp:  screenshots taken close together collapse into one stack reading `30 screenshots`, which can be dragged out as one group or expanded [I>V]
  why:   thirty is the interviewer's stress case for a burst [I>V]
  serves: N6
  touches: D32 D35 D7
# open: what counts as close together
# roads not taken: no limit, newest first, the page scrolls inside itself; a fixed number kept with the oldest pushed off

D55 2026-10-18 [I>V] amends D54
  pre:   a screenshot is on the shelf [I>V]
  trig:  the visionary takes another screenshot within {60 seconds} of the previous one, up to {30} in a row while documenting a bug [I>V]
  resp:  it joins that screenshot in one stack reading `2 screenshots`, up to `30 screenshots`, which can be dragged out as one group or expanded; a gap longer than {60 seconds} starts a new item [I>V]
  why:   thirty is the interviewer's stress case for a burst; the minute was the visionary's pick among no item between, {60 seconds} and {10 seconds} [I>V]
  serves: N6
  touches: D54 D32 D35

D56 2026-10-18 [I>V]
  pre:   over a week the shelf collects {40} notes, files, screenshots and reminders that were never cleared [I>V]
  trig:  a parked file or screenshot reaches an age of {TBD days} on the shelf [I>V]
  resp:  it leaves the shelf on its own and its original stays where it is; notes and reminders stay until the visionary removes them [I>V]
  why:   forty in a week is the interviewer's stress case [I>V]
  serves: N6
  touches: D35 D36 D41 D55
# roads not taken: no limit, newest first, scrolling inside the page; a fixed cap that refuses a new item until something is cleared

D57 2026-10-18 [I>V] amends D56
  pre:   a screenshot was parked on the shelf at {11:58 pm} and has not been dragged out or removed [I>V]
  trig:  {24 hours} pass since it was parked, at {11:58 pm} the next night [I>V]
  resp:  it leaves the shelf on its own and its original stays where it is; every parked file or screenshot gets a full {24 hours}, and notes and reminders stay until the visionary removes them [I>V]
  why:   {11:58 pm} is the interviewer's stress case for the two readings of one day; the visionary picked one day among {1 | 7 | 30} days, then a full {24 hours} over overnight [I>V]
  serves: N6
  spread: A screenshot parked at 11:58 pm, checked at <when>
  sib:   none -- an item leaving before its time is ruled in D58 and D66
  touches: D56 D35 D36 D41 D55
# roads not taken: seven days; thirty days; overnight, leaving everything parked before today when a new day starts

D58 2026-10-18 [I>V]
  pre:   `tax-return.pdf` is parked on the shelf from the Documents folder [I>V]
  trig:  the visionary moves it to another folder in Finder, or moves it to the Trash [I>V]
  resp:  a moved file stays on the shelf and drags out from its new place; a file moved to the Trash leaves the shelf [I>V]
  serves: N6
  sib:   D106
  touches: D36 D41 D57
# roads not taken: the item stays greyed out and marked missing until cleared by hand; it silently leaves the shelf whenever it is not where it was parked from

D59 2026-10-18 [I>V]
  pre:   the shelf holds {3} notes, {1} reminder and {2} parked files [I>V]
  trig:  the Mac restarts, for an update or after a crash [I>V]
  resp:  everything is back on the shelf afterwards, and the parked files keep their {24 hours} clock from when they were parked [I>V]
  why:   the counts are the interviewer's example of a mixed shelf; the twenty-four hours is D57 [I>V]
  serves: N6
  spread: After a restart <how>, the whole shelf comes back
  sib:   none -- reliability beyond this was declined in D75
  touches: D57 D58
# roads not taken: only notes and reminders survive; nothing survives a restart

D60 2026-10-18 [I>V]
  pre:   the visionary has not opened the island themselves [I>V]
  trig:  they log in to the Mac, including after a restart [I>V]
  resp:  the island is running and working at the notch by itself, every time [I>V]
  serves: N1 N5
  sib:   none -- stopping it is ruled in D86 and reliability beyond was declined in D75
  touches: D59
# roads not taken: the visionary launches it and it is gone after a restart; a start-at-login switch, on unless turned off

D61 2026-10-18 [I>V]
  pre:   the island is open on the shelf page [I>V]
  trig:  the visionary clicks + note and presses Return on an empty line [I>V]
  resp:  no note is created and the shelf is unchanged [I>V]
  sib:   none -- the empty case is itself the failure case of D37
  serves: N6
  touches: D37

D62 2026-10-18 [I>V]
  pre:   the island is open on the shelf page with a new note being typed [I>V]
  trig:  the visionary types or pastes past {140 characters}, up to a pasted paragraph of {2000 characters} [I>V]
  resp:  typing or pasting stops at {140 characters}; the note keeps its first {140 characters} and the rest is not taken; reminders, being notes, share the cap [I>V]
  why:   the cap is the visionary's pick among {80 | 140 | 280} characters; two thousand is the interviewer's stress case for a paste [I>V]
  serves: N6
  spread: A new note of <length> keeps <kept>
  sib:   D104
  touches: D37 D39
# roads not taken: a long note kept whole and shown as its first line with an ellipsis; one line only with pasted text cut to its first line

D63 2026-10-18 [I>V]
  pre:   the note "idea: notch app shwos lyrics" is on the shelf [I>V]
  trig:  the visionary clicks its text, corrects it to "idea: notch app shows lyrics" and presses Return; or empties all its text and presses Return [I>V]
  resp:  the corrected text is saved in place; a note emptied this way is removed [I>V]
  serves: N6
  sib:   none -- emptying a note by editing is ruled in this response
  touches: D37 D41 D61 D62
# roads not taken: notes cannot be edited, only removed and rewritten

D64 2026-10-18 [I>V] amends D7
  trig:  the visionary takes a regular screenshot that saves as a file, or makes a screen recording that saves as a `.mov` [I>V]
  resp:  the new screenshot or recording appears on the shelf by itself, ready to drag, and still saves wherever it saves today; a screenshot copied only to the clipboard and images saved by other screenshot tools never land on their own [I>V]
  serves: N6
  sib:   D105
  touches: D7 D32 D36 D55
# the interviewer's labelled pick: recordings share the screenshot flow; a clipboard shot is already in the clipboard and would be the one shelf item with no file behind it, against D36
# open for the adversarial pass: whether a recording joins a screenshot stack
# roads not taken: recordings and clipboard shots; regular screenshots only; everything including other tools

D65 2026-10-18 [I>V] amends D8
  trig:  the visionary drags onto the notch a file, several files selected together in Finder, a folder, a link from Chrome's address bar, or highlighted text [I>V]
  resp:  a file parks on the shelf; several files park as one stack that drags out as a group or expands; a folder parks as one item that drags out whole and follows a move like a file; a link parks as a link and stays until removed, never ageing out; dropped text is not accepted and the shelf is unchanged [I>V]
  serves: N6
  sib:   D102
  touches: D8 D33 D36 D55 D57 D58 D62
# the interviewer's labelled pick: dropped text would be cut silently at the cap of D62, and losing text unannounced is worse than refusing it
# roads not taken: files and folders only; all four with dropped text becoming a note cut at the cap

D66 2026-10-18 [I>V] amends D41
  pre:   a plain note, a parked file, a parked screenshot, a stack, a folder or a link is on the shelf [I>V]
  trig:  the visionary clicks the small x that appears when hovering the item, or drags the item and drops it on the small remove area that appears at the panel's edge only while a shelf item is being dragged [I>V]
  resp:  the item is removed from the shelf and anything it points to stays where it is; a drop anywhere else is a real drop, so the Desktop gets the file moved there as in Finder and Chrome opens it [I>V]
  serves: N6
  sib:   none -- a drop outside the remove area is ruled a real drop in this response
  touches: D41 D35 D36 D52 D65
# rule 7: reshapes the drag half of D41; the interviewer's labelled pick, since nearly nothing on a Mac is empty space and a guessed drop either loses an item or does something unasked
# roads not taken: drag off to spots that accept nothing such as the menu bar; the x on hover only, no drag removal

D67 2026-10-18 [I>V] amends D43
  resp:  a new-song pop-out shows as wings beside the notch inside the menu bar strip for {4 seconds}, never covering an app menu or a status icon: the left wing shows the cover art and as much of the title as fits in the free gap, and when the left gap cannot hold the art, the art and title move into the right wing beside the playing indicator; only when both gaps are full does the notice drop below the notch as a small card for {4 seconds}; hovering always opens downward with the full controls [I>V]
  why:   the duration is the ruling of D42; the visionary chose wings that avoid menus and asked the interviewer's view on the no-room case, then took the labelled pick [I>V]
  ->     means N2
  serves: N1
  spread: The new-song notice finds room: <where>
  touches: D43 D22 D42 D44 D53 N2 N5
# rule 6: the interviewer had claimed Chrome's menus reach the notch on a 13-inch layout; refuted. Measured 2026-10-18 on this Mac: built-in screen `1710` points wide, menu bar strip `33` high, notch `185` wide from x `763` to `948` (NSScreen auxiliaryTopLeftArea and auxiliaryTopRightArea); Chrome's Help menu ends at x `628`, so `135` points free on the left (System Events, last menu bar item of Google Chrome); leftmost status item at x `1210`, so `262` points free on the right (CGWindowList, layer `25`)
# the visionary's "avoid menus" read by the interviewer as covering status icons too, stated aloud and not corrected
# roads not taken: click-through wings that fold when a menu under them is clicked; clicking the wings opens the island; the notice drops below the notch whenever the left has no room; no notice when the left has no room

D68 2026-10-18 [I>V]
  pre:   the island is running and Apple Music is playing "Wonderwall" [I>V]
  trig:  the visionary pauses or skips from the Now Playing tile in Control Center [I>V]
  resp:  Control Center shows and controls the music as it does today, and the island reflects what it did [I>V]
  sib:   none -- this is an existing behaviour kept, not new
  serves: N1
  touches: D18 D19 D20
# mined surface: the interviewer's inventory, put to the visionary with that provenance

D69 2026-10-18 [I>V]
  pre:   the island is running and Apple Music is playing "Wonderwall" [I>V]
  trig:  the visionary presses the keyboard's play or pause, back or skip key [I>V]
  resp:  the keys control the music as they do today, and the island reflects what they did [I>V]
  sib:   none -- this is an existing behaviour kept, not new
  serves: N1
  touches: D18 D19 D20 D45
# mined surface: the interviewer's inventory, put to the visionary with that provenance

D70 2026-10-18 [I>V]
  pre:   the island is running and closed [I>V]
  trig:  the visionary clicks any app menu or status icon beside the notch [I>V]
  resp:  it works exactly as today, with no dead zone around the closed island [I>V]
  sib:   none -- this is an existing behaviour kept, not new
  serves: N5
  touches: D51 D67
# mined surface: the interviewer's inventory, put to the visionary with that provenance

D71 2026-10-18 [I>V]
  resp:  macOS's floating screenshot thumbnail in the bottom-right corner is not required to keep appearing once screenshots land on the shelf [I>V]
  ->     fence-declined screenshot-preview-survival
  touches: D64
# offered in the must-survive inventory and left unselected

D72 2026-10-18 [I>V]
  pre:   Apple Music is playing "Wonderwall" and possibly other sources are playing too [I>V]
  trig:  the visionary quits Apple Music, or closes the YouTube tab that was playing [I>V]
  resp:  that source leaves the flip card; if another source still plays, the newest remaining one shows; if none does, the music page shows the last song paused and ready, and play reopens its app, or reopens that YouTube video in Chrome where it left off, and starts it again [I>V]
  serves: N1
  sib:   none -- no failure case was ruled for reopening a closed source
  touches: D31 D48 D49
# the interviewer's labelled pick, as the one option consistent with D31 and D48
# roads not taken: the quit source's last song shows paused even while another plays; the face leaves but play never reopens a closed app or tab

D73 2026-10-18 [I>V]
  pre:   "Wonderwall" is playing out through the Bluetooth speaker `JBL Flip 5` [I>V]
  trig:  the speaker disconnects mid-song [I>V]
  resp:  nothing pops out; the source line changes to `MacBook speakers` and the play state shows whatever the app did [I>V]
  sib:   none -- no notice is the ruled outcome
  serves: N1
  touches: D1 D4 D24
# rule 7: a disconnect notice would reopen the device-status uses declined in D1; the interviewer's labelled pick keeps D1 standing
# roads not taken: the wings pop briefly with a disconnect notice

D74 2026-10-18 [I>V]
  pre:   the island is closed [I>V]
  trig:  the visionary clicks the notch instead of resting the pointer on it [I>V]
  resp:  the island opens at once, skipping the rest of D51, and behaves as after a hover from then on [I>V]
  serves: N1
  sib:   D101
  touches: D51 D18 D70
# roads not taken: a click on the closed notch toggles play and pause; clicking does nothing special

D75 2026-10-18 [V]
  resp:  of the checklist categories, reliability beyond what is already ruled, availability, security and privacy, upkeep burden, diagnosability and compliance were left unselected at the triage and are not probed [V]
  ->     fence-declined checklist-unselected
  touches: D59
# Phase 3.25 triage, the one sanctioned multi-select; provenance: the checklist, not the visionary's answers
# selected for probing: usability, performance, evolvability, lifecycle

D76 2026-10-18 [I>V]
  pre:   an external mouse is connected and Apple Music is playing "Wonderwall" [I>V]
  trig:  the visionary rests the mouse pointer on the notch, clicks, and turns the mouse wheel down on the open island [I>V]
  resp:  hover, click and scroll behave exactly as with the trackpad, and the wheel moves to the shelf page as a two-finger scroll does [I>V]
  serves: N1 N6
  sib:   none -- the mouse mirrors the trackpad, whose cases are ruled elsewhere
  touches: D30 D51 D74
# checklist category usability, provenance named

D77 2026-10-18 [V]
  resp:  a keyboard shortcut to open the island, simpler motion under Reduce Motion, and styling for a dark or light menu bar are not part of the scope [V]
  ->     fence-declined usability-extras
  touches: D76
# offered in the usability probe and left unselected

D78 2026-10-18 [I>V]
  pre:   the island is closed and a song is playing in any followed source [I>V]
  trig:  a new song starts [I>V]
  resp:  the wings are out within {1 second} of the new song starting, on every followed source [I>V]
  why:   the interviewer's labelled pick among {0.5 | 1 | 3} seconds: still feels tied to the change and is checkable with a stopwatch; half a second judged fragile on a guess, unverified, that some sources such as Chrome tabs report a change with their own lag [I>V]
  serves: N2
  spread: A new song in <source> brings the wing out within a second
  sib:   D107
  touches: D42 D67 D3 D5
# checklist category performance, provenance named
# roads not taken: within half a second; within three seconds

N7 2026-10-18 [I>V] visionary 3
  need:  I need the island to cost my fanless Air almost nothing while it sits there, aiming to barely register and never costing more than a typical menu bar utility [I>V]
# surfaced by the checklist sweep, category performance; weight is the interviewer's guess

D79 2026-10-18 [I>V]
  pre:   the island is closed and Apple Music is playing "Wonderwall" [I>V]
  trig:  {1 minute} passes with nothing touched [I>V]
  resp:  averaged over that minute the island uses no more than {3%} CPU and shows an Energy Impact of no more than {5} in Activity Monitor; near zero is the aim, not the bar [I>V]
  why:   the interviewer's labelled pick among {1% and 1 | 3% and 5 | 5% and 10}, placing the hard line at the visionary's accept level of a typical menu bar app rather than at their aim [I>V]
  serves: N7
  spread: Over a closed minute of Wonderwall, the island's <measure> stays at or under <ceiling>
  sib:   none -- the ceiling itself is the failure line, ruled in this response
  touches: N7 D60
# checklist category performance, provenance named

N8 2026-10-18 [I>V] visionary 2
  need:  I need to be able to add new music sources and new uses of the island later without disturbing what already works [I>V]
# surfaced by the checklist sweep, category evolvability; "nothing in particular" also ticked, read by the interviewer as no other change expected; weight is the interviewer's guess

D80 2026-10-18 [I>V]
  resp:  each music source and each use of the island (music, shelf) is a separate part, so a new source or a new page can be added without changing how the existing ones behave [I>V]
  ->     structural
  serves: N8
  touches: N8 D1 D3 D29
# a new island use may one day be one of the uses declined in D1; this ruling does not reopen D1

D81 2026-10-18 [V]
  resp:  what is left behind when the island is removed is not worth ruling [V]
  ->     fence-declined removal-leftovers
  touches: D59 N4
# checklist category lifecycle, provenance named
# roads not taken: removal takes everything; notes and reminders exported to a text file on removal

D82 2026-10-18 [I>V]
  trig:  the visionary decides to share the island with other people [V]
  resp:  how the island is installed and updated, for the visionary and for others, is not ruled now; any way of getting it onto the visionary's own Mac will do until then [I>V]
  ->     fence-deferred install-and-update
  serves: N4
  touches: N4 D60 D81
# checklist category lifecycle; the interviewer's labelled pick, since sharing is a maybe of weight two and no behaviour depends on it
# roads not taken: a download dragged into Applications that updates itself after asking; the same download updated by hand

N9 2026-10-18 [I>V] visionary 3
  need:  I need my notes, reminders and shelf to stay off other people's screens when I share or record mine [I>V]
# surfaced by the closing domain question of the checklist sweep, the interviewer's priors, provenance named; weight is the interviewer's guess

D83 2026-10-18 [I>V]
  pre:   the visionary is sharing the screen in Zoom or Meet, or recording it [I>V]
  trig:  a new song starts, or the visionary hovers or clicks the notch, or drags a file onto it [I>V]
  resp:  the island does nothing at all until the share or recording ends; then it works as before, and a screen recording that has just ended still lands on the shelf [I>V]
  serves: N9
  sib:   D101
  touches: N9 D42 D51 D64 D74 D33
# roads not taken: invisible to viewers while the visionary still sees and uses it; quiet for everyone with no wings and no shelf page

D84 2026-10-18 [V]
  resp:  a way to quit or reach settings from the island, a volume slider on the music page, and a love or like button are not part of the scope [V]
  ->     fence-declined common-extras
  touches: D60 D24
# offered in the closing domain question, the interviewer's priors, and left unselected
# carried to the adversarial pass: with D60 starting it at login and no way to quit, the island cannot be stopped from itself

D85 2026-10-18 [I>V] amends D84
  resp:  settings reached from the island, a volume slider on the music page, and a love or like button are not part of the scope [I>V]
  ->     fence-declined common-extras
  touches: D84 D60
# adversarial objection 1: quitting is no longer declined, see D86

D86 2026-10-18 [I>V]
  pre:   the island is running [I>V]
  trig:  the visionary right-clicks the notch and picks Quit [I>V]
  resp:  a menu with the single item Quit appears; picking it stops the island until the next login or until the visionary opens it again [I>V]
  serves: N1 N5
  sib:   none -- no failure case was ruled for quitting
  touches: D60 D84 D85 D74
# adversarial objection 1, the interviewer's labelled pick: the smallest exit from the trap of D60 with D84; D60 stands
# roads not taken: accept Force Quit in Activity Monitor; right-click offering Quit and stop starting at login

D87 2026-10-18 [V] ratifies D85
  resp:  the visionary chose the option labelled as partly reversing D84 for quitting only [V]
  touches: D85 D86

D88 2026-10-18 [I>V] amends D50
  pre:   Chrome has a YouTube lecture playing with sound in one tab, a muted hover preview playing on the YouTube home feed in another, and a muted autoplay clip on a news site in a third [I>V]
  trig:  each starts playing, and later the visionary unmutes the preview [I>V]
  resp:  in Chrome only youtube.com and soundcloud.com count, and only while playing sound: the lecture counts as a song, music or not; the muted preview counts only from the moment it is unmuted; the news-site clip never shows on the island [I>V]
  serves: N1 N2
  sib:   D107
  touches: D50 D3 D42 D48
# adversarial objection 2, the interviewer's labelled pick; premise that YouTube plays muted previews on thumbnail hover is the interviewer's recollection, unverified here
# roads not taken: only watch-page and playlist videos count, muted or not; keep D50 with every YouTube video counting

D89 2026-10-18 [I>V] amends D55
  pre:   a screenshot or screen recording is on the shelf [I>V]
  trig:  the visionary takes another screenshot or makes another screen recording within {60 seconds} of the previous capture, up to {30} in a row while documenting a bug [I>V]
  resp:  it joins that capture in one stack whose label counts what is inside, such as `3 screenshots, 1 recording`, up to `30 screenshots`, which can be dragged out as one group or expanded; a gap longer than {60 seconds} starts a new item [I>V]
  why:   thirty is the interviewer's stress case for a burst; the minute was the visionary's pick among no item between, {60 seconds} and {10 seconds} [I>V]
  serves: N6
  spread: A capture <gap> after the previous one <result>
  sib:   none -- no failure case was ruled past a burst of thirty
  touches: D55 D54 D64 D35
# adversarial objection 3, the interviewer's labelled pick: a recording inside a bug-documenting burst belongs to the same drag
# roads not taken: recordings never stack with screenshots; recordings stack only with other recordings

D90 2026-10-18 [I>V]
  pre:   no song has played since the island was installed [I>V]
  trig:  the visionary hovers the notch [I>V]
  resp:  the music page reads `Nothing played yet` with back, play and skip greyed out; scrolling down reaches the shelf as always [I>V]
  serves: N1 N6
  sib:   none -- the never-played case is itself the empty edge of D31
  touches: D31 D29 D30
# adversarial objection 4, the interviewer's labelled pick: keeps the music-first motion of D29 unchanged from day one
# roads not taken: this one case opens on the shelf page; show what Apple Music last played before the island existed

D91 2026-10-18 [I>V] reaffirms N2
  resp:  N2 keeps weight four although the pop-out is off on the external monitor, in fullscreen, while sharing and for muted video; the external-monitor loss is an accepted trade-off in service of N5 [I>V]
  touches: N2 D16 D53 D83 D88 N5
# adversarial objection 5, the interviewer's labelled pick
# roads not taken: lower N2 to weight three; reopen D16 for the new-song notice only

D92 2026-10-18 [I>V] amends D35
  pre:   a screenshot is parked on the shelf and its original is on the Desktop [I>V]
  trig:  the visionary drags it out of the shelf and lets go, either into a Messages chat that accepts it, or where nothing accepts it, such as a Messages chat refusing a recording of {2 GB} as too large [I>V]
  resp:  it leaves the shelf only when something actually accepted the drop; a refused or empty drop leaves it on the shelf as it was; the original stays on the Desktop either way [I>V]
  why:   two gigabytes is the interviewer's stress case for a refused drop [I>V]
  serves: N6
  spread: A refused drop leaves <item> on the shelf
  sib:   D103
  touches: D35 D34 D66
# adversarial objection 6, the interviewer's labelled pick: a note or link has no original elsewhere, so leaving on a refused drop would lose it unannounced
# roads not taken: keep D35 literally, gone once let go

D93 2026-10-18 [I>V]
  pre:   the note "idea: notch app shows lyrics" and the reminder "renew passport" are on the shelf [I>V]
  trig:  the visionary drags either one into a Messages chat [I>V]
  resp:  its text drops into the chat as if typed, and the note or reminder stays on the shelf unchanged, still unchecked if a reminder [I>V]
  serves: N6
  sib:   none -- the note stays on the shelf whatever the drop, by this response
  touches: D57 D37 D38 D40 D92
# adversarial objection 7, the interviewer's labelled pick: leaving would contradict notes and reminders staying until removed (D57)
# roads not taken: drops as text and leaves the shelf; notes and reminders cannot be dragged

D94 2026-10-18 [V] ratifies D15
  resp:  at the scope-fence readback the visionary confirmed the fence, the reopening condition of D15 included [V]
  touches: D15 D17 D6 D82

D95 2026-10-18 [V]
  resp:  at the readback the visionary found nothing missing walking the vision end to end, and nothing the interview should have asked; the six behaviour areas, the fence and the needs landing stand as read back [V]
  ->     boundary
  serves: N0
  touches: D9 D94 D91

D96 2026-10-18 [V]
  resp:  offered the technology-preferences step, the visionary answered make it so: no preferences are stated, and every technical choice, how the island learns what a Chrome tab is playing included, is the build agent's to make and record in the design doc as its own [V]
  ->     boundary
  serves: N0
  touches: D6 D95
# Phase 5.5 electives declined; the deferred queue held one item, D6, whose reopening condition has now fired

D97 2026-10-18 [V] reverses D6
  resp:  the Chrome tracking question is no longer deferred; per D96 it is the build agent's choice [V]
  touches: D6 D96

# Drafting bookkeeping, 2026-10-18: D98 to D107 restate failure behaviour already ruled, marked unwanted so failure-case scenarios can cite it. Each names its source entry; none adds a ruling.

D98 2026-10-18 [I>V] !
  pre:   the island is open on the shelf page [I>V]
  trig:  the visionary clicks + note and presses Return on an empty line [I>V]
  resp:  no note is created and the shelf is unchanged [I>V]
  serves: N6
  touches: D61 D37
# restates D61, the failure case of D37; no new ruling

D99 2026-10-18 [I>V] !
  pre:   the island is closed [I>V]
  trig:  the pointer sweeps across the notch without resting, on its way from Chrome's Help menu to the Wi-Fi icon [I>V]
  resp:  a sweep across that does not rest opens nothing [I>V]
  serves: N1
  touches: D51 D18
# restates the sweep clause of D51; no new ruling

D100 2026-10-18 [I>V] !
  pre:   IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black [I>V]
  trig:  a new song starts in Apple Music [I>V]
  resp:  while any app is fullscreen a new song never pops the wings [I>V]
  serves: N1
  touches: D53 D42 D67
# restates the no-wings clause of D53; no new ruling

D101 2026-10-18 [I>V] !
  pre:   the visionary is sharing the screen in Zoom or Meet, or recording it [I>V]
  trig:  a new song starts, or the visionary hovers or clicks the notch, or drags a file onto it [I>V]
  resp:  the island does nothing at all until the share or recording ends [I>V]
  serves: N9
  touches: D83 D42 D51 D74 D33
# restates the first clause of D83; no new ruling

D102 2026-10-18 [I>V] !
  trig:  the visionary drags highlighted text onto the notch [I>V]
  resp:  dropped text is not accepted and the shelf is unchanged [I>V]
  serves: N6
  touches: D65 D33 D62
# restates the text clause of D65; no new ruling

D103 2026-10-18 [I>V] !
  pre:   a screenshot is parked on the shelf and its original is on the Desktop [I>V]
  trig:  the visionary drags it out of the shelf and lets go where nothing accepts it, such as a Messages chat refusing a recording as too large [I>V]
  resp:  a refused or empty drop leaves it on the shelf as it was; the original stays on the Desktop [I>V]
  serves: N6
  touches: D92 D34 D66
# restates the refused-drop clause of D92; no new ruling

D104 2026-10-18 [I>V] !
  pre:   the island is open on the shelf page with a new note being typed [I>V]
  trig:  the visionary types or pastes past the cap ruled in D62 [I>V]
  resp:  typing or pasting stops at the cap; the note keeps the text up to the cap and the rest is not taken [I>V]
  serves: N6
  touches: D62 D37
# restates the over-cap clause of D62; no new ruling

D105 2026-10-18 [I>V] !
  trig:  the visionary takes a screenshot copied only to the clipboard, or saves an image with another screenshot tool [I>V]
  resp:  a screenshot copied only to the clipboard and images saved by other screenshot tools never land on their own [I>V]
  serves: N6
  touches: D64 D32
# restates the exclusion clause of D64; no new ruling

D106 2026-10-18 [I>V] !
  pre:   `tax-return.pdf` is parked on the shelf from the Documents folder [I>V]
  trig:  the visionary moves it to the Trash [I>V]
  resp:  a file moved to the Trash leaves the shelf [I>V]
  serves: N6
  touches: D58 D36
# restates the Trash clause of D58; no new ruling

D107 2026-10-18 [I>V] !
  pre:   Chrome has a muted hover preview playing on the YouTube home feed in one tab and a muted autoplay clip on a news site in another [I>V]
  trig:  each starts playing [I>V]
  resp:  the muted preview does not count while it stays muted; the news-site clip never shows on the island [I>V]
  serves: N1 N2
  touches: D88 D78
# restates the not-counting clauses of D88; no new ruling

D108 2026-10-19 [I>V] amends D83
  pre:   the visionary is sharing the screen in Zoom or Meet, or recording it [I>V]
  trig:  a new song starts, or the visionary hovers or clicks the notch, or drags a file onto it [I>V]
  resp:  the island keeps working for the visionary as always, while nothing of it, wings, panel or shelf, appears in what the share or the recording captures; a screen recording that has just ended still lands on the shelf [I>V]
  serves: N9
  sib:   D109
  touches: D83 D101 N9 D42 D51 D64 D74 D33
# held finding F12 after the cold read: Apple documents no supported way for an app to detect screen sharing (developer.apple.com/forums/thread/667549); the visionary took the option passed over at D83
# roads not taken: keep fully off while sharing as best effort; a manual pause switch beside Quit

D109 2026-10-19 [I>V] ! amends D101
  pre:   the visionary is sharing the screen in Zoom or Meet, or recording it [I>V]
  trig:  the island's wings, panel or shelf are showing on the visionary's screen [I>V]
  resp:  they appear in what the viewers see or in the recording [I>V]
  serves: N9
  touches: D101 D108
# the failure case of D108

D110 2026-10-19 [I>V]
  pre:   macOS still lets an app keep its own windows out of screen shares and recordings, on this Mac's version [I>V]
  trig:  the build finds macOS no longer allows an app to keep its windows out of shares or recordings [I>V]
  resp:  D108 is buildable only under this assumption; if it fails, the sharing question returns to the visionary [I>V]
  ->     fence-assumption hide-from-capture
  touches: D108
# reports disagree on macOS 15 and later (github.com/tauri-apps/tauri/issues/14200); unverified here

D111 2026-10-19 [I>V] amends D49
  pre:   Apple Music, a YouTube tab in Chrome and an IINA file are all playing, the YouTube tab started last [I>V]
  trig:  the visionary uses the flip control repeatedly [I>V]
  resp:  each flip shows the next source in turn among the sources the island can see separately, with a small `2 of 3` style count matching the faces shown; when IINA is visible it takes its turn, YouTube then IINA then Apple Music then YouTube again, and when the shared now-playing channel shows only another app, IINA has no face and the count reads `2 of 2` [I>V]
  serves: N1
  sib:   none -- a source leaving the card is ruled in D72
  touches: D49 D48 D72
# held finding F13: IINA reports only through the shared now-playing channel, which shows one app at a time (github.com/iina/iina/issues/4337, via the design draft); QuickTime Player and Music have their own scripting channels
# roads not taken: keep D49 with every source a face whatever it costs; the flip only swaps the two newest sources

D112 2026-10-19 [I>V] amends D45
  pre:   the island is open over "Wonderwall" playing at {1:40} [I>V]
  trig:  the visionary clicks back [I>V]
  resp:  "Wonderwall" restarts from {0:00}; a click on back at {3 seconds} into a song or earlier, {0:03} itself included, goes to the previous song instead, and from just after {0:03} it restarts [I>V]
  why:   {1:40} is the interviewer's example position; {3 seconds} was put as roughly what Apple Music and car stereos use, recalled rather than measured, among {2 | 3 | 5} seconds; the boundary at {0:03} counting as within was the visionary's ruling on held finding F1 [I>V]
  serves: N1
  spread: Back at <position> into Wonderwall plays <song> from the start
  sib:   none -- nothing before the first song is ruled in D47
  touches: D45 D23 D47
# roads not taken: {0:03} restarts, within meaning before {0:03}

D113 2026-10-19 [V]
  resp:  the new-song wing opens only to the left of the notch and never to the right; the right side of the notch is left to the status bar the visionary is adding there [V]
  ->     means N2
  touches: D67 D43 D42 D22 N2 N5
# held finding F2 reframed by the visionary: "the wing should only open left. Never go right, I am currently adding a status bar that would go on the right anyways"
# rule 7: contradicts the right-wing fallback and the right-side playing indicator in D67; the no-room case and the indicator are put back as decision points before D67 is restated

D114 2026-10-19 [I>V] amends D67
  resp:  a new-song pop-out shows as a single wing to the left of the notch inside the menu bar strip for {4 seconds}, never covering an app menu or a status icon and never reaching right of the notch: it shows the cover art and as much of the title as fits in the free gap; with less room the title goes first and the art shows alone; when even the art does not fit, nothing pops; there is no playing indicator; hovering always opens downward with the full controls [I>V]
  why:   the duration is the ruling of D42; left only is the visionary's reframe in D113; art alone then nothing was the visionary's pick for the no-room case; the indicator was dropped on the interviewer's labelled pick, since on the left it would cost the title letters [I>V]
  ->     means N2
  serves: N1
  spread: The new-song notice finds room: <where>
  touches: D67 D113 D42 D44 D53 N2 N5
# held finding F2; the right wing and the card below the notch are gone
# roads not taken: a small card below the notch when the left has no room; skip the notice whenever the title cannot fit; the indicator inside the left wing after the title

D115 2026-10-19 [I>V] amends D42
  pre:   the island is closed and Apple Music is near the end of "Wonderwall" with "Champagne Supernova" next [I>V]
  trig:  "Wonderwall" ends and "Champagne Supernova" starts [I>V]
  resp:  a small wing slides out left of the notch with the cover art and "Champagne Su…", and folds back into the plain notch on its own after {4 seconds} [I>V]
  why:   the interviewer's labelled pick among {2 | 4 | 6} seconds: about a second to notice and one to two to read a short title, under the roughly five seconds macOS keeps a notification banner, since the wing covers the end of the menus; left only per D113 [I>V]
  serves: N2
  spread: The wings checked <after> after a new song starts
  sib:   D100
  touches: D42 D113 D114

D116 2026-10-19 [I>V]
  pre:   `tax-return.pdf` is parked on the shelf from the Documents folder [I>V]
  trig:  the visionary drags it out of the shelf onto the Desktop, and Finder moves it there [I>V]
  resp:  the Desktop accepted the drop, so the file leaves the shelf as after any accepted drop, and it now sits on the Desktop [I>V]
  serves: N6
  sib:   D103
  touches: D92 D66 D58 D36
# held finding F3, the interviewer's labelled pick: one rule, an item leaves when something accepts the drop
# roads not taken: it stays on the shelf and follows the move to the Desktop

D117 2026-10-19 [I>V] amends D72
  pre:   Apple Music is playing "Wonderwall" at {2:10} and possibly other sources are playing too [I>V]
  trig:  the visionary quits Apple Music, quits IINA playing a file, or closes the YouTube tab that was playing [I>V]
  resp:  that source leaves the flip card; if another source still plays, the newest remaining one shows; if none does, the music page shows the last song paused and ready, and play reopens its app or its YouTube video in Chrome and resumes it where it left off, here at {2:10} [I>V]
  why:   {2:10} is the interviewer's example position for held finding F4 [I>V]
  serves: N1
  spread: Play after the visionary <closed> resumes <title> at <spot>
  sib:   D124
  touches: D72 D31 D48 D111
# held finding F4: the visionary ruled every reopened source resumes where it left off, not only YouTube
# roads not taken: a reopened app plays from the start; the reopened app decides

D118 2026-10-19 [I>V] amends D89
  pre:   a screenshot or screen recording is on the shelf [I>V]
  trig:  the visionary takes another screenshot or makes another screen recording within {60 seconds} of the previous capture, {30} in a row and a {31st} while documenting a bug [I>V]
  resp:  it joins that capture in one stack whose label counts what is inside, such as `3 screenshots, 1 recording`; a stack has no maximum, so the {31st} capture makes `31 screenshots`; the stack drags out as one group or expands; a gap longer than {60 seconds} starts a new item [I>V]
  why:   thirty is the interviewer's stress case for a burst, not a cap, per held finding F5; the minute was the visionary's pick among no item between, {60 seconds} and {10 seconds} [I>V]
  serves: N6
  spread: A capture <gap> after the previous one <result>
  sib:   none -- a stack has no ceiling to fail at
  touches: D89 D55 D54 D64
# roads not taken: a stack holds at most thirty and the next capture starts a new one

D119 2026-10-19 [I>V]
  pre:   the island is open over a song [I>V]
  trig:  the song plays from Apple Music, youtube.com or soundcloud.com in Chrome, IINA, QuickTime Player or Music, out through the MacBook speakers or a Bluetooth speaker such as `JBL Flip 5` [I>V]
  resp:  the source line names the site for Chrome sources and the app otherwise, `YouTube`, `SoundCloud`, `Apple Music`, `IINA`, `QuickTime Player`, `Music`, and adds the speaker only when it is not the built-in one, as in `YouTube · JBL Flip 5` [I>V]
  serves: N1
  sib:   none -- a label has no failure of its own
  touches: D24 D26 D73 D4
# held finding F6
# rule 7: D73 has the source line change to `MacBook speakers` when the Bluetooth speaker drops; put back to the visionary
# roads not taken: app, site and speaker always, as `Chrome · YouTube · JBL Flip 5`; the site instead of Chrome with the speaker always shown

D120 2026-10-19 [I>V] amends D73
  pre:   "Wonderwall" is playing from Apple Music out through the Bluetooth speaker `JBL Flip 5`, the source line reading `Apple Music · JBL Flip 5` [I>V]
  trig:  the speaker disconnects mid-song [I>V]
  resp:  nothing pops out; the source line becomes `Apple Music`, the speaker part simply gone, and the play state shows whatever the app did [I>V]
  sib:   none -- no notice is the ruled outcome
  serves: N1
  touches: D73 D119 D1 D4
# rule 7 collision of D119 with D73, put to the visionary: the new label rule wins
# roads not taken: name `MacBook speakers` once right after the drop until the song changes

D121 2026-10-19 [I>V]
  pre:   Apple Music is playing "Wonderwall" and a YouTube tab in Chrome started after it [I>V]
  trig:  the visionary hovers the notch and later flips the card [I>V]
  resp:  whenever the card has a flip control it shows a count, the newest source as `1 of 2` and after one flip Apple Music as `2 of 2`; with three sources the same count runs `1 of 3` to `3 of 3` [I>V]
  serves: N1
  sib:   none -- a count has no failure of its own
  touches: D48 D111
# held finding F7, the interviewer's labelled pick, consistent with the `2 of 2` case already ruled in D111
# roads not taken: the count shows only from three sources

D122 2026-10-19 [I>V]
  pre:   the island is closed, Apple Music is playing "Wonderwall", and a muted YouTube preview is playing in Chrome, ignored per D88 [I>V]
  trig:  the visionary unmutes the preview [I>V]
  resp:  the preview joins the flip card as a source from that moment, and no wing pops [I>V]
  serves: N1
  sib:   none -- the no-pop outcome is itself ruled here
  touches: D88 D115 D114 D121 N2
# held finding F8, the interviewer's labelled pick: N2 is about seeing a new song without doing anything, and unmuting is doing something
# roads not taken: unmuting pops the wing like a new song

D123 2026-10-19 [I>V]
  pre:   a note of {130 characters} is on the shelf [I>V]
  trig:  the visionary clicks its text to edit it and types past {140 characters} [I>V]
  resp:  typing stops at {140 characters}, as when a note is first written; every note stays at {140 characters} or fewer [I>V]
  why:   {130 characters} is the interviewer's example for held finding F9; the cap is D62 [I>V]
  serves: N6
  spread: Typing <added> more into a note of 130 characters leaves <kept>
  sib:   D104
  touches: D62 D63 D104
# roads not taken: the cap applies only when a note is first written

D124 2026-10-19 [I>V] !
  pre:   the island is open over "Wonderwall" playing in Apple Music [I>V]
  trig:  the visionary clicks pause, seeks, clicks the source line, or presses play on a quit source, and the app ignores it [I>V]
  resp:  the island shows a state the app is not in, such as play while the music keeps playing, or the progress dot where playback never went [I>V]
  serves: N1
  touches: D19 D25 D26 D117 D86
# held finding F10, the interviewer's labelled pick: the island always shows the app's real state and never its own guess, with no shake or message; this is the failure case the sib-none lines on D19, D25, D26 and D117 lacked

N10 2026-10-19 [I>V] visionary 2
  need:  when I am watching something fullscreen, I do not want it interrupted [I>V]
# held finding F11: the need under D53, laddered after the cold read; the interviewer's labelled pick; weight two as put and accepted

D125 2026-10-19 [I>V] amends D53
  pre:   IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black [I>V]
  trig:  a new song starts in Apple Music [I>V]
  resp:  while any app is fullscreen a new song never pops the wing; hovering the notch still opens the panel [I>V]
  serves: N1 N10
  tension: N2 -- a new song during fullscreen goes unannounced so the movie is not interrupted
  sib:   D100
  touches: D53 N10 D114 D16 N2

D126 2026-10-19 [I>V]
  resp:  the island may rely on a small companion Chrome extension, installed once by the visionary, to follow what youtube.com and soundcloud.com tabs are playing [I>V]
  ->     means N1
  touches: D3 D88 D96 D97 D82
# held finding F14, the interviewer's labelled pick: Chromium is turning off AppleScript-injected JavaScript and points apps to an extension (chromium.org/developers/applescript); Chrome reports all tabs as one system now-playing entry (web.dev/articles/media-session); since macOS 15.4 third-party apps are refused the system now-playing service (community.folivora.ai/t/now-playing-is-no-longer-working-on-macos-15-4/42802), all via the design draft
# roads not taken: no browser extension, ruled out; left as the build agent's own call

D127 2026-10-19 [V] signs D126
  resp:  the visionary read the contract, a normal read with no corrections, ruled the fourteen held findings, and signed the record as it stands [V]
  touches: D126

D128 2026-10-19 [V] amends D51
  pre:   the island is closed [V]
  trig:  the pointer rests on the notch for {0.15 seconds}, or sweeps across it without resting on its way from Chrome's Help menu to the Wi-Fi icon [V]
  resp:  felt on the real machine at the P1 tuning session, a rest of about {0.15 seconds} opens the island; a sweep across the notch on the way to a status icon still opens nothing [V]
  why:   {0.3 seconds} felt slow; half as long felt right, and a sweep did not open it [V]
  serves: N1
  spread: Resting the pointer on the notch for <rest> opens the island
  sib:   none -- the sweep case is ruled in this response
  touches: D51 D99 D18
# resolves the TBR on D51's rest

D129 2026-10-19 [V] ratifies D52
  resp:  felt on the real machine at the P1 tuning session, the grace of about {0.5 seconds} is right as ruled [V]
  spread: The pointer leaving the open island for <away>
  touches: D52
# resolves the TBR on D52's grace

D130 2026-10-19 [V] amends D124
  pre:   the island is open over "Wonderwall" playing in Apple Music [V]
  trig:  the visionary clicks or drags the progress bar to a new spot [V]
  resp:  the dot shows the chosen spot until Apple Music reports playback there, for at most about one second; if Apple Music never gets there, the dot returns to where playback really is [V]
  why:   without it the dot flashed back to the old position before settling, seen at the P1 tuning session; a hold that ends with the app's real state keeps the intent of the ruling it amends [V]
  serves: N1
  sib:   none -- a seek the app ignores is ruled in this response
  touches: D124 D18
