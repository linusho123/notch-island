# DESIGN — notch-island

The orienting document for the agent that builds notch-island. It sits at
the altitude where a statement survives its mechanism being swapped;
anything lower belongs in the builder's own notes. The feature files in this
directory bind; this document explains and bounds. A conflict between the
two is raised as a question, never resolved by editing one side alone.

**Edit doctrine.** Nobody edits this file outside a discussion: the human
and the agent iterate, the agent holds the pen, and every change appends one
Changelog line naming the ruling that sanctioned it. Changing a `ruled`
constraint is a reversal only the visionary can make; a `chosen` one still
takes a discussion, at a lower bar. A change with no changelog line is
indistinguishable from silent drift, and a downstream audit is right to
treat it as drift. The doc explains and bounds; it never overrides a feature
file — at build the feature files bind.

The visionary declined the technology-preferences step ("make it so", D96):
every stack choice below is the builder's own and tagged `chosen`; the
`ruled` lines are behaviour rulings that bound the build.

## Principles

- The island lives in dead space: the notch and the free menu bar strip beside it, on the built-in screen only. It takes nothing from what already works there. [ruled: D16, D70]
- Quiet by default. The only thing that moves on its own is the new-song notice; reminders, speaker changes and everything else wait to be looked at. [ruled: D2, D73]
- Cheap at rest. A fanless Air must barely notice it; work happens on events, never on a timer loop, except two bounded checks: QuickTime Player about once a second while it is open, and Music's playhead every 10 to 15 seconds while it plays. [ruled: D79, D132, D133]
- Sources and pages are parts. Each music source and each use (the music page, the shelf page) is its own part, so a new one is added without changing how the others behave. [ruled: D80]
- What already controls music keeps controlling it. Control Center, the media keys and the apps themselves stay in charge; the island reflects them and sends its clicks to them. [ruled: D46, D68, D69]

## Overall shape

One background app for one Mac, started at every login, with no Dock icon
and no window of its own beyond the island. The island is a single drawn
shape over the built-in screen's notch with four states: closed (the plain
notch), the wing (the new-song notice in the menu bar strip, left of the
notch only), and open (the hover panel, a
music page and a shelf page of one size, scrolled between).

Major parts, in prose:

- **Source parts** — one per followed source (Apple Music; youtube.com and soundcloud.com in Chrome; downloaded files in IINA, QuickTime Player or Music). Each reports what it is playing, its art, position and output device, notices a new song, and carries play, pause, skip, back, seek and "bring me forward" to its app.
- **The now-playing hub** — merges the sources into the flip card: newest source in front, the others a flip away with an `n of m` count shown whenever there is a flip, cycling only through the sources it can see separately, the last song kept paused and ready when nothing plays. It decides when a new song starts and hands the notice to the island.
- **The island view** — the one window: hit-testing that opens on a rest or a click and lets a sweep pass, the wing and its layout in the free gap left of the notch, the open panel and its two pages, the grace on leaving, and drags that hold it open.
- **The shelf** — the stored list of items (captures and stacks, files, folders, links, notes, reminders), their ageing clocks, and the drag in and drag out. It points at files, never holds them.
- **The capture watcher** — sees a new screenshot or screen recording land where macOS saves them and parks it, joining a stack within a minute of the last capture.
- **The context guard** — knows when an app is fullscreen and which screen is the built-in one, and gates the other parts accordingly; it keeps the island's windows out of what screen shares and recordings capture.

## Constraints

