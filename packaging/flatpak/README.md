# Flatpak status

No Flatpak manifest is shipped yet. The readers need host CLI executables,
CLI login state and provider credential storage. A default Flatpak sandbox
cannot read them or run the host's Python/CLI tools. Broad home-directory
access plus `flatpak-spawn --host` would defeat the intended isolation.

A future package should use a small host quotacore service that exposes a
read-only, account-free snapshot through a portal or narrowly scoped shared
file. Keep credentials and CLI processes on the host. Validate layer-shell
availability in the runtime before advertising native Wayland placement.
