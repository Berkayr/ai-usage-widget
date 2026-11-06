# Performance and footprint

Measure the release executable rather than a debug build or only its parent
process. Linux WebKit uses additional web/network processes. RSS counts shared
library pages repeatedly; PSS apportions shared pages; cgroup `memory.current`
measures charges to the application's scope, including its descendants and file
cache. These figures answer different questions and must not be interchanged.

## Reproduce a bounded measurement

Build with `cd app && npx tauri build --no-bundle`, then from the repository root:

```sh
python3 scripts/footprint.py \
  --binary app/src-tauri/target/release/ai-usage \
  --output /tmp/ai-usage-footprint.json
bash scripts/memory-soak.sh
```

`footprint.py` defaults to 180 seconds **per scenario**, with the first 30 seconds
excluded from idle summaries. Repeat `--binary` for debug/release/AppImage; without
it, existing debug/release binaries and release AppImages are selected. Every app launch uses a
new `systemd-run --user --scope`, `MemoryMax=1500M`, `MemorySwapMax=0`, and GNU
`timeout`. Failure never triggers an unconfined fallback. A user systemd session
and graphical display are required. No packages are installed.

Each scenario has a temporary HOME, quota state, settings and caches; credential
and API-key environment variables are not inherited. Native executables and
Python resources are copied into a temporary installation layout before launch.
AppImages use extract-and-run in the temporary cache. The two scenarios are all
providers disabled, and a passive Gemini adapter enabled with a fictional quota
snapshot and a nonfunctional CLI stub used only for installation detection.
The enabled scenario checks that the collected provider reaches `OK`; no real
provider CLI or network request is involved. This is an idle UI benchmark, not an
OAuth/network latency benchmark.

JSON includes binary size/hash, process tree (PID/PPID/name), sampled RSS/PSS,
`memory.current`, full-scope CPU seconds from `cpu.stat`, and voluntary context
switch deltas across all threads in surviving processes. Context switches are a
wakeup **proxy**, not hardware wakeups. Exited processes/threads cannot contribute
their final switch counters. CPU includes exited children through cgroup
accounting. First-render latency has approximately one-second sampling resolution
and includes scope startup; do not interpret millisecond-looking output as
millisecond accuracy. Samples use a one-second interval initially and five seconds
once startup has settled. The measurement driver runs outside the app cgroup.

## Runtime choices

- The filesystem watcher immediately forwards snapshot changes. Its recovery read
  and the frontend's fallback read run every 300 seconds instead of 30/60 seconds.
  The frontend stops polling while the page is hidden, and recovers on visibility.
- Rendering requests are coalesced into one animation frame, not a continuous
  frame loop. Hidden pages defer drawing; their latest snapshot draws on return.
  Infinite CSS animations are disabled even when Wayland does not report a
  bottom-layer window as occluded. Reduced-motion users also get no transitions.
- Linux configures the existing WebKit view to disable WebGL, media, media streams,
  MediaSource, back/forward page cache and release developer extras. The legacy
  accelerated-canvas toggle is retained for older supported engines; newer engines
  ignore it. The context uses the document-viewer cache model. JavaScript, local
  storage, compositing and process sandboxing remain available.
