(() => {
  const pane = document.querySelector('#kami-preset-panel [data-kami-pane="BOX"]');
  const card = pane.querySelectorAll('.kami-card')[0];
  const body = card.querySelector('.kami-collapse-body');
  const rowAll = Array.from(card.querySelectorAll('.kami-field')).find(f => (f.querySelector('.kami-field-label')||{}).textContent === '覆盖模式');
  const sw = rowAll.querySelector('.kami-switch-input');
  const rr = rowAll.getBoundingClientRect(), sr = sw.getBoundingClientRect();
  // 「它下面那行说明文字」：覆盖模式那一行之后紧邻的 .kami-card-note
  let next = rowAll.nextElementSibling;
  const noteAfter = next && next.classList.contains('kami-card-note') ? next : null;
  const chip = card.querySelector('.kami-chip');
  return {
    bodyDisplay: getComputedStyle(body).display,
    bodyHeight: Math.round(body.getBoundingClientRect().height),
    rowLabel: (rowAll.querySelector('.kami-field-label')||{}).textContent,
    rowRect: { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height) },
    switchClass: sw.className,
    switchType: sw.type,
    switchAttrAll: sw.getAttribute('data-kami-tagfix-all'),
    switchAriaLabel: sw.getAttribute('aria-label'),
    switchChecked: sw.checked,
    switchVisible: sr.width > 0 && sr.height > 0,
    switchRect: { w: Math.round(sr.width), h: Math.round(sr.height) },
    switchInValueColumn: !!(rowAll.querySelector('.kami-field-value') && rowAll.querySelector('.kami-field-value').contains(sw)),
    noteAfterIsCardNote: !!noteAfter,
    noteAfterText: noteAfter ? noteAfter.textContent : null,
    chipText: chip ? chip.textContent : null,
    modeButtons: Array.from(card.querySelectorAll('[data-kami-tagfix]')).map(b => ({ id: b.getAttribute('data-kami-tagfix'), label: b.textContent, on: b.classList.contains('is-on'), aria: b.getAttribute('aria-pressed') }))
  };
})()