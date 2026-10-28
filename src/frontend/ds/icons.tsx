/** 功能性图标（内联 SVG，跟随 currentColor）。皮肤要换图标风格用装饰或部件 CSS，不改这里的语义。 */
import * as React from 'react';

type P = React.SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const IconCheck = (p: P): React.JSX.Element => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconChevronDown = (p: P): React.JSX.Element => <svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>;
export const IconChevronRight = (p: P): React.JSX.Element => <svg {...base} {...p}><path d="M9 6l6 6-6 6" /></svg>;
export const IconClose = (p: P): React.JSX.Element => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconMinus = (p: P): React.JSX.Element => <svg {...base} {...p}><path d="M6 12h12" /></svg>;
export const IconCopy = (p: P): React.JSX.Element => <svg {...base} {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
export const IconCode = (p: P): React.JSX.Element => <svg {...base} {...p}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>;
