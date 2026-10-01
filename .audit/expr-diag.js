(() => {
  const out = {};
  let w = null;
  for (const f of document.querySelectorAll('iframe')) {
    try { if (f.contentWindow && f.contentWindow.getScriptId && f.contentWindow.getScriptId() === 'presetmgr') { w = f.contentWindow; break; } } catch (e) {}
  }
  out.foundIframe = !!w;
  if (!w) return out;
  out.typeofs = {};
  ['getChatMessages','setChatMessages','repairTags','eventOn','tavern_events','replaceVariables','getVariables','specsWithCustom','parseCustomTags'].forEach(k => { try { out.typeofs[k] = typeof w[k]; } catch (e) { out.typeofs[k] = 'err'; } });
  try { out.vars = JSON.parse(JSON.stringify(w.getVariables({ type: 'script' }) || {})); } catch (e) { out.varsErr = String(e); }
  try { out.chat0 = w.getChatMessages('0'); } catch (e) { out.chatErr = String(e); }
  try { out.repairCoverOnEmptyRegistry = w.repairTags('<foo>甲<content>乙', 'close', [], true); } catch (e) { out.errOn = String(e); }
  try { out.repairCoverOffEmptyRegistry = w.repairTags('<foo>甲<content>乙', 'close', [], false); } catch (e) { out.errOff = String(e); }
  const card = document.querySelector('#kami-preset-panel [data-kami-pane="BOX"] .kami-card');
  out.statNote = Array.from(card.querySelectorAll('.kami-card-note')).map(n => n.textContent).find(t => t.indexOf('本次会话') >= 0) || null;
  out.chip = (card.querySelector('.kami-chip') || {}).textContent;
  return out;
})()