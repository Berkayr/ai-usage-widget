<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
    <img src="docs/assets/logo.svg" width="104" alt="AI Usage logo">
  </picture>
</p>
<h1 align="center">AI Usage</h1>
<p align="center">Your usage limits, right on your desktop — usage windows and reset countdowns for Windows and Linux.</p>
<p align="center">
  <a href="#install"><img src="docs/assets/release.svg" alt="Release: v0.1 coming"></a>
  <a href="#platforms"><img src="docs/assets/platforms.svg" alt="Platforms: Windows and Linux"></a>
  <a href=".github/workflows/ci.yml"><img src="docs/assets/ci.svg" alt="CI workflow configured; hosted run pending"></a>
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/hero-light.png">
    <img src="docs/screenshots/hero-dark.png" width="1000" alt="AI Usage logo beside Dot Matrix in the orange Ember palette; fictional data">
  </picture>
</p>
<p align="center"><sub>Dot Matrix · Ember · Vivid · fictional data</sub></p>
<p align="center"><a href="#install">Download</a> · <a href="#quick-start">Quick start</a> · <a href="docs/providers.md">Docs</a></p>

Keep Claude Code, Codex and Gemini quota windows visible while you work. A compact desktop widget shows how much is used, when limits reset, and when a source needs attention. Resize it for a small glanceable display or keep detailed cards beside your editor. Panel integrations share the same local snapshot.

Pre-release: installers are coming with v0.1. Gallery values are fictional; provider and desktop validation are listed below.

## Install

| Platform | Preferred download | Availability |
| --- | --- | --- |
| Windows 10/11 | `.exe` setup or `.msi` from GitHub Releases | Coming with v0.1 |
| Linux | AppImage, Debian/Ubuntu `.deb`, Fedora `.rpm` | Coming with v0.1 |
| Arch Linux | AUR package | Coming with v0.1; recipe drafts only |

No winget or AUR installation command is published yet. Linux needs host Python 3.10+, provider CLIs and the appropriate GTK/WebKit runtime; AppImage also has host dependencies. Windows **with Python** installers include a verified private Python runtime; no separate Python installation is needed. If Python 3.10+ is already installed, choose **slim** to skip the bundled runtime and use your existing interpreter. Provider tools are still installed separately. See [packaging](packaging/README.md) before building or testing a package.

## Quick start

To preview the interface from a source checkout with Node/npm dependencies already installed:

```sh
cd app
npm run dev
```

Open Vite's displayed URL with `?sample` to see fictional data. For a native source build, install Rust and the platform's Tauri prerequisites, run `npm ci` in `app`, then `npm run tauri -- dev`. Authenticate in each provider's own CLI before collecting real quotas. The [provider guide](docs/providers.md) explains setup, and [Linux guide](docs/linux.md) covers panels and placement.

## What you get

- **One view across tools.** Session and weekly windows, percentages and reset countdowns sit together in the [desktop view](docs/screenshots/hero-dark.png).
- **A useful size for your workspace.** Compact rows and detailed cards adapt to the available width: [size gallery](docs/screenshots/sizes.png).
- **Clear failure states.** Cached and unavailable data remain distinguishable; see the [state gallery](docs/screenshots/states.png). Missing quota never becomes a reassuring zero.
- **A shared local core.** Desktop and panel readers use the same snapshot, with [Windows and Linux panel layouts](docs/screenshots/taskbar-light.png).
- **Optional quota pacing.** The CLI labels usage as SAVE, NORMAL, SPARE, LAST_CALL or UNKNOWN; [pacing documentation](docs/pace.md) explains ceilings and stale-data handling.

## Make it yours

### A size for every workspace

Keep a compact row beside your editor or expand into detailed cards. Each theme uses the same local data.

![Four different themes at XS, S, M and L window sizes](docs/screenshots/sizes.png)
<sub>XS: Terminal / Phosphor · S: Retro LCD / Liquid Crystal, Light · M: Frosted Glass / Acrylic · L: Brutalist / Acid. Vivid, fictional data.</sub>

Scale text and spacing together from 50% to 300%, with presets or Ctrl +/− and Ctrl+0. Numbers keep their proportions at every size.

![Three themes at 75, 100 and 150 percent scale](docs/screenshots/scale.png)
<sub>75%: Circular Rings / Ocean · 100%: Dot Matrix / Sakura Pink, Light · 150%: Minimal Pace / Emerald, Light. Vivid, fictional data.</sub>

### Find your signal

Choose a quiet Calm look, colorful Vivid palettes or pure black and white Mono. Nine themes change the layout as well as the colors. Theme cards in Settings switch designs immediately; every theme supports Auto, Light and Dark appearance.

![Pink, Nord, blue glass and acid palette examples](docs/screenshots/palettes.png)
<sub>Dot Matrix / Sakura Pink, Light · Dot Matrix / Nord · Frosted Glass / Acrylic · Brutalist / Acid. Vivid, fictional data.</sub>

### Know when data needs attention

Cached data stays marked, sign-in failures ask for attention, and unavailable quotas never become zero. Providers without an active subscription stay hidden.

![Terminal and Retro LCD show cached, sign-in and rate-limit states](docs/screenshots/states.png)
<sub>Terminal / Phosphor, Dark · Retro LCD / Liquid Crystal, Light. Vivid, fictional data.</sub>

### Your desktop, your settings

Change palette, opacity, scale and placement in one panel. Calm uses neutral usage ink below 50%, soft amber from 50% and muted red from 80%. Mono adds hollow warning marks and inverse percentage labels. Choose 10, 20 or 30 meter marks; XS uses 10. Optional monitor scale compensation and the fixed type scale are explained in the [design standard](docs/design-spec.md).

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/settings-light.png">
  <img src="docs/screenshots/settings-dark.png" alt="AI Usage widget and display settings in two theme variants" width="980">
