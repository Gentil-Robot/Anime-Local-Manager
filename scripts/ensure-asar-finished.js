'use strict';
// ASAR returns its output WriteStream before its final write has completed.
// Keep electron-builder waiting until that stream has finished (or failed).
const {finished}=require('node:stream/promises');
const WRAPPED=Symbol.for('alm.asar.waitUntilFinished');
function wrapWriter(writer){
 if(writer[WRAPPED])return writer;
 const wrapped=async(...args)=>{
  const output=await writer(...args);
  if(output&&typeof output.once==='function'&&typeof output.write==='function')await finished(output,{cleanup:true});
  return output;
 };
 wrapped[WRAPPED]=true;return wrapped;
}
function ensureAsarFinished(){
 const path=require('node:path');
 const entry=require.resolve('@electron/asar');
 const disk=require(path.join(path.dirname(entry),'disk.js'));
 for(const name of ['streamFilesystem','writeFilesystem']){
  if(typeof disk[name]!=='function')throw Error('Unsupported ASAR writer: '+name);
  disk[name]=wrapWriter(disk[name]);
 }
}
module.exports={ensureAsarFinished,wrapWriter};
