"use strict";
// Build-only workspace. Never move the source project or the user's ALM data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {atomicJson} = require('../lib/atomic-file');
const NSIS_INCLUDE = 'node_modules/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh';
const PATH_BUDGET = 230; // Leave room below MAX_PATH for native tool temporary suffixes.
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(value, platform, paths) {
  const result = paths.resolve(value);
  return platform === 'win32' ? result.toLowerCase() : result;
}
function projectedNsisPath(directory, paths = path) {
  return paths.join(directory, 'f'.repeat(20), 'project', ...NSIS_INCLUDE.split('/'));
}
function workspaceCandidates(root, {platform = process.platform, env = process.env,
  home = os.homedir(), temporary = os.tmpdir(), paths = path} = {}) {
  if (platform !== 'win32') return [paths.join(root, '.release-work')];
  const identity = digest(canonical(root, platform, paths)).slice(0, 16);
  const bases = [env.LOCALAPPDATA && paths.join(env.LOCALAPPDATA, 'ALM', 'b'),
    home && paths.join(home, '.alm-b'), temporary && paths.join(temporary, 'alm-b')].filter(Boolean);
  return [...new Set(bases)].filter(base => paths.isAbsolute(base))
    .map(base => paths.join(base, identity))
    .filter(directory => projectedNsisPath(directory, paths).length <= PATH_BUDGET);
}
function acquireLock(directory) {
  fs.mkdirSync(directory, {recursive: true});
  const file = path.join(directory, 'publication.lock');
  const token = crypto.randomBytes(24).toString('hex');
  const value = JSON.stringify({schema: 1, pid: process.pid, token});
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      try { fs.writeFileSync(fd, value); } finally { fs.closeSync(fd); }
      return () => {
        // Only remove our own lock; never kill another application or build.
        if (fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && fs.readFileSync(file, 'utf8') === value) fs.unlinkSync(file);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (fs.lstatSync(file).isSymbolicLink()) throw Error('Verrou de publication non fiable : ' + file);
      let old, text;
      try { text = fs.readFileSync(file, 'utf8'); old = JSON.parse(text); } catch {
        throw Error('Verrou de publication illisible : ' + file);
      }
      if (!Number.isSafeInteger(old.pid) || old.pid <= 0) throw Error('Verrou de publication invalide : ' + file);
      let alive = true;
      try { process.kill(old.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; else if (e.code !== 'EPERM') throw e; }
      if (alive) throw Error('Une publication utilise deja ce projet (PID ' + old.pid + '). Fermer son terminal avant de relancer.');
      if (fs.readFileSync(file, 'utf8') !== text) throw Error('Le verrou de publication a change. Relancer.');
      fs.unlinkSync(file);
    }
  }
  throw Error('Impossible de verrouiller la publication.');
}
function openWorkspace(root, options = {}) {
  const platform = options.platform || process.platform;
  const source = fs.realpathSync(root);
  const release = acquireLock(path.join(root, '.release-work'));
  try {
    const candidates = workspaceCandidates(source, {...options, platform});
    const failures = [];
    for (const candidate of candidates) {
      try {
        // Refuse redirected cache directories before using any existing content.
        let current = candidate;
        while (current !== path.dirname(current)) {
          if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Cache redirige par un lien : ' + current);
          current = path.dirname(current);
        }
        fs.mkdirSync(candidate, {recursive: true, mode: 0o700});
        const directory = fs.realpathSync(candidate);
        if (platform === 'win32' && projectedNsisPath(directory).length > PATH_BUDGET) throw Error('Chemin natif trop long');
        const marker = path.join(directory, 'workspace-owner.json');
        const expected = canonical(source, platform, path);
        if (fs.existsSync(marker)) {
          if (fs.lstatSync(marker).isSymbolicLink()) throw Error('Marqueur redirige');
          const owner = JSON.parse(fs.readFileSync(marker, 'utf8'));
          if (owner.schema !== 1 || owner.source !== expected) throw Error('Cache appartenant a un autre projet');
        } else {
          fs.writeFileSync(marker, JSON.stringify({schema: 1, source: expected}), {flag: 'wx', mode: 0o600});
        }
        const probe = path.join(directory, '.write-' + crypto.randomBytes(6).toString('hex'));
        fs.writeFileSync(probe, 'probe', {flag: 'wx', mode: 0o600}); fs.unlinkSync(probe);
        const info = {schema: 1, directory, source, external: directory !== path.join(root, '.release-work')};
        atomicJson(path.join(root, '.release-work', 'workspace.json'), info);
        return {...info, release};
      } catch (error) { failures.push(error.message); }
    }
    throw Error('Aucun espace de compilation court accessible. ' + failures.join('; '));
  } catch (error) { release(); throw error; }
}
function assertNsisInputs(stage, pkg, {platform = process.platform} = {}) {
  const include = path.join(stage, ...NSIS_INCLUDE.split('/'));
  const targets = [include,
    path.join(stage, 'dist', 'Anime-Local-Manager-' + pkg.version + '-Setup-x64.__uninstaller.exe')];
  for (const file of targets) {
    if (platform === 'win32' && file.length > PATH_BUDGET) throw Error('Chemin NSIS trop long (' + file.length + ' caracteres) : ' + file);
  }
  try {
    if (!fs.statSync(include).isFile() || fs.readFileSync(include).length === 0) throw Error('Fichier vide');
  } catch (error) {
    throw Error('Fichier NSIS absent ou illisible : ' + include + '. Les dependances doivent etre reinstallees par la publication.', {cause: error});
  }
  return {include, includePathLength: include.length, pathBudget: PATH_BUDGET};
}
module.exports = {NSIS_INCLUDE, PATH_BUDGET, projectedNsisPath, workspaceCandidates, acquireLock, openWorkspace, assertNsisInputs};
