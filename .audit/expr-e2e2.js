(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let w = null;
  for (const f of document.querySelectorAll('iframe')) {
    try { if (f.contentWindow && f.contentWindow.getScriptId && f.contentWindow.getScriptId() === 'presetmgr') { w = f.contentWindow; break; } } catch (e) {}
  }
  const cap = [];
  const orig = w.console.log;
  w.console.log = function (...a) { cap.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); return orig.apply(w.console, a); };
  const chat = window.__KAMI_PREVIEW_CHAT;
  const BAD = '<foo>甲<content>乙';
  chat[0].message = BAD;
  const emitted = STATE.emit('message_received', 0);
  await wait(900);
  w.console.log = orig;
  const vars = JSON.parse(JSON.stringify(w.getVariables({ type: 'script' }) || {}));
  const pr = vars['kami-preset'] || {};
  return {
    emitted,
    injected: BAD,
    after: chat[0].message,
    changed: chat[0].message !== BAD,
    savedVars: { tagFix: pr.tagFix, tagFixAll: pr.tagFixAll },
    scriptLogs: cap,
    statNote: (() => {
      const card = document.querySelector('#kami-preset-panel [data-kami-pane="BOX"] .kami-card');
      return Array.from(card.querySelectorAll('.kami-card-note')).map(n => n.textContent).find(t => t.indexOf('本次会话') >= 0) || null;
    })()
  };
})()