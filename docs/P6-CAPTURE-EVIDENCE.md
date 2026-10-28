# P6 capture verification

R1 requires a real Zoom/Meet viewer spike before its named rows can use the
controlled capture proxy. `P6_SERVICE_EVIDENCE` points to the reviewed spike
manifest; no evidence is inferred from a generic SCK stream. Missing evidence
blocks those Givens before any fixture, Music or installed-app action.

Each `Zoom` / `Meet` entry names its `service`, `source` (`Zoom viewer` or
`Meet viewer`), `version`, `macos`, `observedAt`, and `reviewedBy`. Its
`observations.panel` and `.wing` each contain `visibleLocally`, `viewerControl`,
`islandAbsent`, `artifact` (relative to the manifest), and `sha256`. These are
reviewed observations from the real viewer, not fields to populate from the
proxy result. The artifact hashes are checked on load. `mapping.checks` is
`["ScreenCaptureKit", "screencapture"]`; `mapping.reason` records why those
checks cover that observed service. Evidence belongs to its named service.
The manifest does not itself perform the prerequisite spike. No real-service
spike has been supplied or performed by F2.

Native recording rows start `/usr/sbin/screencapture -v` on the built-in display
and stop only their owned process with SIGINT. They save directly into their
scratch Desktop, under the arrival example's exact filename. F1's scratch
guardian owns the recorder and removes its artifacts after children terminate.
The existing capture watcher is redirected through the existing test input;
screenshot defaults and the real Desktop are untouched. Arrival starts with
an AX-observed empty shelf and checks the new file and its exact shelf label.
There is no shelf seeding or file rename in that row.

For privacy checks, the two-colour control includes a binary clock. A complete
SCK frame uses its window-server `displayTime`, not callback time. Every frame
inside the action is measured, including late frames; out-of-order, missing,
overflowing or stale evidence fails. AX observations bracket the visible
interval. The movie reader decodes every frame and uses its control clock to
correlate playback with the same interval. Captures are checked for island
presence only, not pixel-exact island appearance. In-memory images are bounded
to references/current images; retained evidence is scalar data, capped at
1,800 frames and 30 seconds. Original movies and captures stay in owned scratch
and are deleted after each scenario, including interrupted runs.

Run the targeted F2 batch through `scripts/when-idle.sh node
scripts/test-p6-f2.js` under `caffeinate -i`. It checks the installed login URL
read-only, uses the authorized existing installed-island pause, attempts the
recording measurement and ignored-.mov probes, then all 14 affected P6 rows
and the existing D110 check. It writes logs and per-row statuses under
`/tmp/ni-p6`. It does not change the feature manifest or wip register. The
ignored-.mov probe bundle must have been prepared separately under
`build/apps.noindex/f2-ignore-mov/NotchIsland.app`; it is never installed.
