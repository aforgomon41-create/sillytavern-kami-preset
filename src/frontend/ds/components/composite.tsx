/**
 * 组合组件：页签、下拉、卡片（容器 / 选择 / 折叠）、对话框、提示。
 * 由多块组成、且有部分会 portal 出去的组件（下拉、对话框、提示），每一块根上同时带 data-k 与 data-k-part，
 * 这样 portal 出去的那块也能被 [data-k="select"][data-k-part="content"] 选中（前端契约第 4 节）。
 */
import * as React from 'react';
import * as RTabs from '@radix-ui/react-tabs';
import * as RSelect from '@radix-ui/react-select';
import * as RDialog from '@radix-ui/react-dialog';
import * as RTooltip from '@radix-ui/react-tooltip';
import * as RCollapsible from '@radix-ui/react-collapsible';
import { k, part } from '../hooks';
import { IconCheck, IconChevronDown, IconChevronRight, IconClose } from '../icons';
import { LevelProvider, nextLevel, useLevel, usePortal } from './context';
import { IconButton } from './controls';

/* ───────── 页签 ───────── */

export interface TabItem { value: string; label: React.ReactNode; content: React.ReactNode; disabled?: boolean }

export function Tabs({ items, value, defaultValue, onValueChange, mode = 'scroll', label }: {
  items: TabItem[]; value?: string; defaultValue?: string; onValueChange?: (v: string) => void; mode?: 'scroll' | 'fit'; label: string;
}): React.JSX.Element {
  const ctl = value !== undefined ? { value } : { defaultValue: defaultValue ?? items[0]?.value ?? '' };
  return (
    <RTabs.Root {...k('tabs', { mode })} {...ctl} {...(onValueChange ? { onValueChange } : {})}>
      <RTabs.List {...part('list')} aria-label={label}>
        {items.map((it) => <RTabs.Trigger key={it.value} value={it.value} disabled={!!it.disabled} {...part('tab')}>{it.label}</RTabs.Trigger>)}
      </RTabs.List>
      {items.map((it) => <RTabs.Content key={it.value} value={it.value} {...part('panel')}>{it.content}</RTabs.Content>)}
    </RTabs.Root>
  );
}

/* ───────── 下拉 ───────── */

export interface SelectOption { value: string; label: React.ReactNode; disabled?: boolean }

