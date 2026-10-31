'use strict';
const assert=require('node:assert/strict');
const {csvTvBudget,csvPreviewDecision}=require('../lib/csv-network-budget');
const classifier=require('../lib/media-classifier');
assert(csvTvBudget(99)>60000);
assert.equal(csvTvBudget(0),30000);
assert.equal(csvTvBudget(10000),180000);
assert.equal(csvTvBudget(99,1000),1000);
assert.equal(csvTvBudget(99,Infinity),csvTvBudget(99));
const tv={classification:'non_anime',sourceTitle:'TV film fixture',reason:'Scripted TV evidence'};
for(const state of ['auto_excluded','dismissed']){
 const next=csvPreviewDecision(tv,{state});
 assert.equal(next.classification,'non_anime');assert.equal(next.importExcluded,true);assert.equal(next.reviewState,state);
}
assert.equal(csvPreviewDecision({classification:'review'},{state:'dismissed'}).classification,'ignored');
assert.equal(csvPreviewDecision({classification:'anime'},null).importExcluded,false);
const anime={officialTitle:'Shared title',malId:990053,type:'TV',source:'LocalMetadata'};
const live={name:'Shared title',type:'Scripted',language:'English',genres:['Drama'],source:'TVMaze'};
assert.equal(classifier.classifyImportCandidate({title:'Shared title',animeFound:anime,tvFound:live}).classification,'review');
assert.equal(classifier.classifyImportCandidate({title:'Shared title',tvFound:{...live,type:'Animation',language:'Japanese',genres:['Anime']}}).classification,'review');
assert.equal(classifier.classifyImportCandidate({title:'Shared title',animeFound:anime,tvFound:{...live,type:'Animation',genres:['Animation']}}).classification,'anime');
console.log('OK Beta53: large-list TV reserve is bounded and separate; excluded TV stays inspectable; ambiguous titles and unconfirmed animation remain protected');

const path=require('node:path');
for(const lang of ['fr','en','ja','es','de','pt-BR','zh-CN']){
 const locale=require(path.join('../public/locales',lang+'.json'));
 assert(locale.strings['🛡️ Non animé · exclu de l’import']);
 assert(locale.strings['série(s) / film(s) non animés · exclus de l’import']);
 assert(locale.templates['{count} entrée(s) restent à vérifier : leur contre-vérification TV n’a pas abouti. Elles ne sont pas sélectionnées pour l’import.']);
}
console.log('OK Beta53: import exclusions and incomplete TV checks are translated in all seven interface languages');
