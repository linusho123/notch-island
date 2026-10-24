# Build plan — notch-island

The reviewed contract is `features/` (signed D127 for D126). The feature
files bind, `DESIGN.md` bounds, and `USER-NEEDS.md` explains. Each phase binds
scenarios to real tests under the gherkin-node-test ratchet: a feature leaves
the `wip` register only when every one of its steps is bound and green, `wip`
only shrinks, and the run manifest (`run-manifest.ndjson`) is committed with
every phase.

Phases run in need-weight order where dependencies allow: N1's music panel
and sources first (weight 5; P1 also builds the app and the harness every
later phase uses), then N2's new-song notice (weight 4, with N5 and N10
bounding it), then N6's shelf (weight 3), then N7's cost and N9's sharing
(weight 3), measured over the finished app. Because the music panel's file
reaches into later parts (an IINA file, a Chrome tab, a shelf drag), a phase
binds every scenario its parts make possible and a feature leaves `wip` in
the phase that binds its last one; each phase lists both.

## Process, every phase

1. **Cold builder** (opus) on branch `pN-<name>`, cut from `main` at the
   phase base, with a self-contained brief. It builds the behaviour, binds the
   phase's scenarios, runs its mutation probes, and commits on the branch.
2. **Two independent cold reviewers** (sonnet), read-only. Neither sees the
   other's review or the builder's report.
   - **Reviewer A — contract and test honesty:** every scenario bound as
     written, every Then far-side, every probe real, nothing on the fence
     built, no feature file, docket, fence, ledger or `[ruled]` DESIGN line
     edited.
   - **Reviewer B — the phase's named risk** (each phase names it below).
3. **Head reviewer** (opus) reconciles both reviews against the code and the
   contract into one ranked fix list, runs its own mutation probes, and drops
   false findings with their reasons. Questions for the visionary stop the
   run here and are put to them before the fix round; the builder never
   answers them.
4. **Fix round** (sonnet) on the same branch, a failing test before each fix;
   a fresh verifier (opus) confirms each fix's test failed before and passes
   after. Then the gate.
5. **Gate — the aBDD workstack, three legs, all must exit 0:**
   - **Acceptance criteria:** `caffeinate -i npm test` (build, bundle, the
     feature suite under the `wip` ratchet) with the Mac **plugged in and the
     lid open**, started through `scripts/when-idle.sh` (from P3 on; see
     Sharing the Mac). Lid closed on battery is Clamshell Sleep and stalls
     the run; check `pmset -g log` before blaming code.
   - **Unit tests:** `swift test` — the builder adds unit tests for the logic
     below the island's surface (layout of the wing in a gap, the hub's
     ordering and counts, the shelf's ageing and stacking clocks, the back
     rule's boundary), alongside the bound scenarios, never instead of them.
   - **Lint:** `npm run lint` — `swift format lint --strict` over `Sources/`
     and `Tests/` (the toolchain's own swift-format 6.3) plus `npm run scope`
     (strict feature and docket lints, the SKILL.md validation script).
   Exit codes of each leg reported.
6. **Integrate:** merge to `main`, commit the run manifest, store a
   treecontext resume pointer that supersedes the last one, report, and
   **stop for the visionary's go-ahead** before the next phase.

Run each phase with `/build-pipeline <phase>`. Models (checked in
`~/.claude/workflows/build-phase.js`, DEFAULT_MODELS, 2026-10-19): builder
opus, both reviewers sonnet, head reviewer and verifier opus, fixer sonnet;
the gate inherits the session's model, so pass `models: { gate: "opus" }` to
pin it.

## Sharing the Mac (ruled by the visionary 2026-10-23, from P3 on)

The visionary keeps using this Mac for other work while a phase runs, so
nothing may need them hands-off by default:

- **Screen-free work runs any time:** building, reviewing, unit tests
  (`swift test`), lint and scope. No agent moves the pointer, clicks, types
  into another app or brings a window forward outside a UI run.
- **UI runs wait for an idle window:** every acceptance run (the builder's
  and reviewers' scenario and mutation runs, the verifier's, the gate) goes
  through `scripts/when-idle.sh`, which starts the command only after **3
  minutes** with no keyboard or trackpad input (`HIDIdleTime`), on AC power,
  lid open, screen awake and unlocked. Agents wait for it; they never ask the
  visionary to step away.
- **Instant stop:** while a UI run is going, any keyboard or trackpad input
  that the harness did not make stops the run within about a second, returns
  the pointer to where the visionary left it, and marks the run void (exit
  code distinct from a failure). A void run is retried at the next idle
  window and never counts as red or green.
- **Built first in P3:** the waiter and the input guard, failing-test-first,
  before any P3 UI run. Until they exist, no UI run starts.

## Acceptance bars, every phase

- **Far-side assertions.** Then steps read what macOS or the other app itself
  shows or knows, never what the island wrote about itself for the test:
  - the island's drawn content through the Accessibility tree (System
    Events), plus screenshot pixels where position or covering matters (the
    wing's edges against the menu bar items' own Accessibility frames);
  - the playing app's real state from that app: Apple Music, Music and
    QuickTime Player through their AppleScript dictionaries; a Chrome tab
    through a test Chrome started with remote debugging (the page's media
    element, `paused`, `currentTime`, `muted`), never through the companion
    extension; IINA through the system now-playing service read by the
    harness's own helper, independent of the island's;
  - files and the shelf's effects through Finder and the file system
    (`ls`, `mdls`), drops through the receiving app (a Messages-like
    stand-in that records what it received);
  - cost through `top -l` CPU and `POWER` columns of the island's process.
