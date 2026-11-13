'use strict';
const current=require('../release-version.json').technicalVersion;
function createUpdateNotifications({checker,center,getChannel,intervalMs=15*60000}) {
 let notifier,timer;
 const reconcile=()=>center.reconcileUpdates(current,getChannel());
 async function check(force=false,channel=getChannel()) {
  const release=await checker.check(force,channel);
  reconcile();
  // A channel may have changed while the network request was in flight.
  if(release.channel===getChannel()) {
   center.recordUpdate(release);
   const item=notifier&&center.claimUpdateNotification();
   if(item)try{await notifier(item);}catch{} // The durable inbox remains available.
  }
  return release;
 }
 return {check,reconcile,start(callback){notifier=callback;clearInterval(timer);timer=setInterval(()=>check().catch(()=>{}),intervalMs);timer.unref?.();return true;},stop(){clearInterval(timer);notifier=null;}};
}
module.exports={createUpdateNotifications};
