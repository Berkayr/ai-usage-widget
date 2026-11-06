import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, delimiter} from 'node:path';

const run = promisify(execFile);
const runner = resolve('docs/tools/acceptance/native-webdriver.mjs');

for (const stage of ['session', 'command']) test(`native ${stage} failures print bounded diagnostics and clean up isolated state`, {skip:process.platform==='win32'}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-usage-driver-test-'));
  try {
    await mkdir(join(root, 'app/src'), {recursive:true});
    await writeFile(join(root, 'app/src/sample-snapshot.json'), '{}');
    // This fake server never starts a browser or the native application.
    await writeFile(join(root, 'tauri-driver'), `#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  if (req.url === '/status') { res.end(JSON.stringify({value:{ready:true}})); return; }
  if (req.url === '/session') {
    const application = JSON.parse(body).capabilities.alwaysMatch['tauri:options'].application;
    const wrapper = fs.readFileSync(application, 'utf8');
    fs.writeFileSync('observed.json', JSON.stringify({application, wrapper, driverDebug:process.env.WEBKIT_DEBUG ?? null}));
    process.stderr.write('x'.repeat(70000) + '\\nSYNTHETIC SESSION FAILURE\\n');
    if (process.env.FAKE_FAILURE_STAGE === 'command') {
      res.end(JSON.stringify({value:{sessionId:'synthetic'}})); return;
    }
  }
  res.writeHead(500); res.end(JSON.stringify({value:{error:'unknown error',message:'synthetic'}}));
});
server.listen(4444, '127.0.0.1');
`, {mode:0o700});
    const env = {...process.env, CI:'true', FAKE_FAILURE_STAGE:stage, PATH:root + delimiter + process.env.PATH};
    delete env.WEBKIT_DEBUG;
    let failure;
    try { await run(process.execPath, [runner], {cwd:root, env, timeout:15000}); }
    catch (error) { failure = error; }
    assert.equal(failure?.code, 1);
    assert.match(failure.stderr, /driver\.log tail/);
    assert.match(failure.stderr, /SYNTHETIC SESSION FAILURE/);
    if (stage === 'command') {
      assert.match(failure.stderr, /Session cleanup failed/);
      assert.match(failure.stderr, /Screenshot failed/);
    }
    assert(failure.stderr.length < 12000, 'Failure output must stay bounded');
    const log = await readFile(join(root, 'native-artifacts/driver.log'), 'utf8');
    assert(log.length <= 65536);
    assert.match(log, /SYNTHETIC SESSION FAILURE/);
    const observed = JSON.parse(await readFile(join(root, 'observed.json'), 'utf8'));
    assert.match(observed.wrapper, /export WEBKIT_DEBUG=Automation G_MESSAGES_DEBUG=all/);
    assert.equal(observed.driverDebug, null);
    await assert.rejects(readFile(observed.application), {code:'ENOENT'});
  } finally {
    await rm(root, {recursive:true, force:true});
  }
});
