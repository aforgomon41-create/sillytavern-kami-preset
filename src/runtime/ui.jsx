/* 运行库：组件层
 * ------------------------------------------------------------------
 * 原则（2026-10-26 用户裁定）：
 *   · 交互行为全部用 Radix 无头组件，不再自研（弹窗/页签/下拉/开关/折叠/手风琴/复选框/单选）
 *   · **类名仍然用 .kami-**：21 套皮肤全部按这些类名和 --kami-* 令牌写样式，
 *     换框架不能换外观契约。Radix 只管行为与可访问性，一个样式都不带。
 *   · 表现层组件（卡片/徽章/空态/加载）没有交互，直接用 div/span，不算自研组件库。
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import * as RSelect from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Switch from '@radix-ui/react-switch';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Accordion from '@radix-ui/react-accordion';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Progress from '@radix-ui/react-progress';
import * as Separator from '@radix-ui/react-separator';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Popover from '@radix-ui/react-popover';

const h = React.createElement;

/* ───────── 表现层（无交互）───────── */

export function Dot(props) { return h('span', { className: 'kami-dot', 'data-kami-on': props && props.on ? '1' : undefined, 'aria-hidden': 'true' }); }
export function Badge(props) { return h('span', { className: 'kami-badge', 'data-kami-kind': props && props.kind }, props && props.children); }
export function Chip(props) { return h('span', { className: 'kami-chip', 'data-kami-kind': props && props.kind }, props && props.children); }
export function Title(props) { return h('span', { className: 'kami-title' }, props && props.children); }
export function Sub(props) { return h('span', { className: 'kami-sub' }, props && props.children); }
export function Note(props) { return h('div', { className: 'kami-card-note', 'data-kami-note': props && props.mark ? '' : undefined }, props && props.children); }
export function Empty(props) { return h('div', { className: 'kami-empty' }, props && props.children); }
export function Spinner(props) { return h('span', { className: 'kami-spin', role: 'status', 'aria-label': (props && props.label) || '加载中' }); }
export function Divider() { return h(Separator.Root, { className: 'kami-divider', decorative: true }); }
export function Grid(props) { return h('div', { className: 'kami-grid' }, props && props.children); }
export function Scroll(props) { return h('div', { className: 'kami-scroll' }, props && props.children); }

export function Shell(props) {
  var cls = 'kami-shell kami-surface' + (props && props.className ? ' ' + props.className : '');
  return h('div', { className: cls }, props && props.children);
}

export function Card(props) {
  return h('div', { className: 'kami-card', 'data-kami-card-role': props && props.role },
    props && props.head ? h('span', { className: 'kami-card-head' },
      props.head.dot ? h(Dot, null) : null,
      h('span', { className: 'kami-card-title' }, props.head.title),
      props.head.right ? h('span', { className: 'kami-item-side' }, props.head.right) : null
    ) : null,
    h('span', { className: 'kami-card-body' }, props && props.children)
  );
}

/* ───────── 按钮 ───────── */

export function Button(props) {
  var cls = 'kami-btn' + (props && props.variant === 'primary' ? ' kami-btn--primary' : '') +
    (props && props.variant === 'ghost' ? ' kami-btn--ghost' : '') +
    (props && props.active ? ' is-on' : '');
  return h('button', {
    type: 'button',
    className: cls,
    disabled: !!(props && props.disabled),
    onClick: props && props.onClick,
    title: props && props.title,
    'aria-pressed': props && props.active ? 'true' : undefined
  }, props && props.children);
}

export function IconButton(props) {
  return h('button', {
    type: 'button',
    className: 'kami-icon-btn' + (props && props.active ? ' is-on' : ''),
    disabled: !!(props && props.disabled),
    onClick: props && props.onClick,
    title: props && props.title,
    'aria-label': (props && props.label) || (props && props.title) || '按钮',
    'aria-pressed': props && props.active ? 'true' : undefined
  }, props && props.children);
}

/* ───────── 页签（Radix Tabs）───────── */

