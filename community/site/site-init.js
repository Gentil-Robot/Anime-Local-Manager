window.ALM_COMMUNITY_WEB=true;
window.showV2Page=()=>{document.getElementById('webLanding').hidden=true;document.getElementById('communityPage').classList.remove('hidden');};
window.addEventListener('DOMContentLoaded',async()=>{if(location.pathname==='/compte.html'){await window.ALM_COMMUNITY?.open();const action=new URLSearchParams(location.search).get('action');if(['signup','login'].includes(action)&&!window.ALM_COMMUNITY.snapshot()?.connected)window.ALM_COMMUNITY.auth(action);}
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="/compte.html"],a[href^="/community-charter.html"]');if(link){const url=new URL(link.href);url.searchParams.set('lang',window.ALM_DESIGN.language());link.href=url.pathname+url.search;}});
});
