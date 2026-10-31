'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runWithRetry, launch, buildCommand } = require('./build-windows-retry');
const quiet = { stdout: { write() {} }, stderr: { write() {} } };

(async () => {
  let calls = 0, waits = [];
  const options = { wait: async ms => waits.push(ms), log: () => {} };
  assert.equal(await runWithRetry(async () => ++calls === 1 ? { code: 1, output: 'read ECONNRESET' } : { code: 0 }, options), 0);
  assert.equal(calls, 2); assert.deepEqual(waits, [10000]);
  calls = 0; waits = [];
  assert.equal(await runWithRetry(async () => { calls++; return { code: 7, output: 'ETIMEDOUT' }; }, options), 7);
  assert.equal(calls, 3); assert.deepEqual(waits, [10000, 20000]);
  calls = 0;
  assert.equal(await runWithRetry(async () => { calls++; return { code: 2, output: 'Invalid configuration: icon missing' }; }, options), 2);
  assert.equal(calls, 1);
  assert.equal(await runWithRetry(async () => { throw new Error('Must not start'); }, { ...options, cancelled: () => true }), 130);
  assert.equal(await runWithRetry(async () => ({ code: 1, signal: 'SIGINT', output: 'ECONNRESET' }), options), 130);
  const failed = await launch(process.execPath, ['-e', 'process.stderr.write("ECONNRESET\\n");process.exit(9)'], process.cwd(), undefined, quiet);
  assert.equal(failed.code, 9); assert.match(failed.output, /ECONNRESET/);
  const passed = await launch(process.execPath, ['-e', 'process.stdout.write("ALM_ARG="+JSON.stringify(process.argv[1])+"\\n")', 'chemin avec espaces & caractere'], process.cwd(), undefined, quiet);
  assert.equal(passed.code, 0); assert.equal(JSON.parse(passed.output.match(/^ALM_ARG=(.*)$/m)[1]), 'chemin avec espaces & caractere');
  const root = path.resolve(__dirname, '..');
  const manifests = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, manifests.version);
  for (const group of ['dependencies', 'devDependencies']) {
    assert.deepEqual(lock.packages[''][group], manifests[group], `${group}: verrou synchronise`);
    for (const [name, version] of Object.entries(manifests[group])) {
      assert.equal(lock.packages[`node_modules/${name}`].version, version, `${name}: version verrouillee`);
      assert.ok(lock.packages[`node_modules/${name}`].integrity, `${name}: integrite du paquet`);
    }
  }
  assert(!fs.existsSync(path.join(root,'Creer EXE Portable.bat')));
  for(const name of ['Publier Installateur Windows.bat','REPRENDRE_BUILD_WINDOWS.bat']){
    const content=fs.readFileSync(path.join(root,name),'utf8');assert(content.startsWith('@echo off\r\n'));assert(content.includes('cd /d "%~dp0"'));assert(content.includes('node scripts\\release-windows.js'));assert(content.includes('if errorlevel 1 goto :error'));if(name.startsWith('REPRENDRE'))assert(content.includes('--resume'));assert(!content.includes(' portable'));
  }
  assert.equal(manifests.scripts.build,'node scripts/build-windows-retry.js nsis');
  assert.equal(manifests.scripts['build-installer'],'node scripts/build-windows-retry.js nsis');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'alm build & test '));
  try {
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ devDependencies: { 'electron-builder': '26.16.1' } }));
    assert.throws(() => buildCommand(fixture, ['nsis']), /absent/);
    const local = path.join(fixture, 'node_modules', 'electron-builder');
    fs.mkdirSync(local, { recursive: true });
    const manifest = path.join(local, 'package.json');
    fs.writeFileSync(manifest, JSON.stringify({ name: 'electron-builder', version: '26.16.1' }));
    fs.writeFileSync(path.join(local, 'cli.js'), 'process.stdout.write("ALM_FIXTURE="+JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()})+"\\n")');
    assert.throws(() => buildCommand(fixture, []), /Usage/);
    assert.throws(() => buildCommand(fixture, ['--publish', 'always']), /Usage/);
    for (const targets of [['dir'], ['nsis']]) {
      const invocation = buildCommand(fixture, targets);
      const result = await launch(invocation.command, invocation.args, invocation.cwd, undefined, quiet);
      assert.equal(result.code, 0);
      assert.deepEqual(JSON.parse(result.output.match(/^ALM_FIXTURE=(.*)$/m)[1]), { args: ['--win', ...targets, '--x64', '--publish', 'never'], cwd: fixture });
    }
    fs.writeFileSync(manifest, JSON.stringify({ name: 'electron-builder', version: '25.0.0' }));
    assert.throws(() => buildCommand(fixture, ['nsis']), /Version electron-builder differente/);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
  console.log('OK : lanceurs Windows, constructeur local et version exacte, cible NSIS et préparation commune, publication desactivee, reprise reseau bornee, erreurs et annulation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
