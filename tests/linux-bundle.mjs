import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanAppImageStaging } from '../app/scripts/prepare-linux-bundle.mjs';

const target = mkdtempSync(path.join(tmpdir(), 'ai-usage-bundle-'));
try {
  for (const prefix of ['', 'x86_64-unknown-linux-gnu']) {
    const release = path.join(target, prefix, 'release');
    for (const name of ['appimage', 'appimage_deb']) {
      const staging = path.join(release, 'bundle', name);
      mkdirSync(staging, { recursive: true });
      writeFileSync(path.join(staging, 'ai-quota-widget'), 'stale fixture');
    }
    writeFileSync(path.join(release, 'ai-quota-widget'), 'unrelated legacy binary');
    writeFileSync(path.join(release, 'ai-usage'), 'current binary');
  }
  cleanAppImageStaging(target, 'x86_64-unknown-linux-gnu');
  cleanAppImageStaging(target, 'x86_64-unknown-linux-gnu');
  for (const prefix of ['', 'x86_64-unknown-linux-gnu']) {
    const release = path.join(target, prefix, 'release');
    assert(!existsSync(path.join(release, 'bundle', 'appimage_deb')));
    assert(!existsSync(path.join(release, 'bundle', 'appimage')));
    assert(existsSync(path.join(release, 'ai-quota-widget')));
    assert(existsSync(path.join(release, 'ai-usage')));
  }
  const config = JSON.parse(readFileSync(new URL('../app/src-tauri/tauri.linux.conf.json', import.meta.url)));
  const base = JSON.parse(readFileSync(new URL('../app/src-tauri/tauri.conf.json', import.meta.url)));
  assert.equal(config.productName, base.mainBinaryName);
  assert.match(readFileSync(new URL('../packaging/ai-usage.desktop', import.meta.url), 'utf8'), /^Icon=ai-usage$/m);
  console.log('Linux bundle staging and icon identity: passed');
} finally { rmSync(target, { recursive: true, force: true }); }
