'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const NETWORK_ERROR = /\b(?:ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN|ECONNREFUSED|ERR_SOCKET_CLOSED|ERR_STREAM_PREMATURE_CLOSE)\b|socket hang up|Client network socket disconnected/i;

async function runWithRetry(run, { wait = delay, log = console.log, cancelled = () => false } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (cancelled()) return 130;
    log(`[build] Tentative ${attempt}/3`);
    const result = await run();
    if (cancelled() || result.signal) return 130;
    if (result.code === 0) return 0;
    if (!NETWORK_ERROR.test(result.output || '') || attempt === 3) return result.code || 1;
    const seconds = attempt * 10;
    log(`[build] Connexion interrompue. Nouvelle tentative dans ${seconds} secondes ; cache conserve.`);
    await wait(seconds * 1000);
  }
  return 1;
}

function launch(command, args, cwd, onChild = () => {}, streams = process) {
  return new Promise(resolve => {
    let output = '';
    const child = spawn(command, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'], shell: false });
    onChild(child);
    const forward = stream => chunk => {
      stream.write(chunk);
      output = (output + chunk.toString()).slice(-131072);
    };
    child.stdout.on('data', forward(streams.stdout));
    child.stderr.on('data', forward(streams.stderr));
    child.once('error', error => {
      output += `\n${error.message}`;
      streams.stderr.write(`${error.message}\n`);
    });
    child.once('close', (code, signal) => resolve({ code: code == null ? 1 : code, signal, output }));
  });
}

function buildCommand(root, targets, { prepackaged, cacheRoot } = {}) {
  if (!targets.length || targets.some(t => !['dir', 'nsis'].includes(t))) {
    throw new Error('Usage : node scripts/build-windows-retry.js nsis');
  }
  let cli, installed;
  const dependencyDir = path.join(root, 'node_modules', 'electron-builder');
  try {
    cli = require.resolve(path.join(dependencyDir, 'cli.js'));
    installed = JSON.parse(fs.readFileSync(path.join(dependencyDir, 'package.json'), 'utf8'));
  }
  catch { throw new Error('electron-builder absent. Lance d abord le script de creation habituel pour installer les dependances.'); }
  const declared = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies?.['electron-builder'];
  if (installed.name !== 'electron-builder' || installed.version !== declared) {
    throw new Error('Version electron-builder differente de celle du projet. Relance le script de creation habituel pour synchroniser les dependances.');
  }
  if(prepackaged&&(!fs.existsSync(prepackaged)||targets.some(t=>t!=='nsis')))throw Error('Application préparée absente ou cible incompatible.');
  return { command: process.execPath, args: [cli, '--win', ...targets, '--x64', '--publish', 'never', ...(prepackaged?['--prepackaged',path.resolve(prepackaged)]:[]), ...(cacheRoot?['--config.electronDownload.cache',path.resolve(cacheRoot)]:[])], cwd: root };
}

async function main() {
  const targets=process.argv.slice(2);if(targets.length!==1||targets[0]!=='nsis')throw Error('La publication Windows utilise uniquement NSIS. Usage : npm run build-installer');
  await require('./release-windows').releaseWindows();return 0;
}

module.exports = { runWithRetry, launch, buildCommand };
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(`[build] ${error.message}`);
  process.exitCode = 1;
});
