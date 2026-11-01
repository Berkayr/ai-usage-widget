# Linux packaging and desktop integration

From the repository root, build the widget with:

```sh
cd app
npm ci && npm run build
npx tauri build --bundles appimage,deb,rpm
```

Bundle targets are AppImage, deb and rpm. The no-bundle debug acceptance build does not create installers. Tauri generates the package desktop entry and uses the existing temporary icons under `app/src-tauri/icons/`; `packaging/dev.aiquota.widget.desktop` is the source-package desktop entry. Replace temporary icons after design review. No proprietary font or brand asset is needed.

The Tauri resources include the Python quotacore module. The widget resolves it from its installed resources and runs it using host `python3`. `QUOTACORE_PYTHONPATH` overrides the module location. Deb/rpm and the source AUR recipe also install a `quotacore` launcher. On deb/rpm it resolves the bundled Python sources; use `quotacore bar` in panel examples instead of `python3 -m quotacore bar`. Panel examples using `python3 -m` require quotacore available to that interpreter separately (the source AUR recipe installs it). For a development checkout:

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

On native GNOME Wayland or when the library is absent, a one-time in-widget hint explains that ordinary Wayland windows cannot be positioned at fixed coordinates. Optional launch: `GDK_BACKEND=x11 ai-quota-widget`, provided XWayland is available. The app does not force X11: availability and fractional-scale quality vary. Panel integrations are the preferred GNOME solution.

Opacity remains controlled by the widget CSS; the WebKitGTK backing surface is explicitly transparent. At 94% background opacity, 6% visibility through the background is expected; the widget does not request compositor blur. Set 100% for a fully opaque background. Theme/CSS behavior and screenshots still require visual review.

## Autostart

The Rust command `set_autostart(enabled: bool)` writes/removes only `dev.aiquota.widget.desktop` under the XDG config autostart directory. It quotes the current executable path and uses the original AppImage path when running an AppImage. Nothing is enabled during installation or testing. Claude will wire the settings toggle after the parallel theme task.

## Release drafts

`aur/PKGBUILD` uses a local source release archive; `aur/PKGBUILD-bin` uses a local x86_64 AppImage. They are reviewable drafts, not published AUR packages. Public release URLs, archive layout, checksum, source license and version policy need release-owner input. No root LICENSE was found, so the drafts use `custom` and do not invent a license or download endpoint. The binary package installs the widget; install quotacore separately for panels. Flatpak is deferred; see `flatpak/README.md` for the host-service design required to preserve sandboxing.

Screenshot slots are documented in each integration README. Populate them only with fictional quota data after Claude's review.

Dependency reference: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (tray packages in the upstream generic list are not required by this widget).
