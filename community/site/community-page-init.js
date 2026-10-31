window.ALM_COMMUNITY_WEB=location.protocol==='https:';
window.ALM_DESIGN_COPY={fr:{},en:{},es:{},de:{},ja:{},'pt-BR':{},'zh-CN':{}};
try{const requested=new URLSearchParams(location.search).get('lang')||localStorage.getItem('alm.web.language')||'fr';if(['fr','en','es','de','ja','pt-BR','zh-CN'].includes(requested))document.documentElement.lang=requested;}catch{}
window.addEventListener('DOMContentLoaded',()=>{const language=document.getElementById('webLanguage');if(language){language.value=document.documentElement.lang;language.onchange=ev=>{document.documentElement.lang=ev.target.value;try{localStorage.setItem('alm.web.language',ev.target.value);}catch{}window.ALM_DESIGN.applyText();window.dispatchEvent(new Event('alm:language-changed'));};}window.ALM_DESIGN.applyText();});

window.addEventListener("alm:language-changed",()=>{document.querySelectorAll('a[href^="/privacy-policy.html"],a[href^="/legal-notice.html"]').forEach(a=>{a.href=a.pathname+"?lang="+encodeURIComponent(document.documentElement.lang);});});
