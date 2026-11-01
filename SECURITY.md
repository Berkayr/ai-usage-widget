# Security policy

This project is pre-release. There is no supported stable release line yet; fixes target the current development branch.

Do not put vulnerabilities, credentials, raw snapshots or private account information in public issues. Use the repository's **Security → Advisories → Report a vulnerability** private reporting channel when enabled. If it is unavailable, ask the maintainer to enable private reporting without including technical exploit details. No public contact address or response-time promise is configured.

Include the affected version, operating system, minimal reproduction with fictional data, expected security boundary and likely impact. Redact secrets, personal paths, usernames, machine names and provider account metadata. Do not test against other people's accounts.

The collector accesses local provider credentials and can make authenticated usage requests. Review [provider boundaries](docs/providers.md) and [configuration](docs/configuration.md). Treat snapshots and diagnostics as private usage data even if they contain no access token. Do not attach credential files or raw CLI/hook output.

The [security model](docs/security-model.md) documents provider consent, credential destinations, plaintext key storage and Windows DACLs, process execution, retention, desktop APIs and release provenance. Default `doctor` is passive; only `doctor --live` reads enabled providers. Test with temporary directories and fictional data. Signed binaries, antivirus reputation, CLI behavior and dependency vulnerability status are separate verification tasks; do not infer them from a clean source scan.
