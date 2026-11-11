import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const full = process.argv.includes('--full');
if (process.argv.slice(2).some(arg => arg !== '--full')) {
  console.error('Usage: node docs/tools/acceptance/run.mjs [--full]');
  process.exit(2);
}

const root = resolve(new URL('../../..', import.meta.url).pathname);
const controls = JSON.parse(await readFile(resolve(root, 'docs/tools/acceptance/controls.json'), 'utf8'));
const promises = JSON.parse(await readFile(resolve(root, 'docs/tools/acceptance/promises.json'), 'utf8'));
const ids = new Set(controls.map(control => control.id));
const brokenPromises = promises.filter(promise =>
  (['headless', 'unit'].includes(promise.verify) && !promise.test) ||
  (['manual', 'not-verified'].includes(promise.verify) && !promise.reason) ||
  !['headless', 'unit', 'manual', 'not-verified'].includes(promise.verify));
if (brokenPromises.length) {
  console.error(`FAIL: ${brokenPromises.length} promise ledger entries have neither a test nor a manual status.`);
  for (const item of brokenPromises) console.error(`  ${item.id}: ${item.claim}`);
  process.exit(1);
}
if (ids.size !== controls.length) {
  console.error('FAIL: duplicate control IDs in controls.json');
  process.exit(1);
}

const fast = [
  ['node', ['docs/tools/acceptance/inventory-check.mjs']],
  ['node', ['docs/tools/acceptance/control-effects.mjs']],
  ['node', ['docs/tools/acceptance/regressions.mjs']],
  ['node', ['docs/tools/settings-check.mjs']],
  ['node', ['docs/tools/provider-layout-check.mjs']],
  ['node', ['docs/tools/quote-check.mjs']],
  ['node', ['docs/tools/shape-final-check.mjs']],
  ['node', ['docs/tools/portrait-resize-check.mjs']],
  ['node', ['docs/tools/screen-fit-check.mjs']],
  ['node', ['tests/settings-contract.mjs']],
  ['node', ['tests/size-contract.mjs']],
  ['node', ['tests/shapes-content.mjs']],
  ['node', ['tests/quote-privacy.mjs']],
  ['node', ['tests/live-startup.mjs']],
  ['node', ['docs/tools/acceptance/live-startup.mjs']],
  ['node', ['tests/documentation.mjs']],
  ['node', ['--test', 'tests/screen-fit.mjs', 'tests/user-palettes.mjs', 'tests/pairwise.mjs']],
  ['python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_install_script.py']],
  ['python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_footprint.py']],
];

const exhaustive = [
  ['node', ['docs/tools/text-overlap-check.mjs']],
  ['node', ['docs/tools/size-audit.mjs']],
  ['node', ['docs/tools/theme-identity-check.mjs']],
  ['node', ['docs/tools/contrast-audit.mjs']],
  ['node', ['docs/tools/settings-contrast-audit.mjs']],
  ['node', ['docs/tools/palette-check.mjs']],
  ['node', ['docs/tools/palette-identity-check.mjs']],
  ['node', ['docs/tools/palette-settings-check.mjs']],
  ['node', ['docs/tools/provider-identity-check.mjs']],
  ['node', ['docs/tools/quote-fit-check.mjs']],
  ['node', ['docs/tools/quote-position-check.mjs']],
  ['node', ['docs/tools/usage-fit-check.mjs']],
  ['node', ['docs/tools/portrait-gap-check.mjs']],
  ['node', ['docs/tools/widget-layout-check.mjs']],
  ['node', ['docs/tools/circle-preview.mjs']],
  ['node', ['docs/tools/shape-final-sheets.mjs']],
];

const jobs = full ? [...fast, ...exhaustive] : fast;
console.log(`Acceptance ${full ? 'full' : 'fast'} run: ${jobs.length} checks; ${controls.length} control entries; ${promises.length} promises.`);
const failures = [];
for (const [command, args] of jobs) {
  const started = performance.now();
  console.log(`> ${command} ${args.join(' ')}`);
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, SKIP_AUDIT_SCREENSHOTS: '1' } });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveResult({ code: code ?? 1, signal }));
  });
  console.log(`Duration: ${((performance.now() - started) / 1000).toFixed(1)} s`);
  if (result.code !== 0) {
    const failure = `${command} ${args.join(' ')} (${result.signal ?? `exit ${result.code}`})`;
    failures.push(failure);
    console.error(`FAIL: ${failure}; continuing so later checks still run.`);
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length}/${jobs.length} acceptance checks failed:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`PASS: acceptance ${full ? 'full' : 'fast'} checks completed.`);
