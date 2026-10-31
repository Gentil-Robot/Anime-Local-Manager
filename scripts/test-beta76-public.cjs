'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const file=path.join(os.tmpdir(),'alm76-public-'+process.pid+'.cjs');
require('esbuild').buildSync({bundle:true,entryPoints:[path.join(__dirname,'../supabase/functions/alm-public/index.ts')],platform:'node',format:'cjs',outfile:file});
const {handle}=require(file);const emails=[],prepared=[];let failAfterAcceptance=true;
const secrets={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'FICTIONAL-service',ALM_TURNSTILE_SITE_KEY:'FICTIONAL-public',ALM_TURNSTILE_SECRET:'FICTIONAL-captcha',RESEND_API_KEY:'FICTIONAL-mail',ALM_CONTACT_TO:'owner@example.test'};
let action='contact';
const deps={crypto:crypto.webcrypto,env:key=>secrets[key],fetch:async(url,options)=>{
 if(url.includes('/siteverify'))return Response.json({success:true,hostname:'animelocalmanager.com',action});
 if(url.includes('/rpc/')){const name=url.split('/').pop(),body=JSON.parse(options.body);if(name==='alm_newsletter_prepare'){prepared.push(body);return Response.json(body.p_id);}return Response.json(true);}
 if(url==='https://api.resend.com/emails'){emails.push({key:options.headers['Idempotency-Key'],body:options.body});if(failAfterAcceptance){failAfterAcceptance=false;throw Error('Simulated timeout after provider acceptance');}return Response.json({id:'fixture'});}
 throw Error('Unexpected outbound request');
}};
const request=body=>new Request('https://fixture.invalid/functions/v1/alm-public',{method:'POST',headers:{Origin:'https://animelocalmanager.com','Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{try{
 let body={requestId:'00000000-0000-4000-8000-000000000076',action,email:'sender@example.test',category:'problem',message:'Fictional issue message for a retry test',consent:true,captchaToken:'fixture'};
 assert.equal((await handle(request(body),deps)).status,503);assert.equal((await handle(request({...body,captchaToken:'new-fixture-proof'}),deps)).status,200);assert.deepEqual(emails[0],emails[1]);
 await handle(request({...body,message:body.message+' changed'}),deps);assert.notEqual(emails[1].key,emails[2].key);
 action='newsletter';body={...body,action};failAfterAcceptance=true;
 assert.equal((await handle(request(body),deps)).status,503);assert.equal((await handle(request(body),deps)).status,200);assert.deepEqual(emails.at(-1),emails.at(-2));assert.deepEqual(prepared[0],prepared[1]);
 const notices=fs.readFileSync(path.join(__dirname,'../public/THIRD-PARTY-NOTICES.txt'),'utf8');assert(notices.includes('@supabase/supabase-js@'));assert(notices.includes('qrcode@1.5.4'));assert(notices.includes('Permission is hereby granted'));
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../community/site/release-manifest.json'),'utf8'));assert.equal(manifest.version,require('../package.json').version);
 for(const record of manifest.files){const bytes=fs.readFileSync(path.join(__dirname,'../community/site',record.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256,record.path);}
 console.log('OK Beta76: timeout-after-acceptance retries preserve email key/body and newsletter links, changed message gets a distinct key; third-party MIT notices and site release hashes verified. No real mail sent.');
}finally{fs.rmSync(file,{force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
