/**
 * 「预设设置」面板重设计预览（皮肤：碎光）第三版：第一版的信息架构（概览 + 当前生效 + 常用 + 带摘要的导航）+ 用户 8 条修改。
 * 数据**完全由解析预设本体得来**（build/frontend/preview-preset-data.mjs），这里只按「类型」渲染，不认任何分类名：
 *   概览里的「常用」= 模型页 + 所有变量卡（按类型找出来）；「当前生效」= 每个单选组的当前选项 + 当前模型。
 * PC：左侧导航 + 右侧内容；手机：页签（概览在第一个，左右滑动切换），「当前生效」压成一行横向滑动。
 * 当前模型显示在面板标题栏（第四版，用户 2026-10-28 要求；导航不再显示「N 项开启」）。
 * 只是预览：界面就是真实酒馆里用的 PresetPanel（src/frontend/panels/preset-panel.tsx），数据换成一份内存实现，开关不会写回预设。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import data from './preset-data.json';
import { initial, type State, type Tab } from '../../../src/frontend/panels/preset-parts';
import { PresetPanel, type CustomStyleRequest, type CustomStyleState, type PresetApi } from '../../../src/frontend/panels/preset-panel';
import { Button } from '../../../src/frontend/ds';
import { CUSTOM_STYLE_COPY } from '../../../src/scripts/_custom-style-ui.js';

const manifest = manifestJson as unknown as SkinManifest;
const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
rt.applySkin(manifest, { scheme: q.get('scheme') || 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss, assetUrls: { paper: paperUrl } });

const TABS: Tab[] = (data as unknown as { tabs: Tab[] }).tabs;

/** 预览用的内存实现：规则与 40 号一致（单选组打开一条时同组其它关掉；选模型 = 该模型的条目全开、其它模型的全关） */
function memoryApi(tabs: Tab[]): PresetApi {
  let st: State = initial(tabs);
  let ver = 0;
  const subs = new Set<() => void>();
  const bump = (next: State): void => { st = next; ver++; subs.forEach((f) => f()); };
  const write = tabs.find((t) => /写作指导/.test(t.name) && (t.groups || []).length);
  let styles = write ? [{ identifier: 's1', display: '冷硬派', content: '短句，少形容词；情绪藏在动作和物件里，不直接说出来。', groupName: (write.groups![1] || write.groups![0])!.name, groupHeadId: '' }] : [];
  let seq = 2;
  return {
    version: () => ver,
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    view: () => ({ ok: true, error: '', name: '预览', tabs, state: st }),
    toggle: (id, gname) => {
      const on = { ...st.on };
      const g = gname ? tabs.flatMap((t) => t.groups || []).find((x) => x.name === gname) : undefined;
      const target = !on[id];
      if (target && g && g.mode === 'one') { for (const i of g.items) { on[i.id] = false; } }
      on[id] = target;
      bump({ ...st, on });
      return { ok: true };
    },
    setVar: (k, v) => { bump({ ...st, vars: { ...st.vars, [k]: v } }); return { ok: true }; },
    selectModel: (name) => {
      const t = tabs.find((x) => x.kind === 'model');
      const m = (t?.models || []).find((x) => x.name === name);
      if (!t || !m) { return { ok: false, msg: '找不到这个模型' }; }
      const on = { ...st.on };
      for (const mm of t.models || []) { for (const i of mm.items) { on[i.id] = false; } }
      for (const i of m.items) { on[i.id] = true; }
      bump({ ...st, model: name, on });
      return { ok: true };
    },
    customStyles: (): CustomStyleState => (write ? {
      ok: true, layerName: write.name, closeOk: true,
      groups: (write.groups || []).map((g) => ({ cardName: g.name, cardMode: g.mode === 'one' ? '单选' : '任选', headIdentifier: g.name })),
      entries: styles.map((x) => ({ ...x }))
    } : { ok: false, code: 'NO_SECTION' }),
    applyCustomStyles: (req: CustomStyleRequest) => {
      styles = styles.filter((x) => !req.removes.includes(x.identifier)).map((x) => {
        const u = req.updates.find((y) => y.identifier === x.identifier);
        return u ? { ...x, display: u.display, content: u.content, groupName: u.groupHeadId } : x;
      }).concat(req.adds.map((a) => ({ identifier: 's' + (seq++), display: a.display, content: a.content, groupName: a.groupHeadId, groupHeadId: a.groupHeadId })));
      bump({ ...st });
      return Promise.resolve({ ok: true });
    }
  };
}
const api = memoryApi(TABS);

function App(): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开预设设置</Button></div>; }
  return <PresetPanel api={api} styleCopy={CUSTOM_STYLE_COPY as unknown as Record<string, string>} onClose={() => setOpen(false)} />;
}

rt.layer().open('preset-preview', <App />);
