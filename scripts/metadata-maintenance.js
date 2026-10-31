'use strict';
const fs=require('fs'),path=require('path');
const {inspectSnapshot}=require('../lib/metadata-snapshot');
const {atomicWrite,atomicJson}=require('../lib/atomic-file');
function maintain({root=path.resolve(__dirname,'..'),minRows=10000}={}){
 const directory=path.join(root,'data','database'),current=path.join(directory,'metadata-full.sql.gz'),manifestFile=path.join(directory,'metadata-manifest.json');
 let manifest=null;try{manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));}catch{}
 if(fs.existsSync(current)){
  const info=inspectSnapshot(current,manifest);if(info.rows<minRows)throw Error('Snapshot incomplet : conservation du fichier existant, aucune substitution automatique.');
  return {ok:true,restored:false,file:current,...info};
 }
 const candidates=[{file:path.join(directory,'metadata-recovery.sql.gz'),manifest:path.join(directory,'metadata-recovery.json')},{file:path.join(root,'.metadata-build-cache','metadata-full.before-refresh.sql.gz'),manifest:manifestFile}];
 for(const candidate of candidates){
  if(!fs.existsSync(candidate.file)||!fs.existsSync(candidate.manifest))continue;
  try{
   const proof=JSON.parse(fs.readFileSync(candidate.manifest,'utf8'));
   const info=inspectSnapshot(candidate.file,{...proof,full:{...proof.full,url:path.basename(candidate.file)}});
   if(info.rows<minRows)continue;
   atomicWrite(current,fs.readFileSync(candidate.file));
   atomicJson(manifestFile,{...proof,full:{...proof.full,url:'metadata-full.sql.gz'}});
   inspectSnapshot(current,JSON.parse(fs.readFileSync(manifestFile,'utf8')));
   return {ok:true,restored:true,file:current,...info};
  }catch(error){console.warn('[metadata-local] Copie de secours non validée, laissée intacte.');}
 }
 throw Error('Aucun snapshot complet vérifié ni copie de secours. Récupère data/database depuis une archive ALM complète. Jikan public ne sera pas interrogé ; le cache et la collection sont conservés.');
}
if(require.main===module){try{const r=maintain();console.log('[metadata-local] '+(r.restored?'Catalogue restauré depuis la copie vérifiée':'Catalogue conservé et vérifié')+' : '+r.rows+' fiches. Aucun appel réseau.');console.log('[metadata-local] Les mises à jour de saisons se font dans ALM via les sources configurées. Cette restauration ne rend pas les données plus récentes.');}catch(error){console.error('[metadata-local] '+error.message);process.exitCode=1;}}
module.exports={maintain};
