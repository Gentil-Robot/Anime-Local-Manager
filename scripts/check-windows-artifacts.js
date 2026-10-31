'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

function artifactPaths(root, pkg, arch = 'x64') {
  const resolve = pattern => {
    if (typeof pattern !== 'string') throw Error('Nom de livrable Windows absent.');
    const name = pattern.replace(/\$\{(version|arch|ext|os)\}/g, (_, key) => ({version:pkg.version,arch,ext:'exe',os:'win'}[key]));
    if (name.includes('${') || path.basename(name) !== name || /[\\/]/.test(name)) throw Error('Nom de livrable Windows invalide.');
    return path.join(root, pkg.build.directories?.output || 'dist', name);
  };
  return {nsis:resolve(pkg.build.nsis?.artifactName)};
}
function inspectPe(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, header = Buffer.alloc(64);
    if (size < 1024 || fs.readSync(fd, header, 0, 64, 0) !== 64 || header.toString('ascii',0,2) !== 'MZ') throw Error('EXE absent, incomplet ou invalide : '+path.basename(file));
    const offset = header.readUInt32LE(60), signature = Buffer.alloc(4);
    if (offset < 64 || offset > size - 4 || fs.readSync(fd, signature, 0, 4, offset) !== 4 || !signature.equals(Buffer.from([80,69,0,0]))) throw Error('En-tête PE invalide : '+path.basename(file));
    const hash = crypto.createHash('sha256'), chunk = Buffer.alloc(1024*1024);
    for (let position=0;position<size;) { const count=fs.readSync(fd,chunk,0,chunk.length,position); if (!count) throw Error('EXE tronqué.'); hash.update(chunk.subarray(0,count)); position+=count; }
    return {file:path.basename(file),bytes:size,sha256:hash.digest('hex')};
  } finally { fs.closeSync(fd); }
}
function signatures(files) {
  if (process.platform !== 'win32') return files.map(()=>({status:'NotChecked',reason:'Authenticode requires Windows'}));
  // Paths are data in an environment variable, never interpolated into PowerShell code.
  const command = "$ErrorActionPreference='Stop'; $paths=ConvertFrom-Json $env:ALM_RELEASE_FILES; $result=@(foreach($p in $paths){$s=Get-AuthenticodeSignature -LiteralPath $p; @{status=[string]$s.Status; signer=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null}}}); ConvertTo-Json -Compress -InputObject $result";
  const output = execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:45000,windowsHide:true,env:{...process.env,ALM_RELEASE_FILES:JSON.stringify(files)}});
  const result = JSON.parse(output.replace(/^\uFEFF/,''));
  if (!Array.isArray(result) || result.length !== files.length) throw Error('Rapport de signature incomplet.');
  if (result.some(s=>!['Valid','NotSigned'].includes(s.status))) throw Error('Signature Windows invalide ou non vérifiable. Consulter le certificat de signature.');
  return result;
}
function checkArtifacts(root, targets = ['nsis'], {checkSignatures=signatures,writeReport=true} = {}) {
  if (!targets.length || targets.some(t=>!['nsis'].includes(t))) throw Error('Cible Windows inconnue.');
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const paths = artifactPaths(root,pkg), files = targets.map(t=>paths[t]);
  const records = files.map(inspectPe);
  const signed = checkSignatures(files);
  const report = {version:pkg.version,checkedAt:new Date().toISOString(),artifacts:records.map((r,i)=>({...r,target:targets[i],signature:signed[i]})),limitations:['Checks file integrity and Authenticode, not installation or antivirus behaviour.']};
  if (writeReport) fs.writeFileSync(path.join(path.dirname(files[0]),'release-check.json'),JSON.stringify(report,null,2)+'\n');
  for (const record of report.artifacts) console.log(`[release] ${record.file} : ${record.bytes} octets, SHA-256 ${record.sha256}, signature ${record.signature.status}`);
  if (report.artifacts.some(r=>r.signature.status==='NotSigned')) console.log('[release] Installateur non signe : aucune signature Authenticode detectee.');
  return report;
}
module.exports = {artifactPaths,inspectPe,checkArtifacts};
if (require.main === module) {try {checkArtifacts(path.resolve(__dirname,'..'),process.argv.length>2?process.argv.slice(2):undefined);} catch(error) {console.error('[release] '+error.message);process.exitCode=1;}}