- There is one app webview. Modern WebKit's old process-count-limit API has no
  effect; forcing a single OS process would give up isolation. No such switch is
  used. See [WebKit's process-limit API](https://webkitgtk.org/reference/webkit2gtk/stable/method.WebContext.set_web_process_count_limit.html)
  and [cache models](https://webkitgtk.org/reference/webkit2gtk/stable/enum.CacheModel.html).
- Provider implementations load only when collection uses them. Registry metadata
  stays lightweight; explicit detection/diagnostics can load additional adapters.
  An unchanged snapshot skips atomic replace/fsync. Provider observation timestamps
  remain significant, so freshness updates are not silently discarded. The
  snapshot generation timestamp alone does not trigger a disk write.
- The selected theme's CSS, renderer and palette manifest are dynamically imported.
  Settings and synthetic sample audits load all manifests for their pickers; the
  native widget loads only its selected theme's data. Each of the ten themes has
  12 built-in palettes; user palettes use existing settings IPC without a new
  runtime dependency. `@font-face` alone
  does not fetch a font: a rendered element must use it. Hidden theme previews do
  not load all their fonts. The system-theme screenshot check fetched no custom
  fonts. Theme source files were left to the separate design task.

The release profile uses size optimization, LTO, one codegen unit, abort-on-panic
and symbol stripping. Panic abort changes failure handling: a panic ends the app
rather than unwinding. Provider failures remain ordinary error results.

## Windows and limits

Windows cross-compilation checks API compatibility; it does not measure WebView2
memory. WebView2 uses several engine processes, and its memory cost depends on
runtime version, content and shared pages. A single typical MB figure would be
misleading without a measured reference system. Frontend polling/rendering
reductions apply on Windows too. No unmeasured Chromium flags, GPU disabling or
process-isolation changes were added. Microsoft documents the process model and
performance options in [WebView2 performance guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance).

For the smallest Linux footprint, use a panel reader with the widget closed.
The panel still exists and collection still incurs short Python subprocesses;
zero widget memory does not mean zero total system cost.

## Measured size and collector cost

A synthetic-data Linux check compared equivalent Tauri `custom-protocol` builds:

| Build | Executable bytes |
| --- | ---: |
| Original release, optimization level 3 | 12,402,568 |
| Original release, manually stripped for comparison | 8,164,960 |
| Size profile `s`, LTO, one unit, abort, stripped | 4,242,720 |
| Size profile `z`, LTO, one unit, abort, stripped (selected) | 3,920,864 |

These comparisons include the frontend/native changes as well as the release
profile; they do not isolate the contribution of every compiler flag. All builds
rendered within the first one-second sampling interval, so this measurement does
not establish a startup-speed improvement.

Ten separate disabled-provider Python `write` launches had median elapsed time
about 46.7 ms before and 41.9 ms after lazy collection imports. Observed child peak
RSS fell from 26,020 KiB to 17,440 KiB. The widget starts a collector every 300
seconds; interpreter startup is short-lived, not a resident Python process.

An assembled `s`-profile release AppDir contained 329,958,216 logical file bytes (excluding
symlinks): WebKitGTK 99,403,232; JavaScriptCore 41,168,057; ICU 40,373,859;
GStreamer 6,407,142; application/Python sources 4,359,415; other libraries/assets
138,246,511. This is **uncompressed** staging data, not a breakdown of a compressed
AppImage download. The tested packaging attempt could not download its upstream
AppImage runtime, so no new complete compressed artifact was measured.


The final `z` release completed both 180-second scenarios. Idle CPU averaged
0.0104% with providers disabled and 0.0100% with synthetic Gemini enabled (one
CPU core basis). Median scope memory was 154.53 / 157.48 MiB respectively:
the <0.1% idle CPU target passed, but the <150 MB memory target did **not**.
The original release measured 154.44 / 162.26 MiB; these runs do not establish a
meaningful total-memory reduction. Shared-library charge ownership and concurrent
scopes affect these numbers. A 120-second update soak passed with a 9.94 MiB
post-warmup range, ten snapshot opens and approximately 0.50-second render
acknowledgements for all three synthetic changes.

The soak memory limit compares the mean of the first and last quarters of samples after 30 seconds, so isolated peaks do not count as sustained growth.


## Enforced acceptance budgets

`footprint.py` exits 1 if either scenario exceeds **0.1% of one CPU core**,
**5 seconds to first render**, or **250 MiB median idle cgroup memory for a bare
binary**. CPU and first-render budgets also apply to AppImages. An AppImage can
read higher because its extracted bundled libraries and file cache are charged
to the same cgroup; its memory figure is reported without the bare-binary gate.
Pass `--monitor Fictional-1` (replace with the intended connector) to write
`linux.monitor` in the temporary settings. The resource staging directory uses
`mainBinaryName`, matching Tauri's Linux resource lookup.

Previously recorded 180-second release measurements (not rerun during the final
acceptance task) were:

| Scenario | First render | Idle CPU, one core | Median cgroup memory |
| --- | ---: | ---: | ---: |
| All providers disabled | 1.005 s | 0.01038% | 154.53 MiB |
| Fictional passive Gemini | 1.005 s | 0.01001% | 157.48 MiB |

Both recorded scenarios satisfy the new budgets.

Current measurement, Linux release binary on KDE Plasma 6 Wayland, 60 seconds per
scenario, 2026-11-06:

| Scenario | First render | Idle CPU, one core | Median cgroup memory | PSS |
| --- | ---: | ---: | ---: | ---: |
| All providers disabled | 1.007 s | 0.015% | 158.5 MiB | 263.4 MiB |
| Fictional passive Gemini | 1.006 s | 0.015% | 164.4 MiB | 269.4 MiB |

The same build as an AppImage with extract-and-run held 502 MiB of cgroup memory
for two minutes with no growth: 163 MiB anonymous and 318 MiB of reclaimable file
cache. The <150 MB memory target is still not met. The unit
suite checks exact budget boundaries, failure above each boundary, AppImage
memory handling and staging of resources/monitor before any process launch.