export function TabsRoot(props) { return h(Tabs.Root, { value: props.value, onValueChange: props.onValueChange, className: 'kami-tabs-root' }, props.children); }
export function TabsList(props) { return h(Tabs.List, { className: 'kami-tabs', 'data-kami-role': 'tabs' }, props.children); }
export function Tab(props) {
  return h(Tabs.Trigger, { value: props.value, className: 'kami-tab', disabled: !!props.disabled, title: props.title }, props.children);
}
export function TabPanel(props) { return h(Tabs.Content, { value: props.value, className: 'kami-tab-panel' }, props.children); }

/* ───────── 弹窗（Radix Dialog）───────── */

export function Modal(props) {
  return h(Dialog.Root, { open: !!props.open, onOpenChange: function (v) { if (props.onOpenChange) { props.onOpenChange(v); } } },
    h(Dialog.Portal, { container: props.portal },
      h(Dialog.Overlay, { className: 'kami-dialog-backdrop' }),
      h(Dialog.Content, { className: 'kami-drop kami-dialog', 'aria-describedby': undefined },
        props.title ? h(Dialog.Title, { className: 'kami-dialog-title kami-title' }, props.title) : null,
        h(Dialog.Description, { className: 'kami-dialog-desc kami-card-note', style: props.title ? undefined : { display: 'none' } }, props.desc || ''),
        props.children,
        h(Dialog.Close, { className: 'kami-icon-btn kami-dialog-close', 'aria-label': '关闭' }, '✕')
      )
    )
  );
}

/* ───────── 下拉选单（Radix Select）───────── */

export function Select(props) {
  return h(RSelect.Root, { value: props.value, onValueChange: props.onValueChange, disabled: !!props.disabled },
    h(RSelect.Trigger, { className: 'kami-select', 'aria-label': props.label || '选择' },
      h(RSelect.Value, null),
      h(RSelect.Icon, { className: 'kami-select-icon' }, '▾')
    ),
    h(RSelect.Portal, { container: props.portal },
      h(RSelect.Content, { className: 'kami-select-content kami-drop' },
        h(RSelect.Viewport, null,
          (props.options || []).map(function (o) {
            return h(RSelect.Item, { key: o.value, value: o.value, className: 'kami-select-item' },
              h(RSelect.ItemText, null, o.label));
          })
        )
      )
    )
  );
}

/* ───────── 开关（Radix Switch）───────── */

export function SwitchToggle(props) {
  return h(Switch.Root, {
    className: 'kami-switch', checked: !!props.checked,
    onCheckedChange: props.onCheckedChange, disabled: !!props.disabled,
    'aria-label': props.label || '开关'
  }, h(Switch.Thumb, { className: 'kami-switch-thumb' }));
}

/* ───────── 折叠（Radix Collapsible）───────── */

export function Collapse(props) {
  return h(Collapsible.Root, {
    className: 'kami-collapse', open: !!props.open,
    onOpenChange: props.onOpenChange, 'data-kami-open': props.open ? '1' : '0'
  },
    h(Collapsible.Trigger, { className: 'kami-head kami-collapse-head' },
      props.title ? h('span', { className: 'kami-title' }, props.title) : null,
      h('span', { className: 'kami-chev', 'aria-hidden': 'true' }, '▸')
    ),
    h(Collapsible.Content, { className: 'kami-body kami-collapse-body' }, props.children)
  );
}

/* ───────── 手风琴（Radix Accordion）───────── */

export function AccordionRoot(props) {
  return h(Accordion.Root, {
    className: 'kami-accordion', type: 'single', collapsible: true,
    value: props.value, onValueChange: props.onValueChange
  }, props.children);
}
export function AccordionItem(props) {
  return h(Accordion.Item, { className: 'kami-accordion-item', value: props.value },
    h(Accordion.Header, { className: 'kami-head kami-collapse-head' },
      h(Accordion.Trigger, { className: 'kami-title kami-accordion-trigger' }, props.title)
    ),
    h(Accordion.Content, { className: 'kami-body kami-collapse-body' }, props.children)
  );
}

/* ───────── 复选框 / 单选（Radix）───────── */

