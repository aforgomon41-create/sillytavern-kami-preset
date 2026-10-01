(() => ({
  href: location.href,
  hint: (document.getElementById('hint') || {}).textContent,
  hasKamiPreset: !!window.KamiPreset,
  hasKamiSkin: !!window.KamiSkin,
  iframes: document.querySelectorAll('iframe').length,
  presetIframe: Array.from(document.querySelectorAll('iframe')).some(f => { try { return f.contentWindow && f.contentWindow.getScriptId && f.contentWindow.getScriptId() === 'presetmgr'; } catch (e) { return false; } }),
  diag: (document.getElementById('diag') || {}).textContent ? document.getElementById('diag').textContent.slice(0, 400) : '',
  readyState: document.readyState
}))()