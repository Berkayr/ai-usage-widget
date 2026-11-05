# Packaging and desktop integration

From the repository root, build the widget with:

```sh
cd app
npm ci && npm run build
npx tauri build --bundles appimage,deb,rpm
```

Bundle targets are AppImage, deb and rpm. The no-bundle debug acceptance build does not create installers. Tauri generates the package desktop entry and uses the existing temporary icons under `app/src-tauri/icons/`; `packaging/ai-usage.desktop` is the source-package desktop entry. Replace temporary icons after design review. No proprietary font or brand asset is needed.

The Tauri resources include the Python quotacore module. The widget resolves it from its installed resources and runs it using host `python3`. The native app always loads its packaged sources; `QUOTACORE_PYTHON` may select an interpreter executable, without arguments. Deb/rpm and the source AUR recipe also install a `quotacore` launcher. On deb/rpm it resolves the bundled Python sources; use `quotacore bar` in panel examples instead of `python3 -m quotacore bar`. Panel examples using `python3 -m` require quotacore available to that interpreter separately (the source AUR recipe installs it). For a development checkout:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install .
.venv/bin/python -m quotacore write
```

In panel config examples, replace `python3` with the absolute `.venv/bin/python` path, or use a distribution package that installs quotacore for system Python. In GNOME's extension argv an absolute path is required; shell aliases and `~` are not expanded. Do not use pip to override distribution-managed Python packages.

Run `python3 -m quotacore daemon --interval 300` with the same interpreter to keep the shared snapshot fresh when the widget is closed. Panel readers only read `snapshot.json`; they do not call providers or touch credentials. `QUOTACORE_HOME` overrides the state directory; otherwise it is `$XDG_STATE_HOME/quotacore` or `~/.local/state/quotacore`. Configure the writer and panels to use the same directory.

Gemini passive reads never start agy. Run `python3 -m quotacore refresh-gemini` explicitly to write quotacore's own Gemini cache, then `python3 -m quotacore write`; or feed agy's status-line hook into `python3 -m quotacore hook agy`. No dependency on a personal script or `~/.cache/gemini-kota.json` exists. On Linux graphical launchers, agy is also discovered under `~/.local/bin` when absent from PATH.

## Dependencies

These are package names for the listed distribution families; release variants may rename them. Build dependencies include a C/C++ toolchain, Rust/Cargo, Node/npm, pkg-config and the development headers. Installing the optional GTK3 layer-shell library enables native corner placement; GTK4 layer-shell cannot serve Tauri's GTK3 window. No appindicator dependency is needed.

| Family | Runtime | Additional build dependencies | Optional native Wayland / panel |
| --- | --- | --- | --- |
| Arch | `gtk3 webkit2gtk-4.1 python` | `base-devel rust cargo nodejs npm` | `gtk-layer-shell`, `plasma5support`, Waybar/Polybar/i3blocks |
| Debian / Ubuntu | `libgtk-3-0 libwebkit2gtk-4.1-0 python3` (newer Debian/Ubuntu may use `libgtk-3-0t64`) | `build-essential libgtk-3-dev libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev patchelf pkg-config`, Rust, Node/npm | `libgtk-layer-shell0`, `libplasma5support6` / distribution Plasma5Support package |
| Fedora | `gtk3 webkit2gtk4.1 python3` | `gcc gcc-c++ gtk3-devel webkit2gtk4.1-devel openssl-devel librsvg2-devel patchelf`, Rust, Node/npm | `gtk-layer-shell`, `plasma5support` |
| openSUSE | `gtk3 libwebkit2gtk-4_1-0 python3` | `gcc gcc-c++ gtk3-devel webkit2gtk3-devel libopenssl-devel librsvg-devel patchelf pkg-config`, Rust, Node/npm | `libgtk-layer-shell0`, Plasma5Support package (version dependent) |

The rpm dependency names in tauri.conf.json target Fedora. openSUSE needs its own rpm dependency overrides at release time; do not advertise the Fedora rpm as universal. AppImage may require FUSE 2 or `--appimage-extract-and-run`; Python, provider CLIs and GTK3 layer-shell remain host dependencies. Check distributions before release.

## Window behavior

On a compositor with wlr-layer-shell and `libgtk-layer-shell.so.0`, the hidden GTK3 window is initialized before realization and shown as a layer surface. Default: bottom layer, top-right corner, 12 logical-pixel margins, primary output (first output if the backend has no primary). It reserves no panel space. GTK/GDK handle output scaling and corner anchoring.

The persisted widget settings accept a `linux` object:

```json
{"linux": {"layer": "bottom", "margin": 12, "monitor": null}}
```

`layer` accepts `top` (above normal windows) or `bottom` (desktop); `monitor` is a zero-based GDK output index, or null for primary. The output index can change when displays are reconnected; automatic physical display identity matching is not implemented. The shared settings UI does not yet expose these fields; it preserves the object returned by `load_settings`. Claude can add controls after the theme task. Layer-shell needs a corner; `Free` mode returns an explicit error. Keyboard mode is None until the existing settings panel opens, then OnDemand. A page-load observer supplies this without editing the shared frontend.

On X11, GTK utility type, sticky, skip-pager/taskbar and keep-above/keep-below hints are applied. Tauri positions using physical work-area coordinates and converts the logical margin using that monitor's scale. A utility hint is intentional: this is an interactive widget, not a dock reserving work area. Window managers may override EWMH hints.

On native GNOME Wayland or when the library is absent, a one-time in-widget hint explains that ordinary Wayland windows cannot be positioned at fixed coordinates. Optional launch: `GDK_BACKEND=x11 ai-usage`, provided XWayland is available. The app does not force X11: availability and fractional-scale quality vary. Panel integrations are the preferred GNOME solution.

Opacity remains controlled by the widget CSS; the WebKitGTK backing surface is explicitly transparent. At 94% background opacity, 6% visibility through the background is expected; the widget does not request compositor blur. Set 100% for a fully opaque background. Theme/CSS behavior and screenshots still require visual review.

## Autostart

The Rust command `set_autostart(enabled: bool)` writes/removes only `ai-usage.desktop` under the XDG config autostart directory. It quotes the current executable path and uses the original AppImage path when running an AppImage. Nothing is enabled during installation or testing. The settings toggle controls this registration. First launch migrates the application’s legacy login entry to the current executable.

## Release drafts

`aur/PKGBUILD` uses a local source release archive; `aur/PKGBUILD-bin` uses a local x86_64 AppImage. They are reviewable drafts, not published AUR packages. Public release URLs, archive layout, checksum, source license and version policy need release-owner input. No root LICENSE was found, so the drafts use `custom` and do not invent a license or download endpoint. The binary package installs the widget; install quotacore separately for panels. Flatpak is deferred; see `flatpak/README.md` for the host-service design required to preserve sandboxing.

Screenshot slots are documented in each integration README. Populate them only with fictional quota data after Claude's review.

Dependency reference: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (tray packages in the upstream generic list are not required by this widget).

## AUR checksum release gate

The recipes deliberately contain `REPLACE_WITH_VERIFIED_SHA256`; they must fail
checksum validation until reviewed release artifacts exist. Before publication:

1. Obtain the intended source archive / AppImage from the reviewed release and verify its provenance.
2. Calculate `sha256sum <artifact>` and replace each placeholder with that exact 64-digit digest; review source filenames and versions too.
3. Run `python3 packaging/check-release.py`; it must exit 0. It currently exits 1 for unpublished drafts, by design.
4. Run `makepkg --verifysource` for each recipe against the actual artifacts, then perform a clean package build.

CI warns if `SKIP` is reintroduced. Do not replace a placeholder with `SKIP` or
publish the drafts before these checks. Checksums alone do not authenticate a
release publisher.

## Windows: with Python and slim

Release builds publish two NSIS installers and two MSI packages for x86-64:

- **with-python**: Python 3.13.17 from python.org, extracted under the application resource directory's `python/`. No separate Python installation required.
- **slim**: no Python files installed; requires a working Python 3.10+ (`py -3`, `python3` or `python`). Choose this edition when Python is already installed.

Both editions share an application identity: install one, not both. Uninstall before
switching editions so an old with-Python installation cannot leave runtime files
behind. Normal upgrades within the same edition retain the normal identity.
NSIS hooks run before/after copying Tauri's generated resource list, and MSI uses
a different installer engine. Separate resource sets provide a predictable,
reviewable omission in both formats without a custom installer template or
copy-then-delete hook. This is a user-selected slim edition, not automatic detection
by the installer.

On Windows, from the repository root:

```powershell
./scripts/fetch-python.ps1
cd app
npm ci
npm run tauri -- build --locked --bundles nsis,msi --config src-tauri/tauri.with-python.conf.json
# Or build slim (does not include python/ even if it exists locally):
npm run tauri -- build --locked --bundles nsis,msi
```

On Linux, `scripts/fetch-python.sh` prepares the identical Windows runtime for
cross-build staging; it does not bundle Python into Linux packages. Both scripts
read the same pinned URL and SHA-256 in `scripts/python-runtime.json`. The Windows
script also checks PSF Authenticode signatures on python.exe and python313.dll.
Keep LICENSE.txt from the upstream archive with the runtime. Never commit the
runtime directory or zip. Downloads happen at build time only.

Windows installers embed the small WebView2 bootstrapper (about 1.8 MB). Windows 11
and most Windows 10 machines already have WebView2, so nothing is downloaded; if it
is missing, the bootstrapper installs it from Microsoft during setup. The app itself
downloads nothing at first launch. Python contributes about 10.9 MB of compressed
input / 22.6 MB installed to with-Python; final installer sizes depend on WebView2,
Rust build mode and compression and must be measured on Windows. Slim saves the
Python contribution; WebView2 is shared by both editions.

The widget selects `QUOTACORE_PYTHON`, then packaged Python if present, then system
Python 3.10+. Invalid explicit overrides or a damaged embedded runtime fail with a
clear message rather than silently selecting another interpreter. The packaged
module directory supplies `PYTHONPATH`; `site` is disabled and no pip installation
is performed. About / Diagnostics reports the selected source, version and path
using passive `doctor` output. Direct `python -m quotacore doctor` reports `direct`
when launched outside the native selector.

Linux uses system Python 3.10+: deb/rpm declare the minimum version. AppImage
cannot enforce a package dependency and reports installation guidance if Python
is missing or too old. A host interpreter avoids duplicating the distribution's
Python security maintenance and matches the existing CLI/panel integration.

## Installation footprint

For a small Linux installation, prefer deb/rpm or the source AUR recipe: these
reuse the distribution's WebKitGTK and Python. AppImage carries WebKitGTK,
JavaScriptCore, GTK and supporting libraries, so its download can exceed 100 MB
even when the widget executable is only a few MB; those bundled libraries also
have a separate update lifecycle. The KDE/GNOME/Waybar integrations can read the
shared snapshot without starting the widget or a webview: their incremental
**widget-process** memory is zero, while the existing panel and periodic Python
collector still consume resources. Measurements and a bounded, synthetic-data
benchmark are described in [performance notes](../docs/performance.md).

## Linux AppImage identity and staging

### Linux installer script

After a release is published, x86-64 users can run the one-line installer shown in the root README. It downloads only the matching release package and `SHA256SUMS.txt`, checks that the package has a checksum entry, then verifies it before installation. Debian/Ubuntu and Fedora use their native package managers (with `sudo`); other distributions get an AppImage in `~/.local/bin` and an application-menu entry. Use `scripts/install.sh --uninstall` to remove the AppImage files; package installs are removed with `apt remove ai-usage` or `dnf remove ai-usage`. `--from-dir DIR` exercises the same package selection, checksum and installation path with local release assets.

The platform override `app/src-tauri/tauri.linux.conf.json` uses `ai-usage` as
Tauri's Linux product name. Tauri names the AppImage root icon and desktop entry
after that value, while `Icon` uses the main binary name; keeping both equal
prevents appimagetool's missing-icon error. The desktop template retains the
human-readable name **AI Usage**.

The Linux `beforeBundleCommand` runs `app/scripts/prepare-linux-bundle.mjs` for
both `tauri build` and `tauri bundle`, including release CI. It clears only
`bundle/appimage` and `bundle/appimage_deb` in the selected Cargo target/profile
locations. Tauri otherwise reuses the latter and can copy an old product's
binaries and resources into a new AppImage. Cargo's compiled binaries and caches
are retained. `CARGO_TARGET_DIR`, explicit target triples and debug bundles are
supported. Run `node tests/linux-bundle.mjs` to check this cleanup independently.

```sh
cd app
NO_STRIP=true npm run tauri -- build --locked --bundles appimage
# Expected: ai-usage_0.1.0_amd64.AppImage (version/architecture vary)
```
