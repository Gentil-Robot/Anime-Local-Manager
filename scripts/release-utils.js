'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const {atomicJson}=require('../lib/atomic-file');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function fileHash(file){const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024),h=crypto.createHash('sha256');try{for(let n;(n=fs.readSync(fd,buffer,0,buffer.length,null))>0;)h.update(buffer.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}}
function npmInvocation(args){
 const candidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.join(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
 try{for(const name of execFileSync(process.platform==='win32'?'where.exe':'which',['npm'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)){candidates.push(fs.realpathSync(name),path.join(path.dirname(name),'node_modules/npm/bin/npm-cli.js'));}}catch{}
 const cli=candidates.find(p=>p.endsWith('npm-cli.js')&&fs.existsSync(p));if(!cli)throw Error('npm introuvable. Installer Node.js avec npm, puis relancer.');return {command:process.execPath,args:[path.resolve(cli),...args]};
}
function redact(text,env=process.env){let result=String(text);for(const key of ['CSC_LINK','WIN_CSC_LINK','CSC_KEY_PASSWORD','WIN_CSC_KEY_PASSWORD','GH_TOKEN','GITHUB_TOKEN','NODE_AUTH_TOKEN','NPM_TOKEN','ALM_CONFIG_KEY']){const value=env[key];if(value&&value.length>=4)result=result.split(value).join('[masqué]');}return result.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[masqué]@');}
function logger(file,{consoleOutput=console.log,heartbeatMs=15000,env=process.env}={}){
 fs.mkdirSync(path.dirname(file),{recursive:true});let active=null,timer;
 const write=value=>fs.appendFileSync(file,redact(value,env));
 const say=value=>{const text=redact(value,env);write(text+'\n');consoleOutput(text);};
 const begin=(name,{silent=false}={})=>{clearInterval(timer);active={name,at:Date.now(),silent};(silent?value=>write(value+'\n'):say)('[publication] '+name);timer=setInterval(()=>consoleOutput('[publication] '+name+' — en cours, '+Math.floor((Date.now()-active.at)/1000)+' s'),heartbeatMs);timer.unref?.();};
 return {file,write,say,begin,end(name,result='OK'){clearInterval(timer);timer=null;(active?.silent?value=>write(value+'\n'):say)('[publication] '+result+' · '+name+' · '+Math.round((Date.now()-(active?.at||Date.now()))/1000)+' s');active=null;},close(){clearInterval(timer);}};
}
function runCommand(command,args,{cwd,env=process.env,log,verbose=false,onChild=()=>{},timeoutMs=0,signal,windowsVerbatimArguments=false}={}){
 return new Promise(resolve=>{
  if(signal?.aborted)return resolve({code:130,signal:'cancelled',output:''});
  let output='',stdout='',stderr='',spawnError=null,timer,killTimer;const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true,windowsVerbatimArguments});onChild(child);
  const abort=()=>{if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>child.kill('SIGTERM'));}else child.kill('SIGTERM');killTimer=setTimeout(()=>{if(process.platform==='win32'&&child.pid)spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');},5000);killTimer.unref?.();};
  signal?.addEventListener('abort',abort,{once:true});if(timeoutMs)timer=setTimeout(()=>{spawnError='Délai dépassé';abort();},timeoutMs);
  const forward=(chunk,channel)=>{const text=redact(chunk.toString(),env);if(channel==='stdout')stdout=(stdout+text).slice(-131072);else stderr=(stderr+text).slice(-131072);output=(output+text).slice(-131072);log?.write(text);if(verbose)process.stdout.write(text);};child.stdout.on('data',chunk=>forward(chunk,'stdout'));child.stderr.on('data',chunk=>forward(chunk,'stderr'));child.on('error',error=>{spawnError=error.message;forward(Buffer.from(error.message+'\n'),'stderr');});
  child.once('close',(code,nativeSignal)=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);resolve({code:signal?.aborted?130:spawnError?1:code??1,signal:nativeSignal,output,stdout,stderr,error:spawnError});});
 });
}
function treeManifest(directory,{allowLinks=false}={}){const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isSymbolicLink()){if(!allowLinks)throw Error('Lien inattendu dans le livrable : '+file);const real=fs.realpathSync(file);if(real!==directory&&!real.startsWith(path.resolve(directory)+path.sep))throw Error('Dépendance liée hors du projet : '+file);files.push({path:path.relative(directory,file).split(path.sep).join('/'),link:fs.readlinkSync(file)});continue;}if(entry.isDirectory())walk(file);else if(entry.isFile())files.push({path:path.relative(directory,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:fileHash(file)});}}walk(directory);return {files,digest:hash(JSON.stringify(files))};}
function verifiedFile(record){try{return fs.statSync(record.path).size===record.bytes&&fileHash(record.path)===record.sha256;}catch{return false;}}
function inputFingerprint(root,toolchain,policy={}){
 const {checkSource}=require('./check-source-files');const checked=checkSource(root);if(!checked.ok)throw Error('Sources modifiées ou incomplètes : '+checked.issues.slice(0,3).join('; '));
 const source=JSON.parse(fs.readFileSync(path.join(root,'SOURCE-MANIFEST.json'),'utf8'));return {key:hash(JSON.stringify([source,toolchain,policy])),source,manifestSha256:fileHash(path.join(root,'SOURCE-MANIFEST.json'))};
}
// Do not use fs.mkdtempSync beneath an arbitrarily nested Windows source tree:
// its native implementation can reject a long prefix even when mkdirSync and
// ordinary file operations accept the same (long-path-enabled) directory.
// Keep the staging directory on the destination volume for atomic renames.
function createPromotionDirectory(destination){
 for(let attempt=0;attempt<6;attempt++){
  const candidate=path.join(destination,'.publication-'+crypto.randomBytes(8).toString('hex'));
  try{fs.mkdirSync(candidate,{mode:0o700});return candidate;}
  catch(error){if(error.code!=='EEXIST')throw error;}
 }
 throw Error('Impossible de creer un dossier temporaire unique pour la publication.');
}
function promote(files,destination,{copy=fs.copyFileSync,rename=fs.renameSync,finalize=()=>{}}={}){
 fs.mkdirSync(destination,{recursive:true});
 const temp=createPromotionDirectory(destination),backup=path.join(temp,'previous'),placed=[],moved=[];
 try{
  fs.mkdirSync(backup);
  for(const file of files)copy(file,path.join(temp,path.basename(file)));
  for(const file of files){const name=path.basename(file),target=path.join(destination,name);if(fs.existsSync(target)){rename(target,path.join(backup,name));moved.push(name);}rename(path.join(temp,name),target);placed.push(name);}
  finalize();return placed;
 }catch(error){
  for(const name of placed)fs.rmSync(path.join(destination,name),{force:true});
  for(const name of moved)rename(path.join(backup,name),path.join(destination,name));
  throw error;
 }finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
module.exports={hash,fileHash,npmInvocation,redact,logger,runCommand,treeManifest,verifiedFile,inputFingerprint,promote,atomicJson};
