/**
 * 新前端展示台：把设计系统的全部组件、全部状态放在各层表面上渲染，供肉眼检查与自动审计（test/frontend/browser/ds-audit.mjs）。
 * 参数：?skin=fallback|paper|abyss  &scheme=dark|light  &density=compact|cozy|roomy  &motion=full|calm|off  &dialog=1
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import { FALLBACK_SKIN } from '../../../src/frontend/runtime/fallback-skin';
import suiguangJson from '../../../src/skins-next/suiguang/skin.json';
import suiguangCss from '../../../src/skins-next/suiguang/skin.css';
import suiguangPaper from '../../../src/skins-next/suiguang/assets/paper.png';
import {
  Badge, Button, Card, Checkbox, ChoiceCard, CollapseCard, Dialog, Empty, Field, IconButton, IconClose, Select, Spinner,
  Panel, Surface, Switch, Tabs, TextArea, TextField, Tooltip, type Level, type Rect
} from '../../../src/frontend/ds';

/* 两套故意刁钻的测试皮肤：验证「任何种子都可读」在真实渲染里也成立 */
const TEST_SKINS: Record<string, SkinManifest> = {
  fallback: FALLBACK_SKIN,
  suiguang: suiguangJson as unknown as SkinManifest,
  paper: { id: 'paper', name: '粉纸浅黄（测试）', version: '0', contract: '1.0', defaultScheme: 'light',
    schemes: { light: { seeds: { neutral: '#f7d6e0', accent: '#ffe066', radius: 2, elevation: 'outline' } }, dark: { seeds: { neutral: '#3a2030', accent: '#ffe066', radius: 2, elevation: 'outline' } } } },
  abyss: { id: 'abyss', name: '近黑暗红（测试）', version: '0', contract: '1.0', defaultScheme: 'dark',
    schemes: { dark: { seeds: { neutral: '#050505', accent: '#5a0000', radius: 16, elevation: 'glow' } }, light: { seeds: { neutral: '#fafafa', accent: '#5a0000', radius: 16, elevation: 'glow' } } } }
};

const q = new URLSearchParams(location.search);
const rt = createRuntime(window);
(window as unknown as { __rt: unknown }).__rt = rt;
const skin = TEST_SKINS[q.get('skin') || 'fallback'] || FALLBACK_SKIN;
const extra = skin.id === 'suiguang' ? { skinCss: suiguangCss, assetUrls: { paper: suiguangPaper } } : {};
const composed = rt.applySkin(skin, {
  scheme: (q.get('scheme') as 'dark' | 'light') || skin.defaultScheme,
  density: (q.get('density') as 'cozy') || 'cozy', motion: (q.get('motion') as 'full') || 'full'
}, extra);
(window as unknown as { __corrections: unknown }).__corrections = composed.corrections;

