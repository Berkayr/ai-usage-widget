# Provider data and setup

The writer (`python3 -m quotacore write`) collects enabled providers into a shared local snapshot. The widget and panel readers display that snapshot. A subscription quota is different from API credit balance. Missing values are unknown, never assumed to be zero.

Status describes validation evidence, not an upstream compatibility guarantee. Gemini via agy has recorded live-account checks; Claude, Codex and the remaining adapters are beta until live-account acceptance is recorded. Provider endpoints and response formats can change independently of this application.

| Provider | Status | Source and required setup | Limits |
| --- | --- | --- | --- |
| Claude Code | Beta | Sign in through Claude Code first. Reads `~/.claude/.credentials.json` (`claudeAiOauth.accessToken`, expiry, subscription type); GET `https://api.anthropic.com/api/oauth/usage` with bearer authentication. | No token renewal. Falls back to recent status-line observations, then local `~/.claude.json` usage cache and previous cached windows. OAuth scope, expiry and endpoint throttling can block live reads. |
| Codex | Beta | Install and sign in through the Codex CLI; it must be discoverable on PATH. Starts `codex app-server`, exchanges JSON-RPC `initialize`, `initialized`, `account/rateLimits/read`, then stops the process. | The adapter delegates credential access/networking to the CLI; it does not directly open Codex credential files or request a model response. Requires the matching app-server response schema. |
| Gemini CLI / Antigravity | Stable Antigravity adapter; direct Gemini CLI quota API planned | Requires the Antigravity `agy` command, already signed in. Reads local `gemini-kota.json`; refresh explicitly with `python3 -m quotacore refresh-gemini`, then `python3 -m quotacore write`. Alternatively feed the agy status-line hook into `python3 -m quotacore hook agy`. | Passive reads do not launch agy. Explicit refresh invokes `agy -p /usage --output-format json`; its credentials/networking are managed by agy. Cache older than seven days is rejected. Installing stock Gemini CLI alone does not satisfy detection. |
| GitHub Copilot | Beta | GitHub CLI installed and signed in with appropriate account access. Adapter runs `gh auth token`, then GET `https://api.github.com/copilot_internal/user` using the token. | Internal endpoint; may change or reject token permissions. No automatic login. |
| OpenRouter | Beta | `OPENROUTER_API_KEY`, or `openrouter` in local `secrets.json`. GET `https://openrouter.ai/api/v1/key`, then optional `https://openrouter.ai/api/v1/credits`. | API key allowance and account credits are distinct meters, not chat subscription windows. |
| DeepSeek API | Beta | `DEEPSEEK_API_KEY`, or `deepseek` in local `secrets.json`. GET `https://api.deepseek.com/user/balance`. | Currency balances only; not the DeepSeek chat application's subscription quota. |
| JetBrains AI | Beta | Local IDE quota cache: `JetBrains/*/options/AIAssistantQuotaManager2.xml` under the platform config directory (`%APPDATA%` on Windows, `$XDG_CONFIG_HOME` or `~/.config` on Linux). | Reads newest matching file and supported embedded JSON fields. No network or credential read by this adapter. IDE versions can change the XML format; cache freshness depends on the IDE. |

## Failure states

`STALE` preserves earlier data with a visible warning. `AUTH_REQUIRED` means sign in again through the provider's own tool. `RATE_LIMITED` means wait; repeated refreshes are unhelpful. `SOURCE_UNAVAILABLE` means the source could not be read; `SCHEMA_CHANGED` means its shape was not recognized. `DISABLED`, `NOT_INSTALLED` and `NO_SUBSCRIPTION` providers are hidden by the desktop renderer. Extra/model windows are hidden by default and can be enabled in settings.

Claude status-line input is reduced to quota observations; the application does not scan conversation history. Hook input can contain other fields, so do not publish raw hook payloads or provider responses. Snapshot files can contain plan labels, quota values, timestamps and error summaries: treat them as private even when they contain no token.

See [configuration](configuration.md) for storage locations and provider enablement, and [privacy](../README.md#privacy) for the collection boundary.
