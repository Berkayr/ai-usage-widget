# Security model

AI Quota Widget runs as the current user. Do not run it elevated. It reads quota
metadata and, after provider selection, may use existing credentials to retrieve
usage or balances. It does not scan conversation history or request model
completions. There is no application telemetry, analytics, developer upload,
background update check, or remote webview content in the product code.
Third-party tools retain their own networking and telemetry behavior.

## Consent and diagnostics

A new installation starts with every provider disabled. The shared **Choose what
to track** screen lists access disclosures and unchecked choices in all eight
themes. **Start** persists the choices; only selected providers can then collect.
The same controls remain in settings. CLI users run `quotacore init` (interactive)
or `quotacore configure claude codex` (explicit selection); `quotacore configure`
disables everything. Existing configurations retain their explicit provider
entries. Providers introduced by an upgrade default disabled.

Before consent, detection checks directory/file existence and executable paths;
it never opens credential contents, runs provider CLIs, or sends provider
requests. An API provider may be marked detected when a shared secrets file
exists, even if that file contains only the other provider's key. Detection is
an availability hint, not an account check.

The widget starts a local Python collector on startup and every 300 seconds.
With no consent this writes disabled records without calling provider readers.
`doctor` shows cached diagnostics and resolved Python/module/CLI paths without
provider access. `doctor --live` reads **enabled** providers only. Passive panel
readers use the saved snapshot. Explicit `refresh-gemini`, hooks and `key set`
are independent user-invoked operations; they do not silently enable providers.

Implementation: [configuration](../quotacore/paths.py),
[CLI and collection](../quotacore/__main__.py),
[disclosures](../quotacore/consent.py),
[shared provider controls](../app/src/themes/shared/providers.js).

## Credentials and destinations

| Provider | What is read or executed after selection | Credential destination |
| --- | --- | --- |
| Claude | `~/.claude/.credentials.json`; fallback quota observations and `~/.claude.json` cached usage | Access token to `api.anthropic.com`; no refresh-token exchange, credential-file writes or keychain access |
| Codex | `codex app-server`; JSON-RPC `initialize`, `initialized`, `account/rateLimits/read` | The installed CLI manages credentials, endpoints and possible renewal; this adapter does not directly open `auth.json` |
| Gemini/agy | Passive reads of local `gemini-kota.json`; explicit `refresh-gemini` runs `agy -p /usage --output-format json` | CLI-managed credentials and endpoints only on explicit refresh; passive reads make no network requests |
| Copilot | `gh auth token` stdout, kept in process memory | Token to `api.github.com` |
| OpenRouter | `OPENROUTER_API_KEY`, otherwise `openrouter` in local `secrets.json` | Key to `openrouter.ai` |
| DeepSeek | `DEEPSEEK_API_KEY`, otherwise `deepseek` in local `secrets.json` | Key to `api.deepseek.com` |
| JetBrains | Quota XML in the platform JetBrains config directory | No credential read or network request |

Direct HTTP calls are bodyless GETs to these fixed HTTPS URLs:

| Endpoint | Headers carrying credentials / request identity |
| --- | --- |
| `https://api.anthropic.com/api/oauth/usage` | `Authorization: Bearer …`, `anthropic-beta: oauth-2025-04-20`, `User-Agent: quotacore/0.1` |
| `https://api.github.com/copilot_internal/user` | `Authorization: Bearer …`, `Accept: application/json`, `User-Agent: quotacore/0.2` |
| `https://openrouter.ai/api/v1/key` | Same common headers |
| `https://openrouter.ai/api/v1/credits` | Same common headers |
| `https://api.deepseek.com/user/balance` | Same common headers |

[Provider adapters](../quotacore/providers/) reject HTTP redirects. They use normal
system TLS verification, including the user's configured trust store and proxy
environment; there is no certificate pinning. Each direct request has a 15-second
timeout and a 1 MiB response limit before JSON decoding. Codex/agy/gh may use
services or proxies configured in those tools; their indirect traffic is outside
this app's fixed-endpoint boundary.

## Local storage