export function Select({ options, value, defaultValue, onValueChange, placeholder, size, disabled, 'aria-label': ariaLabel }: {
  options: SelectOption[]; value?: string; defaultValue?: string; onValueChange?: (v: string) => void; placeholder?: string;
  size?: 'sm' | 'md'; disabled?: boolean; 'aria-label'?: string;
}): React.JSX.Element {
  const portal = usePortal();
  const ctl = { ...(value !== undefined ? { value } : {}), ...(defaultValue !== undefined ? { defaultValue } : {}), ...(onValueChange ? { onValueChange } : {}) };
  return (
    <RSelect.Root {...ctl} disabled={!!disabled}>
      <RSelect.Trigger {...k('select', { size })} {...part('trigger')} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
        <span {...part('value')}><RSelect.Value placeholder={placeholder} /></span>
        <RSelect.Icon {...part('icon')}><IconChevronDown /></RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal container={portal}>
        <RSelect.Content {...k('select')} {...part('content')} data-k-level="surface-1" position="popper" sideOffset={4} collisionPadding={8}>
          <LevelProvider level="surface-1">
            <RSelect.Viewport {...part('viewport')}>
              {options.map((o) => (
                <RSelect.Item key={o.value} value={o.value} disabled={!!o.disabled} {...part('item')}>
                  <RSelect.ItemIndicator {...part('item-indicator')}><IconCheck width={14} height={14} /></RSelect.ItemIndicator>
                  <RSelect.ItemText>{o.label}</RSelect.ItemText>
                </RSelect.Item>
              ))}
            </RSelect.Viewport>
          </LevelProvider>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/* ───────── 卡片 ───────── */

interface CardBase { title?: React.ReactNode; meta?: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode }

/** 容器卡：只是一块表面 */
export function Card({ title, meta, footer, children }: CardBase): React.JSX.Element {
  const lv = nextLevel(useLevel());
  return (
    <section {...k('card', { role: 'container' })} data-k-level={lv}>
      <LevelProvider level={lv}>
        {title || meta ? <header {...part('head')}>{title ? <h3 {...part('title')}>{title}</h3> : null}{meta ? <span {...part('meta')}>{meta}</span> : null}</header> : null}
        {children !== undefined ? <div {...part('body')}>{children}</div> : null}
        {footer ? <footer {...part('foot')}>{footer}</footer> : null}
      </LevelProvider>
    </section>
  );
}

/** 选择卡：整张卡是一个可按的按钮，选中时整对换成「选中」配对，并有边线与勾（不只靠颜色） */
export function ChoiceCard({ title, meta, children, selected, onSelect, disabled }: CardBase & { selected: boolean; onSelect: () => void; disabled?: boolean }): React.JSX.Element {
  const lv = nextLevel(useLevel());
  return (
    <button type="button" {...k('card', { role: 'choice' })} data-k-level={lv} data-state={selected ? 'selected' : undefined}
      aria-pressed={selected} disabled={!!disabled} onClick={onSelect}>
      <LevelProvider level={lv}>
        <span {...part('head')}>
          <span {...part('indicator')}><IconCheck /></span>
          {title ? <span {...part('title')}>{title}</span> : null}
          {meta ? <span {...part('meta')}>{meta}</span> : null}
        </span>
        {children !== undefined ? <span {...part('body')}>{children}</span> : null}
      </LevelProvider>
    </button>
  );
}

/** 折叠卡：头部是开关按钮，正文可收起 */
export function CollapseCard({ title, meta, children, open, defaultOpen, onOpenChange }: CardBase & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (v: boolean) => void }): React.JSX.Element {
  const lv = nextLevel(useLevel());
  const ctl = { ...(open !== undefined ? { open } : {}), ...(defaultOpen !== undefined ? { defaultOpen } : {}), ...(onOpenChange ? { onOpenChange } : {}) };
  return (
    <RCollapsible.Root {...k('card', { role: 'collapse' })} data-k-level={lv} {...ctl}>
      <LevelProvider level={lv}>
        <RCollapsible.Trigger {...part('head')}>
          <span {...part('indicator')}><IconChevronRight /></span>
          {title ? <span {...part('title')}>{title}</span> : null}
          {meta ? <span {...part('meta')}>{meta}</span> : null}
        </RCollapsible.Trigger>
        <RCollapsible.Content {...part('body')}>{children}</RCollapsible.Content>
      </LevelProvider>
    </RCollapsible.Root>
  );
}

/* ───────── 对话框 ───────── */

export function Dialog({ open, onOpenChange, title, description, children, footer, size, trigger, closeLabel = '关闭' }: {
  open?: boolean; onOpenChange?: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; trigger?: React.ReactNode; closeLabel?: string;
}): React.JSX.Element {
  const portal = usePortal();
  const ctl = { ...(open !== undefined ? { open } : {}), ...(onOpenChange ? { onOpenChange } : {}) };
  return (
    <RDialog.Root {...ctl}>
      {trigger ? <RDialog.Trigger asChild>{trigger}</RDialog.Trigger> : null}
      <RDialog.Portal container={portal}>
        <RDialog.Overlay {...k('dialog')} {...part('overlay')} />
        <RDialog.Content {...k('dialog', { size })} {...part('content')} data-k-level="surface-1" {...(description ? {} : { 'aria-describedby': undefined })}>
          <LevelProvider level="surface-1">
            <div {...part('head')}>
              <RDialog.Title {...part('title')}>{title}</RDialog.Title>
              <RDialog.Close asChild><IconButton label={closeLabel} variant="ghost" {...part('close')}><IconClose /></IconButton></RDialog.Close>
            </div>
            {description ? <RDialog.Description {...part('description')}>{description}</RDialog.Description> : null}
            <div {...part('body')}>{children}</div>
            {footer ? <div {...part('foot')}>{footer}</div> : null}
          </LevelProvider>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ───────── 提示 ───────── */

export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <RTooltip.Provider delayDuration={300}>{children}</RTooltip.Provider>;
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactElement }): React.JSX.Element {
  const portal = usePortal();
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal container={portal}>
        <RTooltip.Content {...k('tooltip')} {...part('content')} data-k-level="inverse" sideOffset={6} collisionPadding={8}>{content}</RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
