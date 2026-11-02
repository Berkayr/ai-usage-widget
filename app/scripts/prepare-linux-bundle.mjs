import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tauri clears bundle/appimage, but reuses bundle/appimage_deb/data. A rename
// otherwise carries old binaries, desktop entries and resources into the image.
export function cleanAppImageStaging(targetDirectory, triple, debug = false) {
  const roots = [targetDirectory];
  if (triple) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(triple)) throw new Error('Invalid target triple');
    roots.push(path.join(targetDirectory, triple));
  }
  for (const root of roots) {
    for (const name of ['appimage', 'appimage_deb']) {
      rmSync(path.join(root, debug ? 'debug' : 'release', 'bundle', name), { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = fileURLToPath(new URL('../src-tauri/Cargo.toml', import.meta.url));
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', manifest], { encoding: 'utf8' }));
  cleanAppImageStaging(metadata.target_directory, process.env.TAURI_ENV_TARGET_TRIPLE, process.env.TAURI_ENV_DEBUG === 'true');
}
