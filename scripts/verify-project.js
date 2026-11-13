'use strict';
const fs=require('node:fs'),path=require('node:path');
const {logger,runCommand,atomicJson}=require('./release-utils');
const release=require('../release-version.json');

// Historical test filenames are deliberately stable. Only their human-facing
// descriptions are modernized; the exact filename stays in verification.json
// and in the technical log to preserve provenance and investigation detail.
function category(file){if(/build|package|release|beta58|beta70-windows/.test(file))return 'Publication';if(/karaoke|timeline|nocturne|ui-logic|polish|retours-window|native/.test(file))return 'Interface et karaoké';if(/38|39|40|41|42|43|44|45|46|audit|retours-runtime|association-concurrency/.test(file))return 'Données, sauvegardes et sécurité';if(/beta(23|26|48|49|50|51|52|53|54|55|56|57)|csv|betaseries|manual-add/.test(file))return 'Imports et bibliothèque';return 'Structure et régressions';}

const exactNames=Object.freeze({
 'test-windows-update-handoff.cjs':'Mises à jour Windows : confirmation avant fermeture et reprise',
 'test-v211-update-notifications.cjs':'Mises à jour : alertes persistantes et notifications système',
 'test-v211-update-ui.cjs':'Mises à jour : cloche, actions et retour de vérification',
 'test-v210-password-recovery.cjs':'Compte : récupération vérifiée et MFA',
 'test-v210-update-channels.cjs':'Mises à jour : canaux et compatibilité 2.0.0',
 'test-v200-engine-main.cjs':'Moteur : reprise dans Electron',
 'test-v200-engine-supervisor.cjs':'Moteur : surveillance et redémarrage',
 'test-v200-auth-security-ui.cjs':'Compte : interface MFA et secrets',
 'test-v200-auth-security-http.cjs':'Compte : intégration HTTP du MFA',
 'test-v200-auth-security-sql.cjs':'Compte : sécurité SQL et révocation',
 'test-v200-auth-security.cjs':'Compte : authentification et MFA',
 'test-source-files.js':'Intégrité des sources',
 'test-v200-http-errors.cjs':'HTTP : erreurs et continuité du service',
 'test-beta-stable.js':'Conformité '+release.publicVersion,
 'test-nocturne.js':'Présentation et navigation',
 'test-beta76-imports.cjs':'Imports : contrôle des données',
 'test-beta78-storage.cjs':'Stockage : persistance et récupération',
 'test-beta82-production-copy.cjs':'Copie de publication : intégrité',
 'test-beta51-http.js':'Bibliothèque : services HTTP',
 'test-beta53-http.js':'Imports : intégration HTTP',
 'test-beta46-cleanup.js':'Nettoyage et récupération des données',
 'test-beta58-smoke.js':'Installation : vérification du démarrage',
 'test-beta79-services.cjs':'Services et version du site',
 'test-manual-add-runtime.js':'Ajout manuel : fonctionnement',
 'test-beta23-multiseason-runtime.js':'Regroupement des saisons : fonctionnement',
 'test-beta70-windows-paths.cjs':'Installation : chemins Windows',
 'test-beta78-library-fields.cjs':'Bibliothèque : validation des champs',
 'test-beta78-community-inputs.cjs':'Communauté : saisie et contrôles',
 'test-beta78-season-races.cjs':'Saisons : concurrence des requêtes',
 'test-beta82-common-profile.cjs':'Amis : animés en commun',
 'test-beta82-cover-cache.cjs':'Jaquettes : cache local',
 'test-beta82-dna-posters.cjs':'Anime DNA : jaquettes et titres',
 'test-beta82-recommend-catalog.cjs':'Recommandations : catalogue',
 'test-beta82-social-cache-hardening.cjs':'Communauté : sécurité et cache',
 'test-beta82-cover-retries.cjs':'Jaquettes : reprises réseau',
 'test-beta82-ux6.cjs':'Expérience utilisateur : finitions',
 'test-beta82-account-teardown.cjs':'Compte : fermeture et nettoyage',
 'test-beta82-memories-filters.cjs':'Souvenirs : recherche et filtres',
 'test-beta82-community-navigation.cjs':'Communauté : navigation',
 'test-beta82-card-actions.cjs':'Fiches : actions utilisateur',
 'test-beta82-engine-callbacks.cjs':'Moteur : callbacks et arrêt',
 'test-beta82-anilist-network.cjs':'AniList : protections réseau',
 'test-beta82-safe-storage.cjs':'Chiffrement et stockage sécurisé',
 'test-beta82-delete-confirmation.cjs':'Suppression de compte : confirmation',
 'test-beta82-betaseries-network.cjs':'BetaSeries : protections réseau',
 'test-release-v200.cjs':'Compatibilité '+release.publicVersion
});
const parts=Object.freeze({
 source:'sources',files:'fichiers',audit:'audit',upgrade:'mise à niveau',karaoke:'karaoké',timeline:'synchronisation',
 ui:'interface',logic:'logique',final:'régressions',polish:'finitions',runtime:'fonctionnement',
 http:'HTTP',sql:'SQL',public:'site public',network:'réseau',maintenance:'maintenance',
 window:'fenêtres',retours:'parcours',association:'associations',concurrency:'concurrence',
 calendar:'calendrier',csv:'CSV',betaseries:'BetaSeries',progress:'progression',
 worker:'traitements en arrière-plan',imports:'imports',import:'import',manual:'manuel',add:'ajout',
 release:'publication',watch:'mises à jour',packaged:'application empaquetée',integrity:'intégrité',
 native:'natif',providers:'fournisseurs',enrichment:'enrichissement',cleanup:'nettoyage',
 smoke:'démarrage',tooling:'outillage',community:'communauté',flows:'parcours',scheduler:'tâches planifiées',
 sync:'synchronisation',support:'assistance',favorites:'favoris',diagnostic:'diagnostics',
 policy:'confidentialité',notebook:'souvenirs',package:'installation',windows:'Windows',paths:'chemins',
 age:'âge et partage',charter:'charte',requests:'requêtes',restoration:'restauration',news:'actualités',
 review:'contrôle des animés',visual:'visuel',database:'base de données',input:'saisie',inputs:'saisies',
 deferred:'tâches différées',library:'bibliothèque',fields:'champs',season:'saisons',races:'concurrence',
 server:'serveur',storage:'stockage',recovery:'récupération',services:'services',performance:'performances',
 paging:'pagination',common:'animés communs',seasons:'saisons',prepublication:'prépublication',
 build:'construction',perf:'performances',security:'sécurité',gap:'optimisations',local:'local',
 images:'jaquettes',toolchain:'outils de construction',safe:'sécurisé',
 cover:'jaquettes',cache:'cache',recommend:'recommandations',catalog:'catalogue',social:'social',
 hardening:'renforcement',retries:'nouvelles tentatives',ux:'expérience utilisateur',
 account:'compte',teardown:'suppression',memories:'souvenirs',filters:'filtres',navigation:'navigation',
 card:'fiches',actions:'actions',engine:'moteur',callbacks:'callbacks',encoding:'encodage',
 anilist:'AniList',delete:'suppression',confirmation:'confirmation',version:'version',
 test:'contrôle',user:'utilisateur',beta:'bêta',stable:'stable'
});
function displayName(file){
 const name=path.basename(file);
 if(Object.prototype.hasOwnProperty.call(exactNames,name))return exactNames[name];
 let stem=name.replace(/\.(?:cjs|js)$/,'').replace(/^test-/,'');
 stem=stem.replace(/^(?:beta\d+|gap\d+)(?:-|$)/,'');
 const title=stem.split('-').filter(Boolean).map(token=>parts[token]||token).join(' ');
 if(!title||/\bbeta\s*\d+\b/i.test(title))throw Error('Libellé de vérification invalide : '+name);
 return title.charAt(0).toLocaleUpperCase('fr')+title.slice(1);
}
function diagnosticHeadline(output){
 const lines=String(output||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const item=lines.find(s=>/^(?:AssertionError|SyntaxError|TypeError|ReferenceError|RangeError|Error:|\[ERR_|FAIL|KO\b|ÉCHEC\b)/.test(s))||lines.slice(-1)[0]||'Consulter le journal technique.';
 return item.replace(/test-beta\d+[\w-]*\.(?:cjs|js)/gi,'test historique').slice(0,240);
}
async function verifyProject({root=path.resolve(__dirname,'..'),reportFile,logFile,verbose=false,signal,run=runCommand,consoleOutput=console.log,heartbeatMs=15000}={}){
 const directory=path.join(root,'.release-work','verification');reportFile=reportFile||path.join(directory,'latest.json');logFile=logFile||path.join(directory,'verification-'+Date.now()+'.log');
 const log=logger(logFile,{consoleOutput,heartbeatMs});
 const original=JSON.parse(fs.readFileSync(path.join(root,'scripts/verification-plan.json'),'utf8')).steps;
 const categories=[...new Set(original.map(category))],steps=categories.flatMap(group=>original.filter(file=>category(file)===group));
 const totals=new Map(categories.map(group=>[group,steps.filter(file=>category(file)===group).length]));
 let activeGroup='';
 const report={schema:1,release:{technicalVersion:release.technicalVersion,publicName:release.publicName,distributionChannel:release.distributionChannel},startedAt:new Date().toISOString(),status:'running',log:path.relative(root,logFile),checks:[],groups:{}};
 consoleOutput('[vérification] '+release.publicName+' · '+steps.length+' suites');
 try{
  for(const file of steps){
   if(signal?.aborted)throw Error('Vérification annulée');
   const group=category(file),label=displayName(file),order=(report.groups[group]||0)+1;
   const name=release.publicVersion+' · '+group+' · '+label+' ('+order+'/'+totals.get(group)+')',at=Date.now();
   if(group!==activeGroup){
    if(activeGroup)consoleOutput('[vérification] OK · '+activeGroup+' · '+report.groups[activeGroup]+' suites');
    activeGroup=group;
    consoleOutput('[vérification] '+group+' · '+totals.get(group)+' suites');
   }
   log.begin(name,{silent:!verbose});
   log.write('[trace technique] script='+file+'\n');
   const result=await run(process.execPath,[path.join(root,file)],{cwd:root,log,verbose,signal,timeoutMs:10*60*1000});
   report.checks.push({test:file,label,group,status:result.code===0?'passed':'failed',durationMs:Date.now()-at,exitCode:result.code});
   report.groups[group]=order;
   log.end(name,result.code===0?'OK':'ÉCHEC');
   if(result.code!==0){
    consoleOutput('[vérification] '+release.publicVersion+' · '+label+' : '+diagnosticHeadline(result.output));
    if(verbose)consoleOutput(String(result.output||'').split(/\r?\n/).slice(-35).join('\n'));
    throw Error('Contrôle « '+label+' » en échec. Journal technique : '+logFile);
   }
  }
  report.status='passed';
  if(activeGroup)consoleOutput('[vérification] OK · '+activeGroup+' · '+report.groups[activeGroup]+' suites');
  consoleOutput('[vérification] '+release.publicVersion+' · '+steps.length+' suites réussies. Les détails historiques des scénarios restent dans le journal technique.');
  return report;
 }catch(error){report.status=signal?.aborted?'cancelled':'failed';report.error=error.message;throw error;}
 finally{report.finishedAt=new Date().toISOString();atomicJson(reportFile,report);log.close();}
}
module.exports={verifyProject,category,displayName,diagnosticHeadline};
if(require.main===module)verifyProject({verbose:process.argv.includes('--verbose')}).catch(error=>{console.error('[vérification] '+error.message);process.exitCode=1;});
