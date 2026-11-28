'use strict';
// Run only on a disposable GitHub Linux runner; never install on a user PC.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
assert.equal(process.platform,'linux');
assert.equal(process.env.ALM_VM_PREVIEW_BUILD,'1');
assert.equal(process.env.GITHUB_ACTIONS,'true');
const reportFile=path.join(dist,'LINUX-VM-TEST-REPORT.json'),report=JSON.parse(fs.readFileSync(reportFile,'utf8')),pkg=require('../package.json');
assert.equal(report.version,'2.2.0');assert.equal(report.notForProduction,true);
assert.equal(report.packageName,'anime-local-manager-vm-test');
const expectedCount=Number(require('../data/database/metadata-manifest.json').full.rows);
const expectedNode=fs.readFileSync(path.join(root,'.node-version'),'utf8').trim();
const command=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,...options});assert.ifError(r.error);assert.equal(r.status,0,r.stderr||r.stdout);return (r.stdout||'').trim();};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
 const results={};
 for(const a of report.artifacts){
  assert.equal(path.basename(a.filename),a.filename);assert(a.filename.includes('VM-TEST'));
  const file=path.join(dist,a.filename);assert.equal(hash(file),a.sha256);assert.equal(fs.statSync(file).size,a.size);
 }
 const app=report.artifacts.find(a=>a.filename.endsWith('.AppImage'));
 const deb=report.artifacts.find(a=>a.filename.endsWith('.deb'));
 assert(app&&deb);
 const debFile=path.join(dist,deb.filename);
 assert.equal(command('dpkg-deb',['--field',debFile,'Package']),report.packageName);
 assert.equal(command('dpkg-deb',['--field',debFile,'Version']),'2.2.0');
 const proofOptions={version:'2.2.0',expectedCount,electron:pkg.devDependencies.electron};
 const {testApp}=require('./smoke-windows');
 // Launch the actual AppImage in extract-and-run mode, no system FUSE mount.
 results.appImage=await testApp(path.join(dist,app.filename),proofOptions);
 // Install the separate preview package on this disposable runner.
 command('sudo',['apt-get','install','-y','--no-install-recommends',debFile],{stdio:['ignore','pipe','pipe']});
 try{
  const files=command('dpkg-query',['-L',report.packageName]).split('\n');
  const exe=files.find(f=>path.basename(f)==='anime-local-manager-vm-test'&&fs.existsSync(f)&&fs.statSync(f).isFile()&&!fs.lstatSync(f).isSymbolicLink());
  assert(exe,'Installed isolated Linux executable missing');
  const asar=path.join(path.dirname(exe),'resources/app.asar');
  require('./check-packaged-integrity').verifyPreparedSource(asar,root);
  results.deb=await testApp(exe,proofOptions);
 }finally{command('sudo',['dpkg','--remove',report.packageName]);}
 for(const proof of Object.values(results)){
  assert.equal(proof.runtime.node,expectedNode);assert.equal(proof.runtime.electron,pkg.devDependencies.electron);
  assert.equal(proof.runtime.chrome,'156.0.8078.109');
  assert.equal(proof.persistence,true);
 }
 report.smoke=results;report.status='verified-linux-vm-preview';
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
 console.log('OK Linux VM: real AppImage launch and separate DEB installation, two launches, data persistence, backup, runtime versions.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
