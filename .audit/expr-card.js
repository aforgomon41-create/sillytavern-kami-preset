(() => {
  const pane = document.querySelector('#kami-preset-panel [data-kami-pane="BOX"]');
  const card = pane.querySelectorAll('.kami-card')[0];
  const out = {};
  out.cardClass = card.className;
  out.headHTML = card.querySelector('.kami-card-head') ? card.querySelector('.kami-card-head').outerHTML.slice(0, 700) : null;
  const body = card.querySelector('.kami-collapse-body');
  out.bodyClass = body ? body.className : null;
  out.bodyHidden = body ? body.hidden : null;
  out.bodyDisplay = body ? getComputedStyle(body).display : null;
  out.bodyRect = body ? (() => { const r = body.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })() : null;
  out.fields = Array.from(card.querySelectorAll('.kami-field')).map(f => ({
    label: (f.querySelector('.kami-field-label') || {}).textContent || null,
    valueHTML: (f.querySelector('.kami-field-value') || {}).innerHTML ? f.querySelector('.kami-field-value').innerHTML.slice(0, 200) : null
  }));
  out.notes = Array.from(card.querySelectorAll('.kami-card-note')).map(n => ({ cls: n.className, text: (n.textContent || '').trim(), hidden: n.hidden, display: getComputedStyle(n).display }));
  return out;
})()