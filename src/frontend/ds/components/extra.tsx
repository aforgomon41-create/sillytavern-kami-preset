/**
 * 分段按钮、弹出说明、撤销提示条。
 * · 分段按钮：选项 ≤ 4 个且名字短时代替下拉（下拉要点两次）；选中态是「选中」配对底色 + 字重（不只靠颜色，2026-10-29 去掉选中项自己的边框）
 * · 进度条、步骤列表：更新、手动搜索、大总结这类长任务用
 * · 弹出说明：点 ⓘ 看完整注释（悬停提示在手机上不好用）
 * · 提示条：改动直接生效时给「撤销」，代替确认框
 */
import * as React from 'react';
import * as RToggle from '@radix-ui/react-toggle-group';
import * as RPopover from '@radix-ui/react-popover';
import * as RProgress from '@radix-ui/react-progress';
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
        {trigger ?? <button type="button" {...k('info-button')} aria-label={label} title={label}>i</button>}
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

/* ───────── 进度条 ─────────
 * value 是 0~100；**拿不到总量就传 null**，显示来回流动的「不确定进度」，绝不拿假数字糊弄（更新弹窗的老规矩，_update-progress.js）。 */
export function Progress({ value, label, tone }: { value: number | null; label: string; tone?: 'accent' | 'danger' | 'success' }): React.JSX.Element {
  const v = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <RProgress.Root {...k('progress', { tone })} value={v} max={100} aria-label={label} data-indeterminate={v === null ? '' : undefined}>
      <RProgress.Indicator {...part('indicator')} style={v === null ? undefined : { transform: 'translateX(-' + (100 - v) + '%)' }} />
    </RProgress.Root>
  );
}

/* ───────── 步骤列表 ─────────
 * 长任务的阶段：做完的打勾、进行中的转圈、失败的标红、没到的空心。状态写在 data-state 上，读屏另读「（已完成）」等文字。 */
export interface StepItem { id: string; label: React.ReactNode; hint?: React.ReactNode }
export function Steps({ items, current, failed, label }: { items: StepItem[]; current: string; failed?: boolean; label: string }): React.JSX.Element {
  const at = items.findIndex((s) => s.id === current);   /* 找不到 = 还没开始，全部空心 */
  return (
    <ol {...k('steps')} aria-label={label}>
      {items.map((s, i) => {
        const state = at >= 0 && i < at ? 'done' : i === at ? (failed ? 'failed' : 'current') : 'pending';
        return (
          <li key={s.id} {...part('item')} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span {...part('marker')} aria-hidden="true">{state === 'done' ? <IconCheckSmall /> : state === 'failed' ? <IconClose width={12} height={12} /> : state === 'current' ? <span {...k('spinner', { size: 'sm' })} /> : null}</span>
            <span {...part('label')}>{s.label}<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{state === 'done' ? '（已完成）' : state === 'failed' ? '（失败）' : state === 'current' ? '（进行中）' : ''}</span></span>
            {s.hint ? <span {...part('hint')}>{s.hint}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function IconCheckSmall(): React.JSX.Element {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
}

