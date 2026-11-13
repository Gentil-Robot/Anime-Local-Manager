'use strict';
const copy=require('../public/update-notification-copy');
function createDesktopUpdateNotification({Notification,language,icon,open}) {
 const active=new Set();
 return async item=>{
  if(!Notification?.isSupported?.())return false;
  const lang=language(),badge=copy.text(item.prerelease?'beta':'stable',lang);
  return new Promise(resolve=>{
   const notification=new Notification({title:copy.text('available',lang,item.version)+' · '+badge,body:copy.text('open',lang),icon,silent:true});
   active.add(notification);if(active.size>64)active.delete(active.values().next().value);
   let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
   const timer=setTimeout(()=>finish(false),5000);
   notification.once('show',()=>finish(true));notification.once('failed',()=>{active.delete(notification);finish(false);});notification.once('close',()=>active.delete(notification));
   notification.on('click',()=>open());notification.show();
  });
 };
}
module.exports={createDesktopUpdateNotification};
