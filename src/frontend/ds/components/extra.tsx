/**
 * 分段按钮、弹出说明、撤销提示条。
 * · 分段按钮：选项 ≤ 4 个且名字短时代替下拉（下拉要点两次）；选中态有边线与字重（不只靠颜色）
 * · 弹出说明：点 ⓘ 看完整注释（悬停提示在手机上不好用）
 * · 提示条：改动直接生效时给「撤销」，代替确认框
 */
import * as React from 'react';
import * as RToggle from '@radix-ui/react-toggle-group';
import * as RPopover from '@radix-ui/react-popover';
import { k, part } from '../hooks';
import { IconClose } from '../icons';
import { LevelProvider, usePortal } from './context';

export interface SegOption { value: string; label: React.ReactNode }

export function Segmented({ options, value, onValueChange, label, size }: { options: SegOption[]; value: string; onValueChange: (v: string) => void; label: string; size?: 'sm' | 'md' }): React.JSX.Element {
  return (
    <RToggle.Root type="single" {...k('segmented', { size })} value={value} aria-label={label}
      onValueChange={(v: string) => { if (v) { onValueChange(v); } }}>
      {options.map((o) => <RToggle.Item key={o.value} value={o.value} {...part('item')}>{o.label}</RToggle.Item>)}
    </RToggle.Root>
  );
}

export function InfoPopover({ label = '说明', children, trigger }: { label?: string; children: React.ReactNode; trigger?: React.ReactNode }): React.JSX.Element {
  const portal = usePortal();
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>
        {trigger ?? <button type="button" {...k('icon-button', { size: 'sm', variant: 'ghost' })} aria-label={label} title={label}><span {...part('icon')} style={{ fontStyle: 'normal', fontWeight: 600 }}>i</span></button>}
      </RPopover.Trigger>
      <RPopover.Portal container={portal}>
        <RPopover.Content {...k('popover')} {...part('content')} data-k-level="surface-1" sideOffset={6} collisionPadding={10}>
          <LevelProvider level="surface-1">{children}</LevelProvider>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export function Toast({ message, action, onAction, onClose }: { message: React.ReactNode; action?: string; onAction?: () => void; onClose: () => void }): React.JSX.Element {
  return (
    <div {...k('toast')} data-k-level="inverse" role="status" aria-live="polite">
      <span {...part('message')}>{message}</span>
      {action ? <button type="button" {...part('action')} onClick={onAction}>{action}</button> : null}
      <button type="button" {...part('close')} aria-label="关闭" onClick={onClose}><IconClose width={14} height={14} /></button>
    </div>
  );
}
