/**
 * 基础控件：按钮、图标按钮、开关、复选框、输入框、字段、徽章、加载、空状态。
 * 只输出部件清单里登记过的钩子（parts.ts）；外观全在 CSS 层，组件里不写样式。
 */
import * as React from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import * as RCheckbox from '@radix-ui/react-checkbox';
import { k, part } from '../hooks';
import { IconCheck, IconMinus } from '../icons';

/* ───────── 字段：给里面的控件分配 id 与说明关联 ───────── */

interface FieldCtx { id: string; describedBy: string | undefined; invalid: boolean; disabled: boolean }
const FieldContext = React.createContext<FieldCtx | null>(null);
const useField = (): FieldCtx | null => React.useContext(FieldContext);

export interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  layout?: 'stack' | 'inline';
  disabled?: boolean;
  children: React.ReactNode;
}

export function Field({ label, hint, error, layout = 'stack', disabled = false, children }: FieldProps): React.JSX.Element {
  const id = React.useId();
  const hintId = hint ? id + '-hint' : undefined, errId = error ? id + '-err' : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const ctx = React.useMemo(() => ({ id: id + '-ctl', describedBy, invalid: !!error, disabled }), [id, describedBy, error, disabled]);
  return (
    <div {...k('field', { layout })} data-invalid={error ? '' : undefined} data-disabled={disabled ? '' : undefined}>
      <label {...part('label')} htmlFor={ctx.id}>{label}</label>
      <div {...part('control')}><FieldContext.Provider value={ctx}>{children}</FieldContext.Provider></div>
      {hint ? <div {...part('hint')} id={hintId}>{hint}</div> : null}
      {error ? <div {...part('error')} id={errId} role="alert">{error}</div> : null}
    </div>
  );
}

/* ───────── 按钮 ───────── */

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  busy?: boolean;
  icon?: React.ReactNode;
  type?: 'button' | 'submit';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, busy = false, icon, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} {...k('button', { variant, size })} disabled={disabled || busy} aria-busy={busy ? 'true' : undefined} {...rest}>
      {busy ? <span {...k('spinner')} {...part('spinner')} aria-hidden="true" /> : icon ? <span {...part('icon')}>{icon}</span> : null}
      <span {...part('label')}>{children}</span>
    </button>
  );
});

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'> {
  /** 图标按钮必须有可读名称 */
  label: string;
  variant?: 'default' | 'ghost';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, variant, size, children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} title={label} {...k('icon-button', { variant, size })} {...rest}>
      <span {...part('icon')}>{children}</span>
    </button>
  );
});

/* ───────── 开关 / 复选框 ───────── */

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** 不在 Field 里时必须给 */
  'aria-label'?: string;
}

export function Switch({ size, ...props }: SwitchProps): React.JSX.Element {
  const f = useField();
  return (
    <RSwitch.Root {...k('switch', { size })} id={f?.id} aria-describedby={f?.describedBy} disabled={props.disabled ?? f?.disabled} {...strip(props, ['disabled'])}>
      <RSwitch.Thumb {...part('thumb')} />
    </RSwitch.Root>
  );
}

export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean | 'indeterminate') => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Checkbox(props: CheckboxProps): React.JSX.Element {
  const f = useField();
  return (
    <RCheckbox.Root {...k('checkbox')} id={f?.id} aria-describedby={f?.describedBy} disabled={props.disabled ?? f?.disabled} {...strip(props, ['disabled'])}>
      <RCheckbox.Indicator {...part('indicator')}>{props.checked === 'indeterminate' ? <IconMinus /> : <IconCheck />}</RCheckbox.Indicator>
    </RCheckbox.Root>
  );
}

/* ───────── 输入 ───────── */

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md'; invalid?: boolean };

export const TextField = React.forwardRef<HTMLInputElement, InputProps>(function TextField({ size, invalid, disabled, ...rest }, ref) {
  const f = useField();
  const bad = invalid ?? f?.invalid ?? false;
  return (
    <div {...k('text-field', { size })} data-invalid={bad ? '' : undefined}>
      <input ref={ref} {...part('input')} id={f?.id} aria-describedby={f?.describedBy} aria-invalid={bad || undefined} disabled={disabled ?? f?.disabled} {...rest} />
    </div>
  );
});

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const TextArea = React.forwardRef<HTMLTextAreaElement, AreaProps>(function TextArea({ invalid, disabled, ...rest }, ref) {
  const f = useField();
  const bad = invalid ?? f?.invalid ?? false;
  return (
    <div {...k('text-area')} data-invalid={bad ? '' : undefined}>
      <textarea ref={ref} {...part('input')} id={f?.id} aria-describedby={f?.describedBy} aria-invalid={bad || undefined} disabled={disabled ?? f?.disabled} {...rest} />
    </div>
  );
});

/* ───────── 展示 ───────── */

export function Badge({ tone, children }: { tone?: 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info'; children: React.ReactNode }): React.JSX.Element {
  return <span {...k('badge', { tone: tone === 'neutral' ? undefined : tone })}>{children}</span>;
}

export function Spinner({ label = '加载中', size }: { label?: string; size?: 'sm' | 'md' }): React.JSX.Element {
  return <span {...k('spinner', { size })} role="status" aria-label={label} />;
}

export function Empty({ title, description, actions, icon }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }): React.JSX.Element {
  return (
    <div {...k('empty')}>
      {icon ? <div {...part('icon')} aria-hidden="true">{icon}</div> : null}
      <div {...part('title')}>{title}</div>
      {description ? <div {...part('description')}>{description}</div> : null}
      {actions ? <div {...part('actions')}>{actions}</div> : null}
    </div>
  );
}

/** 去掉若干键（配合 exactOptionalPropertyTypes，避免把 undefined 显式传给 Radix） */
function strip<T extends object, K extends keyof T>(o: T, keys: K[]): Omit<T, K> {
  const out = { ...o };
  for (const key of keys) { delete out[key]; }
  return out;
}
