'use strict';
const fs=require('node:fs'),path=require('node:path');
const specs=require('./catalogue.json');
const section='font-size:16px;line-height:1.6',button='display:inline-block;padding:14px 22px;background:#574087;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px';
function render(s){
const part=(lang,title,body,label,detail,level)=>'<section lang="'+lang+'"><'+level+' style="font-size:26px;line-height:1.3">'+title+'</'+level+'><p style="'+section+'">'+body+'</p>'+(label?'<p><a href="{{ .ConfirmationURL }}" style="'+button+'">'+label+'</a></p>':s.kind==='code'?'<p style="font-size:30px;font-family:monospace">{{ .Token }}</p>':'')+'<p style="'+section+'">'+detail+'</p></section>';
return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+s.subject+'</title></head><body style="margin:0;background:#f4f2f8;color:#202338;font-family:Arial,sans-serif"><main style="max-width:560px;margin:24px auto;padding:28px;background:#ffffff;border-radius:12px"><p style="font-size:14px;color:#5e4d90">ANIME LOCAL MANAGER</p>'+part('fr',...s.fr,'h1')+'<hr style="border:0;border-top:1px solid #ddd6e8;margin:28px 0">'+part('en',...s.en,'h2')+'<p style="font-size:14px;color:#575969"><span lang="fr">Cette adresse d’envoi ne reçoit pas de réponses.</span><br><span lang="en">This sending address does not receive replies.</span></p><p style="font-size:14px"><a href="https://animelocalmanager.com/community-notice.html" style="color:#574087">Communauté et confidentialité / Community and privacy</a></p></main></body></html>';
}
if(require.main===module){for(const [name,s] of Object.entries(specs))fs.writeFileSync(path.join(__dirname,name+'.html'),render(s)+'\n');console.log('8 modèles ALM : français puis anglais.');}
module.exports={render,specs};
