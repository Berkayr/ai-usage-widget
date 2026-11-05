# Linux desktop support

The widget uses Tauri with GTK3/WebKitGTK. Python 3.10+ and the relevant provider CLI are host dependencies, including for AppImage. Deb/rpm bundle quotacore's Python sources and install a launcher; a development checkout can use `python3 -m quotacore` from the repository root. See [packaging](../packaging/README.md) for distribution dependencies and [configuration](configuration.md) for storage paths.

| Desktop | Placement | Panel option | Evidence |
| --- | --- | --- | --- |
| KDE Plasma 6 Wayland | GTK3 layer-shell corners; ordinary window fallback without library | [Plasmoid](../integrations/kde-plasmoid/README.md) | Tested: native layer-shell widget and a 16-minute memory run. Plasmoid checked in plasmoidviewer, not yet on a real panel. |
| KDE Plasma 6 X11 | Physical work area + scaled margins; utility/sticky hints | Plasmoid | Community-tested wanted. |
| GNOME 45–49 Wayland | Ordinary Mutter window; optional XWayland | [GNOME extension](../integrations/gnome-extension/README.md) | Community-tested wanted on every Shell version. |
| GNOME X11 | X11 coordinates + utility hints | GNOME extension | Community-tested wanted. |
| Hyprland / Sway | GTK3 layer-shell corners, top/bottom layer | [Waybar](../integrations/waybar/README.md) | Community-tested wanted. |
| river | GTK3 layer-shell | Plain reader / user's bar | Community-tested wanted. |
| Xfce / Cinnamon | X11 positioning + utility/sticky hints | [Polybar](../integrations/polybar/README.md) or command plugin | Community-tested wanted; no Cinnamon Wayland claim. |
| MATE / i3 | X11 positioning; tiling rules may be needed | Polybar / [i3blocks](../integrations/i3blocks/README.md) | Community-tested wanted. |

## Native Wayland placement

Install the distribution's **GTK3** layer-shell runtime (`libgtk-layer-shell.so.0`; usually `gtk-layer-shell` or `libgtk-layer-shell0`). GTK4 layer-shell cannot handle this GTK3 window. The library is loaded dynamically, so its absence does not prevent startup. The compositor must also implement the layer-shell protocol.

The settings panel exposes layer, margin and monitor when layer-shell is available. Default is bottom layer, top-right, 12 logical-pixel margin, Auto monitor. The widget reserves no panel space. Free placement is unavailable for layer surfaces. Monitor indices may change after reconnecting displays. Fractional scaling and multiple monitors still need real-session acceptance.

Mutter does not supply this layer-shell path. Use the GNOME panel integration, move the normal window manually, or explicitly try `GDK_BACKEND=x11 ai-usage` if XWayland is installed. The application does not force an X11 fallback. Window managers can override EWMH positioning hints.

## Shared panel data

Panel readers are passive: `python3 -m quotacore bar --format waybar` reads the existing snapshot without network requests or credentials. Keep the writer running with `python3 -m quotacore daemon --interval 300`, or use the widget's collector. Configure the same `QUOTACORE_HOME` for both if overriding storage. A packaged deb/rpm launcher also supports `quotacore bar`.

The KDE refresh action explicitly runs the writer, which can contact enabled providers. KDE configuration supports session/weekly/both windows, bars/dots/none and a read interval. The GNOME extension polls asynchronously and uses Shell theme warning/error colors. Header labels, percentages and `*` stale markers follow the actual compact output; panel appearance depends on the installed desktop theme.

The [gallery](../README.md#make-it-yours) includes HTML illustrations of taskbar/panel placement. They use fictional quotas and are not evidence of native Windows/KDE/Waybar rendering. Debian and Fedora packages were built and inspected locally in earlier acceptance work; installation on clean distributions, AppImage execution and AUR publication remain pending.
