'use strict';
// Independent runtime and network review. No real accounts, requests or writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
const pin=read('.node-version').trim();
assert.equal(pin,'24.22.3');
assert.equal(read('.nvmrc').trim(),pin);
const floor=version=>{
 const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);
 return !!m&&((+m[1]===22&&(+m[2]>23||+m[2]===23&&+m[3]>=5))||(+m[1]===24&&(+m[2]>22||+m[2]===22&&+m[3]>=3)));
};
assert(floor(process.versions.node),'Unpatched or unsupported build Node: '+process.versions.node);
if(process.env.GITHUB_ACTIONS==='true')assert.equal(process.versions.node,pin);
assert.equal(pkg.devDependencies.electron,'45.5.0');
assert.equal(lock.packages[''].devDependencies.electron,pkg.devDependencies.electron);
assert.equal(lock.packages['node_modules/electron'].version,pkg.devDependencies.electron);
assert.match(lock.packages['node_modules/electron'].integrity,/^sha512-[A-Za-z0-9+/]{86}==$/);
// CVE-2026-118764: vulnerable minimatch copies may exist only in dev tooling
// until the compatible stable upstream builder release is available.
for(const [location,dependency] of Object.entries(lock.packages)){
 if(!/(?:^|\/)node_modules\/minimatch$/.test(location))continue;
 const parts=String(dependency.version).split('.').map(Number);
 if(parts[0]>=7&&(parts[0]<11||parts[0]===11&&parts[1]===0&&parts[2]===0))assert.equal(dependency.dev,true,'Affected minimatch in production dependency tree: '+location);
}
assert(!process.env.ELECTRON_OVERRIDE_DIST_PATH,'External Electron runtime override refused');
const probe=spawnSync(require('electron'),['-p','JSON.stringify(process.versions)'],{
 cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true
});
assert.ifError(probe.error);
assert.equal(probe.status,0,probe.stderr);
const runtime=JSON.parse(probe.stdout.trim());
assert.equal(runtime.electron,pkg.devDependencies.electron);
assert.equal(runtime.node,pin);
assert.equal(runtime.chrome,'156.0.8078.109');
const inventory=[];
function scan(file){
 const text=read(file),lines=text.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/(?:node:)?http2\b|(?:https|tls)\s*\.\s*createServer|SNICallback|requestCert|new\s+https\s*\.\s*Agent|net\s*\.\s*fetch|api\.jikan\.moe|proxyAgent|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/.test(line))inventory.push({file,line:i+1});
  assert(!/\brejectUnauthorized\s*:\s*false\b/.test(line),'TLS verification disabled: '+file+':'+(i+1));
 }
}
for(const file of ['main.js','preload.js','server.js','db.js','csv-worker.js'])scan(file);
for(const folder of ['lib','community','public']){
 for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){
  if(entry.isFile()&&/\.(?:c?js|mjs)$/.test(entry.name))scan(folder+'/'+entry.name);
 }
}
assert.match(read('server.js'),/async function jikanLimited[\s\S]{0,400}ALM_JIKAN_RETIRED/);
assert.match(read('server.js'),/async function fetchJikanJson[\s\S]{0,900}metadataProviders\.byId/);
assert.match(read('lib/metadata-providers.js'),/https:\/\/api\.myanimelist\.net\/v2\//);
assert.match(read('lib/metadata-providers.js'),/https:\/\/kitsu\.app\/api\/edge\//);
console.log('ALM_RUNTIME_REVIEW='+JSON.stringify({buildNode:process.versions.node,electron:runtime.electron,embeddedNode:runtime.node,chromium:runtime.chrome,inventory}));
console.log('Runtime identity and baseline transport guards verified; inventory entries are review signals, not proof of vulnerability.');
