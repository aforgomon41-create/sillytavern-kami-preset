(() => {
  const out = {};
  out.href = location.href;
  out.hasKamiPreset = !!window.KamiPreset;
  const panel = document.querySelector('#kami-preset-panel');
  out.panelExists = !!panel;
  if (!panel) return out;
  out.panelDisplay = getComputedStyle(panel).display;
  out.panelRect = (() => { const r = panel.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })();
  out.tabs = Array.from(panel.querySelectorAll('[data-kami-tab]')).map(b => ({
    key: b.getAttribute('data-kami-tab'),
    text: (b.textContent || '').trim(),
    selected: b.getAttribute('aria-selected')
  }));
  out.chatLen = (window.__KAMI_PREVIEW_CHAT || []).length;
  out.iframeCount = document.querySelectorAll('iframe').length;
  return out;
})()