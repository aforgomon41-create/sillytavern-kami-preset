/**
 * 预设相关界面的共用页面组件：预设设置面板与引导共用（旧界面盘点第四节建议，用户 2026-10-28 认可）。
 * 数据结构是解析预设本体得来的（build/frontend/preview-preset-data.mjs），组件只按「类型」渲染，不认任何分类名。
 */
import * as React from 'react';
import { Badge, Button, ChoiceCard, ChoiceGrid, EntryLabel, InfoPopover, SettingSection, TextField, stripEmoji } from '../ds';

export interface Item { id: string; name: string; on: boolean; note: string }
export interface Group { name: string; mode: 'one' | 'any'; note: string; items: Item[] }
export interface VarField { kind: 'single' | 'range'; keys: string[]; values: number[] }
export interface VarCard { name: string; note: string; fields: VarField[] }
export interface Model { name: string; label: string; emoji: string; items: Item[] }
export interface Tab { id: string; kind: 'model' | 'layer'; name: string; note?: string; models?: Model[]; vars?: VarCard[]; standalone?: Item[]; groups?: Group[] }

export const plain = (name: string): string => stripEmoji(name).replace(/[[\]]/g, '').trim();
export const groupLabel = (name: string): string => name.replace(/[[\]]/g, '');

/** 状态：条目 id → 开关；变量 key → 数值；当前模型 */
export interface State { on: Record<string, boolean>; vars: Record<string, number>; model: string }
export function initial(TABS: Tab[]): State {
  const on: Record<string, boolean> = {}, vars: Record<string, number> = {};
  let model = '';
  for (const t of TABS) {
    for (const g of t.groups || []) { for (const i of g.items) { on[i.id] = i.on; } }
    for (const i of t.standalone || []) { on[i.id] = i.on; }
    for (const v of t.vars || []) { for (const f of v.fields) { f.keys.forEach((k, n) => { vars[k] = f.values[n] as number; }); } }
    if (t.models) {
      for (const m of t.models) { for (const i of m.items) { on[i.id] = i.on; } }
      /* 当前模型：开着的专属条目最多的那个 */
      const best = [...t.models].sort((a, b) => b.items.filter((i) => i.on).length - a.items.filter((i) => i.on).length)[0];
      model = best ? best.name : '';
    }
  }
  return { on, vars, model };
}

export const info = (label: string, note: string | undefined): React.ReactNode =>
  note ? <InfoPopover label={'关于「' + label + '」'}><p style={{ whiteSpace: 'pre-wrap' }}>{note}</p></InfoPopover> : undefined;

export type Act = { toggle: (g: Group | null, item: Item) => void; setVar: (k: string, v: number) => void; setModel: (m: Model) => void };

export function GroupCards({ g, st, act }: { g: Group; st: State; act: Act }): React.JSX.Element {
  const [all, setAll] = React.useState(false);
  const LIMIT = 8;
  const shown = all ? g.items : g.items.slice(0, LIMIT);
  return (
    <SettingSection title={<EntryLabel name={groupLabel(g.name)} />} badge={<Badge>{g.mode === 'one' ? '单选' : '多选'}</Badge>}
      aside={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        {g.items.length > LIMIT ? <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? '收起' : '全部 ' + g.items.length + ' 项'}</Button> : null}
        {info(plain(g.name), g.note)}
      </span>}>
      <ChoiceGrid>
        {shown.map((i) => <ChoiceCard key={i.id} multi={g.mode === 'any'} title={<EntryLabel name={i.name} />} selected={!!st.on[i.id]}
          onSelect={() => act.toggle(g, i)} info={info(plain(i.name), i.note)} />)}
      </ChoiceGrid>
    </SettingSection>
  );
}

export function ModelPicker({ t, st, act, withItems }: { t: Tab; st: State; act: Act; withItems: boolean }): React.JSX.Element {
  const cur = (t.models || []).find((m) => m.name === st.model);
  return (
    <>
      <SettingSection title={<EntryLabel name={t.name} />} badge={<Badge>单选</Badge>} aside={info('模型切换', t.note)}>
        <ChoiceGrid>
          {(t.models || []).map((m) => <ChoiceCard key={m.name} title={<EntryLabel name={m.name} />} selected={m.name === st.model} onSelect={() => act.setModel(m)} />)}
        </ChoiceGrid>
      </SettingSection>
      {withItems && cur ? (
        <SettingSection title={<EntryLabel name={cur.emoji + ' ' + cur.label + ' 专属条目'} />} badge={<Badge>多选</Badge>}>
          <ChoiceGrid>
            {cur.items.map((i) => <ChoiceCard key={i.id} multi title={<EntryLabel name={i.name} />} selected={!!st.on[i.id]} onSelect={() => act.toggle(null, i)} info={info(plain(i.name), i.note)} />)}
          </ChoiceGrid>
        </SettingSection>
      ) : null}
    </>
  );
}

export function VarFields({ v, st, act }: { v: VarCard; st: State; act: Act }): React.JSX.Element {
  return (
    <SettingSection title={<EntryLabel name={v.name} />} aside={info(plain(v.name), v.note)}>
      {v.fields.map((f) => (
        <div key={f.keys.join()} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {f.keys.map((k, n) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {f.kind === 'range' ? <span style={{ color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{n === 0 ? '最少' : '最多'}</span> : null}
              <span style={{ width: 112 }}><TextField type="number" inputMode="numeric" value={String(st.vars[k] ?? '')} onChange={(e) => act.setVar(k, Number(e.target.value))} aria-label={plain(v.name) + (f.kind === 'range' ? (n === 0 ? ' 最少' : ' 最多') : '')} /></span>
              {f.kind === 'range' && n === 0 ? <span aria-hidden="true">–</span> : null}
            </label>
          ))}
        </div>
      ))}
    </SettingSection>
  );
}
