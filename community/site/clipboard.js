/* A write-only desktop bridge; browser fallback remains tied to a user action. */
(() => {
  'use strict';
  async function copy(value) {
    if (typeof value !== 'string' || value.length > 100000) throw Error('INVALID_INPUT');
    if (window.animeManager?.writeClipboard) {
      await window.animeManager.writeClipboard(value);
      return true;
    }
    try { await navigator.clipboard.writeText(value); return true; } catch {}
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-10000px';
    document.body.append(field);
    field.select();
    try { return document.execCommand('copy'); } catch { return false; }
    finally { field.remove(); }
  }
  window.ALM_CLIPBOARD = {copy};
})();
