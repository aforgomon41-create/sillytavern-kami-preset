(() => {
  const out = {};
  const panel = document.querySelector('#kami-preset-panel');
  out.panelDisplay = getComputedStyle(panel).display;
  const pane = panel.querySelector('[data-kami-pane="BOX"]');
  out.boxPaneFound = !!pane;
  out.boxPaneHidden = pane ? pane.hidden : null;
  out.boxPaneVisible = pane ? (pane.offsetParent !== null || getComputedStyle(pane).display !== 'none') : null;
  const cards = pane ? Array.from(pane.querySelectorAll('.kami-card')) : [];
  out.cardCount = cards.length;
  out.cardTitles = cards.map(c => (c.querySelector('.kami-card-title, .kami-card-head') || {}).textContent ? (c.querySelector('.kami-card-title, .kami-card-head').textContent || '').trim().slice(0, 40) : '?');
  return out;
})()