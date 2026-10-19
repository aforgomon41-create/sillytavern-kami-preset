/* 酒馆活设置与预设文件的字段名不同。更新和脚本整理共用，保留文件中的扩展字段。 */
function completionPresetAliases() {
  return {
    temp_openai: 'temperature', freq_pen_openai: 'frequency_penalty', pres_pen_openai: 'presence_penalty',
    top_p_openai: 'top_p', top_k_openai: 'top_k', top_a_openai: 'top_a', min_p_openai: 'min_p',
    repetition_penalty_openai: 'repetition_penalty'
  };
}
export function snapshotCompletionPreset(settings, stored) {
  var copy = function (value) { return JSON.parse(JSON.stringify(value)); };
  var raw = copy(stored || {}), live = copy(settings || {}), key;
  for (key in live) { if (Object.prototype.hasOwnProperty.call(live, key)) { raw[key] = live[key]; } }
  /* 对应酒馆 openai.js 的 settingsToUpdate：其余预设字段与活设置同名。 */
  var aliases = completionPresetAliases();
  for (key in aliases) {
    if (Object.prototype.hasOwnProperty.call(live, key)) { raw[aliases[key]] = live[key]; }
    delete raw[key];
  }
  var storedExt = (stored && stored.extensions) || {}, ext = raw.extensions || {}, helper = ext.tavern_helper || {};
  for (key in storedExt) { if (!Object.prototype.hasOwnProperty.call(ext, key)) { ext[key] = copy(storedExt[key]); } }
  var storedHelper = storedExt.tavern_helper || {};
  for (key in storedHelper) { if (!Object.prototype.hasOwnProperty.call(helper, key)) { helper[key] = copy(storedHelper[key]); } }
  if (Object.prototype.hasOwnProperty.call(ext, 'tavern_helper')) { ext.tavern_helper = helper; }
  if (Object.keys(ext).length || Object.prototype.hasOwnProperty.call(raw, 'extensions')) { raw.extensions = ext; }
  return raw;
}

/* 继承结果交回面板写活设置时，补齐宿主实际使用的字段；保留原字段供旧接口读取。 */
export function completionPresetForLive(preset, settings) {
  var raw = JSON.parse(JSON.stringify(preset)), aliases = completionPresetAliases();
  for (var key in aliases) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, key) && Object.prototype.hasOwnProperty.call(raw, aliases[key])) { raw[key] = raw[aliases[key]]; }
  }
  return raw;
}
