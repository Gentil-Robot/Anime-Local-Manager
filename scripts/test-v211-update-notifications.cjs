'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createNotificationCenter}=require('../lib/notification-center'),{createUpdateNotifications}=require('../lib/update-notifications');
const {createVersionCheck,RELEASES}=require('../lib/version-check'),{normalize}=require('../lib/maintenance');
const {EventEmitter}=require('node:events'),{createDesktopUpdateNotification}=require('../lib/desktop-update-notification');
const copy=require('../public/update-notification-copy');
const installed=require('../release-version.json').technicalVersion;
const [major,minor]=installed.split('.').map(Number);
const future=offset=>`${major}.${minor+offset}.0`;
const offer=(version,prerelease=true)=>({tag_name:'v'+version,prerelease,html_url:RELEASES+'/tag/v'+version});
async function run(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-update-alerts-')),file=path.join(dir,'notifications.json');
 let center=createNotificationCenter({file}),channel='beta',offline=false,calls=0;
 const releases=[offer(installed)];
 const checker=createVersionCheck({fetchImpl:async()=>{if(offline)throw Error('offline');return new Response(JSON.stringify(releases));}});
 let service=createUpdateNotifications({checker,center,getChannel:()=>channel});service.start(async()=>{calls++;});
 try{
  assert.equal(normalize({}).channel,'beta');for(const channel of [null,'','unknown'])assert.equal(normalize({channel}).channel,'beta');assert.equal(normalize({channel:'stable'}).channel,'stable');
  // The installed version must not be offered, even on the beta channel.
  await service.check(true);assert.equal(calls,0);assert.equal(center.state().items.length,0);
  releases[0]=offer(future(1));
  await Promise.all([service.check(true),service.check(true)]);assert.equal(calls,1);assert.equal(center.state().unread,1);assert.equal(center.state().items[0].type,'update');
  center.read();center.record({title:'Calendar',animeId:7,episode:3});center.clear();assert.equal(center.state().items.length,1);assert.equal(center.state().unread,0);
  service.stop();center=createNotificationCenter({file});service=createUpdateNotifications({checker,center,getChannel:()=>channel});service.start(async()=>{calls++;});await service.check(true);assert.equal(calls,1,'Restart/read/calendar clear cannot repeat a desktop alert');
  channel='stable';service.reconcile();assert.equal(center.state().items.length,0);await service.check(true);assert.equal(calls,1);assert.equal(center.state().unread,0);
  channel='beta';center.configure(true);releases[0]=offer(future(2));await service.check(true);assert.equal(center.state().items.length,2);assert.equal(calls,1,'Muted desktop alerts retain their inbox entry');center.configure(false);await service.check(true);assert.equal(calls,2);
  offline=true;await service.check(true);assert.equal(calls,2);assert.equal(center.state().items.length,2);offline=false;
  releases[0].prerelease=false;await service.check(true);assert.equal(calls,2);assert.equal(center.state().items.find(i=>i.version===future(2)).prerelease,false,'Promoting a beta updates its badge without a duplicate');
  center.reconcileUpdates(future(2),'beta');assert.equal(center.state().unread,0);assert.equal(center.state().items.length,0,'Installed updates no longer appear as available');
  for(const candidate of [{latest:'v'+future(3),releaseUrl:'https://evil.invalid/release'},{latest:'<img onerror=alert(1)>',releaseUrl:RELEASES+'/tag/invalid'},{latest:'v'+future(3),releaseUrl:RELEASES+'/tag/v'+future(3),error:'OFFLINE'}])center.recordUpdate({available:true,...candidate});assert.equal(center.state().items.length,0);
  center.configure(true);releases[0]=offer(future(3));await service.check(true);center.configure(false);
  offline=true;await service.check(true);assert.equal(calls,2,'Unmuting offline must not deliver an unconfirmed pending update');offline=false;
  releases[0].draft=true;await service.check(true);assert.equal(calls,2,'A withdrawn pending release must not notify');
  releases[0].draft=false;await service.check(true);assert.equal(calls,3,'The pending alert resumes only after a successful source check');
  releases[0]={...offer(future(4)),draft:true};await service.check(true);assert.equal(calls,3,'Draft releases never notify');
  for(const language of copy.languages){let instance,opened=0;class Notification extends EventEmitter{static isSupported(){return true;}constructor(options){super();this.options=options;instance=this;}show(){this.emit('show');}}
   const notify=createDesktopUpdateNotification({Notification,language:()=>language,icon:'fixture.ico',open:()=>opened++});assert.equal(await notify({version:future(3),prerelease:true}),true);assert(instance.options.title.includes(future(3)));assert(instance.options.title.includes(copy.text('beta',language)));instance.emit('click');assert.equal(opened,1);assert(copy.text('checking',language));assert(copy.text('view',language));
  }
  console.log('OK update alerts: concurrent checks, restart dedupe, quiet mode, channel changes, installed releases, promotion, source failures and native clicks in seven languages.');
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
