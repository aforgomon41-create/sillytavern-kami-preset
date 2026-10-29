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

/* ───────── 滑杆 ─────────
 * 自己实现（没有装 Radix Slider）：role="slider" + 方向键 / Home / End / PageUp / PageDown；指针拖动用 pointer capture。
 * 手机上 touch-action: pan-y——竖着划照常滚动页面，横着拖才是调值；面板翻页手势本来就跳过 [role="slider"]。 */

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  /** 松手（或键盘改完）时调用一次：适合写盘、发提示 */
  onValueCommit?: (v: number) => void;
  /** 显示在右侧的值（默认就是数值本身） */
  format?: (v: number) => string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Slider({ value, min, max, step = 1, onValueChange, onValueCommit, format, disabled, ...rest }: SliderProps): React.JSX.Element {
  const f = useField();
  const track = React.useRef<HTMLDivElement>(null);
  const live = React.useRef(value);
  live.current = value;
  const dis = disabled ?? f?.disabled ?? false;
  const decimals = (String(step).split('.')[1] || '').length;
  const snap = (v: number): number => Number(Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min)).toFixed(decimals));
  const set = (v: number): number => { const n = snap(v); if (n !== live.current) { live.current = n; onValueChange(n); } return n; };
  const fromX = (x: number): number => { const r = track.current!.getBoundingClientRect(); return min + (r.width ? (x - r.left) / r.width : 0) * (max - min); };
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  const text = format ? format(value) : String(value);
  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (dis || e.button !== 0) { return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute('data-dragging', '');
    (e.currentTarget.querySelector('[role="slider"]') as HTMLElement | null)?.focus({ preventScroll: true });
    set(fromX(e.clientX));
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { set(fromX(e.clientX)); } };
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!e.currentTarget.hasAttribute('data-dragging')) { return; }
    e.currentTarget.removeAttribute('data-dragging');
    if (onValueCommit) { onValueCommit(live.current); }
  };
  const onKey = (e: React.KeyboardEvent): void => {
    const big = Math.max(step, (max - min) / 10);
    const map: Record<string, number> = { ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step, PageUp: value + big, PageDown: value - big, Home: min, End: max };
    if (!(e.key in map)) { return; }
    e.preventDefault();
    const n = set(map[e.key] as number);
    if (onValueCommit) { onValueCommit(n); }
  };
  return (
    <div {...k('slider')} data-disabled={dis ? '' : undefined}>
      <div {...part('track')} ref={track} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div {...part('range')} style={{ width: pct + '%' }} />
        <div {...part('thumb')} role="slider" tabIndex={dis ? -1 : 0} id={f?.id} aria-describedby={f?.describedBy}
          aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text} aria-disabled={dis || undefined}
          aria-label={rest['aria-label']} style={{ left: pct + '%' }} onKeyDown={dis ? undefined : onKey} />
      </div>
      <output {...part('value')} aria-hidden="true">{text}</output>
    </div>
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
