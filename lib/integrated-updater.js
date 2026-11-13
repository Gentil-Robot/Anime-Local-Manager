'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {REPOSITORY,compare}=require('./version-check');
function chooseAsset(release,{current,platform,arch,portable}){
 if(!release?.available||release.error||compare(release.latest,current)<=0)throw Error('ALM_UPDATE_NOT_NEWER');
 const v=release.latest.replace(/^v/,'');
 const special=v===require('../release-version.json').technicalVersion&&!portable&&platform==='win32';
 if(special&&release.prerelease!==true)throw Error('ALM_UPDATE_CHANNEL');
 const name=special?require('../release-version.json').installerName.replace(/-x64\.exe$/,'-'+arch+'.exe'):platform==='win32'?`Anime-Local-Manager-${v}-${portable?'Portable':'Setup'}-${arch}.exe`:platform==='linux'&&portable?`Anime-Local-Manager-${v}-linux-${arch}.AppImage`:'';
 if(!name)throw Error('ALM_UPDATE_PACKAGE_MANAGER');
 const a=(release.assets||[]).find(a=>a.name===name&&a.state==='uploaded');
 if(!a||!/^sha256:[a-f\d]{64}$/i.test(a.digest||'')||!Number.isSafeInteger(a.size)||a.size<1024||a.size>1024*1024*1024)throw Error('ALM_UPDATE_ASSET_MISSING');
 const expected='https://github.com/'+REPOSITORY+'/releases/download/'+encodeURIComponent(release.latest)+'/'+encodeURIComponent(name);
 if(a.browser_download_url!==expected)throw Error('ALM_UPDATE_URL');
 return {name,size:a.size,url:expected,digest:a.digest.slice(7).toLowerCase(),version:v,prerelease:release.prerelease===true||special};
}
function allowedDownload(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('ALM_UPDATE_URL');if(u.hostname==='github.com'){if(!u.pathname.startsWith('/'+REPOSITORY+'/releases/download/'))throw Error('ALM_UPDATE_URL');}else if(!['release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(u.hostname))throw Error('ALM_UPDATE_URL');return u.toString();}
async function hashFile(file){const hash=crypto.createHash('sha256');for await(const c of fs.createReadStream(file))hash.update(c);return hash.digest('hex');}
async function downloadAsset(a,file,{fetchImpl=global.fetch,signal,onProgress=()=>{}}={}){
 let url=a.url,response;
 for(let n=0;n<5;n++){url=allowedDownload(url);response=await fetchImpl(url,{redirect:'manual',signal,headers:{'User-Agent':'AnimeLocalManager/'+require('../package.json').version}});if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel?.();if(!location)throw Error('ALM_UPDATE_DOWNLOAD');url=new URL(location,url).toString();continue;}break;}
 if(!response?.ok||!response.body?.getReader)throw Error('ALM_UPDATE_DOWNLOAD');
 const length=Number(response.headers.get('content-length'));if(length&&length!==a.size){await response.body.cancel();throw Error('ALM_UPDATE_SIZE');}
 const fd=await fs.promises.open(file,'wx',0o600),reader=response.body.getReader(),hash=crypto.createHash('sha256');let bytes=0,lastProgress=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>a.size)throw Error('ALM_UPDATE_SIZE');hash.update(value);let offset=0;while(offset<value.length){const r=await fd.write(value,offset,value.length-offset);offset+=r.bytesWritten;}if(Date.now()-lastProgress>100||bytes===a.size){lastProgress=Date.now();onProgress(bytes,a.size);}}if(bytes!==a.size||hash.digest('hex')!==a.digest)throw Error('ALM_UPDATE_CHECKSUM');await fd.sync();}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{await fd.close();}
 if(file.endsWith('.exe')){const f=await fs.promises.open(file,'r'),header=Buffer.alloc(64),signature=Buffer.alloc(4);try{await f.read(header,0,64,0);const pos=header.readUInt32LE(60);if(header.toString('ascii',0,2)!=='MZ'||pos<64||pos>a.size-4)throw Error('ALM_UPDATE_EXECUTABLE');await f.read(signature,0,4,pos);if(!signature.equals(Buffer.from([80,69,0,0])))throw Error('ALM_UPDATE_EXECUTABLE');}finally{await f.close();}}
}
const {WINDOWS_SCRIPT,WINDOWS_BOOTSTRAP_SCRIPT,launchWindows,readState}=require('./windows-update-launcher');
function createIntegratedUpdater({current,platform=process.platform,arch=process.arch,portable=false,packaged=false,target=process.execPath,directory,getRelease,quit,onChange=()=>{},fetchImpl=global.fetch,launch=launchWindows,verifyWindows=require('./windows-signature').verifySignature}){
 let status={phase:'idle',progress:0,error:'',supported:packaged&&(platform==='win32'||platform==='linux'&&portable)},pending=null,controller=null,ready=null;
 const readyFile=path.join(directory,'ready.json');
 // A restart restores only the expected artifact; install rechecks its full hash.
 try{const saved=JSON.parse(fs.readFileSync(readyFile,'utf8'));const asset=chooseAsset({available:true,latest:saved.latest,prerelease:saved.prerelease===true||saved.latest.replace(/^v/,'')===require('../release-version.json').technicalVersion,assets:[saved.asset]},{current,platform,arch,portable});const file=path.join(directory,saved.basename);if(/^[a-f0-9-]{36}-Anime-Local-Manager-/.test(saved.basename)&&path.basename(saved.basename)===saved.basename&&fs.statSync(file).size===asset.size){ready={...asset,file};status={...status,phase:'ready',progress:100,version:asset.version,prerelease:asset.prerelease};}}catch{}
 if(packaged)try{require('./update-cache').remove({directory,current,onlyInstalled:true});}catch(error){console.warn('[updates] Installer cache cleanup:',error.code||'ALM_CLEANUP_FAILED');}
 const previousInstall=readState(path.join(directory,'update-install.json'));
 if(ready&&previousInstall?.phase==='failed'&&previousInstall.version===ready.version)status={...status,phase:'error',error:previousInstall.code||'ALM_UPDATE_INSTALL_FAILED',canRetry:true};
 const paint=patch=>{status={...status,...patch};onChange({...status});return {...status};};
 return {state:()=>({...status}),cancel(){controller?.abort();},async download(){if(pending)return pending;if(!status.supported)throw Error('ALM_UPDATE_PACKAGE_MANAGER');ready=null;controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20*60000);
  pending=(async()=>{paint({phase:'checking',error:'',progress:0,canRetry:false});const a=chooseAsset(await getRelease(true),{current,platform,arch,portable});fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,crypto.randomUUID()+'-'+a.name);try{paint({phase:'downloading',version:a.version,prerelease:a.prerelease});await downloadAsset(a,file,{fetchImpl,signal:controller.signal,onProgress:(bytes,total)=>paint({bytes,total,progress:Math.floor(bytes/total*100)})});await fs.promises.chmod(file,platform==='linux'?0o700:0o600);ready={...a,file};require('./atomic-file').atomicJson(readyFile,{latest:a.url.split('/').at(-2),prerelease:a.prerelease,basename:path.basename(file),asset:{name:a.name,size:a.size,digest:'sha256:'+a.digest,state:'uploaded',browser_download_url:a.url}});return paint({phase:'ready',progress:100});}catch(error){await fs.promises.unlink(file).catch(()=>{});throw error;}})().catch(error=>paint({phase:controller.signal.aborted?'cancelled':'error',error:controller.signal.aborted?'ALM_UPDATE_CANCELLED':error.message})).finally(()=>{clearTimeout(timer);pending=null;controller=null;});return pending;
 },async install(){if(pending||!ready||!(status.phase==='ready'||status.phase==='error'&&status.canRetry))throw Error('ALM_UPDATE_NOT_READY');paint({phase:'preparing',error:'',canRetry:false});try{if(await hashFile(ready.file)!==ready.digest)throw Error('ALM_UPDATE_CHECKSUM');if(platform==='win32')await verifyWindows(ready.file,target,{requireSigned:process.env.ALM_UPDATE_REQUIRE_SIGNATURE==='1',thumbprint:process.env.ALM_UPDATE_SIGNER_THUMBPRINT||''});let file=ready.file;
  if(portable){file=target+'.alm-'+crypto.randomUUID()+'.next'+(platform==='win32'?'.exe':'.AppImage');await fs.promises.copyFile(ready.file,file,fs.constants.COPYFILE_EXCL);await fs.promises.chmod(file,0o700);if(await hashFile(file)!==ready.digest){await fs.promises.unlink(file);throw Error('ALM_UPDATE_CHECKSUM');}}
  const job={pid:process.pid,file,target,digest:ready.digest,portable,installDir:path.dirname(target),version:ready.version,readyFile,log:path.join(directory,'update-error.log')};
  if(platform==='win32')await launch(job);else{const script=path.join(directory,'replace-appimage.sh');await fs.promises.writeFile(script,'#!/bin/sh\nset -eu\npid="$1"; incoming="$2"; target="$3"; digest="$4"; count=0\nwhile kill -0 "$pid" 2>/dev/null; do count=$((count+1)); [ "$count" -lt 90 ] || exit 1; sleep 1; done\n[ "$(sha256sum < "$incoming" | cut -d " " -f1)" = "$digest" ] || exit 1\nbackup="${target}.alm-previous"\n[ ! -e "$backup" ] || rm -f -- "$backup"\nmv -- "$target" "$backup"\nif mv -- "$incoming" "$target"; then "$target" & else mv -- "$backup" "$target"; "$target" & fi\n',{mode:0o700});const child=spawn('/bin/sh',[script,String(job.pid),file,target,job.digest],{detached:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});}
  if(platform!=='win32')try{fs.unlinkSync(readyFile);}catch{}paint({phase:'installing'});quit();return status;}catch(error){paint({phase:'error',error:error.message,canRetry:!!ready});throw error;}
 }};
}
module.exports={chooseAsset,allowedDownload,downloadAsset,hashFile,WINDOWS_SCRIPT,WINDOWS_BOOTSTRAP_SCRIPT,launchWindows,createIntegratedUpdater};