`key set` reads stdin and saves **unencrypted plaintext** keys in `secrets.json`.
No operating-system credential vault or encryption is provided. Environment keys
take precedence. The dependency-free [privacy helper](../quotacore/privacy.py)
applies Unix mode 0600, or a protected Windows DACL granting file access only to
the current user's SID. Atomic temporary files receive this restriction **before**
secret contents are written; failure aborts the save. Administrators can still
take ownership, and malware running as the same user can read these files.

| Written locally | Contents / purpose |
| --- | --- |
| `config.json` | Provider consent, enabled flags, display ordering, interval |
| `secrets.json` | Optional OpenRouter/DeepSeek keys, plaintext |
| `snapshot.json` | Plan labels, usage/balances, reset/capture times, source, state, error summaries |
| `claude-observation.json`, `gemini-kota.json` | Quota fields extracted from explicitly supplied hooks or Gemini refresh |
| `pace-log.jsonl`, `pace-state.json` | Usage timing, percentages, profiles, reset events and pacing state |
| `settings.json`, `window.json` | Widget appearance, taskbar preferences and geometry |
| Webview local storage | Theme/display preferences |

Collector files are under the user's state/config directories; widget settings
are under the user's platform config directory. Windows defaults stay inside the
user profile (`LOCALAPPDATA` / platform config). `QUOTACORE_HOME`, XDG variables
and other documented overrides are explicit relocation controls. Unix JSON files
and pace history are saved as 0600; native settings/geometry writes also restrict
existing files before truncation. Windows native appearance settings inherit
profile permissions; Python JSON files receive the restricted DACL above.

Pace history retains at most 1 MiB and records from the last 30 days, pruning on
each logged run without keeping backup copies. `pace --purge` removes history and
pace state without collecting; `--no-log` skips history writes but still updates
profile state. Expired records are not removed while the app is idle. Deleting
files is not secure erasure. Snapshots and diagnostics are private metadata;
error truncation is not a general secret-redaction guarantee.

Implementation: [atomic files](../quotacore/paths.py),
[history](../quotacore/history.py), [native writes](../app/src-tauri/src/lib.rs).

## Processes and hooks

The native app prefers the packaged Python module resources on both Windows and
Linux. An explicit `QUOTACORE_PYTHONPATH` overrides that directory. Host Python
and provider executables still resolve from the trusted local installation and
PATH. `quotacore doctor` exposes the interpreter, module and resolved CLI paths.
Windows tries the Python launcher, then Python when the executable cannot start.
Trust the inherited Python, PATH, library and proxy environment.

The [native collector runner](../app/src-tauri/src/collector.rs) has a 120-second
deadline, a 1 MiB stdout limit and generic UI errors (raw stderr is discarded).
It isolates the process tree in a Unix process group or Windows Job Object with
kill-on-close, and cleans it up on completion or timeout. Provider CLIs also have
adapter deadlines (Codex 20s, gh 10s, explicit agy refresh 45s). Provider CLI
capture sizes are not all bounded independently; the direct HTTP and native
collector-output limits do not impose an operating-system memory limit on a
third-party CLI. Windows `.cmd` Codex shims explicitly invoke `cmd.exe`; normal
native commands use argument arrays. No provider response generates a command.

[Status-line hooks](../quotacore/hooks.py) extract quota fields from stdin and do
not modify Claude/Gemini settings. Hook input is limited to 1 MiB. Optional
`--chain-cmd '["program","argument"]'` (alias `--chain`) uses `shell=False`.
Only explicit `--chain-shell 'command'` invokes a shell. Both forward the complete
original hook input to the user-selected command: choose commands you trust.
Runtime is limited to 5 seconds and stdout to 64 KiB; stderr is discarded. Unix
chains are cleaned up as a process group. On Windows hook timeout terminates the
direct child; arbitrary commands may detach descendants. Hooks are explicit
user configuration, not installed or activated automatically.

## Desktop and webview

Start at login is an explicit toggle: only this application's HKCU Run value
(Windows), or per-user autostart desktop entry (Linux), is added/removed.
Executable paths are quoted. No startup entry is created by installation tests.

