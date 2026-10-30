/**
 * 预览用的 PresetApi 内存实现（预设设置预览与引导预览共用）：规则与 40 号一致——
 * 单选组打开一条时同组其它关掉；选模型 = 该模型的条目全开、其它模型的全关。不会写回任何东西。
 */
import { initial, type State, type Tab } from '../../../src/frontend/panels/preset-parts';
import type { CustomStyleRequest, CustomStyleState, PresetApi } from '../../../src/frontend/panels/preset-panel';

export function memoryApi(tabs: Tab[]): PresetApi {
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