- The island exists only around the built-in notch; nothing of it appears on an external monitor, and a new-song notice still shows on the built-in screen. [ruled: D16]
- The new-song wing sits inside the menu bar strip left of the notch only, for four seconds, never covering an app menu or a status icon and never reaching right of the notch, which is left to the status bar the visionary is adding there: the cover art and as much of the title as fits in the free gap; with less room the title goes first and the art shows alone; when even the art does not fit, nothing pops. There is no playing indicator and no card below the notch. Measured on this Mac: the built-in screen is `1710` points wide, the menu bar strip `33` high, the notch `185` wide from x `763` to `948`; with Chrome frontmost its Help menu ends at x `628`, leaving `135` free on the left. The gap is measured live, never hard-coded. It comes out within the first second of the song or not at all; a later app switch never brings out a wing that had not shown. [ruled: D113, D114, D134]
- The closed island leaves no dead zone: every menu and status icon beside the notch clicks as it does today. [ruled: D70]
- The wings are out within a second of a new song on every followed source. [ruled: D78]
- A rest of about `0.3` s opens the island and a leave grace of about `0.5` s closes it; both are held to be felt on the real machine and tuned there, so they are configuration, not constants buried in code. [ruled: D51, D52]
- In Chrome only youtube.com and soundcloud.com count, and only while playing sound. [ruled: D88]
- No wing while any app is fullscreen, so fullscreen watching is never interrupted; hovering still opens the panel. [ruled: D125]
- While the screen is shared or recorded the island keeps working for the visionary as always, while nothing of it — wing, panel or shelf — appears in what the share or the recording captures; a recording that just ended still lands on the shelf. [ruled: D108]
- Hidden-from-capture is buildable only while macOS lets an app keep its own windows out of shares and recordings; if the build finds it no longer does, the sharing question returns to the visionary rather than being settled in code. [ruled: D110]
- The island always shows the app's real state, never its own guess: when an app ignores a pause, a seek, a click on the source line or play on a quit source, the island keeps showing what the app is really doing, with no shake or message. [ruled: D124]
- The flip cycles only through the sources the island can see separately, and its count matches the faces shown; a source it cannot see separately has no face. A paused source is still a face, one flip away, until its app quits or its tab closes. [ruled: D111, D121, D131]
- The source line names the site for Chrome sources and the app otherwise, adding the speaker only when it is not the built-in one; a dropped Bluetooth speaker simply disappears from it. [ruled: D119, D120]
- The island may rely on a small companion Chrome extension, installed once by the visionary, to follow what youtube.com and soundcloud.com tabs are playing. [ruled: D126]
- The shelf points at files and folders, never moves or copies them; a moved item follows its new place and a trashed one leaves. [ruled: D36, D58]
- A capture leaves the shelf on a drag out only when something accepted the drop. [ruled: D92]
- Everything on the shelf survives a restart, with each parked file's day-long clock intact. [ruled: D59]
- The island starts by itself at every login; its only menu is a right-click with the single item Quit, which stops it until the next login. [ruled: D60, D86]
- Idle cost ceiling: closed with music playing, at most `3%` CPU and an Energy Impact of `5` averaged over a minute; near zero is the aim, not the bar. [ruled: D79]
- A native macOS app in Swift: AppKit for the window and events, SwiftUI for the drawn content. It runs as an agent app (no Dock icon, no app menu) and is not sandboxed, since several source parts need access the sandbox denies; it is never meant for the App Store (D82 leaves install open). [chosen]
- The island is one borderless, non-activating panel above the menu bar level on the built-in screen, found as the screen that reports a notch, and placed from the screen's reported areas either side of the camera housing; outside the drawn shape it passes every click through. [chosen]
- Start at login through the system's login-item service for the main app. [chosen]
- Apple Music's part listens to the player-info notification Music broadcasts on every track or state change, and uses AppleScript for art, controls and seek (one Automation permission). [chosen]
- Chrome's part is that companion extension, talking to the app over native messaging: it reports, per tab, the page's media-session metadata, position and whether the tab is audible, and carries controls, seek, reopening a closed video where it left off, and focusing the exact tab. Chosen over the system now-playing service because Chrome reports all its tabs as one system entry and that service shows one app at a time, and over AppleScript-injected JavaScript because Chromium is turning that off by default. [chosen]
- IINA's part reads the system now-playing service, which IINA publishes to and which has no other door into IINA; QuickTime Player's part uses its AppleScript dictionary; Music playing a downloaded file is Apple Music's part. The system service is read through an Apple-signed helper process because macOS 15.4 and later deny it to third-party apps. [chosen]
- The output-device name on the source line comes from the system's default audio output and its change notifications. [chosen]
- The capture watcher reads the screenshot save location from the screenshot preferences (Desktop by default) and parks only new files macOS marks as screen captures; clipboard shots never produce a file, so they never land. [chosen]
- The shelf is stored locally under the app's Application Support folder, holding files and folders as bookmarks that resolve after a move. [chosen]
- Fullscreen is detected on events (space and app changes), never by polling; sharing and recording need no detection, since the island's windows are marked to stay out of screen captures at all times. [chosen]