- **Givens may inject, Thens may not.** Spreads that need exact values (song
  positions, a 2 GB refused drop, a 24-hour clock, a Bluetooth output named
  `JBL Flip 5`, a left gap of a given width) go through a test-only input the
  harness feeds: a clock, an output-device name, a menu-bar layout. It is
  compiled out of the installed app, it replaces only an input, and no Then
  may read it. Each phase that binds an outline through it also binds at
  least one scenario against the real system.
- **Stand-ins, not the visionary's things.** Tests play generated audio and
  video files (a tagged `Wonderwall`-titled track in a test Music library
  playlist, a no-art `concert_2019_final_v2.mkv`, short `.mov` and `.wav`
  files), serve stand-in pages for youtube.com and soundcloud.com from a
  local server mapped onto those hostnames in the test Chrome only, and work
  in a scratch Desktop, Documents and screenshot folder. A test never touches
  the visionary's real library, Desktop, shelf or Chrome profile. One smoke
  scenario per Chrome site may run against the real site if the network is
  up; it is never the only binding of a scenario.
- **Mutation-checking.** For every bound scenario, a deliberately broken
  island turns it red. The builder lists its probes; the head reviewer runs
  its own.
- **The fence holds.** Nothing on `OUT-OF-SCOPE.md` is built: no countdowns,
  device status or incoming alerts; no keyboard shortcut, Reduce Motion
  variant or menu-bar theming; no settings, volume slider or love button; no
  installer or self-update; nothing drawn on the external monitor; nothing
  right of the notch.
- **Never edited by a phase:** `features/*.feature`, `features/DOCKET.md`,
  `features/OUT-OF-SCOPE.md`, `features/USER-NEEDS.md`, `[ruled]` lines in
  `features/DESIGN.md`. A `[chosen]` DESIGN change appends a changelog line.
  A named assumption the build finds false (D110 above all) stops the phase
  and goes to the visionary.

## Prerequisites (the visionary, once, before P1)

- **Accessibility** for the terminal that runs the tests (System Settings →
  Privacy & Security → Accessibility), so the harness can read the island and
  the menu bar and move the pointer.
- **Automation** for that terminal to control Music, QuickTime Player and
  System Events; the first P1 run prompts for each.
- **Screen Recording** for that terminal, so the harness can take the
  screenshots that check pixels and, in P6, prove the island stays out of a
  capture.
- Nothing else to install: Swift 6.3 (Command Line Tools), Google Chrome,
  IINA, Music and QuickTime Player are on this Mac (checked 2026-10-19,
  macOS 26.6.2). The app builds with Swift Package Manager and is bundled and
  ad-hoc signed by script; the companion Chrome extension loads unpacked into
  the test Chrome, and P2 ends with the one-time install into the visionary's
  own Chrome (D126).

