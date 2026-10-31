/* Visual layer. No API calls or user-library mutations. */
(() => {
  'use strict';
  const VERSION = window.ALM_RELEASE?.technicalVersion || '2.0.0';
  const edition = () => window.ALM_RELEASE?.publicVersion || 'V2.0.0 Bêta stable';
  const storage = {
    get(key, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
  };
  const language = () => window.ALM_I18N?.getLanguage?.() || document.documentElement.lang || 'fr';
  const t = (key, args = {}) => {
    const source = window.ALM_DESIGN_COPY || {};
    const value = source[language()]?.[key] ?? source.en?.[key] ?? key;
    return String(value).replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(args,name) ? String(args[name]) : match);
  };
  const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iconPaths = {
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
    library:'M4 4h4v16H4z M10 4h4v16h-4z M16 5l4-1 3 15-4 1z',
    heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
    movie:'M3 3h18v18H3z M7 3v18 M17 3v18 M3 7h4 M3 12h4 M3 17h4 M17 7h4 M17 12h4 M17 17h4',
    play:'M5 3l16 9-16 9z',
    season:'M5 5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M8 2v5 M16 2v5 M3 10h18 M8 14h2 M14 14h2',
    news:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h3 M13 15h3 M8 18h8',
    compass:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16 8l-3 5-5 3 3-5z',
    dna:'M6 2c0 10 12 10 12 20 M18 2C18 12 6 12 6 22 M7 5h10 M9 9h6 M9 15h6 M7 19h10',
    book:'M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v15 M5 8h3 M16 8h3',
    memories:'M4 4h16v16H4z M8 9h8 M8 13h5 M10 2v4 M14 2v4 M8 17l2-2 2 2 2-2',
    shield:'M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z M8 12l3 3 5-6',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M9 2h6l1 3 3 1 3 3v6l-3 1-1 3-3 3H9l-1-3-3-1-3-3V9l3-1 1-3z',
    info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 11v6 M12 7v1',
    music:'M9 18V5l12-2v13 M9 8l12-2 M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3z M21 16a3 3 0 1 1-3-3c2 0 3 1 3 3z',
    star:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    moon:'M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13z',
    search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M15 15l6 6',
    arrow:'M5 12h14 M14 7l5 5-5 5',
    import:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    image:'M3 3h18v18H3z M3 16l6-6 4 4 3-3 5 5 M16 7h.01'
  };
  const icon = name => `<svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name] || iconPaths.compass}"/></svg>`;
  function applyText(root = document) {
    root.querySelectorAll('[data-design-text]').forEach(node => {
      const value = t(node.dataset.designText);
      node.setAttribute('data-no-i18n','');
      if (node.textContent !== value) node.textContent = value;
    });
    root.querySelectorAll('[data-design-aria]').forEach(node => node.setAttribute('aria-label',t(node.dataset.designAria)));
    root.querySelectorAll('[data-design-version]').forEach(node => {node.textContent=t('version',{version:VERSION});});
  }
  function applyPreferences() {
    const motion=storage.get('alm.visual.motion','system');
    const reduce = motion==='reduced' || (motion==='system' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.dataset.motion = reduce ? 'reduced' : 'full';
    document.documentElement.dataset.density = storage.get('alm.visual.density','comfortable')==='compact'?'compact':'comfortable';
    window.dispatchEvent(new CustomEvent('alm:motion-changed',{detail:{reduced:reduce}}));
  }
  window.ALM_DESIGN={VERSION,edition,t,icon,escape,language,storage,applyText,applyPreferences};
  window.addEventListener('alm:language-changed',()=>applyText());
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',applyPreferences);
  applyPreferences();
})();
