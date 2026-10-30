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
import type { Tab } from '../../../src/frontend/panels/preset-parts';
import { PresetPanel } from '../../../src/frontend/panels/preset-panel';
import { memoryApi } from './memory-api';
import { Button } from '../../../src/frontend/ds';
import { CUSTOM_STYLE_COPY } from '../../../src/scripts/_custom-style-ui.js';

const manifest = manifestJson as unknown as SkinManifest;
const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
rt.applySkin(manifest, { scheme: q.get('scheme') || 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss, assetUrls: { paper: paperUrl } });

const TABS: Tab[] = (data as unknown as { tabs: Tab[] }).tabs;

const api = memoryApi(TABS);

function App(): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开预设设置</Button></div>; }
  return <PresetPanel api={api} styleCopy={CUSTOM_STYLE_COPY as unknown as Record<string, string>} onClose={() => setOpen(false)} />;
}

rt.layer().open('preset-preview', <App />);
