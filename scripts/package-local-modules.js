'use strict';
const fs=require('node:fs'),path=require('node:path');
const archiveName=name=>String(name).replace(/\\/g,'/').replace(/^\/+/, '');
// Inspect literal local CommonJS imports in the actual payload.
function localModules(files,read){
 const visited=new Set(),queue=[...files].filter(name=>/^(?:main|preload|server|db|csv-worker)\.js$|^lib\/.*\.js$/.test(name));
 if(files.has('lib/server-process.js')&&!files.has('lib/server-host.js'))throw Error('Module local absent du paquet : lib/server-host.js');
 function resolve(from,request){
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),request));
  if(base.startsWith('../'))throw Error('Module local hors du paquet : '+from+' → '+request);
  for(const name of [base,base+'.js',base+'.json',base+'/index.js',base+'/index.json'])if(files.has(name))return name;
  throw Error('Module local absent du paquet : '+from+' → '+request);
 }
 while(queue.length){const name=queue.pop();if(visited.has(name))continue;visited.add(name);if(!name.endsWith('.js')&&!name.endsWith('.cjs'))continue;
  for(const match of read(name).toString().matchAll(/\brequire(?:\.resolve)?\(\s*(['"])(\.\.?\/[^'"\r\n]+)\1\s*\)/g))queue.push(resolve(name,match[2]));
 }
 return visited;
}
function sourceRuntimeFiles(root){
 const files=new Set();function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.release-work','dist','logs'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile())files.add(path.relative(root,file).split(path.sep).join('/'));}}walk(root);
 const result=localModules(files,name=>fs.readFileSync(path.join(root,name)));for(const name of ['public/index.html','package.json'])result.add(name);return result;
}
module.exports={localModules,sourceRuntimeFiles,archiveName};
