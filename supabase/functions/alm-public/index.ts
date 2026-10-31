import {RELEASE_VERSION} from './release.ts';
import {normalizeDiagnostic} from './support-model.ts';
// Public contact and newsletter endpoint. Server secrets never enter the client bundle.
// ALM binds only to loopback and attempts at most twenty fallback ports, 3123..3143.
// Match the EXACT serialized origin; accepting arbitrary localhost ports would
// expand access unnecessarily. Turnstile action/hostname validation still applies.
function allowedOrigin(origin){
 if(origin==='https://animelocalmanager.com')return true;
 if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin))return false;
 try{
  const value=new URL(origin),port=Number(value.port);
  return value.origin===origin && port>=3123 && port<=3143;
 }catch{return false;}
}
const CATEGORIES=new Set(['problem','idea','question','collaboration','privacyRequest','other']);
const enc=new TextEncoder();
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export async function handle(req,deps={env:key=>Deno.env.get(key),fetch:globalThis.fetch,crypto:globalThis.crypto}){
 const requestUrl=new URL(req.url),oneClick=req.method==='POST'&&requestUrl.pathname.endsWith('/unsubscribe');const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
 if(allowedOrigin(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return allowedOrigin(origin)?new Response(null,{status:204,headers}):reply(403,{ok:false,code:'INVALID_INPUT'});
 if(!oneClick&&!allowedOrigin(origin))return reply(403,{ok:false,code:'INVALID_INPUT'});
 const env=deps.env,siteKey=env('ALM_TURNSTILE_SITE_KEY');
 if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/config'))return reply(200,{releaseVersion:RELEASE_VERSION,captchaSiteKey:siteKey||'',diagnosticVersion:1,diagnosticSectionsVersion:2,ready:!!(siteKey&&env('ALM_TURNSTILE_SECRET')&&env('RESEND_API_KEY')&&env('ALM_CONTACT_TO'))});
 if(req.method!=='POST')return reply(405,{ok:false,code:'INVALID_INPUT'});
 if(!oneClick&&!(req.headers.get('content-type')||'').startsWith('application/json'))return reply(415,{ok:false,code:'INVALID_INPUT'});
 let body;try{const reader=req.body?.getReader();if(!reader)return reply(400,{ok:false,code:'INVALID_INPUT'});let bytes=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32000){await reader.cancel();return reply(413,{ok:false,code:'PAYLOAD_LIMIT'});}chunks.push(value);}const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}body=oneClick?{action:'newsletter-unsubscribe',token:requestUrl.searchParams.get('token')}:JSON.parse(new TextDecoder().decode(buffer));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return reply(400,{ok:false,code:'INVALID_INPUT'});}
 const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!service)return reply(503,{ok:false,code:'ALM_COMMUNITY_NOT_READY'});
 const sha=async value=>hex(await deps.crypto.subtle.digest('SHA-256',enc.encode(value)));
 const sign=async value=>{const key=await deps.crypto.subtle.importKey('raw',enc.encode(service),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await deps.crypto.subtle.sign('HMAC',key,enc.encode(value)));};
 async function rpc(name,args){const r=await deps.fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json',apikey:service,Authorization:'Bearer '+service},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('BACKEND');if(r.status===204)return null;const text=await r.text();return text?JSON.parse(text):null;}
 try{
 if(['newsletter-confirm','newsletter-unsubscribe'].includes(body.action)){
  const confirming=body.action==='newsletter-confirm';const token=String(body.token||'');if(!(confirming?/^[a-f0-9]{64}\.[a-f0-9]{64}$/:/^[a-f0-9-]{36}\.[a-f0-9]{64}$/).test(token))return reply(400,{ok:false,code:'INVALID_INPUT'});
  const [tokenId,signature]=token.split('.'),expected=await sign((confirming?'confirm:':'unsubscribe:')+tokenId);let diff=0;for(let n=0;n<64;n++)diff|=signature.charCodeAt(n)^expected.charCodeAt(n);if(diff)return reply(400,{ok:false,code:'expiredLink'});const ok=await rpc('alm_newsletter_action',{p_hash:await sha(token),p_action:confirming?'confirm':'unsubscribe'});return ok?reply(200,{ok:true}):reply(400,{ok:false,code:'expiredLink'});
 }
 if(!['contact','newsletter'].includes(body.action)||body.consent!==true||body.website)return reply(400,{ok:false,code:'INVALID_INPUT'});
 const email=String(body.email||'').trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{ok:false,code:'INVALID_INPUT'});
 if(body.action==='contact'&&(!CATEGORIES.has(body.category)||typeof body.message!=='string'||body.message.trim().length<20||body.message.length>4000))return reply(400,{ok:false,code:'INVALID_INPUT'});
 const captcha=String(body.captchaToken||'');if(!env('ALM_TURNSTILE_SECRET')||!env('RESEND_API_KEY')||!env('ALM_CONTACT_TO'))return reply(503,{ok:false,code:'ALM_COMMUNITY_NOT_READY'});
 if(!captcha||captcha.length>2048)return reply(403,{ok:false,code:'ALM_CAPTCHA_REQUIRED'});
 const verification=await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env('ALM_TURNSTILE_SECRET'),response:captcha}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!verification.ok)return reply(503,{ok:false,code:'ALM_COMMUNITY_NOT_READY'});
 const verified=await verification.json();const allowedHost=new URL(origin).hostname;if(verified.success!==true||verified.hostname!==allowedHost||verified.action!==body.action)return reply(403,{ok:false,code:'ALM_CAPTCHA_REQUIRED'});
 const allowed=await rpc('alm_email_allowed',{p_email:email});if(!allowed)return reply(400,{ok:false,code:'ALM_EMAIL_DOMAIN'});
 const claimed=await rpc('alm_claim_public_action',{p_fingerprint:await sign('email:'+email),p_kind:body.action});if(!claimed){headers['Retry-After']='3600';return reply(429,{ok:false,code:'RATE_LIMIT'});}
 // A retry must reproduce BOTH provider key and email content, including links.
 const requestId=typeof body.requestId==='string'&&/^[a-f0-9-]{36}$/i.test(body.requestId)?body.requestId:new Date().toISOString().slice(0,10);
 const stable=await sign('public-request:'+JSON.stringify([requestId,body.action,email,body.category||'',body.message||'',body.locale||'fr',body.diagnostic?normalizeDiagnostic(body.diagnostic):null]));
 const id=[stable.slice(0,8),stable.slice(8,12),stable.slice(12,16),stable.slice(16,20),stable.slice(20,32)].join('-');let message;
 if(body.action==='contact'){
  const category={problem:'Signaler un problème / Report a problem',idea:'Proposer une idée / Suggest an idea',question:'Question / Question',collaboration:'Collaboration / Partnership',privacyRequest:'Confidentialité / Privacy',other:'Autre / Other'}[body.category];
  const text='Nouvelle demande via ALM\nObjet : '+category+'\nAdresse de réponse : '+email+'\n\n'+body.message+'\n\n---\nNew request through ALM\nCategory: '+category+'\nReply address: '+email+'\n\n'+body.message;
  message={from:'ALM <noreply@mail.animelocalmanager.com>',to:[env('ALM_CONTACT_TO')],reply_to:email,subject:'ALM — '+category,text,html:'<!doctype html><html><body><section lang="fr"><h1>Nouvelle demande via ALM</h1><p>'+escape(category)+'</p><p>'+escape(email)+'</p><pre>'+escape(body.message)+'</pre></section><hr><section lang="en"><h1>New request through ALM</h1><p>'+escape(category)+'</p><p>'+escape(email)+'</p><pre>'+escape(body.message)+'</pre></section></body></html>'};
 }else{
  const nonce=await sign('confirmation-nonce:'+id),token=nonce+'.'+await sign('confirm:'+nonce);let unsubscribe=id+'.'+await sign('unsubscribe:'+id);
  const prepared=await rpc('alm_newsletter_prepare',{p_id:id,p_email:email,p_locale:['fr','en','es','de','ja','pt-BR','zh-CN'].includes(body.locale)?body.locale:'fr',p_token_hash:await sha(token),p_unsubscribe_hash:await sha(unsubscribe)});
  if(!prepared)return reply(200,{ok:true});unsubscribe=prepared+'.'+await sign('unsubscribe:'+prepared);await rpc('alm_newsletter_unsubscribe_key',{p_id:prepared,p_hash:await sha(unsubscribe)});
  const confirm='https://animelocalmanager.com/newsletter.html?action=confirm&token='+token,cancel='https://animelocalmanager.com/newsletter.html?action=unsubscribe&token='+unsubscribe;
  const fr='Confirme ton inscription aux nouveautés ALM : nouvelles versions et annonces importantes.\nConfirmer : '+confirm+'\nSi tu n’as pas demandé cette inscription, ignore ce mail ou annule : '+cancel;
  const en='Confirm your subscription to ALM updates: new releases and important announcements.\nConfirm: '+confirm+'\nIf you did not request this, ignore this email or cancel: '+cancel;
  message={from:'ALM <noreply@mail.animelocalmanager.com>',to:[email],subject:'ALM — Confirme ton inscription / Confirm your subscription',text:fr+'\n\n---\n\n'+en,html:'<!doctype html><html><body><section lang="fr"><h1>Les nouveautés ALM</h1><p>Nouvelles versions et annonces importantes. Confirme ton inscription volontaire.</p><p><a href="'+escape(confirm)+'">Confirmer mon inscription</a></p><p>Vérifie aussi les spams. Si tu n’as pas demandé ce mail, ignore-le ou <a href="'+escape(cancel)+'">annule l’inscription</a>.</p></section><hr><section lang="en"><h1>ALM updates</h1><p>New releases and important announcements. Confirm your voluntary subscription.</p><p><a href="'+escape(confirm)+'">Confirm my subscription</a></p><p>Also check spam. If you did not request this, ignore it or <a href="'+escape(cancel)+'">cancel the subscription</a>.</p></section></body></html>',headers:{'List-Unsubscribe':'<'+url+'/functions/v1/alm-public/unsubscribe?token='+unsubscribe+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
 }
  if(body.action==='contact'&&body.diagnostic!=null){if(typeof body.diagnostic!=='object'||Array.isArray(body.diagnostic))return reply(400,{ok:false,code:'INVALID_INPUT'});const diagnostic=JSON.stringify(normalizeDiagnostic(body.diagnostic),null,2);message.text+='\n\nDiagnostic technique / Technical diagnostic\n'+diagnostic;message.html=message.html.replace('</body>','<section><h2>Diagnostic technique / Technical diagnostic</h2><pre>'+escape(diagnostic)+'</pre></section></body>');}
const sent=await deps.fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':'alm-'+body.action+'-'+id},body:JSON.stringify(message),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!sent.ok)return reply(503,{ok:false,code:'ALM_NETWORK'});return reply(200,{ok:true});
 }catch{return reply(503,{ok:false,code:'ALM_NETWORK'});}
}
if(typeof Deno!=='undefined')Deno.serve(req=>handle(req));