## Platform facts and risks

Verified for this draft (2026-10-18):

- Since macOS 15.4 the system now-playing daemon checks an entitlement and refuses third-party clients; notch apps that still show any player's song do it through ungive's mediaremote-adapter, a framework loaded by the Apple-signed `/usr/bin/perl` that streams JSON and carries commands ([BetterTouchTool forum](https://community.folivora.ai/t/now-playing-is-no-longer-working-on-macos-15-4/42802), [ungive's post](https://community.folivora.ai/t/now-playing-is-no-longer-working-on-macos-15-4/42802/9), [Better-Now-Playing-Pock-Widget](https://github.com/JosephPri/Better-Now-Playing-Pock-Widget), [OpenNotch PR #3](https://github.com/niyamvora/OpenNotch/pull/3), [media-remote crate](https://crates.io/crates/media-remote)). **Risk:** it rests on a gap Apple may close; it is confined to the IINA part so a closure costs one source.
- Music broadcasts `com.apple.Music.playerInfo` on track and state changes; its payload lacks artwork, which needs AppleScript ([Finding Distributed Notifications on Catalina](https://medium.com/macoclock/finding-distributed-notifications-on-macos-catalina-b2a292aac5a1), [Apple Developer Forums](https://developer.apple.com/forums/thread/671798)).
- Chrome feeds macOS Now Playing from the web Media Session API, but all its tabs share one system entry, so the system service cannot tell two Chrome tabs apart ([web.dev, Media Session](https://web.dev/articles/media-session)). Chromium says AppleScript JavaScript injection is being disabled by default and points apps at an extension with native messaging ([Chromium, AppleScript](https://www.chromium.org/developers/applescript/)).
- IINA has no AppleScript dictionary but publishes to the system now-playing service ([IINA #4337](https://github.com/iina/iina/issues/4337), [IINA #5336](https://github.com/iina/iina/issues/5336)). **Risk:** the system service names only one current app, so while IINA plays beside Apple Music and a YouTube tab (the three-source flip) IINA may drop out of view; D111 rules that it then has no face and the count reads `2 of 2`.
- macOS marks its own screenshots with `kMDItemIsScreenCapture`, and the save folder is the screenshot preference `location`, Desktop by default ([MacRumors thread](https://forums.macrumors.com/threads/detect-when-screenshots-are-taken.1064884/), [Setapp](https://setapp.com/how-to/where-do-screenshots-go-on-mac)). **Unverified:** that screen recordings carry the same mark and that other screenshot tools never do.
- Start at login: the main-app login-item service, macOS 13 and later, for an agent app ([Nil Coalescing](https://nilcoalescing.com/blog/LaunchAtLoginSetting/)).
- **Risk, sharing:** Apple knows of no supported way for an app to tell that the screen is being shared ([Apple Developer Forums](https://developer.apple.com/forums/thread/667549); [MacPaw research](https://macpaw.tech/research/is-mac-screen-captured/)), and whether marking a window as not shareable still hides it from ScreenCaptureKit on macOS 15 and later is disputed ([Tauri #14200](https://github.com/tauri-apps/tauri/issues/14200)). The island therefore no longer detects sharing (D108); it keeps its windows out of captures, and whether that holds on this Mac's macOS is the named assumption of D110, to be settled by a spike against Zoom, Meet and the system recorder before the sharing scenarios are bound.
- **Unverified:** that Chrome reports a muted YouTube hover preview as inaudible until it is unmuted; the companion extension reads the tab's audible state directly, so the Chrome rule does not depend on it.

## Changelog

- 2026-10-18 — initial draft (scope interview; docket D1–D97, with D98–D107 restating ruled failure cases at drafting; electives declined, D96).
- 2026-10-19 — post-read rulings D108–D126, N10 (cold read, held findings F1–F14).
- 2026-10-19 — P1 build, the SwiftPM build (D96; BUILD-PLAN P1 exit): the app builds with Swift Package Manager from the Command Line Tools (`Package.swift`: the logic in `IslandCore`, the app in `NotchIsland`, the acceptance harness's helper in `island-harness`), bundled as an agent app and ad-hoc signed by `scripts/build-app.sh` (`npm run build:app`), as installed (`build/release`) and with the test-only input compiled in (`build/test`); the unit tests use the swift-testing package, because the Command Line Tools' own SwiftPM gives its generated test runner no Testing module and a plain `swift test` would otherwise run nothing. [chosen]
- 2026-10-19 — P1 build, the window approach under the panel line above (D96; BUILD-PLAN P1 exit): the one panel is sized to the drawn shape, the camera housing's own rect while closed and the open panel's rect while open, so outside the shape there is no island window to take a click; it never becomes key, so the frontmost app keeps its focus; it sits above the menu bar on every space, fullscreen ones included. It is marked to stay out of captures from day one, and D110 holds on this Mac (macOS 26.6.2): a `screencapture` shot and a ScreenCaptureKit capture both lack the visibly open island (guarded by `test/hidden-from-capture.test.js`). At rest the island runs on events only; while open it also looks at the pointer ten times a second and re-reads the source every two seconds. For the tuning on the machine (D51, D52; BUILD-PLAN Q3), a debug or test build reads the rest and grace times from the defaults `restSeconds` and `graceSeconds`; the installed app has no such switch. [chosen]
- 2026-10-19 — P1 tuning (BUILD-PLAN Q3): the default rest is 0.15 s and the grace 0.5 s (D128, D129), as ruled at the tuning session. After a seek the progress bar holds the clicked position until Music reports one within a second of it, for 1 s at most, then Music's real position wins (D130, amending D124); the logic is `SeekHold` in IslandCore. [chosen]
- 2026-10-22 — P2 build, the source parts under the Chrome, IINA and QuickTime lines above (D96, D126; BUILD-PLAN P2): QuickTime Player sends no notifications, so while it runs (and only then) its part reads it once a second, through Scripting Bridge addressed to its running process, so a read never starts a QuickTime that is quitting; at rest with QuickTime quit the island still runs on events only. The companion extension's native-messaging host is the app's own binary, started by Chrome with the caller's origin, which answers only the companion extension and relays to the running island over a socket only this user can open, naming the Chrome that started it so that exactly that Chrome comes forward. A failed read of Music is no report, never "stopped". The acceptance harness drives a test Chrome of its own over the DevTools protocol on a pipe, loading the extension unpacked, with stand-in youtube.com, soundcloud.com, news and Gmail pages served locally. [chosen]
- 2026-10-22 — P2 head-review rulings D131 (a paused source stays a face), D132 (QuickTime checked about once a second while open; amends the cheap-at-rest principle, D79's ceiling stands), D133 (Music playhead checked every 10 to 15 seconds while playing).
- 2026-10-23 — P3 build, the wing under the island-view part and the panel line above (D96; BUILD-PLAN P3): the wing is drawn in a second borderless panel of its own, beside the island's, that never takes a click (so the menu bar strip under it works as before, D70) and is kept out of captures like the island; it is right-aligned against the notch's left edge, inside the menu bar strip. The free gap is read for every notice and again on every app switch while the wing is out: the frontmost app's menu bar items through Accessibility and the status icons from the window server; menus read on an external monitor are laid out the same from the built-in screen's left edge; a menu bar that cannot be read leaves no room, so nothing pops. The island therefore needs the Accessibility permission. The hub's new-song event (`NewSongDetector` in IslandCore) is a source playing a song other than its last played one, dated by the app's own playhead; the wing folds four seconds after the last start (`WingHold`). QuickTime Player is read at once when it changes the now-playing channel, besides its once-a-second read (D132). A test build takes an exact gap width as test input (`leftGap`). [chosen]
- 2026-10-24 — P3 head-review ruling D134: a wing comes out within the first second of its song or not at all.
