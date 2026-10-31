"use strict";
const fs = require("fs");
const path = require("path");
function readJson(file, fallback={}) { try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch {return fallback;} }
function localeCoverage(root) {
  const dir=path.join(root,"public","locales"), reference=readJson(path.join(dir,"en.json"));
  const result={};
  for (const code of ["fr","en","ja","es","de","pt-BR","zh-CN"]) {
    const data=readJson(path.join(dir,code+".json"));
    const missing=[]; let total=0,translated=0;
    for (const section of ["strings","placeholders","titles","templates"]) {
      for (const key of Object.keys(reference[section] || {})) {
        total++;
        if (code==="fr" || typeof data[section]?.[key]==="string" && data[section][key].trim()) translated++;
        else missing.push({section,key});
      }
    }
    result[code]={translated,total,percent:total ? Math.round(1000*translated/total)/10 : 100,missing};
  }
  return result;
}
function diagnostics(root, storage, library, sources=[], completion=null) {
  const pkg=readJson(path.join(root,"package.json"));
  const manifest=readJson(path.join(root,"data","database","metadata-manifest.json"));
  const song=readJson(path.join(root,"public","karaoke","song.json"));
  const installed={};
  for (const key of Object.keys({...pkg.dependencies,...pkg.devDependencies})) {
    installed[key]=readJson(path.join(root,"node_modules",key,"package.json"),{version:null}).version;
  }
  const locales=localeCoverage(root);
  const provisional=Array.isArray(completion?.items)?completion.items.filter(a=>a.kind==='season'):
    library.filter(a=>a.needsSequelCheck===true&&!a.malId&&!a.anilistId);
  // Counts only: no user title, filesystem path, email or API key in this report.
  return {version:pkg.version, generatedAt:new Date().toISOString(),
    runtime:{node:process.versions.node,platform:process.platform,electron:process.versions.electron || null},
    storage, library:{count:library.length,provisionalSeasons:provisional.length,provisionalIds:provisional.map(a=>Number(a.id)).filter(Number.isSafeInteger),awaitingSeasons:(completion?.awaiting||[]).filter(a=>a.kind==='season-source-wait').length},
    snapshot:{rows:Number(manifest.full?.rows || 0),generatedAt:manifest.generatedAt || null,sha256:manifest.full?.sha256 || null},
    locales, news:Object.fromEntries(Object.keys(locales).map(code=>[code,{configuredSources:sources.filter(s=>s.lang===code).length}])),
    karaoke:{status:song.reviewStatus || "unreviewed", flaggedLines:(song.sections||[]).flatMap(s=>s.lines||[]).filter(l=>l.review).length,pendingInsertions:(song.pendingInsertions||[]).length},
    dependencies:{declared:{...pkg.dependencies,...pkg.devDependencies},installed},
    limitations:["Locale coverage measures key presence, not translation quality.","No external service is contacted by this diagnostic.","A configured RSS source is not a guarantee of live availability."]};
}
module.exports={localeCoverage,diagnostics};
