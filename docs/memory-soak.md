# Snapshot watcher regression check

Build with `cd app && npx tauri build --debug --no-bundle`, then run
`scripts/memory-soak.sh` from the repository root in a Linux desktop session.
Use `--binary PATH` for another built executable and `--output /tmp/soak-result`
to retain synthetic measurements and diagnostic logs. `--monitor DP-2` selects
a connector; legacy numeric monitor indices are also accepted.

The driver creates a temporary home, XDG directories, and QUOTACORE_HOME, with
Claude, Codex and Gemini enabled. Provider credentials are absent; quota cards
are supplied by fictional snapshots. It never reads the user's quota/settings
files or starts authenticated provider CLIs. The application runs for 120 seconds
inside a user systemd scope with MemoryMax=1500M, MemorySwapMax=0 and a 125-second
timeout. No direct-launch fallback is allowed. The scope is stopped on exit.

The test samples the entire scope's memory.current every ten seconds (including
WebKit children), watches snapshot OPEN events using ctypes/inotify, and makes
three atomic os.replace updates at 40/60/80 seconds. It requires the maximum
minus minimum memory after second 30 to stay below 20 MiB, 3–35 snapshot opens,
and three native acknowledgements from the frontend's requestAnimationFrame
render within two seconds of each replacement. This acknowledges DOM rendering;
it does not measure physical display presentation. Runtime failures fail the test.

The watcher accepts Create, Modify(Data), and destination Rename events for the
exact snapshot path. Modify(Any) is also necessary because notify maps Windows
FILE_ACTION_MODIFIED to that type. Explicit Access and Metadata are ignored.
A bounded one-item channel and 400 ms coalescing window prevent event storms;
a generated_at + content hash suppresses duplicate emissions. Native 30-second
and frontend 60-second reads provide recovery if filesystem events are missed.
The collector also emits immediately after completion. Frontend duplicate
snapshots do not render; an age transition past ten minutes marks cards stale.
`AI_USAGE_SNAPSHOT_TRACE=1` enables synthetic soak emit/render/monitor diagnostics;
normal launches do not log snapshot timestamps or monitor geometry.