The optional Windows taskbar strip creates no GUI thread/window/hook while off.
Enabling starts its GUI thread; disabling ends it, calls `UnhookWinEvent` and
destroys its tooltip and strip window. `SetWinEventHook` listens only for Explorer
location changes, filtered to its PID with `WINEVENT_OUTOFCONTEXT` and
`WINEVENT_SKIPOWNPROCESS`. It does not capture keys or inject code into Explorer.
The transparent topmost, non-activating window draws quota text without stealing
focus. GDI/GDI+ draw the strip; registry reads obtain the system theme.
See [taskbar lifecycle](../app/src-tauri/src/taskbar.rs) and
[Windows autostart](../app/src-tauri/src/autostart.rs).

Linux optionally loads `libgtk-layer-shell.so.0` for compositor-supported
placement. Its library search environment must be trusted. Bundled constant JS
coordinates focus/placement; it is not generated from provider content.

The production frontend is bundled locally. CSP restricts resources and IPC.
No generic filesystem, shell or opener plugin is enabled, but specific native
commands can collect data, save settings and change autostart. Snapshot text is
escaped; state classes use a fixed allowlist through the
[shared safety helper](../app/src/themes/shared/safety.js). Treat snapshots as
private local data even though renderer injection is defended against.

## Releases and verification

External GitHub Actions are pinned to full commit SHAs, Rust has a fixed version,
and release Cargo builds require `--locked`. Release-please explicitly dispatches the installer workflow at the released
tag, using a narrowly scoped job permission.
Dependabot proposes Actions/npm/Cargo/pip updates. Installer builds request
GitHub artifact provenance attestations. This requires GitHub attestation support
for the repository/plan; YAML validation alone does not prove a release ran or
was attested. Verify an actual installer against its repository's attestation
before trusting it. SHA-256 checksums detect modification but do not authenticate
the publisher. Authenticode signing and SmartScreen/antivirus reputation have
not been established by these changes.

AUR recipes remain unpublished drafts with deliberately invalid checksum
placeholders. Follow the [packaging release gate](../packaging/README.md) before
publishing. Documentation screenshots use only fictional fixtures and keep the
browser sandbox enabled by default; `SCREENSHOT_NO_SANDBOX=1` is an explicit
restricted-development override, never an application startup flag.

Reproduce local boundary checks with fictional data:

```sh
python3 -m unittest discover -s tests
node tests/render-security.mjs
cd app
npm run build
npx tauri build --debug --no-bundle
cd src-tauri
cargo test --lib collector::tests --locked
cargo check --target x86_64-pc-windows-gnu --locked
```

Do not attach raw diagnostics, credentials, snapshots or hook input to issues.
Use [SECURITY.md](../SECURITY.md) for private reporting. These tests do not replace
Windows runtime lifecycle/ACL testing, release attestation verification or an
up-to-date dependency vulnerability scan.

## For AI reviewers

- [Collection](../quotacore/__main__.py) requires provider selection; new providers default off.
- [Detection and doctor](../quotacore/__main__.py) avoid credential contents; live diagnosis is explicit and respects disabled providers.
- [Direct HTTP](../quotacore/providers/common.py) uses fixed HTTPS GET endpoints, rejects redirects and bounds response size.
- [Claude](../quotacore/providers/claude.py) never renews tokens or writes provider credentials; Codex/agy delegate authentication to their CLIs.
- [Keys](../quotacore/privacy.py) are plaintext with Unix 0600 / current-user Windows DACLs, not encrypted vault storage.
- [History](../quotacore/history.py) is local, bounded and purgeable; snapshots still contain private usage metadata.
- [Hooks](../quotacore/hooks.py) use argv by default; only explicit shell chaining runs a shell and all chains receive raw stdin.
- [Native collection](../app/src-tauri/src/collector.rs) has deadlines, bounded stdout and process-tree cleanup.
- [Renderers](../app/src/themes/shared/safety.js) escape text and allowlist state classes in every theme.
- [Windows strip](../app/src-tauri/src/taskbar.rs) observes Explorer location events only when enabled; no keylogging or injection.
- [Release builds](../.github/workflows/build.yml) pin external actions and request provenance; signing and AV reputation remain unverified.
