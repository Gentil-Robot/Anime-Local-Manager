'use strict';
const path=require('node:path');

// Resolve declared production dependencies using Node's ancestor node_modules
// search, against archive entries only. Never fall back to the build machine.
function packageDependencies(files,read){
 const visited=new Set(),queue=files.has('package.json')?['package.json']:[];
 const json=name=>{try{return JSON.parse(read(name).toString());}catch{throw Error('Manifeste de dépendance illisible dans le paquet : '+name);}};
 function resolve(from,name){
  if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name))throw Error('Nom de dépendance invalide : '+name);
  let directory=path.posix.dirname(from);
  for(;;){
   if(path.posix.basename(directory)!=='node_modules'){
    const candidate=path.posix.join(directory,'node_modules',name,'package.json');
    if(files.has(candidate))return candidate;
   }
   if(directory==='.')return null;
   directory=path.posix.dirname(directory);
  }
 }
 while(queue.length){
  const manifest=queue.pop();if(visited.has(manifest))continue;visited.add(manifest);
  const pkg=json(manifest),optional=pkg.optionalDependencies||{};
  const dependencies={...pkg.dependencies,...optional,...pkg.peerDependencies};
  for(const name of Object.keys(dependencies)){
   const target=resolve(manifest,name),mayBeAbsent=Object.hasOwn(optional,name)||pkg.peerDependenciesMeta?.[name]?.optional===true;
   if(!target){if(mayBeAbsent)continue;throw Error('Dépendance de production absente du paquet : '+manifest+' → '+name);}
   queue.push(target);
  }
 }
 return visited;
}
module.exports={packageDependencies};
