import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

/* ============================================================
 * 第一部分：通用变量结构（测试版：仅日期；后续替换为正式结构）
 * ============================================================ */
export const Schema = z.object({
  日期: z.string().describe('当前日期，格式如 2026年9月3日 星期四'),
});

// 默认初始值：角色卡开场白没有 <initvar> 块时使用（动态生成今天的日期）
function getDefaultStatData() {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const dateText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${week}`;
  return { 日期: dateText };
}

/* ============================================================
 * 第二部分：注册 zod（保持官方模板写法）
 * ============================================================ */
$(() => {
  console.info('[MVU通用预设] 脚本已加载，正在注册 schema 并启动引导…');
  registerMvuSchema(Schema);
  bootstrapPreset().catch(e => console.error('[MVU通用预设] 引导脚本启动失败', e));
});

/* ============================================================
 * 第三部分：通用初始化引导（不依赖世界书 [initvar]）
 *
 * 注意：玩家的“使用/不使用”决策绑定在【聊天会话】上，
 * 而不是角色卡上 —— 同一角色卡的不同会话可以独立选择。
 *
 * 决策保存在酒馆助手的【聊天变量】里（type: 'chat'），
 * 随聊天存档持久化；云酒馆跨设备/跨浏览器也能保持一致。
 * ============================================================ */

// 会话决策变量名（v3：改用聊天变量存储，旧 localStorage 记录作废）
const DECISION_VARIABLE = 'mvu_preset_decision_v3';

let started = false;      // 防止重复初始化引导
let asking = false;       // 弹窗互斥锁
let evaluating = false;   // 是否正在评估中（防止多个触发点并发导致重复弹窗）
let evaluatedChat = null; // 当前会话中已经评估过的聊天 id

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getChatId() {
  try { return String(SillyTavern.getCurrentChatId?.() ?? ''); }
  catch { return ''; }
}

// 读取/写入会话决策（酒馆助手聊天变量 API，随聊天文件保存）
async function getDecision() {
  try {
    const vars = await getVariables({ type: 'chat' });
    return vars?.[DECISION_VARIABLE] ?? null;
  } catch (e) {
    console.warn('[MVU通用预设] 读取会话决策变量失败', e);
    return null;
  }
}

async function setDecision(value) {
  try {
    await updateVariablesWith(vars => {
      if (value === null || value === undefined) {
        delete vars[DECISION_VARIABLE];
      } else {
        vars[DECISION_VARIABLE] = value;
      }
      return vars;
    }, { type: 'chat' });
    return true;
  } catch (e) {
    console.warn('[MVU通用预设] 写入会话决策变量失败', e);
    return false;
  }
}

async function getEnabledLorebooks() {
  const list = [];
  try {
    const ls = await getLorebookSettings();
    list.push(...(ls.selected_global_lorebooks || []));
    const cl = await getCharLorebooks();
    if (cl?.primary) list.push(cl.primary);
    if (cl?.additional) list.push(...cl.additional);
  } catch (e) {
    console.warn('[MVU通用预设] 获取世界书列表失败', e);
  }
  return list;
}

// 判断一个消息变量对象是否“已经有变量数据”
function hasVariableData(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.stat_data && Object.keys(d.stat_data).length > 0) return true;
  if (d.initialized_lorebooks && Object.keys(d.initialized_lorebooks).length > 0) return true;
  return false;
}

// 是否已经初始化（第 0 楼 swipes_data 或最近几楼的 variables）
async function isInitialized() {
  try {
    const msg0 = (await getChatMessages(0, { include_swipes: true }))[0];
    if (msg0) {
      for (const d of (msg0.swipes_data || [])) if (hasVariableData(d)) return true;
      for (const d of Object.values(msg0.variables || {})) if (hasVariableData(d)) return true;
    }
    const chat = SillyTavern.chat || [];
    for (let i = Math.max(0, chat.length - 3); i < chat.length; i++) {
      const m = chat[i];
      for (const d of Object.values(m?.variables || {})) if (hasVariableData(d)) return true;
    }
  } catch (e) {
    console.warn('[MVU通用预设] 检查初始化状态失败', e);
  }
  return false;
}

// 该角色卡是否“疑似自带 MVU 变量结构”（世界书标记 / 开场白标记）
async function looksLikeMvuCard() {
  try {
    for (const bookId of await getEnabledLorebooks()) {
      try {
        const entries = await getLorebookEntries(bookId);
        if (entries.some(en => /\[initvar\]|\[mvu_update\]|\[mvu_plot\]/i.test(en.comment || ''))) return true;
      } catch { /* 单本世界书失败不影响判断 */ }
    }
    const msg0 = (await getChatMessages(0, { include_swipes: true }))[0];
    if (msg0) {
      const texts = [msg0.message, ...(msg0.swipes || [])].filter(Boolean);
      if (texts.some(t => /<initvar>|_\.set\(|<UpdateVariable>|<json_?patch>/i.test(t))) return true;
    }
  } catch (e) {
    console.warn('[MVU通用预设] 检测角色卡变量结构失败', e);
  }
  return false;
}

// 解析 <initvar> 块内容（支持 YAML/JSON，含宏替换）
function parseContent(text) {
  let content = text;
  try { if (typeof substitudeMacros === 'function') content = substitudeMacros(content); } catch { /* 忽略 */ }
  try { return YAML.parse(content) || {}; } catch { /* fallthrough */ }
  try { return JSON.parse(content) || {}; } catch { return {}; }
}

// 简易深合并（用于多个 <initvar> 块叠加）
function deepMerge(target, source) {
  for (const key of Object.keys(source || {})) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], sv);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

// 构造 MVU 数据对象；initialized_lorebooks 预填所有世界书，
// 防止 MVU 原生 initCheck 之后又用世界书 [initvar] 覆盖我们写入的数据
async function createMvuData(statData) {
  const lorebooks = await getEnabledLorebooks();
  const initialized_lorebooks = {};
  for (const id of lorebooks) initialized_lorebooks[id] = [];
  return {
    display_data: {},
    initialized_lorebooks,
    stat_data: statData || {},
    delta_data: {},
    schema: { type: 'object', properties: {} },
  };
}

// 执行“使用预设通用变量结构”的初始化
async function doInit() {
  // 弹窗期间 MVU 可能刚好完成初始化，先再确认一次
  if (await isInitialized()) return true;

  const msg0 = (await getChatMessages(0, { include_swipes: true }))[0];
  if (!msg0 || !Array.isArray(msg0.swipes) || msg0.swipes.length === 0) {
    console.warn('[MVU通用预设] 找不到第 0 楼开场白，无法初始化');
    return false;
  }

  const swipes_data = await Promise.all(msg0.swipes.map(async (swipeText, index) => {
    // 1) 如果开场白自带 <initvar> 块，以块内容为基准
    let statData = {};
    const re = /<(initvar)>(?:\s*```.*)?([\s\S]*?)(?:```\s*)?<\/\1>/gim;
    let found = false;
    for (const m of swipeText.matchAll(re)) {
      try {
        deepMerge(statData, parseContent(m[2]));
        found = true;
      } catch (e) {
        console.error('[MVU通用预设] 解析 <initvar> 块失败', e);
      }
    }
    // 2) 没有块时使用通用默认值（测试版：今天的日期）
    if (!found || Object.keys(statData).length === 0) {
      statData = getDefaultStatData();
    }

    const currentData = await createMvuData(statData);

    // 3) 让 mvu_zod 对这份数据做 schema 校验 / 补 prefault
    await eventEmit('mag_variable_initialized', currentData, index);

    // 4) 处理开场白里可能存在的 _.set / JSON Patch 更新命令（对齐 MVU 原生行为）
    try {
      const parsed = await Mvu.parseMessage(swipeText, currentData);
      if (parsed) Object.assign(currentData, parsed);
    } catch (e) {
      console.warn('[MVU通用预设] 解析开场白更新命令失败', e);
    }
    return currentData;
  }));

  await setChatMessages([{ message_id: 0, swipes_data }]);
  console.info('[MVU通用预设] 已用预设通用变量结构完成初始化');
  return true;
}

async function doInitSafe() {
  try { return await doInit(); }
  catch (e) { console.error('[MVU通用预设] 初始化失败', e); return false; }
}

/* ------------------------------------------------------------
 * 玩家确认弹窗：使用酒馆助手/SillyTavern 的 UI，而不是原生 confirm
 * （原生 confirm 在沙箱 iframe 里会被静默拦截，返回 false）
 * ------------------------------------------------------------ */
async function askConfirm(message, okText = '在本会话使用', cancelText = '本会话不使用') {
  try {
    if (typeof SillyTavern?.callGenericPopup === 'function' && SillyTavern.POPUP_TYPE?.CONFIRM) {
      const result = await SillyTavern.callGenericPopup(
        message,
        SillyTavern.POPUP_TYPE.CONFIRM,
        '',
        { okButton: okText, cancelButton: cancelText }
      );
      // 兼容不同版本：AFFIRMATIVE 枚举 / true / 'ok'
      const affirmative = SillyTavern.POPUP_RESULT?.AFFIRMATIVE;
      return result === affirmative || result === true || result === 'ok';
    }
  } catch (e) {
    console.warn('[MVU通用预设] 酒馆助手弹窗失败，尝试原生 confirm 兜底', e);
  }
  try {
    return confirm(message); // 兜底，沙箱环境可能直接返回 false
  } catch {
    return false;
  }
}

// 核心评估：在合适的时机决定“不干预 / 自动初始化 / 弹窗询问”
async function maybeAsk() {
  // 同一时间只允许一个评估流程（轮询/切聊天/发消息可能同时触发，避免重复弹窗）
  if (evaluating) return;
  evaluating = true;
  try {
    await doMaybeAsk();
  } finally {
    evaluating = false;
  }
}

async function doMaybeAsk() {
  if (asking) return;
  const chatIdAtStart = getChatId();
  if (!chatIdAtStart || evaluatedChat === chatIdAtStart) return;

  // 关键：等 MVU 自己的 initCheck 跑完（读世界书是异步的），避免误判自带卡
  await sleep(1500);
  if (chatIdAtStart !== getChatId()) return; // 用户已经切走
  if ($('#chat > .welcomePanel').length > 0) return; // 欢迎面板阶段不打扰，等真正开始
  if (!SillyTavern.chat || SillyTavern.chat.length === 0) return;

  // 等待期间可能已有另一个评估流程完成，二次确认防止重复弹窗
  if (evaluatedChat === chatIdAtStart) return;

  // ① 已经初始化：角色卡自带变量结构（或本会话已处理过），预设不介入
  if (await isInitialized()) {
    console.info('[MVU通用预设] 检测到变量已初始化，预设不介入');
    evaluatedChat = chatIdAtStart;
    return;
  }

  const decision = await getDecision();

  // ② 本会话之前点过“不使用”
  if (decision === 'no') {
    console.info('[MVU通用预设] 本会话此前已选择“不使用”，跳过');
    evaluatedChat = chatIdAtStart;
    return;
  }

  // ③ 疑似角色卡自带 MVU 变量结构 → 交给角色卡自己，预设不介入
  if (await looksLikeMvuCard()) {
    console.info('[MVU通用预设] 检测到角色卡疑似自带 MVU 变量结构，不干预');
    evaluatedChat = chatIdAtStart;
    return;
  }

  // ④ 本会话之前点过“使用” → 静默自动初始化
  if (decision === 'yes') {
    console.info('[MVU通用预设] 本会话此前已选择“使用”，自动初始化');
    if (await doInitSafe()) evaluatedChat = chatIdAtStart;
    return;
  }

  // ⑤ 首次遇到：用酒馆助手弹窗询问
  asking = true;
  let usePreset = false;
  try {
    console.info('[MVU通用预设] 首次检测到未初始化，弹出询问');
    usePreset = await askConfirm(
      '检测到当前会话没有初始化 MVU 变量。\n\n' +
      '是否在本会话中使用「预设通用变量结构」？\n\n' +
      '· 确定：仅本会话启用（本会话之后自动初始化，不再询问）\n' +
      '· 取消：本会话不使用变量结构（本会话之后不再询问）\n\n' +
      '提示：选择只影响当前会话，同一角色卡的其它会话可单独选择。'
    );
  } catch (e) {
    console.error('[MVU通用预设] 询问失败', e);
  }
  asking = false;

  if (usePreset) {
    console.info('[MVU通用预设] 玩家选择：本会话使用预设变量结构');
    await setDecision('yes');
    if (await doInitSafe()) evaluatedChat = chatIdAtStart;
  } else {
    console.info('[MVU通用预设] 玩家选择：本会话不使用变量结构');
    await setDecision('no');
    evaluatedChat = chatIdAtStart;
  }
}

// 引导入口：等待 MVU 就绪，注册事件 + 轮询兜底
async function bootstrapPreset() {
  if (started) return;
  started = true;

  console.info('[MVU通用预设] 正在等待 MVU 就绪…');
  try {
    await waitGlobalInitialized('Mvu');
  } catch (e) {
    console.error('[MVU通用预设] 等待 MVU 初始化超时', e);
    started = false;
    return;
  }
  console.info('[MVU通用预设] MVU 已就绪，注册事件监听');

  const safeEval = () => maybeAsk().catch(e => console.error('[MVU通用预设] 评估失败', e));

  // 切换聊天：重置评估状态，稍等 MVU 的 initCheck 后评估
  if (typeof tavern_events !== 'undefined') {
    eventOn(tavern_events.CHAT_CHANGED, () => {
      evaluatedChat = null;
      console.info('[MVU通用预设] 聊天已切换，准备评估');
      setTimeout(safeEval, 300);
    });
    // 发送消息（欢迎面板刚消失时 MVU 可能因时序错过初始化，这里兜底）
    eventOn(tavern_events.MESSAGE_SENT, () => setTimeout(safeEval, 200));
    eventOn(tavern_events.GENERATION_STARTED, () => setTimeout(safeEval, 200));
  }

  // 轮询兜底：修复“开启时没初始化”（等聊天数据就绪、欢迎面板消失）
  let ticks = 0;
  const timer = setInterval(async () => {
    try {
      if (++ticks > 75) { clearInterval(timer); return; } // 最多约 60 秒
      const cid = getChatId();
      if (!cid || !SillyTavern.chat || SillyTavern.chat.length === 0) return;
      if ($('#chat > .welcomePanel').length > 0) return; // 欢迎面板阶段继续等
      clearInterval(timer);
      console.info('[MVU通用预设] 聊天数据已就绪，开始首次评估');
      await maybeAsk().catch(e => console.error('[MVU通用预设] 评估失败', e));
    } catch (e) {
      console.warn('[MVU通用预设] 轮询异常', e);
    }
  }, 800);
}
