'use strict';
const {execFile}=require('node:child_process');
// Fixed PowerShell code; untrusted paths are data, never interpolated into code.
const SCRIPT="$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:ALM_SIGNATURE_FILE; @{status=[string]$s.Status;thumbprint=[string]$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress";
function readSignature(file,run=execFile){return new Promise((resolve,reject)=>run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:16384,env:{...process.env,ALM_SIGNATURE_FILE:file}},(error,out)=>{if(error)return reject(Error('ALM_UPDATE_SIGNATURE_CHECK'));try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')));}catch{reject(Error('ALM_UPDATE_SIGNATURE_CHECK'));}}));}
function assertSignature(incoming,current,{requireSigned=false,thumbprint=''}={}){
 const pinned=String(thumbprint||'').replace(/\s/g,'').toUpperCase(),old=String(current?.thumbprint||'').toUpperCase(),next=String(incoming?.thumbprint||'').toUpperCase();
 if(incoming?.status!=='Valid'&&incoming?.status!=='NotSigned')throw Error('ALM_UPDATE_SIGNATURE_INVALID');
 if(current?.status==='Valid'&&(!old||incoming.status!=='Valid'||next!==old))throw Error('ALM_UPDATE_SIGNATURE_PUBLISHER');
 if((requireSigned||pinned)&&incoming?.status!=='Valid')throw Error('ALM_UPDATE_SIGNATURE_REQUIRED');
 if(pinned&&next!==pinned)throw Error('ALM_UPDATE_SIGNATURE_PUBLISHER');
 return {signed:incoming.status==='Valid',thumbprint:next};
}
async function verifySignature(file,target,options={}){const incoming=await readSignature(file,options.run),current=await readSignature(target,options.run);return assertSignature(incoming,current,options);}
module.exports={readSignature,assertSignature,verifySignature,SCRIPT};
