# Contributing

Start with an issue describing a reproducible problem or the proposed behavior. For a new provider, document the quota source, authentication boundary, schema and failure modes before implementing an adapter. Use fictional fixture data; never submit raw account exports, tokens, machine names, personal paths, plans tied to a person, or real screenshots.

## Development

Python 3.10+, Node/npm and Rust are required. Native builds also need the platform's Tauri prerequisites. From the repository root:

```sh
python3 -m unittest discover -s tests
node tests/render-security.mjs
node --test tests/*.mjs
cd app
npm ci
npm run build
cd src-tauri
cargo test --locked
```

For native development, also install quotacore into the Python environment used by the launcher; see [packaging](packaging/README.md) for virtual environment setup and discovery.

Keep changes focused. Update user-facing docs when behavior changes. For visuals, regenerate `node docs/tools/screenshots.mjs` from the root and inspect every affected image with synthetic data. Run `node --test tests/documentation.mjs` to check local documentation links and the gallery space algorithm. Screenshot generation also rejects gallery scenes with an empty content rectangle larger than 12% of the canvas. It uses only headless Chrome and fictional fixtures. Native desktop behavior needs an actual desktop check; a browser illustration cannot validate window positioning or Win32 rendering. Include the platform, validation performed and remaining limits in the pull request.

Provider collection tests must be isolated from real credentials and state. Do not run the real collector merely to verify documentation. The current hosted CI covers Python tests, frontend builds and Rust checks; distribution builds run separately; see [release workflow notes](docs/releases.md).

## Commit messages

Use Conventional Commits: `type(scope): imperative description`, without a final period. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Useful scopes: `tray`, `linux`, `core`, `theme`, `readme`.

Examples: `fix(linux): preserve corner margin after scaling`, `docs(readme): explain provider authentication`. Use `!` or a `BREAKING CHANGE:` footer for incompatible behavior. Release-please uses these messages to prepare version/changelog pull requests; release publication remains a maintainer action.

The project is licensed under the [MIT License](LICENSE). Do not add proprietary fonts or assets without redistribution rights.
