# Notch Island

Notch Island makes use of the dead space around the MacBook Air's camera notch. Rest the pointer
on the notch and it springs open into a **music panel** for whatever is playing. Scroll down and
the same panel becomes a **shelf** for screenshots, files, links, notes and reminders. When a new
song starts, a small **wing** slides out of the notch's left edge for four seconds, then folds
back.

It is a native Swift agent app for one Mac: no Dock icon, no settings, no window beyond the
island. It starts at every login and runs on events rather than timers, so a fanless Air barely
notices it.

- **Version:** 0.1.0 (`package.json`)
- **Platform:** a MacBook with a notch, macOS 14 or later. Developed and tested on a MacBook Air
  running macOS 27.2.
- **Status:** phases P1–P6 are merged. On the last full run, 491 of 500 acceptance rows passed:
  7 are deferred by ruling and 2 are known reds (see [Status](#status)).

---

## Contents

- [What it does](#what-it-does)
  - [Opening and closing](#opening-and-closing)
  - [The music page](#the-music-page)
  - [Music sources](#music-sources)
  - [The new-song wing](#the-new-song-wing)
  - [The shelf](#the-shelf)
  - [Around the clock](#around-the-clock)
- [What it deliberately does not do](#what-it-deliberately-does-not-do)
- [Install](#install)
- [Permissions](#permissions)
- [Where things are kept](#where-things-are-kept)
- [How it works](#how-it-works)
- [Building from source](#building-from-source)
- [Testing](#testing)
- [How this project is specified and built](#how-this-project-is-specified-and-built)
- [Repository layout](#repository-layout)
- [Platform facts, risks and limitations](#platform-facts-risks-and-limitations)
- [Status](#status)
- [Related: Meter](#related-meter)

---

## What it does

### Opening and closing

| Action | Result |
| --- | --- |
| Rest the pointer on the notch for about **0.15 s** | The island opens on the music page |
| Sweep across the notch without stopping | Nothing happens, so you can reach a status icon without opening it |
| Click the closed notch | It opens at once |
| Move the pointer off | It closes after a **0.5 s** grace period |
| Drag something | It never closes mid-drag, however far the pointer goes |
| Right-click the notch | A menu with one item: **Quit** |

The open island is a card of its own, about 8 points below the notch, with the plain notch above
it and nothing joining them. Inside the menu bar strip the island is never wider than the notch,
so the menus and icons beside it keep working, with no dead zone around it.

Opening springs out of the notch's own shape in about 0.4 s and overshoots by at most 4 points,
with the content fading in as it settles. Closing shrinks back in about 0.3 s with no bounce.

It works the same with an external mouse as with the trackpad. It works over fullscreen apps too:
hovering opens the panel, but no wing pops.

### The music page

- **The current song:** cover art, title, artist, and a **source line** such as `Apple Music`,
  `YouTube · JBL Flip 5` or `IINA`.
- **A progress bar.** Click the bar or drag its dot to seek.
- **Back, pause/play and skip.**
  - **Back** within the first three seconds (`0:03` included) goes to the previous song. Later,
    it restarts the current song.
  - **Skip** and **back** with nothing next or before go to the playing app, and the island shows
    whatever that app does.
- **Clicking the art or the source line** brings the playing app to the front. For a Chrome
  source, it brings forward the exact tab.
- **When nothing is playing**, the last song shows paused and ready, and play starts it again.
  Before any song has ever played, the page reads `Nothing played yet`.
- **When more than one source is playing**, the newest one shows, with a flip control and a count
  such as `1 of 2`. Flipping turns the card like a mirror to the next source, and the flipped
  card's buttons control that source. A paused source stays one flip away until its app quits or
  its tab closes.
- **The island always shows what the app is really doing.** If Music ignores a pause or a seek,
  the button and the dot stay where playback actually is. The island does not shake or show a
  message.

Control Center and the keyboard's media keys keep working as they always did, and the island
follows what they do.

### Music sources

| Source | Counts when | Source line |
| --- | --- | --- |
| **Apple Music** (streamed or downloaded) | playing | `Apple Music` |
| **youtube.com** in Chrome | the tab is playing *with sound* | `YouTube` |
| **soundcloud.com** in Chrome | the tab is playing with sound | `SoundCloud` |
| **IINA** | playing a local file | `IINA` |
| **QuickTime Player** | playing a local file | `QuickTime Player` |

- Downloaded `mp4`, `mp3`, `wav`, `mov` and `mkv` files count in whichever of IINA, QuickTime
  Player or Music your default apps open them in.
- No other Chrome site counts. A muted YouTube preview doesn't count until you unmute it. Then it
  joins the flip card but doesn't pop the wing, because unmuting is something you did yourself.
- The source line adds the speaker's name only when it isn't the built-in one
  (`Apple Music · JBL Flip 5`). If a Bluetooth speaker drops mid-song, its name disappears from
  the line, and nothing pops.
- If you quit the app or close the tab, play on the island **reopens it where it left off**.
  For a YouTube video, this reopens the video at the same spot.

### The new-song wing

When a new song starts with the island closed:

- A wing slides out of the notch's **left** edge, inside the menu bar strip, **within a second**.
- It shows the cover art and as much of the title as fits in the free gap between the app's last
  menu and the notch. The gap is measured live, never hard-coded.
- **With less room, the title goes first and the art shows alone. If even the art doesn't fit,
  nothing pops.** The wing never covers an app menu or a status icon. On this Mac with Chrome in
  front, 139.5 points are free.
- It folds back by itself **four seconds** after the last song started. If you skip quickly, the
  wing stays out and the title changes without flicker.
- Moving onto the notch while the wing is out opens the full panel.
- **No wing appears:**
  - while any app is fullscreen
  - right of the notch. That side is left free for a status bar ([Meter](#related-meter)).
  - on an external monitor. The island exists only at the built-in notch.
  - if it didn't come out within the song's first second. A later app switch never brings out a
    wing that hadn't shown.

Nothing else moves on its own. There is no playing indicator, and reminders, speaker changes and
everything else wait until you look.

### The shelf

Scroll down with two fingers on the open island to reach the shelf page, which is the same size
as the music page. Scroll up to go back.

**What lands on the shelf by itself**

- New **screenshots** and **screen recordings**, from wherever macOS saves them (Desktop by
  default, or the folder you have set). The originals stay where they were saved.
- Captures taken within a minute of each other make a **stack**, with no maximum. Thirty
  screenshots taken while documenting a bug become one stack, and a 31st joins it. A stack drags
  out as one group or expands into its captures.
- Clipboard screenshots never produce a file, so they never land.

**What you can drop on the notch**

Drag onto the closed notch and it opens as a drop target:

| Dropped | Parked as |
| --- | --- |
| a file from Finder or the Desktop | one item |
| several files selected together | one stack |
| a folder | one item |
| a link from Chrome's address bar | a link |
| highlighted text | refused |

**Notes and reminders**

- **+ note** writes a one-line note of up to **140 characters**, while typing, pasting and
  editing. Return saves it. An empty note is not created, and emptying an existing note removes
  it.
- The **box** beside a note turns it into a reminder, and the **pencil** turns it back.
- **Checking off** a reminder removes it at once.
- Notes and reminders stay until you remove them. A reminder never pops the island out or draws
  attention to itself.
- Dragged into a chat, a note or reminder drops in as text and **stays** on the shelf.

**How the shelf treats your files**

- **The shelf points at files and never copies them.** Parking a file leaves it in its folder. A
  file moved in Finder stays on the shelf at its new place. A file moved to the Trash leaves the
  shelf.
- **Dragging an item out** works as if you dragged it from its folder. It leaves the shelf only
  if the drop was accepted, and the Desktop counts. A refused drop leaves it where it was.
- **Removing an item** with the small **×**, or the remove area that appears only while you drag
  a shelf item, takes it off the shelf and **never touches the file**.
- **Dropping an item on the Trash in the Dock** is the one action that moves a file. A file, a
  folder (with everything in it), a capture or a stack goes to the Trash. A link only leaves the
  shelf, and a note or reminder stays.
- **Ageing:** parked files and captures leave by themselves a full **24 hours** after landing.
  Links, notes and reminders never age.
- **Everything survives a restart**, and each parked file keeps its 24-hour clock.

### Around the clock

- **Starts at every login** with nobody opening it. **Quit** stops it until the next login.
- **Stays off other people's screens.** While you share or record your screen, the island keeps
  working for you, but nothing of it (wing, panel or shelf) appears in what is captured. Its
  windows are always marked to stay out of screen captures. A recording that just ended still
  lands on the shelf.
- **Cheap at rest.** With the island closed and music playing, it uses at most **3% CPU** and an
  **Energy Impact of 5**, averaged over a minute. The aim is near zero. Only two checks run on a
  clock:
  - QuickTime Player, about once a second, only while it is open
  - Music's playhead, every 10–15 s, only while it plays

  Everything else is driven by events.

---

## What it deliberately does not do

These were considered and declined while the project was scoped. The full list, with reasons, is
in [`features/OUT-OF-SCOPE.md`](features/OUT-OF-SCOPE.md).

- **No other island uses:** no timers, meeting countdowns, download progress, charging or AirPods
  status, or incoming alerts.
- **No settings,** no volume slider, no love/like button.
- **No keyboard shortcut** to open it, no Reduce Motion variant, no menu-bar theming.
- **Nothing right of the notch,** and nothing on an external monitor.
- **No installer or self-update.** How it is installed for other people is *deferred* until it is
  shared.
- **AI integration** is *deferred* as a future idea.

---

## Install

There is no installer yet (installing and updating are deferred until the island is shared). On
your own Mac:

```sh
npm run build:app                                          # or: sh scripts/build-app.sh
ditto build/apps.noindex/release/NotchIsland.app /Applications/NotchIsland.app
open /Applications/NotchIsland.app
```

On first launch the app registers itself to start at login (`SMAppService.mainApp`) and appears
at the notch. Grant the [permissions](#permissions) when macOS asks.

**Updating:** quit the island (right-click → Quit), rebuild, `ditto` over the old copy, and open
it again. The app is signed with the same local identity on every build, so macOS keeps its
Accessibility and Automation grants.

### The Chrome companion (for YouTube and SoundCloud)

Chrome reports all its tabs to macOS as a single now-playing entry, so the island uses a small
companion extension to follow individual tabs. Set it up once:

1. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**
   and choose `app/chrome-extension/`. The `key` in its manifest pins the extension id to
   `iibgeapdjhifkjdbhpehkdpjejakjnfh`.
2. Register the native-messaging host with your Chrome:
   ```sh
   npm run install:chrome-host -- --real
   ```
   This writes
   `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/local.notch_island.json`.
   It points at `/Applications/NotchIsland.app` and allows only the companion extension. Without
   `--real` (or `--chrome-dir <folder>`) the script changes nothing.

The extension reads only `youtube.com` and `soundcloud.com` tabs (`tabs`, `nativeMessaging` and
`alarms` permissions). It reports each tab's media-session metadata, position and audible state,
and carries the island's controls back to the tab.

### Uninstall

Removal was ruled not worth specifying. To remove it by hand:

1. Right-click the notch → **Quit**.
2. Remove it from **System Settings → General → Login Items**.
3. Delete these:
   ```sh
   rm -rf /Applications/NotchIsland.app
   rm -rf ~/Library/Application\ Support/notch-island       # the shelf, last song, Chrome relay
   rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/local.notch_island.json
   ```
4. Remove the companion from `chrome://extensions`.
5. Optionally, delete the build's signing keychain:
   `security delete-keychain ~/Library/Keychains/notch-island-dev.keychain-db`.

---

## Permissions

| Permission | Why |
| --- | --- |
| **Accessibility** | To read the frontmost app's menu bar items and the status icons, so the wing fits the free gap, and the Dock's Trash position, for the Trash drop |
| **Automation → Music** | Art, controls and seek for Apple Music (AppleScript) |
| **Automation → QuickTime Player** | Reading and controlling QuickTime Player |

It needs no Screen Recording permission. The app is **not sandboxed**, because several source
parts need access the sandbox denies. It is not meant for the App Store.

---

## Where things are kept

| Path | What |
| --- | --- |
| `/Applications/NotchIsland.app` | The app (bundle id `local.notch-island`) |
| `~/Library/Application Support/notch-island/` | The shelf (files and folders as bookmarks that survive a move), the last song, the Chrome relay socket |
| `~/Library/Keychains/notch-island-dev.keychain-db` | The local self-signed code-signing identity, made by `scripts/signing.sh` on the first build. It sits in a keychain of its own holding nothing else |

If the shelf's store can't be read, it is set aside rather than overwritten. An item on an
unmounted volume stays on the shelf and keeps ageing.

---

## How it works

The project is built from separate parts, so a new source or a new use can be added without
changing the others:

- **Source parts.** There is one part per source.
  - **Apple Music** listens for the `com.apple.Music.playerInfo` notification and uses AppleScript
    for art, controls and seek.
  - **Chrome** uses the companion extension over native messaging. The host is the app's own
    binary, started by Chrome. It answers only the extension and relays to the running island
    over a socket only you can open.
  - **IINA** has no scripting dictionary, so it is read from the system now-playing service.
    Since macOS 15.4 that service refuses third-party apps, so the island reads it through a
    small adapter (`app/adapter/now-playing-adapter.m`) loaded into the Apple-signed
    `/usr/bin/perl`.
  - **QuickTime Player** is read through Scripting Bridge, only while it runs.
  - The speaker name comes from the default audio output and its change notifications.
- **The now-playing hub** merges the sources into the flip card (newest in front, `n of m`),
  keeps the last song, and decides when a new song has started.
- **The island view.** Three borderless, non-activating panels (the notch, the open card and the
  wing) sit above the menu bar on the built-in screen. They are placed from the screen's reported
  areas either side of the camera housing. Outside the drawn shape they pass every click through,
  and they never take focus. The one exception is typing a note: then the card alone takes the
  keys and hands them back when you finish.
- **The shelf** is the stored list of items with their ageing clocks, plus drag in and drag out.
- **The capture watcher** reads the screenshot location from the screenshot preferences and
  follows it on file-system events. It parks only new files that macOS marks as screen captures
  (`kMDItemIsScreenCapture`).
- **The context guard** detects fullscreen from space and app changes, never by polling. It
  identifies the built-in screen and keeps every island window out of screen captures.

The logic below the surface lives in `IslandCore` (no AppKit) and is unit-tested: the back rule,
the flip order and count, the wing's fit in a gap, the shelf's stacking and ageing, the hover
state machine, the seek hold, and the Dock Trash hit test.

The motion is modelled on the *feel* of vorssaint-utils' island. None of its code is used: it is
GPL-3.0, and this project is not.

---

## Building from source

### Requirements

- A MacBook with a notch, macOS 14 or later
- The **Command Line Tools** (`xcode-select --install`), with Swift 6.x. **Xcode is not
  needed**, and there is no Xcode project.
  - The 2026-10-29 Command Line Tools ship a default macOS 27.2 SDK without the SwiftUI macro
    plugin. While that is the case, `scripts/lib/sdk.sh` builds against the **macOS 26.5 SDK**
    installed beside it. An `SDKROOT` you set yourself wins.
- **Node.js** (a current LTS) and `npm install`, for the tests and lints. The dev dependencies
  are `gherkin-node-test` and `@bingh/docketry`. If docketry is not on the registry yet,
  `npm link` it from a local checkout.
- For the acceptance tests: **Google Chrome, IINA, Music and QuickTime Player**.

### Commands

| Command | What it does |
| --- | --- |
| `npm run build:app` | Builds and bundles everything (below) |
| `npm test` | `build:app`, then every `test/**/*.test.js`, including the full feature suite |
| `swift test` | Unit tests (swift-testing) for `IslandCore` and `HarnessCore` |
| `npm run lint` | `swift format lint --strict` over `Sources/` and `Tests/`, then `npm run scope` |
| `npm run scope` | Strict Gherkin lint of the feature files and the scope check |
| `npm run install:chrome-host` | Writes the Chrome native-messaging host manifest (needs `--real` or `--chrome-dir`) |

`npm run build:app` produces:

| Output | What |
| --- | --- |
| `build/apps.noindex/release/NotchIsland.app` | The app as installed. No test input compiled in |
| `build/apps.noindex/test/NotchIsland.app` | The test build (`local.notch-island.test`), with `-DISLAND_TEST_INPUT` |
| `build/island-harness` | The acceptance harness's helper. Never bundled |
| `build/now-playing-adapter.dylib` | The IINA adapter, also copied into the app's `Resources` |
| `build/now-playing-reader.dylib` | The harness's own now-playing reader, independent of the app's |

The bundles live under a `.noindex` folder so Spotlight lists only the installed copy. The
release build uses SwiftPM's **native** build system, because the newer default writes no
`description.json` and the cost check reads it to prove the binary it measures is an optimised
release.

**Signing.** Every app the build makes is signed with one local self-signed identity,
`notch-island dev`. It lives in its own keychain, which `scripts/signing.sh` creates on first use.
macOS remembers Automation consent against an app's signature, and an ad-hoc signature changes on
every build, which would mean a new prompt every time. If the identity can't be made, the build
falls back to ad-hoc signing. The dylibs that perl loads stay ad-hoc.

**Test-only input.** The test build accepts injected values the harness feeds: a clock, an
output-device name, a menu-bar gap width, a scratch data folder, and the rest and grace times.
Only debug and test builds read these. The installed app has no such switches.

---

## Testing

There are three layers. All of them must exit 0 before a phase merges.

### 1. Acceptance criteria: `npm test`

Every scenario in `features/*.feature` runs as a real test through
[gherkin-node-test](https://www.npmjs.com/package/gherkin-node-test). The steps live in
`test/steps/`, and helpers live in `test/support/`. The run writes
`features/run-manifest.ndjson`.

- **Then steps read the far side**, never what the island wrote about itself:
  - the island's content through the Accessibility tree, with screenshot pixels where position
    matters
  - Music and QuickTime through their own AppleScript dictionaries
  - Chrome tabs through a test Chrome's DevTools protocol (the media element's `paused`,
    `currentTime` and `muted`), never through the extension
  - IINA through the harness's own now-playing reader
  - files through the file system and `mdls`
  - drops through a stand-in receiving app
  - cost through the system's own process samples
- **Stand-ins, not your things.** Tests play generated media (a `Wonderwall`-titled track in a
  test Music playlist, a no-art `concert_2019_final_v2.mkv`). They serve stand-in youtube.com and
  soundcloud.com pages locally to a test Chrome, and work in scratch Desktop, Documents and
  screenshot folders. A test never touches your real Music library, Desktop, shelf or Chrome
  profile. The installed island steps aside for a run and comes back afterwards.
- **The `wip` ratchet.** Scenarios not yet bound sit in a register that can only shrink.

**Sharing the Mac with the tests.** You can keep using the Mac while work goes on:

- Building, unit tests and lint run any time.
- Every UI run goes through **`scripts/when-idle.sh <command>`**. It waits for **3 minutes with no
  keyboard or trackpad input**, on AC power, with the lid open, the screen awake and unlocked,
  and sound going to the built-in speakers. Headphones count as you using the Mac.
- While a run is going, any input the harness didn't make **stops it within about a second**. The
  pointer goes back where you left it, and the run is marked *void*, with an exit code distinct
  from a failure. It is retried at the next idle window.

So a full gate looks like:

```sh
sh scripts/when-idle.sh caffeinate -i npm test
```

**Before running**, give the terminal **Accessibility**, **Automation** (Music, QuickTime Player,
System Events) and **Screen Recording** permission. The harness reads the island, moves the
pointer, checks pixels, and proves that the island is absent from captures.

### 2. Unit tests: `swift test`

These use the swift-testing package, pinned in `Package.swift`, because the Command Line Tools'
SwiftPM gives a plain `swift test` runner no Testing module. `IslandCoreTests` covers the
island's logic, and `HarnessCoreTests` covers the harness's input guard and capture verdicts.

### 3. Lint: `npm run lint`

`swift format` at strict, plus `npm run scope` (strict feature lint and the scope check).

### Checks that wait on the real world

| Check | Why it's not automated | Ruling |
| --- | --- | --- |
| Zoom and Meet *viewer* scenarios | They need a real remote viewer's evidence. Hidden-from-capture is proven against the system's own recording and capture | deferred (D144) |
| A real logout and login | The scenarios relaunch the registered app in its place | deferred (D145) |
| With an external monitor attached | The scenario needs the `PM161Q J` monitor connected as an extended display, and refuses to run without it | deferred (D146) |

---

## How this project is specified and built

Notch Island was built with an acceptance-driven process (aBDD). The behaviour was agreed in a
scoping interview *before* any code was written. Each phase was then built against that agreement
and reviewed by independent agents. The documents in `features/` are the contract:

| File | Role |
| --- | --- |
| `features/*.feature` | **The contract.** Gherkin scenarios, each tagged with the ruling that decided it. At build time only these bind |
| `features/DOCKET.md` | Every ruling (`N…` needs, `D…` decisions), dated, in the [docketry](https://www.npmjs.com/package/@bingh/docketry) grammar |
| `features/USER-NEEDS.md` | Why the island exists, need by need (N0–N10), with tensions and coverage |
| `features/OUT-OF-SCOPE.md` | Declined, deferred, named assumptions, out of reach, roads not taken |
| `features/DESIGN.md` | Principles, shape, constraints, platform facts and risks, and a changelog of every design choice |
| `docs/BUILD-PLAN.md` | The phases, the per-phase process and risk, the acceptance bars |
| `docs/scope-held-findings.md` | Findings from the cold read of the contract, all since ruled |

Each phase went through the same steps: a cold builder, two independent reviewers (one checking
contract and test honesty, one checking the phase's named risk), a head reviewer, a
failing-test-first fix round, a verifier, and the three-layer gate. The phases were:

| Phase | Built |
| --- | --- |
| P1 | The island and its music panel (Apple Music) |
| P2 | Music sources and the flip card (Chrome companion, IINA, QuickTime) |
| P3 | The new-song wing, plus the idle waiter and input guard |
| P3.5 | The island's shape and motion (the detached card, springs) |
| P4 | The shelf: captures and files |
| P5 | The shelf: notes and reminders |
| P6 | Around the clock: login, Quit, cost ceiling, hidden from capture |

**Changing behaviour** means changing the contract first. A feature file, the docket, the fence,
the needs ledger or a `[ruled]` design line is never edited to make a test pass. If the build
finds a named assumption false (hidden-from-capture above all), the phase stops and the question
goes back to the owner.

---

## Repository layout

```
Package.swift              SwiftPM manifest (swift-tools 6.0, macOS 14, swift-testing pin)
app/
  Info.plist               bundle template (agent app; name, id, version filled in by the build)
  adapter/                 the now-playing adapter loaded by /usr/bin/perl (IINA)
  chrome-extension/        the companion extension (MV3) and its pinned id
Sources/
  IslandCore/              the logic: no AppKit, unit-tested
  NotchIsland/             the app: island windows and view, source parts, wing, context guard
  HarnessCore/             the harness's decisions (input guard, capture verdicts), unit-tested
  island-harness/          the harness's helper: Accessibility, pointer, screen and capture reads
Tests/
  IslandCoreTests/         unit tests for the island's logic
  HarnessCoreTests/        unit tests for the harness's decisions
features/                  the contract (see above) and run-manifest.ndjson
docs/                      build plan, P6 capture evidence, held scope findings
scripts/
  build-app.sh             build, bundle and sign the release and test apps, the adapter, the harness
  build-harness.sh         the harness helper
  signing.sh               the local signing identity
  lib/sdk.sh               the SDK pin
  install-chrome-host.js   the Chrome native-messaging host manifest
  when-idle.sh / .js       run a UI command only in an idle window, under the input guard
  lint-features.js, scope-check.js   npm run scope
  verify-installed-login.js          read-only check of the installed app's login registration
  test-p6-*.js             the P6 capture and login verification runs
test/
  features.test.js         every feature file under the wip ratchet
  steps/                   step definitions, one file per feature
  support/                 the harness: island, Music, Chrome, players, shelf, capture, cost, guardians
  *.test.js                tests of the harness itself and of specific fixes
```

---

## Platform facts, risks and limitations

- **IINA relies on a gap Apple may close.** Since macOS 15.4 the now-playing daemon refuses
  third-party clients, and the perl-loaded adapter works around that. The workaround is used only
  for IINA, so if Apple closes the gap, only that source is lost. That service also names only
  one current app, so while IINA plays beside Apple Music and a YouTube tab it may have no face:
  the count then reads `2 of 2`.
- **Hidden-from-capture rests on macOS.** Apple offers no supported way to tell that the screen is
  being shared, so the island doesn't try. Instead it keeps its windows out of captures at all
  times. Whether that holds is a named assumption, checked on this Mac against the system's
  recording and capture. If a macOS release stops honouring it, the question goes back to the
  owner rather than being patched over.
- **Trash drops are read through Accessibility.** The Dock reports a drop on its Trash
  inconsistently, so the island reads the Trash's position from the Dock through Accessibility
  and checks where the drag ended.
- **Behaviour learned on macOS 27:**
  - App menus that don't fit left of the notch now continue past it instead of hiding.
  - The notch's frame sits at a half point (x `762.5`).
  - The system's own status icons are drawn by a `MenuBarAgent` process.
  - Chrome swaps tabs for prerendered ones without reporting a close, and suspends idle extension
    service workers after about 30 s. The extension drops gone tabs and wakes on an alarm.
- **Only the built-in screen.** With your eyes on an external monitor a wing can go unseen. This
  was accepted as a trade-off. The design assumes an extended (never mirrored) external display
  and the lid never closed while working.
- **The cost ceiling is measured on the release build,** summing the island, its helpers and its
  Chrome host.

---

## Status

Phases P1–P6 are merged into `main`, followed by bug-fix rounds:

- the Chrome extension keeps one live connection and drops vanished tabs
- the Dock Trash drop
- the remove area fitting inside the shelf page
- Apple Music resuming a streamed song after Music quit
- an audit pass that caught the tests up with macOS 27 and the new toolchain

The last full suite (commit `90628ed`) ran **491 of 500 rows green**:

- **7 deferred by ruling.** These are the Zoom and Meet viewer rows (D144) and the
  external-monitor row (D146).
- **2 red:**
  - the 20-songs-a-second-apart wing row
  - one flip row while IINA has no face

The real logout-and-login check (D145) and a manual check with the real `JBL Flip 5` speaker
are still to be done by hand.

---

## Related: Meter

[`menubar-meter`](../menubar-meter) is a sibling project, built the same way. It shows CPU, GPU,
RAM and chip temperature in the menu bar **right of the notch**, the space Notch Island leaves
free for it. Its panel is drawn in Notch Island's style. Notch Island's harness checks that a
status item there stays clear of the notch and reports a collision as an environment problem,
not a failure of the island.
