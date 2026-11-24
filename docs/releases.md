# Release workflow notes

A green build is not an installer acceptance test; install the produced packages before publishing.

CI checks Ubuntu and Windows frontend builds and Rust compilation, plus Python tests on Ubuntu. The release-please workflow watches `main`, prepares a Conventional Commits version/changelog PR, and creates a version tag when that PR is merged. Enable Actions permissions to create pull requests in the repository settings before using it.

The manifest starts at `0.1.0`. `release-as: 0.1.0` pins the first release intentionally: **remove that field from `release-please-config.json` in the first release PR before merging**, so later releases can advance normally. The root Python strategy updates Python metadata; extra JSON/TOML updaters synchronize the frontend, Tauri and Rust package/lock versions. Review every generated version change before merging.

Installer builds run for pushed `v*` tags. Release-please also dispatches the same build workflow at the released tag using `workflow_dispatch`, because tags created with `GITHUB_TOKEN` do not start another push workflow. This avoids needing a personal access token. Both entry points share a concurrency group for the tag.

The build matrix targets Windows x86_64 (`.exe` via NSIS and `.msi` via WiX) and Linux x86_64 (AppImage, deb, Fedora-targeted rpm). Artifacts get OS/architecture prefixes. Both builds must succeed before the upload job combines installers, writes `SHA256SUMS.txt`, and attaches assets to the tag's release. If no release exists, it creates a draft. Reruns replace matching assets. Checksums verify file integrity, not publisher identity; signing is not configured.

Before publishing a release, verify installation, host Python/provider CLI discovery, package contents, clean-machine startup, Windows transparency and taskbar behavior, and Linux distribution dependencies. AppImage execution and all native panel configurations still need acceptance. The existing rpm dependency names target Fedora, not every rpm distribution. AUR and winget publication are not part of this pipeline.

Implementation references: [release-please action](https://github.com/googleapis/release-please-action), [extra version file updaters](https://github.com/googleapis/release-please/blob/main/docs/customizing.md), [Tauri GitHub builds](https://v2.tauri.app/distribute/pipelines/github/).

All external actions are pinned to full commit SHAs; Rust is pinned to 1.99.1 and release builds use `--locked`. Installer builds request GitHub artifact provenance with job-scoped `id-token: write` and `attestations: write`. Repository/plan eligibility and an actual successful attested release still need verification; this is not Windows Authenticode signing.
