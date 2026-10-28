/**
 * 「碎光」示范皮肤预览：静态质感、碎裂溢光动效、PC / 手机两种适配、帧率实测。
 * 构建：node build/frontend/build-preview.mjs → design/previews/suiguang/preview.js
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import {
  Badge, Button, Card, Checkbox, ChoiceCard, CollapseCard, Dialog, Field, Panel, Select, Surface, Switch, Tabs, TextArea, TextField, Tooltip
} from '../../../src/frontend/ds';

const manifest = manifestJson as unknown as SkinManifest;
const rt = createRuntime(window);
type Mode = 'light' | 'dark'; type Motion = 'full' | 'calm' | 'off';

function useSkin() {
  const [scheme, setScheme] = React.useState<Mode>(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [motion, setMotion] = React.useState<Motion>('full');
  const [effects, setEffects] = React.useState<string[]>(['fracture', 'paper', 'seal']);
  const [params, setParams] = React.useState<Record<string, number>>({ glow: 0.7, shard: 6, corner: 6 });
  React.useLayoutEffect(() => {
    rt.applySkin(manifest, { scheme, motion, density: 'cozy', fontScale: 1, effects, params }, { skinCss, assetUrls: { paper: paperUrl } });
  }, [scheme, motion, effects, params]);
  return { scheme, setScheme, motion, setMotion, effects, setEffects, params, setParams };
}

/** 帧率实测：最近一秒的帧数与最长一帧 */
function Fps(): React.JSX.Element {
  const [s, setS] = React.useState({ fps: 0, worst: 0 });
  React.useEffect(() => {
    let raf = 0, last = performance.now(), frames = 0, worst = 0, t0 = last;
    const tick = (now: number): void => { frames++; worst = Math.max(worst, now - last); last = now; if (now - t0 >= 1000) { setS({ fps: frames, worst: Math.round(worst) }); frames = 0; worst = 0; t0 = now; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <Badge tone={s.worst > 50 ? 'warning' : 'success'}>{s.fps} 帧/秒 · 最长 {s.worst}ms</Badge>;
}

function Controls({ sk }: { sk: ReturnType<typeof useSkin> }): React.JSX.Element {
  const toggle = (id: string, on: boolean): void => sk.setEffects((e) => (on ? [...e, id] : e.filter((x) => x !== id)));
  return (
    <Card title="预览设置" meta={<Fps />}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="配色" layout="inline">
          <Select aria-label="配色" value={sk.scheme} onValueChange={(v) => sk.setScheme(v as Mode)} options={[{ value: 'light', label: '宣纸（浅）' }, { value: 'dark', label: '墨（深）' }]} />
        </Field>
        <Field label="动效" layout="inline" hint="平静：只留溢光；关闭：不播任何动效">
          <Select aria-label="动效" value={sk.motion} onValueChange={(v) => sk.setMotion(v as Motion)} options={[{ value: 'full', label: '完整' }, { value: 'calm', label: '平静' }, { value: 'off', label: '关闭' }]} />
        </Field>
        {(manifest.effects || []).map((f) => (
          <Field key={f.id} label={f.name} layout="inline" hint={f.description}>
            <Switch checked={sk.effects.includes(f.id)} onCheckedChange={(v) => toggle(f.id, v)} />
          </Field>
        ))}
        {[['glow', '溢光强度', 0.2, 1, 0.05], ['shard', '碎块大小', 3, 12, 1], ['corner', '圆角', 0, 12, 1]].map(([id, name, min, max, step]) => (
          <Field key={id as string} label={(name as string) + '：' + sk.params[id as string]} layout="inline">
            <input type="range" min={min as number} max={max as number} step={step as number} value={sk.params[id as string]} aria-label={name as string}
              onChange={(e) => sk.setParams((p) => ({ ...p, [id as string]: Number(e.target.value) }))} style={{ width: 160, accentColor: 'var(--k-accent)' }} />
          </Field>
        ))}
      </div>
    </Card>
  );
}

const STYLES = ['流畅行文', '通用网文', '古风雅韵', '轻小说', '冷硬派', '散文诗'];

function Demo(): React.JSX.Element {
  const [style, setStyle] = React.useState(0);
  const [on, setOn] = React.useState(true);
  const [dlg, setDlg] = React.useState(false);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Tabs label="页签" items={[
        { value: 'write', label: '写作风格', content: (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
              {STYLES.map((s, i) => <ChoiceCard key={s} title={s} selected={style === i} onSelect={() => setStyle(i)} />)}
            </div>
            <Field label="自动压缩" layout="inline" hint="发送量超过上限时，自动把旧楼层总结成压缩块"><Switch checked={on} onCheckedChange={setOn} /></Field>
            <Field label="叙事视角" layout="inline">
              <Select aria-label="叙事视角" defaultValue="limited" options={[{ value: 'limited', label: '限知第三人称' }, { value: 'omni', label: '全知第三人称' }, { value: 'first', label: '第一人称' }]} />
            </Field>
            <Field label="附加指令" hint="每轮都会附在最后一条用户消息后"><TextArea placeholder="例如：保持悬疑氛围，节奏放慢" /></Field>
            <CollapseCard title="自动标签处理" meta="已开启">在正则处理前保护思维链中的标签引用，减少误伤正文。</CollapseCard>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Checkbox defaultChecked aria-label="记住选择" /><span>记住选择</span>
              <Badge>默认</Badge><Badge tone="info">提示</Badge><Badge tone="danger">注意</Badge>
            </div>
          </div>) },
        { value: 'msg', label: '消息前端', content: (
          <div style={{ display: 'grid', gap: 12 }}>
            <CollapseCard title="思绪" meta="49 字">用户想知道门后有什么。先确认场景：深夜、小镇边缘的废屋。保持悬疑氛围，给出三个方向不同的选项。</CollapseCard>
            <Card title="正文" meta="58 字">夜风穿过破败的窗棂，发出低低的呜咽。你站在那扇木门前，门缝里漏出一线昏黄的光。</Card>
            <Card title="抉择" meta="3 项">
              <div style={{ display: 'grid', gap: 8 }}>
                {['推开门走进去', '先在门外听一听', '转身离开'].map((t) => <Button key={t} style={{ justifyContent: 'flex-start' }}>{t}</Button>)}
              </div>
            </Card>
          </div>) },
        { value: 'about', label: '关于', content: <p>「碎光」是新前端的示范皮肤，同时是默认皮肤。它用到了皮肤系统的全部四级定制：种子、按对配色、部件 CSS、装饰与素材，以及平台动效模块。</p> }
      ]} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" onClick={() => setDlg(true)}>打开对话框</Button>
        <Button>默认按钮</Button>
        <Button variant="ghost">幽灵按钮</Button>
        <Tooltip content="悬停 / 长按出现的提示"><Button variant="ghost">有提示</Button></Tooltip>
        <Button variant="danger">删除</Button>
      </div>
      <Field label="名称"><TextField placeholder="输入点什么" /></Field>
      <Dialog open={dlg} onOpenChange={setDlg} title="确认操作" description="对话框弹出时也会碎裂溢光。" footer={<><Button onClick={() => setDlg(false)}>取消</Button><Button variant="primary" onClick={() => setDlg(false)}>确定</Button></>}>
        <p>按下任何按钮、开关、卡片，或展开折叠卡，都会看到边缘碎成方块、缝隙里透出光。</p>
      </Dialog>
    </div>
  );
}

function App(): React.JSX.Element {
  const sk = useSkin();
  const [open, setOpen] = React.useState(true);
  return (
    <>
      {open ? (
        <Panel title="碎光 · 示范皮肤" onClose={() => setOpen(false)} defaultSize={{ w: 760, h: 820 }}
          footer={<><span style={{ marginRight: 'auto', color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>PC：浮动窗可拖动缩放 · 手机：贴底抽屉可下拉关闭</span><Button variant="primary" onClick={() => setOpen(false)}>完成</Button></>}>
          <div style={{ display: 'grid', gap: 14 }}><Controls sk={sk} /><Demo /></div>
        </Panel>
      ) : (
        <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Surface level="surface-1" style={{ padding: 8, borderRadius: 8 }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开面板</Button></Surface></div>
      )}
    </>
  );
}

rt.layer().open('preview', <App />);
