/**
 * 「显示」面板预览（原皮肤管理）：真的 SkinManager + 运行库，改动立即套到面板自己身上（面板就是实时预览）。
 * 皮肤：内置「碎光」+ 两套测试皮肤（只为演示多皮肤列表，颜色故意刁钻：粉纸浅黄 / 近黑暗红）。
 * 设置存在本页 localStorage（真的皮肤脚本存酒馆助手脚本变量）。?reset=1 清掉存的设置。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import { SkinManager, type SkinEntry, type StoredSettings } from '../../../src/frontend/skin-engine/manager';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import { DisplayPanel, type DisplayPrefs } from '../../../src/frontend/panels/display-panel';
import { Button } from '../../../src/frontend/ds';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';

const KEY = 'kami-skin-preview';
const q = new URLSearchParams(location.search);
try { if (q.get('reset')) { localStorage.removeItem(KEY); } } catch (e) { /* 无痕 */ }

const TEST: SkinManifest[] = [
  { id: 'paper', name: '粉纸浅黄', version: '0.0.1', contract: '1.0', defaultScheme: 'light', author: '测试', description: '测试皮肤：粉色纸面、亮黄强调、2px 圆角、只有描边没有阴影。用来检查刁钻配色下面板仍然读得清。',
    schemes: { light: { seeds: { neutral: '#f7d6e0', accent: '#ffe066', radius: 2, elevation: 'outline' } }, dark: { seeds: { neutral: '#3a2030', accent: '#ffe066', radius: 2, elevation: 'outline' } } },
    params: [{ id: 'corner', name: '圆角', type: 'number', default: 2, min: 0, max: 16, step: 1, unit: 'px', bind: 'seed:radius', group: '形状' }] },
  { id: 'abyss', name: '近黑暗红', version: '0.0.1', contract: '1.0', defaultScheme: 'dark', author: '测试', description: '测试皮肤：近黑底、暗红强调、16px 大圆角、发光层级。',
    schemes: { dark: { seeds: { neutral: '#050505', accent: '#5a0000', radius: 16, elevation: 'glow' } }, light: { seeds: { neutral: '#fafafa', accent: '#5a0000', radius: 16, elevation: 'glow' } } } }
];
const entries: SkinEntry[] = [
  { manifest: manifestJson as unknown as SkinManifest, css: skinCss, assetUrls: { paper: paperUrl } },
  ...TEST.map((manifest) => ({ manifest }))
];

const rt = createRuntime(window);
const store = {
  load: (): unknown => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  save: (s: StoredSettings): void => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 无痕 */ } }
};
const mgr = new SkinManager(store, rt, entries, window);
mgr.apply();
(window as unknown as { __mgr: unknown; __rt: unknown }).__mgr = mgr;
(window as unknown as { __rt: unknown }).__rt = rt;

/* 非皮肤的显示设置：预览里都存本页 localStorage（真的脚本里角色名样式走 35 号的 KamiNameWrap → 酒馆全局变量） */
const ls = { get: (k: string): string | null => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k: string, v: string): boolean => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } } };
const prefs: DisplayPrefs = {
  nameWrap: {
    modes: [{ id: 'bt', label: '反引号', demo: '`角色名`' }, { id: 'ul', label: '双下划线', demo: '__角色名__' }, { id: 'none', label: '无包裹', demo: '角色名' }],
    get: () => ls.get('kami-preview-name-wrap') || 'bt', set: (id) => ls.set('kami-preview-name-wrap', id)
  },
  optionsFolded: { get: () => ls.get('kami.options.folded') === '1', set: (v) => ls.set('kami.options.folded', v ? '1' : '0') },
  optionMode: { get: () => (ls.get('kami-option-mode') === 'send' ? 'send' : 'fill'), set: (v) => ls.set('kami-option-mode', v) }
};
try { if (q.get('reset')) { ['kami-preview-name-wrap', 'kami.options.folded', 'kami-option-mode'].forEach((k) => localStorage.removeItem(k)); } } catch (e) { /* 无痕 */ }

function App(): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开显示设置</Button></div>; }
  return <DisplayPanel manager={mgr} prefs={prefs} onClose={() => setOpen(false)} />;
}
rt.layer().open('skin-preview', <App />);
