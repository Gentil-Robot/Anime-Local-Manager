'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createNotificationCenter}=require('../lib/notification-center'),{createUpdateNotifications}=require('../lib/update-notifications');
const {createVersionCheck,RELEASES}=require('../lib/version-check'),{normalize}=require('../lib/maintenance');
const {EventEmitter}=require('node:events'),{createDesktopUpdateNotification}=require('../lib/desktop-update-notification');
const copy=require('../public/update-notification-copy');
async function run(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-update-alerts-')),file=path.join(dir,'notifications.json');
 let center=createNotificationCenter({file}),channel='beta',offline=false,calls=0;
 const releases=[{tag_name:'v2.2.0',prerelease:true,html_url:RELEASES+'/tag/v2.2.0'}];
 const checker=createVersionCheck({fetchImpl:async()=>{if(offline)throw Error('offline');return new Response(JSON.stringify(releases));}});
 let service=createUpdateNotifications({checker,center,getChannel:()=>channel});service.start(async()=>{calls++;});
 try{
  assert.equal(normalize({}).channel,'beta');for(const channel of [null,'','unknown'])assert.equal(normalize({channel}).channel,'beta');assert.equal(normalize({channel:'stable'}).channel,'stable');
  await Promise.all([service.check(true),service.check(true)]);assert.equal(calls,1);assert.equal(center.state().unread,1);assert.equal(center.state().items[0].type,'update');
  center.read();center.record({title:'Calendar',animeId:7,episode:3});center.clear();assert.equal(center.state().items.length,1);assert.equal(center.state().unread,0);
  service.stop();center=createNotificationCenter({file});service=createUpdateNotifications({checker,center,getChannel:()=>channel});service.start(async()=>{calls++;});await service.check(true);assert.equal(calls,1,'Restart/read/calendar clear cannot repeat a desktop alert');
  channel='stable';service.reconcile();assert.equal(center.state().items.length,0);await service.check(true);assert.equal(calls,1);assert.equal(center.state().unread,0);
  channel='beta';center.configure(true);releases[0]={...releases[0],tag_name:'v2.3.0',html_url:RELEASES+'/tag/v2.3.0'};await service.check(true);assert.equal(center.state().items.length,2);assert.equal(calls,1,'Muted desktop alerts retain their inbox entry');center.configure(false);await service.check(true);assert.equal(calls,2);
  offline=true;await service.check(true);assert.equal(calls,2);assert.equal(center.state().items.length,2);offline=false;
  releases[0].prerelease=false;await service.check(true);assert.equal(calls,2);assert.equal(center.state().items.find(i=>i.version==='2.3.0').prerelease,false,'Promoting a beta updates its badge without a duplicate');
  center.reconcileUpdates('2.3.0','beta');assert.equal(center.state().unread,0);assert.equal(center.state().items.length,0,'Installed updates no longer appear as available');
  for(const candidate of [{latest:'v2.4.0',releaseUrl:'https://evil.invalid/release'},{latest:'<img onerror=alert(1)>',releaseUrl:RELEASES+'/tag/invalid'},{latest:'v2.4.0',releaseUrl:RELEASES+'/tag/v2.4.0',error:'OFFLINE'}])center.recordUpdate({available:true,...candidate});assert.equal(center.state().items.length,0);
  releases[0]={tag_name:'v2.9.0',prerelease:true,draft:true,html_url:RELEASES+'/tag/v2.9.0'};await service.check(true);assert.equal(calls,2,'Draft releases never notify');
  for(const language of copy.languages){let instance,opened=0;class Notification extends EventEmitter{static isSupported(){return true;}constructor(options){super();this.options=options;instance=this;}show(){this.emit('show');}}
   const notify=createDesktopUpdateNotification({Notification,language:()=>language,icon:'fixture.ico',open:()=>opened++});assert.equal(await notify({version:'2.4.0',prerelease:true}),true);assert(instance.options.title.includes('2.4.0'));assert(instance.options.title.includes(copy.text('beta',language)));instance.emit('click');assert.equal(opened,1);assert(copy.text('checking',language));assert(copy.text('view',language));
  }
  console.log('OK 2.1.1 update alerts: concurrent checks, restart dedupe, quiet mode, channel changes, installed releases, promotion, source failures and native clicks in seven languages.');
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
