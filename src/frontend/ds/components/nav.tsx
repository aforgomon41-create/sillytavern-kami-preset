/**
 * 导航列表：PC 上是面板左侧的竖排导航（layout="sidebar"，当前项 aria-current）；
 * 手机上是可以点进去的一级列表（layout="list"，每行带当前值摘要与箭头）。同一组数据两种形态。
 */
import * as React from 'react';
import { k, part } from '../hooks';
import { IconChevronRight } from '../icons';
import { ICONS } from '../icons/registry';

export interface NavItem { id: string; label: React.ReactNode; icon?: string; meta?: React.ReactNode }

export function NavList({ items, current, onSelect, layout, label }: { items: NavItem[]; current?: string; onSelect: (id: string) => void; layout: 'sidebar' | 'list'; label: string }): React.JSX.Element {
  return (
    <nav {...k('nav', { layout })} aria-label={label}>
      {items.map((it) => {
        const Icon = it.icon ? ICONS[it.icon] : undefined;
        const active = layout === 'sidebar' && it.id === current;
        return (
          <button key={it.id} type="button" {...part('item')} aria-current={active ? 'page' : undefined} data-state={active ? 'active' : undefined} onClick={() => onSelect(it.id)}>
            {Icon ? <span {...part('icon')} aria-hidden="true"><Icon width="100%" height="100%" strokeWidth={1.75} /></span> : null}
            <span {...part('label')}>{it.label}</span>
            {it.meta !== undefined ? <span {...part('meta')}>{it.meta}</span> : null}
            {layout === 'list' ? <span {...part('chevron')} aria-hidden="true"><IconChevronRight /></span> : null}
          </button>
        );
      })}
    </nav>
  );
}
