'use strict';
(() => {
  const messages = {
    fr: ['Prototype de secours · profil séparé · hors ligne', 'Tester le catalogue expérimental'],
    en: ['Rescue prototype · separate profile · offline', 'Try the experimental catalogue'],
    ja: ['代替版プロトタイプ · 専用プロファイル · オフライン', '実験用カタログを試す'],
    es: ['Prototipo alternativo · perfil separado · sin conexión', 'Probar el catálogo experimental'],
    de: ['Ersatz-Prototyp · eigenes Profil · offline', 'Experimentellen Katalog testen'],
    'pt-BR': ['Protótipo alternativo · perfil separado · offline', 'Testar o catálogo experimental'],
    'zh-CN': ['备用原型 · 独立配置 · 离线', '试用实验目录']
  };
  const banner = document.createElement('div');
  banner.className = 'rescue-notice';
  banner.setAttribute('role', 'note');
  const label = document.createElement('span');
  const link = document.createElement('a');
  link.href = '/catalogue-independant.html';
  banner.append(label, link);
  document.body.prepend(banner);
  function update() {
    const lang = document.documentElement.lang;
    const copy = messages[lang] || messages[lang.split('-')[0]] || messages.en;
    label.textContent = copy[0]; link.textContent = copy[1];
    document.title = 'ALM · ' + copy[0];
  }
  update();
  new MutationObserver(update).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
})();