</picture>
<sub>Dark: Circular Rings / Ocean · Light: Frosted Glass / Acrylic. Vivid, fictional data.</sub>

Prefer the familiar? System uses your desktop font, light/dark appearance and system accent where supported. It is the default theme.

![System theme adapts to light and dark desktop appearance](docs/screenshots/system.png)
<sub>System / Desktop · Light and Dark · Calm · fictional data.</sub>

### Nine designs, one snapshot

![Nine themes in two rows, mixing light and dark appearance](docs/screenshots/themes.png)
<sub>Top: System, Dot Matrix / Sakura Pink, Circular Rings, Terminal, Frosted Glass. Bottom: Brutalist, Compact Strip, Retro LCD, Minimal Pace. Alternating Dark / Light, Vivid, fictional data.</sub>

[Individual light and dark captures](docs/screenshots/themes/) · [Alternate gallery](docs/screenshots/themes-light.png) · [All themes in Mono](docs/screenshots/mono.png)

Windows has an optional taskbar strip with independent provider, window and theme settings. Linux integrations include KDE Plasma, GNOME Shell, Waybar, Polybar and i3blocks. The following taskbar/panel images are HTML illustrations using fictional data; native rendering and desktop compatibility need separate testing.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/taskbar-light.png">
  <img src="docs/screenshots/taskbar-dark.png" alt="Windows 11 taskbar strip layout illustration" width="1100">
</picture>
<sub>Windows taskbar strip · desktop Light / Dark · HTML illustration, fictional data.</sub>

![KDE Breeze compact panel layout illustration](docs/screenshots/kde-panel.png)
<sub>KDE Breeze Light · HTML illustration, fictional data.</sub>
![Waybar compact output illustration](docs/screenshots/waybar.png)
<sub>Waybar Dark · HTML illustration, fictional data.</sub>

See [configuration](docs/configuration.md) for every setting and environment override.

## Supported tools

| Tool | Status | What is shown |
| --- | --- | --- |
| Claude Code | Beta | OAuth usage windows; observation/cache fallback |
| Codex | Beta | CLI app-server quota windows |
| Gemini CLI / Antigravity | Stable Antigravity adapter; direct Gemini CLI planned | agy quota snapshot and explicit refresh |
| GitHub Copilot | Beta | Internal usage endpoint |
| OpenRouter | Beta | API key usage and account credits |
| DeepSeek API | Beta | Currency balances |
| JetBrains AI | Beta | Local IDE quota/credit cache |

Stable marks recorded live-source checks; beta adapters still need live-account acceptance. [Sources, credentials and limitations](docs/providers.md) are documented per provider.

## Platforms

| Environment | Status |
| --- | --- |
| Windows 10/11 | Native widget and strip implemented; live desktop community-tested wanted |
| KDE Plasma 6 Wayland | Fallback startup checked; native layer-shell and panel community-tested wanted |
| KDE X11, GNOME Wayland/X11 | Community-tested wanted |
| Hyprland / Sway | Layer-shell and Waybar implemented; community-tested wanted |
| Xfce, Cinnamon, MATE, i3 and other X11 desktops | Positioning/panel paths available; community-tested wanted |

[Linux details](docs/linux.md) explain the GTK3 layer-shell dependency, GNOME fallback and distribution differences.

## Privacy & security

First launch asks which providers to track; all providers stay disabled until you choose **Start**. CLI users run `quotacore init`. New providers default off. The widget reads a local snapshot. Collection can contact provider services using existing credentials: Claude's `~/.claude/.credentials.json`, Codex/agy CLI-managed authentication, GitHub CLI's token, or optional OpenRouter/DeepSeek API keys from environment variables or local `secrets.json`. JetBrains reads a local quota XML file.

Requests retrieve usage or balances; the collector does not submit prompts or request model completions. It does not scan chat history. Passive panel reads make no network requests; explicit refresh runs the collector. There is no application telemetry or analytics code. Third-party CLIs retain their own networking behavior. Snapshots, observations and pace history stay local and can contain sensitive usage metadata; do not attach raw files to issues. See the [security model](docs/security-model.md) for credential destinations, plaintext key storage, process limits, retention and verification; [provider data boundaries](docs/providers.md) describe adapter support.

## FAQ

**Why does this differ from the provider dashboard?** Sources refresh at different times; cached data, different quota windows and API balances are not interchangeable. Check the source and state before comparing.

**What happens when credentials expire?** The source reports an authentication error or marked cached data. Sign in again through the provider's tool; the widget does not renew credentials.

**Does it read my prompts?** It does not scan conversation history or submit prompts. Optional status-line hooks extract quota fields from their input; never share raw hook payloads.

**Why won't a corner stick on Wayland?** Fixed placement needs compositor layer-shell support and the GTK3 runtime. GNOME normally uses an ordinary window; choose its panel integration or the documented XWayland option.

## Roadmap

Cursor, Kiro, Amp and Grok adapters; additional themes; native desktop acceptance across more environments; signed release validation; winget and AUR distribution. These are plans, not current integrations.

## Contributing

Bug reports, provider samples with invented data, and desktop compatibility checks are welcome. Read [CONTRIBUTING](CONTRIBUTING.md), use the issue templates, and report vulnerabilities through [SECURITY](SECURITY.md).

## License

A project license has not been granted yet. A license file will be added after the maintainer's decision. Bundled font dependencies retain their own upstream licenses; see the app's font resources. Provider names identify compatible tools and do not imply affiliation.
