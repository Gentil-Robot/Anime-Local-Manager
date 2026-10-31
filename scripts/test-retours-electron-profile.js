'use strict';
const {app}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.disableHardwareAcceleration();
// Only the container's unavailable OS singleton is replaced; main.js/IPC remain real.
app.requestSingleInstanceLock=()=>true;
const profile=process.env.ALM_UI_PROFILE||fs.mkdtempSync(path.join(os.tmpdir(),'alm-retours-electron-'));
fs.mkdirSync(path.join(profile,'data'),{recursive:true});app.setPath('userData',profile);
fs.writeFileSync(path.join(profile,'app-language.txt'),'fr');
fs.writeFileSync(path.join(profile,'data/config.json'),JSON.stringify({metadataUpdateOnStart:false,metadataAutonomousUpdateOnStart:false}));
fs.writeFileSync(path.join(profile,'data/animes.json'),JSON.stringify([
 {id:701,malId:700001,title:"L'Atelier des sorciers",canonicalTitle:'Atelier',localizedTitles:{fr:'Atelier'},status:'Watching',episodesSeen:'9',episodesTotal:'12',score:'7',notes:'Notes personnelles à conserver',tags:['favori'],type:'TV',synopsis:'Incorrect music clip',poster:'/assets/design/clip-complet-poster.jpg',trailer:{youtube_id:'abcdefghijk'}},
 {id:702,malId:20,title:'Naruto',status:'Watching',episodesSeen:'2',episodesTotal:'220',score:'8'}
]));
require('../main');

