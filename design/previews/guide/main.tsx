/**
 * 「引导」重设计预览（皮肤：碎光）。旧引导 15 步，其中 7 步是把预设设置各页签再走一遍（旧界面盘点第二节第 5 条）；
 * 新引导只留**第一次必须决定**的 6 步，其余让用户之后在面板里调：
 *   免责声明 → 外观（皮肤）→ 模型 → 语言与数值 → 长文压缩与防截断 → 完成
 * 页面组件与预设设置面板、皮肤管理面板共用（src/frontend/panels/），数据同样来自解析预设本体；文案来自 design/copy/guide-copy.json。
 * 免责声明正文现读预设里的免责条目（guide-data.json 由 build/frontend/preview-preset-data.mjs 生成），确认之前不能往后走。
 * 电脑：左侧步骤列表（走过的步骤可以点回去）；手机：顶部进度条。
 * 界面就是真实酒馆里用的 GuidePanel（src/frontend/panels/guide-panel.tsx）；预览里预设换成内存实现，压缩 / 防截断是本页内存里的开关。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import { SkinManager, type StoredSettings } from '../../../src/frontend/skin-engine/manager';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import data from '../preset-panel/preset-data.json';
import guideData from './guide-data.json';
import type { Tab } from '../../../src/frontend/panels/preset-parts';
import { GuidePanel } from '../../../src/frontend/panels/guide-panel';
import type { Live } from '../../../src/frontend/panels/toolbox-types';
import { memoryApi } from '../preset-panel/memory-api';
import { Button } from '../../../src/frontend/ds';

const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
const KEY = 'kami-guide-preview-skin';
try { if (q.get('reset')) { localStorage.removeItem(KEY); } } catch (e) { /* 无痕 */ }
const mgr = new SkinManager({
  load: (): unknown => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  save: (s: StoredSettings): void => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 无痕 */ } }
}, rt, [
  { manifest: manifestJson as unknown as SkinManifest, css: skinCss, assetUrls: { paper: paperUrl } },
  { manifest: { id: 'paper', name: '粉纸浅黄', version: '0.0.1', contract: '1.0', defaultScheme: 'light', description: '测试皮肤',
    schemes: { light: { seeds: { neutral: '#f7d6e0', accent: '#ffe066', radius: 2, elevation: 'outline' } }, dark: { seeds: { neutral: '#3a2030', accent: '#ffe066', radius: 2, elevation: 'outline' } } } } }
], window);
mgr.apply();
(window as unknown as { __mgr: unknown }).__mgr = mgr;

const TABS: Tab[] = (data as unknown as { tabs: Tab[] }).tabs;
const preset = memoryApi(TABS);

/* 压缩 / 防截断：预览里就是本页内存里的两三个开关 */
const ext = { roll: false, grand: true, anti: false };
let extVer = 0;
const extSubs = new Set<() => void>();
const bumpExt = (): void => { extVer++; extSubs.forEach((f) => f()); };
const extLive: Live = { version: () => extVer, subscribe: (fn) => { extSubs.add(fn); return () => { extSubs.delete(fn); }; } };

function App(): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  const [note, setNote] = React.useState('');
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开引导</Button>{note ? <span style={{ marginLeft: 8 }}>{note}</span> : null}</div>; }
  return (
    <GuidePanel disclaimer={guideData.disclaimer} preset={preset} skins={mgr} live={[extLive]} initialStep={Number(q.get('step') || 0)}
      long={{
        compress: { get: () => ({ roll: ext.roll, grand: ext.grand }), setRoll: (v) => { ext.roll = v; bumpExt(); }, setGrand: (v) => { ext.grand = v; bumpExt(); }, open: () => setNote('（预览）这里会打开工具箱的「压缩」页') },
        antitrunc: { get: () => ext.anti, set: (v) => { ext.anti = v; bumpExt(); } }
      }}
      onClose={(done) => { setNote(done ? '已完成引导' : ''); setOpen(false); }} />
  );
}

rt.layer().open('guide-preview', <App />);
