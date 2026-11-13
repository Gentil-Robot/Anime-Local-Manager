'use strict';
// Reproducible hashes for the public site and entire source archive.
// Run only after editing sources and reports. --check is read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),release=require('../release-version.json');
const excluded=new Set(['node_modules','.release-work','dist','logs','.git','__pycache__','.cache']);
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(start,relative=''){
 const names=fs.readdirSync(path.join(start,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
 const files=[];
 for(const entry of names){if(entry.isDirectory()){
  if(!excluded.has(entry.name)&&!entry.name.startsWith('.release-work')) files.push(...walk(start,path.join(relative,entry.name)));
 }else if(entry.isFile()&&entry.name!=='SOURCE-MANIFEST.json'&&(start===root||entry.name!=='release-manifest.json')){
  const name=path.join(relative,entry.name).split(path.sep).join('/');
  if(!name.endsWith('.pyc')&&!name.endsWith('.tmp')&&entry.name!=='.DS_Store'){
   const bytes=fs.readFileSync(path.join(start,name));files.push({path:name,bytes:bytes.length,sha256:sha256(bytes)});
  }
 }else if(entry.isSymbolicLink()){throw Error('Archive source cannot contain symlinks: '+entry.name);}}
 return files;
}
const baseline='bbf8b99c9faa2d014069e3f1320c75f01535a758b5c9ec6caf39b473a32dae00';
const check=process.argv.includes('--check');
function save(relative,obj){const file=path.join(root,relative),expected=JSON.stringify(obj,null,2)+'\n';
 if(check){assert.equal(fs.readFileSync(file,'utf8'),expected,relative+' manifest out of date');}
 else fs.writeFileSync(file,expected);
}
const site=path.join(root,'community/site');
const currentSite=JSON.parse(fs.readFileSync(path.join(site,'release-manifest.json'),'utf8'));
const siteFiles=walk(site);
assert(siteFiles.some(x=>x.path==='release-version.js'));
assert(siteFiles.some(x=>x.path==='index.html'));
const siteManifest={...currentSite,version:release.technicalVersion,files:siteFiles,releaseId:'v212-beta-stable-20261113',sourceArchiveSha256:baseline,previousValidatedVersion:release.previousValidatedVersion};
save('community/site/release-manifest.json',siteManifest);
const old=JSON.parse(fs.readFileSync(path.join(root,'SOURCE-MANIFEST.json'),'utf8'));
const sourceFiles=walk(root);
assert(sourceFiles.some(x=>x.path==='community/site/release-manifest.json'));
assert(sourceFiles.some(x=>x.path==='data/database/metadata-full.sql.gz'));
assert(sourceFiles.some(x=>x.path==='docs/RECETTE-V200-BETA-STABLE-2026-10-25.md'));
const candidate={...old,version:release.technicalVersion,releaseId:'v212-beta-stable-20261113',sourceArchiveSha256:baseline,previousValidatedVersion:release.previousValidatedVersion,files:sourceFiles};
save('SOURCE-MANIFEST.json',candidate);
console.log(`${check?'OK':'Updated'} release manifest: site ${siteFiles.length} files, source ${sourceFiles.length} files, SHA-256 verified.`);
