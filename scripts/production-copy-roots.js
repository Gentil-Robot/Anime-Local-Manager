'use strict';
const fs=require('node:fs'),path=require('node:path');
// `npm ls --parseable --all` reports both package directories and nested
// descendants. Copying each recursively rewrites nested descendants.
// Select only minimal ancestors, preserving the exact selected package tree.
function copyRoots(source,listing){
 const root=path.resolve(source),seen=new Set(),names=[];
 for(const line of String(listing||'').split(/\r?\n/)){
  if(!line.trim())continue;
  const absolute=path.resolve(line.trim()),relative=path.relative(root,absolute);
  if(!relative)continue; // npm ls reports the project directory itself
  if(!relative.startsWith('node_modules'+path.sep)||relative.includes('..'+path.sep))
   throw Error('Dependency path outside project node_modules');
  if(!seen.has(relative)){seen.add(relative);names.push(relative);}
 }
 names.sort((a,b)=>a.length-b.length||a.localeCompare(b));
 const roots=[];
 for(const name of names){if(!roots.some(r=>name.startsWith(r+path.sep)))roots.push(name);}
 return roots;
}
function copyProductionModules(source,payload,listing,copy=fs.cpSync){
 const roots=copyRoots(source,listing);
 for(const relative of roots)copy(path.join(source,relative),path.join(payload,relative),{recursive:true});
 return roots.length;
}
module.exports={copyRoots,copyProductionModules};
