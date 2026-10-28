/**
 * 设置面板的通用布局：分组、设置行、选择网格。
 * 这些是每个面板都会反复用的排法，收缩规则（min-width: 0、minmax(0, 1fr)）固化在 k.lock 里，
 * 避免「一行不换行的说明文字把整列撑出面板」这种问题在每个面板各踩一次。
 */
import * as React from 'react';
import { k, part } from '../hooks';

export function SettingSection({ title, badge, aside, children }: { title: React.ReactNode; badge?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <section {...k('setting-section')}>
      <header {...part('head')}>
        <h3 {...part('title')}>{title}</h3>
        {badge ? <span {...part('badge')}>{badge}</span> : null}
        {aside ? <span {...part('aside')}>{aside}</span> : null}
      </header>
      <div {...part('body')}>{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, info, control }: { label: React.ReactNode; description?: React.ReactNode; info?: React.ReactNode; control: React.ReactNode }): React.JSX.Element {
  return (
    <div {...k('setting-row')}>
      <div {...part('text')}>
        <div {...part('label')}>{label}</div>
        {description ? <div {...part('description')}>{description}</div> : null}
      </div>
      {info ? <div {...part('info')}>{info}</div> : null}
      <div {...part('control')}>{control}</div>
    </div>
  );
}

/** 选择网格：按可用宽度自动分列。每列最小宽度默认按设备给（电脑 170px、手机 140px，见 k.components），给了 min 就用 min */
export function ChoiceGrid({ min, children }: { min?: number; children: React.ReactNode }): React.JSX.Element {
  return <div {...k('choice-grid')} style={min ? ({ '--k-grid-min': min + 'px' } as React.CSSProperties) : undefined}>{children}</div>;
}
