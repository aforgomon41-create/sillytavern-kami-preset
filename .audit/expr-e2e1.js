(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const chat = window.__KAMI_PREVIEW_CHAT;
  const seedBefore = chat[0].message;
  const BAD = '<foo>甲<content>乙';
  chat[0].message = BAD;
  const injected = chat[0].message;
  const handlers = STATE.handlers.get('message_received');
  const emitted = STATE.emit('message_received', 0);
  await wait(900);
  // 脚本 iframe 里的变量读数（覆盖模式/档位是否落盘）
  let vars = null;
  for (const f of document.querySelectorAll('iframe')) {
    try {
      if (f.contentWindow && f.contentWindow.getScriptId && f.contentWindow.getScriptId() === 'presetmgr') {
        vars = JSON.parse(JSON.stringify(f.contentWindow.__scriptVars));
        break;
      }
    } catch (e) {}
  }
  const tagfixVars = vars ? Object.keys(vars).filter(k => k.indexOf('tagfix') >= 0).reduce((o, k) => (o[k] = vars[k], o), {}) : null;
  return {
    handlerCount: handlers ? handlers.size : 0,
    emitted,
    seedBefore,
    injected,
    after: chat[0].message,
    changed: chat[0].message !== injected,
    tagfixVars
  };
})()