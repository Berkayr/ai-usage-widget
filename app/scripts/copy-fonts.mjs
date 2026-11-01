import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const target = new URL('../src/fonts/', import.meta.url);
await mkdir(target, { recursive: true });
for (const [name, file] of [
  ['dotgothic16-latin-400-normal.woff2', '../node_modules/@fontsource/dotgothic16/files/dotgothic16-latin-400-normal.woff2'],
  ['jetbrains-mono-latin-400-normal.woff2', '../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'],
  ['jetbrains-mono-latin-600-normal.woff2', '../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2']
]) await cp(new URL(file, import.meta.url), new URL(name, target));
for (const [pkg, dest] of [['@fontsource/dotgothic16','OFL-DotGothic16.txt'], ['@fontsource/jetbrains-mono','OFL-JetBrainsMono.txt']]) {
  const license = new URL(`../node_modules/${pkg}/LICENSE`, import.meta.url);
  await writeFile(new URL(dest, target), await readFile(license));
}