function Controls(): React.JSX.Element {
  const [on, setOn] = React.useState(true);
  const [sel, setSel] = React.useState('b');
  const [choice, setChoice] = React.useState(1);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button>默认按钮</Button>
        <Button variant="primary">主要按钮</Button>
        <Button variant="ghost">幽灵按钮</Button>
        <Button variant="danger">危险操作</Button>
        <Button size="sm">小按钮</Button>
        <Button busy>处理中</Button>
        <Button disabled>禁用</Button>
        <IconButton label="关闭"><IconClose /></IconButton>
        <IconButton label="关闭（实底）" variant="default"><IconClose /></IconButton>
        <Tooltip content="提示内容"><Button variant="ghost" data-testid="tip">有提示</Button></Tooltip>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Switch checked={on} onCheckedChange={setOn} aria-label="开关一" />
        <Switch checked={false} aria-label="开关二" />
        <Checkbox checked aria-label="已勾选" />
        <Checkbox checked={false} aria-label="未勾选" />
        <Checkbox checked="indeterminate" aria-label="半选" />
        <Select aria-label="下拉" value={sel} onValueChange={setSel} options={[{ value: 'a', label: '选项甲' }, { value: 'b', label: '选项乙' }, { value: 'c', label: '选项丙', disabled: true }]} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Badge>中性</Badge><Badge tone="accent">强调</Badge><Badge tone="danger">危险</Badge><Badge tone="warning">警告</Badge><Badge tone="success">成功</Badge><Badge tone="info">信息</Badge>
        <Spinner />
      </div>
      <Field label="名称" hint="填入要保存的名称"><TextField placeholder="占位文字" defaultValue="" /></Field>
      <Field label="接口地址" error="地址格式不对"><TextField defaultValue="htp://bad" /></Field>
      <Field label="自动压缩" layout="inline" hint="超过上限时自动总结旧楼层"><Switch defaultChecked /></Field>
      <Field label="提示词"><TextArea defaultValue={'一段较长的提示词内容\n第二行'} /></Field>
      <p>普通正文，带一个 <a href="https://example.com">链接</a>，以及 <span style={{ color: 'var(--k-on-muted)' }}>次要说明文字</span>。</p>
      <Tabs label="页签" items={[{ value: 'a', label: '压缩', content: <p>压缩页内容</p> }, { value: 'b', label: '网络搜索', content: <p>搜索页内容</p> }, { value: 'c', label: '其他功能（很长的页签名）', content: <p>其他</p> }, { value: 'd', label: '禁用页', content: null, disabled: true }]} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[0, 1].map((i) => <ChoiceCard key={i} title={'选择卡 ' + (i + 1)} meta="说明" selected={choice === i} onSelect={() => setChoice(i)}>可以点选的卡片正文</ChoiceCard>)}
      </div>
      <CollapseCard title="折叠卡" meta="3 项" defaultOpen>折叠卡的正文内容</CollapseCard>
      <Empty title="还没有内容" description="空状态的说明文字" />
    </div>
  );
}

function Section({ level, title }: { level: Level; title: string }): React.JSX.Element {
  return (
    <Surface level={level} data-testid={'surface-' + level} style={{ padding: 16, borderRadius: 12 }}>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <Controls />
      {level === 'surface-1' ? <div style={{ marginTop: 12 }}><Card title="嵌套卡片" meta="自动 surface-2" footer={<Button variant="primary">确定</Button>}><Controls /></Card></div> : null}
    </Surface>
  );
}

function App(): React.JSX.Element {
  const [dlg, setDlg] = React.useState(q.get('dialog') === '1');
  const [panel, setPanel] = React.useState(q.get('panel') === '1');
  const w = window as unknown as { __panelClosed: number; __geom: Rect | null };
  return (
    <div data-testid="gallery" style={{ position: 'absolute', inset: 0, overflow: 'auto', pointerEvents: 'auto' }}>
      <Surface level="bg" style={{ padding: 16, display: 'grid', gap: 16, minHeight: '100%' }}>
        <h1>新前端展示台 · {skin.name} · {composed.mode}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => setDlg(true)} data-testid="open-dialog">打开对话框</Button>
          <Button onClick={() => setPanel(true)} data-testid="open-panel">打开面板</Button>
        </div>
        <Section level="bg" title="画布（bg）" />
        <Section level="surface-1" title="表面一（surface-1）" />
        <Section level="sunken" title="凹陷（sunken）" />
        <Section level="inverse" title="反色（inverse）" />
      </Surface>
      {panel ? <Panel title="面板标题（很长的标题会省略）" onClose={() => { setPanel(false); w.__panelClosed = (w.__panelClosed || 0) + 1; }}
        onGeometryChange={(g) => { w.__geom = g; }} actions={<Button size="sm" variant="ghost" data-testid="panel-action">操作</Button>}
        footer={<><Button>取消</Button><Button variant="primary">保存</Button></>}><Controls /></Panel> : null}
      <Dialog open={dlg} onOpenChange={setDlg} title="对话框标题" description="对话框的说明文字"
        footer={<><Button onClick={() => setDlg(false)}>取消</Button><Button variant="primary" onClick={() => setDlg(false)}>确定</Button></>}>
        <Controls />
      </Dialog>
    </div>
  );
}

rt.layer().open('playground', <App />);
