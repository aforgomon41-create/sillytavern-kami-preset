(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const chat = window.__KAMI_PREVIEW_CHAT;
  const out = [];
  for (const bad of ['<div>甲<br>乙<content>丙', '<br>甲<span>乙']) {
    chat[0].message = bad;
    const emitted = STATE.emit('message_received', 0);
    await wait(700);
    out.push({ injected: bad, emitted, after: chat[0].message });
  }
  const card = document.querySelector('#kami-preset-panel [data-kami-pane="BOX"] .kami-card');
  return { cases: out, chip: card.querySelector('.kami-chip').textContent, switchChecked: card.querySelector('[data-kami-tagfix-all]').checked };
})()