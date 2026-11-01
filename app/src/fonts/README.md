The predev and prebuild scripts copy the selected Fontsource WOFF2 files and
their complete OFL license texts into this directory after `npm install`.
Keep these generated assets local to the application bundle; do not replace
them with remote font URLs.

Inter Variable is bundled from the locally installed Inter font distribution; see OFL-Inter.txt. It is used by the sans-serif themes. No font is fetched at runtime.
