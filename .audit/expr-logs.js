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
  chat[0].message = '<foo>甲<content>乙';
  const emitted = STATE.emit('message_received', 0);
  await wait(900);
  w.console.log = orig;
  return { emitted, after: chat[0].message, logs: cap };
})()