## Open questions for the visionary (before the phase that needs them)

These scenarios cannot be fully driven by an automated test on this Mac.
Each needs a ruling on how it counts as bound; until then it stays in `wip`.

- **Q1 (P1, P6) — real logins.** "After Quit, the next login starts the
  island again" (D86) and the login scenarios of D60 need a real log-out and
  log-in. Options: bind them to macOS's own login-item registry (it lists the
  island as enabled) plus one manual log-in check by the visionary recorded
  in the phase report; or keep the login steps manual only.
  *Ruled 2026-10-19:* registry binding plus one manual check. The visionary
  deferred the manual log-out/log-in check to the very end of the build (after
  P6); the release build was installed to /Applications and registered at
  login on 2026-10-19 (P1, 57a9b41).
- **Q2 (P2) — the real Bluetooth speaker.** The `JBL Flip 5` scenarios (D4,
  D119, D120) run against an injected output-device name. Options: that
  binding plus one manual check by the visionary with the real speaker,
  connected and then switched off mid-song, recorded in the phase report; or
  injected only.
- **Q3 (end of P1) — tuning the feel.** The 0.3 s rest (D51) and the 0.5 s
  grace (D52) are held to be felt on the machine. Proposal: a short live
  session with the visionary on the P1 build, a tuning switch in a debug
  build only; any change is a new docket entry by the visionary (the TBR
  tokens resolve) before P1 merges.

---

## P1 — The island and its music panel (Apple Music)

**Contract:** `music-panel.feature` (17 scenarios, 8 outlines), the parts
that need only Apple Music and the island.
**Rulings:** D51/D99 (rest opens, a sweep does not), D74 (click opens),
D52 (grace; no close mid-drag of the progress dot), D18/D24 (panel
contents), D19 (pause/play), D124 (an ignored pause or seek), D20 (skip),
D112 (back and the 0:03 rule), D47 (nothing before), D76 (mouse), D31 (last
song ready), D90 (Nothing played yet), D29/D30 (the music page scrolls to an
empty shelf page), D86 (right-click Quit), D125 (hover in fullscreen), D60
(starts at login, per Q1), D16 (built-in notch only), D70 (no dead zone).
**Builds:**
- The SwiftPM package, the agent app bundle (no Dock icon), ad-hoc signing,
  login-item registration, `npm run build:app`.
- The island view: one borderless non-activating panel over the built-in
  notch, placed from the screen's notch areas; hit-testing with click-through
  outside the drawn shape; rest, sweep, click and grace; the panel with its
  two pages (the shelf page empty until P4); the right-click Quit menu.
- The context guard's screen and fullscreen parts.
- The Apple Music source part (player-info notifications, AppleScript art,
  controls, seek) and a minimal hub that holds one source and the last song.
- From day one, the island's windows are marked to stay out of screen
  captures; **the builder verifies D110 on this Mac in P1** (a
  ScreenCaptureKit capture and a `screencapture` shot both lack the island
  while it is visibly open) and stops the phase if it is false.
**Harness (reused by every later phase):**
- `test/features.test.js` with one `runFeatures` call and the `wip` register
  (all six features at the start).
- `steps/` definers; the Accessibility reader for the island and the menu
  bar; pointer driving (rest, sweep, click, drag, scroll, a mouse wheel);
  the app launcher; the scratch-folder sandbox; the test-input feeder; a test
  Music playlist built from generated tracks.
- `npm test` (build, bundle, suite), `swift test` (unit tests), `npm run
  lint` (swift-format strict) and `npm run scope` (strict feature and docket
  lints, the SKILL.md validation script) — the three gate legs every later
  phase reuses.
