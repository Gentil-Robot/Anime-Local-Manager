'use strict';
// Reuse a recently server-verified identity only for this exact access token.
// Supabase evaluates data permissions on every query and RPC.
module.exports=function sessionAccess(client,{now=Date.now,ttl=15000}={}){
 let token=null,verified=null,expires=0,pending=null,version=0;
 const clear=()=>{version++;token=null;verified=null;expires=0;pending=null;};
 async function current(){
  if(!client)throw Error('ALM_COMMUNITY_NOT_READY');
  const result=await client.auth.getSession(),session=result.data?.session;
  if(result.error||!session){clear();throw Error('ALM_COMMUNITY_LOGIN_REQUIRED');}
  const key=session.access_token||session.user?.id;
  if(token!==key){clear();token=key;}
  if(verified&&expires>now())return verified;
  if(pending)return pending;
  const epoch=version;
  const request=client.auth.getUser().then(({data,error})=>{
   if(epoch!==version)throw Error('SESSION_EXPIRED');
   if(error||!data?.user||data.user.id!==session.user?.id){clear();throw Error('ALM_COMMUNITY_LOGIN_REQUIRED');}
   verified=data.user;expires=now()+ttl;return verified;
  }).finally(()=>{if(pending===request)pending=null;});
  pending=request;return request;
 }
 return {current,clear};
};