export function Check(props) {
  return h(Checkbox.Root, {
    className: 'kami-checkbox', checked: !!props.checked,
    onCheckedChange: props.onCheckedChange, disabled: !!props.disabled,
    id: props.id, 'aria-label': props.label || '复选框'
  }, h(Checkbox.Indicator, { className: 'kami-checkbox-indicator' }, '✓'));
}

export function Radios(props) {
  return h(RadioGroup.Root, { className: 'kami-radios', value: props.value, onValueChange: props.onValueChange, disabled: !!props.disabled, 'aria-label': props.label || '单选' },
    (props.options || []).map(function (o) {
      return h('label', { key: o.value, className: 'kami-radio' },
        h(RadioGroup.Item, { value: o.value, className: 'kami-radio-item' }, h(RadioGroup.Indicator, { className: 'kami-radio-indicator' }, '●')),
        h('span', null, o.label)
      );
    })
  );
}

/* ───────── 分段切换（Radix ToggleGroup）───────── */

export function Segmented(props) {
  return h(ToggleGroup.Root, {
    className: 'kami-seg', type: 'single', value: props.value,
    onValueChange: function (v) { if (v && props.onValueChange) { props.onValueChange(v); } },
    disabled: !!props.disabled, 'aria-label': props.label || '分段切换'
  }, (props.options || []).map(function (o) {
    return h(ToggleGroup.Item, { key: o.value, value: o.value, className: 'kami-seg-item' }, o.label);
  }));
}

/* ───────── 菜单（Radix DropdownMenu）───────── */

export function Menu(props) {
  return h(DropdownMenu.Root, null,
    h(DropdownMenu.Trigger, { asChild: true }, props.trigger),
    h(DropdownMenu.Portal, { container: props.portal },
      h(DropdownMenu.Content, { className: 'kami-menu kami-drop', align: props.align || 'end' },
        (props.items || []).map(function (it, i) {
          if (it.separator) { return h(DropdownMenu.Separator, { key: 'sep' + i, className: 'kami-menu-sep' }); }
          return h(DropdownMenu.Item, { key: it.value || i, className: 'kami-menu-item', onSelect: it.onSelect, 'data-kami-act': it.value }, it.label);
        })
      )
    )
  );
}

/* ───────── 气泡 / 提示 / 进度 ───────── */

export function Hint(props) {
  return h(Tooltip.Provider, { delayDuration: 240 },
    h(Tooltip.Root, null,
      h(Tooltip.Trigger, { asChild: true }, props.children),
      h(Tooltip.Portal, { container: props.portal },
        h(Tooltip.Content, { className: 'kami-tooltip kami-drop', sideOffset: 6 }, props.text)
      )
    )
  );
}

export function Bar(props) {
  return h(Progress.Root, { className: 'kami-progress', value: props.value || 0, 'aria-label': props.label || '进度' },
    h(Progress.Indicator, { className: 'kami-progress-bar', style: { width: (props.value || 0) + '%' } }));
}

export function Pop(props) {
  return h(Popover.Root, null,
    h(Popover.Trigger, { asChild: true }, props.trigger),
    h(Popover.Portal, { container: props.portal },
      h(Popover.Content, { className: 'kami-popover kami-drop', sideOffset: 6 }, props.children)
    )
  );
}

/* ───────── 字段行 ───────── */

export function Field(props) {
  return h('div', { className: 'kami-field' },
    h('span', { className: 'kami-field-label' }, props.label),
    h('span', { className: 'kami-field-value' }, props.children),
    props.hint ? h('span', { className: 'kami-card-note' }, props.hint) : null
  );
}

export const primitives = {
  Dialog: Dialog, Tabs: Tabs, Select: RSelect, DropdownMenu: DropdownMenu, Switch: Switch,
  Collapsible: Collapsible, Accordion: Accordion, Tooltip: Tooltip, Progress: Progress,
  Separator: Separator, Checkbox: Checkbox, RadioGroup: RadioGroup, ToggleGroup: ToggleGroup, Popover: Popover
};