**Reviewer B's risk:** the island stealing what already works — a dead zone
around the closed notch, clicks swallowed outside the drawn shape, a sweep
that opens it, a panel that steals focus from the frontmost app; and that the
test input can never reach a Then.
**Binds now:** every music-panel scenario except the IINA concert-file ones
(D24, D25), the Chrome row of the source-line click (D26), and the shelf-item
row of the drag outline (D52).
**Register after P1:** `music-panel` stays in `wip` (finishes in P4).
**Expected probes:** opens on contact, opens on a sweep, closes instantly,
closes mid-drag, a dead zone beside the notch, focus stolen, pause shown
while still playing (D124), back at 0:03 restarting, the panel on the
external monitor, no Quit, Quit that also unregisters login.
**Exit:** P1's scenarios pass; Q3's tuning session held; scope clean;
manifest committed; DESIGN changelog lines for the SwiftPM build and the
window approach.
*Closed 2026-10-19:* gate green at 57a9b41; Q3 held (D128 rest 0.15 s, D129
grace 0.5 s, D130 seek hold); Q1's manual login check deferred by the
visionary to the end of the build.

## P2 — Music sources and the flip card

**Contract:** `music-sources.feature` (10 scenarios, 11 outlines), plus the
IINA and Chrome scenarios P1 left in `music-panel.feature`.
**Rulings:** D3/D5 (the sources), D88/D107 (Chrome only youtube.com and
soundcloud.com, only while sounding), D122 (unmuting joins quietly), D4/D119/
D120 (Bluetooth and the source line), D48/D111/D121 (the flip card, faces
only for what is visible, the count), D117 (a quit source leaves; play
reopens and resumes), D46 (nothing next → the app's own behaviour), D68/D69
(Control Center and media keys still work and the island follows), D24/D25/
D26 (the concert file, seek, the exact Chrome tab).
**Needs first:** the visionary's answer to **Q2**.
**Builds:** the companion Chrome extension and its native-messaging host;
the QuickTime Player part; the IINA part through the Apple-signed helper and
the now-playing adapter; the output-device name; the full hub (newest in
front, cycling, counts, a source leaving, reopen and resume); the source
line.
**Far-side checks:** each source's own state as listed in the acceptance
bars; Control Center's Now Playing tile read through Accessibility; media
keys sent as system key events.
**Reviewer B's risk:** the fragile channels — the now-playing adapter
breaking or lagging, IINA vanishing behind Apple Music, two Chrome tabs
confused for one, a muted tab counted, an extension message the island
trusts over the tab's real state; and the extension's native-messaging host
accepting messages only from the extension.
**Register:** `music-sources` leaves `wip`.
**Expected probes:** every Chrome site counted, a muted preview counted, the
wing on unmute, the oldest source in front, a count only at three, IINA given
a face it cannot keep, a reopened song from 0:00, `MacBook speakers` named,
skip greyed when nothing is next.
**Exit:** the extension installed once into the visionary's own Chrome, with
their go-ahead.
*Closed 2026-10-23:* gate green at b6a67b6 (npm test 273: 160 pass, 0 fail,
113 todo; swift test 121; lint 0; scope 0); `music-sources` left wip,
`music-panel` narrowed to its shelf-drag row (P4). Run by hand (the Workflow
tool was off): builder resumed after a rate-limit stop, two cold reviews, head
review (5 must, 8 should), fix round, verifier (S8 blocked once, fixed as S8b),
gate. Visionary rulings: D131 a paused source stays a face, D132 QuickTime
checked about once a second while open, D133 Music's playhead every 10–15 s;
M4 accepted as is: the D46/D47 Apple Music back row on the first song is an
equivalent mutant (Music's own back is a no-op there, and D47 makes the app's
response the outcome), like QuickTime's skip on a lone file. Still pending on
the visionary: the extension's one-time install into their own Chrome
(`npm run install:chrome-host -- --real`), the Q2 real JBL Flip 5 check
(deferrable to the end), the Q1 login check (end of the build).

## P3 — The new-song notice

**Contract:** `new-song-notice.feature` (4 scenarios, 4 outlines).
**Rulings:** D115/D42 (the wing for four seconds), D113/D114 (left only,
never over a menu or status icon, title then art then nothing), D78 (out
within a second on every source), D44 (fast skips update in place), D28
(hover over the wing opens the panel), D16 (built-in notch only, with an
external monitor), D125/D100 (no wing in fullscreen).
**Builds:** the wing view and its layout in the free gap left of the notch,
measured from the frontmost app's menu bar items; the hub's new-song event
with the one-second budget; the fast-skip hold.
**Far-side checks:** the wing's frame from Accessibility and pixels against
the menu bar items' own frames (none overlapped, nothing right of the notch);
the source app's track change time from that app; the external monitor that
is attached (PM161Q J) for "nothing on the external monitor".
**Reviewer B's risk:** covering — an app menu or status icon partly hidden,
a wing that reaches right of the notch, a layout measured once and stale
after an app switch; and timing — a wing that flickers on fast skips, a
budget met only for Apple Music.
**Register:** `new-song-notice` leaves `wip`.
**Expected probes:** a wing over Chrome's Help menu, a right wing, a playing
indicator, six seconds, 0.5 s vs 1.5 s lateness, a re-pop per skip, a wing in
fullscreen, a wing on the external monitor.
*Closed 2026-10-24:* gate at afb7037: swift test 174, lint 0, scope 0; UI
(through when-idle, 1 void) 319 tests, 228 pass, 1 fail, 90 todo — the fail
was the P1 row "Resting the pointer on the notch opens the music panel"
opening 4 ms past its allowed time; by the visionary's choice it was re-run
5× alone through the waiter, 5/5 green, and recorded here as a timing flake
(the run manifest committed is the gate run's, with that row red). Every P3
row passed, the external-monitor row on PM161Q J with a normal desktop on it.
`new-song-notice` left wip. Run by hand (Workflow tool off): builder (three
session-limit stops, resumed), two cold reviews, head review (4 must), fix
round, verifier. Rulings: D134 (a wing comes out within the first second or
not at all). Sharing the Mac built (scripts/when-idle.sh + input guard; an
early guard voided ~80 runs on the harness's own events until f5034ef).
Carried to P4's start: the in-idle-run guard in `test/support/harness.js` so
the six UI test files outside features.test.js and fullscreen-wing-out also
refuse to run outside the waiter; a plain-message failure when the external
screen shows a fullscreen app; head-review should-fixes S4 (stand-in menu bar
calibration), S5 (Apple Music art read inside the one-second budget), S6, S8,
S9; QuickTime's ~0.6 s latency margin to watch.

## P3.5 — The island's shape and motion (quick, asked by the visionary)

**Contract:** the new and reworded scenarios of `music-panel.feature` (the
neck, the opening spring, the opened and closing checks; the three rest/click
rewords on the fence's Sanctioned changes) and `new-song-notice.feature` (the
wing slides out and back).
**Rulings:** D135/D136 (inside the menu bar strip never wider than the notch;
the panel only below it), D137/D138 (spring out of the notch in about 0.4 s,
at most 4 points of overshoot, shrink back in about 0.3 s without bounce;
opening starts at the end of the rest), D139 (the wing slides the same way).
**Builds:** the drawn island as one shape whose menu-bar part is the notch's
width, with curved shoulders into the panel below; click-through everywhere
outside the drawn shape (the shoulders' corners included); the open, close
and wing motions driven frame by frame from the island's own state, so a
re-hover mid-close reverses smoothly; content fade-in on settle. No code from
vorssaint-utils (GPL-3.0).
**Far-side checks:** the drawn shape's frames sampled from Accessibility and
pixels during the motion, against the menu bar items' own frames (a test
status item right of the notch; never Meter itself, which is only read);
timing from the harness's own clock against those samples.
**Reviewer B's risk:** a mid-motion frame that covers a menu or status item,
a bounce that pushes the neck wider than the notch, clicks swallowed in the
transparent shoulder corners, a reversal mid-close that jumps, the motion's
cost against D79's ceiling.
**Quick path (the visionary's request):** one builder, one combined review
(contract and the risk above) instead of two, head review only if that review
finds a must-fix, then the full gate once at the end.
**Amendment (the visionary, 2026-10-24, before merge):** D140 reverses
D135: no neck. The open island is a card of its own below the menu bar
strip, its top about 8 points below the notch's bottom edge, the plain notch
above it and nothing joining them; it still grows down out of the notch and
shrinks back up into it with D137/D138's springs, and D136 (never wider than
the notch inside the strip) still holds. The shape scenario is reworded (the
fence's Sanctioned changes). The builder reshapes on this branch: the motion
math, springs, wing and harness work carry over; the click-through is simply
outside the card's rounded rect.
**Register:** no feature leaves wip; the reworded and new scenarios bind in
`music-panel` (out of wip apart from its P4 shelf-drag row) and `new-song-notice`, so they gate at once.

## P4 — The shelf: captures and files

**Contract:** `shelf-captures-and-files.feature` (20 scenarios, 11 outlines),
plus the shelf-item row P1 left in `music-panel.feature`.
**Rulings:** D30 (scroll between pages), D64/D105 (screenshots and
recordings land; clipboard and other tools never), D118 (stacks within a
minute, no maximum), D33/D65/D102 (drop onto the notch: files, several files,
folders, links; text refused), D36/D58/D106 (points, follows a move, a
trashed file leaves), D34/D92/D103/D116 (drag out; leaves only on an accepted
drop, the Desktop included), D66 (the x and the remove area), D57 (24 hours;
links and notes stay), D59 (survives a restart), D52 (no close mid-drag of a
shelf item).
**Builds:** the shelf store (bookmarks, ageing clocks, restart survival); the
capture watcher on the screenshot location; drag in, drag out and the remove
area; the shelf page's layout.
**Far-side checks:** real screenshots and recordings taken by macOS's own
tool (`screencapture`) into the scratch screenshot folder; the file system
and Finder for where files are; a drop-target stand-in that accepts or
refuses; a real relaunch of the island for the restart scenarios.
**Reviewer B's risk:** the visionary's files — a shelf that moves, copies or
deletes a file it only points at; a drag out that loses a note or a link on a
refused drop; a capture watcher that parks files macOS did not make; an
ageing clock reset by a restart.
**Register:** `shelf-captures-and-files` and `music-panel` leave `wip`.
**Expected probes:** a copy on park, a move on park, a trashed file kept, a
refused drop that still removes, a 61-second gap joined, a cap at thirty, a
clipboard shot landed, a link aged off, a restart that empties the shelf.

## P5 — The shelf: notes and reminders

**Contract:** `shelf-notes-and-reminders.feature` (9 scenarios, 3 outlines).
**Rulings:** D37 (+ note), D61/D98 (empty ignored), D62/D104/D123 (the cap,
on writing and editing), D63 (edit; emptied removes), D39 (the note and
reminder toggle), D40 (check off removes at once), D2 (reminders never draw
attention), D93 (drag out as text and stay), D66 (the x).
**Builds:** note entry and editing on the shelf page, the toggle, check-off,
text drag out.
**Far-side checks:** the receiving stand-in for the dropped text; the island's
closed state for "never draws attention" (no wing, no badge, pixels of the
notch area unchanged over the waiting time).
**Reviewer B's risk:** text loss — a cap that truncates silently on paste
past it (D104 says the rest is not taken, nothing more), an edit that drops a
note, a check-off on a misclick that cannot be told from a plain note's x.
**Register:** `shelf-notes-and-reminders` leaves `wip`.
**Expected probes:** 141 characters kept, an empty note created, a reminder
that pops, a checked reminder kept, a dragged note removed, no cap on edit.

## P6 — Around the clock

**Contract:** `around-the-clock.feature` (2 scenarios, 5 outlines).
**Rulings:** D60 (starts at login), D108/D109 (hidden from shares and
recordings while it works for the visionary), D79 (the cost ceiling), D70
(menus beside the closed island work as today).
**Needs first:** the visionary's answer to **Q1**.
**Builds:** nothing new unless a measurement fails; then optimisation inside
the lines.
**Far-side checks:** macOS's login-item registry; a ScreenCaptureKit capture
and a `screencapture` shot that lack the island while Accessibility shows it
open on screen; a real screen recording started by macOS's own tool that
then lands on the shelf; `top -l` CPU and `POWER` over a closed minute with a
generated track playing, measured on the release build.
**Reviewer B's risk:** measurement honesty — averaging that hides spikes, a
debug build measured, the test input left compiled in; and a capture check
that passes because nothing was on screen at all.
**Register:** `around-the-clock` leaves `wip`; the register is then empty.
**Exit:** the whole contract passes; a release build installed on this Mac
and registered to start at login, with the visionary's go-ahead.
