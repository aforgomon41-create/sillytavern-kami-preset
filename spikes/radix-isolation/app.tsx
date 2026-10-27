/**
 * 技术验证（2026-10-27）：React + Radix 在两种挂载方式下能否正常工作。
 *   A. 宿主页面里的 Shadow DOM（面板）——隔离酒馆全局 CSS
 *   B. 父页面的 React 渲染进同源 iframe（消息前端）——iframe 只留载荷与挂载点
 * 本文件只做验证，不是正式代码。
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Popover from '@radix-ui/react-popover';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';

type Props = { portal: HTMLElement };

function App({ portal }: Props) {
  const [sel, setSel] = React.useState('a');
  const [menu, setMenu] = React.useState('none');
  const [on, setOn] = React.useState(false);
  return (
    <Tooltip.Provider delayDuration={0}>
      <div className="k-app" data-testid="app">
        <button className="k-btn" data-testid="plain">普通按钮</button>

        <Select.Root value={sel} onValueChange={setSel}>
          <Select.Trigger className="k-btn" data-testid="sel-trigger" aria-label="下拉">
            <Select.Value />
          </Select.Trigger>
          <Select.Portal container={portal}>
            <Select.Content className="k-pop" data-testid="sel-content" position="popper">
              <Select.Viewport>
                {['a', 'b', 'c'].map((v) => (
                  <Select.Item key={v} value={v} className="k-item" data-testid={'sel-' + v}>
                    <Select.ItemText>选项 {v.toUpperCase()}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        <span data-testid="sel-value">{sel}</span>

        <Popover.Root>
          <Popover.Trigger className="k-btn" data-testid="pop-trigger">弹层</Popover.Trigger>
          <Popover.Portal container={portal}>
            <Popover.Content className="k-pop" data-testid="pop-content">
              <p data-testid="pop-inside">弹层里面的文字</p>
              <input data-testid="pop-input" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Dialog.Root>
          <Dialog.Trigger className="k-btn" data-testid="dlg-trigger">对话框</Dialog.Trigger>
          <Dialog.Portal container={portal}>
            <Dialog.Overlay className="k-overlay" />
            <Dialog.Content className="k-pop k-dialog" data-testid="dlg-content">
              <Dialog.Title>标题</Dialog.Title>
              <Dialog.Description>说明</Dialog.Description>
              <button className="k-btn" data-testid="dlg-a">甲</button>
              <button className="k-btn" data-testid="dlg-b">乙</button>
              <Dialog.Close className="k-btn" data-testid="dlg-close">关闭</Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="k-btn" data-testid="menu-trigger">菜单</DropdownMenu.Trigger>
          <DropdownMenu.Portal container={portal}>
            <DropdownMenu.Content className="k-pop" data-testid="menu-content">
              <DropdownMenu.Item className="k-item" data-testid="menu-x" onSelect={() => setMenu('x')}>项目 X</DropdownMenu.Item>
              <DropdownMenu.Item className="k-item" data-testid="menu-y" onSelect={() => setMenu('y')}>项目 Y</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span data-testid="menu-value">{menu}</span>

        <Tooltip.Root>
          <Tooltip.Trigger className="k-btn" data-testid="tip-trigger">提示</Tooltip.Trigger>
          <Tooltip.Portal container={portal}>
            <Tooltip.Content className="k-pop" data-testid="tip-content">提示内容</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        <Switch.Root className="k-switch" data-testid="switch" checked={on} onCheckedChange={setOn}>
          <Switch.Thumb className="k-thumb" />
        </Switch.Root>

        <Tabs.Root defaultValue="one">
          <Tabs.List aria-label="页签">
            <Tabs.Trigger value="one" data-testid="tab-one">一</Tabs.Trigger>
            <Tabs.Trigger value="two" data-testid="tab-two">二</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="one" data-testid="panel-one">第一页</Tabs.Content>
          <Tabs.Content value="two" data-testid="panel-two">第二页</Tabs.Content>
        </Tabs.Root>
      </div>
    </Tooltip.Provider>
  );
}

const CSS = `
:host { all: initial; }
.k-root { font-family: system-ui, sans-serif; font-size: 14px; color: rgb(20, 20, 20); }
.k-btn { background: rgb(240, 240, 240); color: rgb(20, 20, 20); font-size: 14px; border: 1px solid rgb(120, 120, 120); }
.k-pop { background: rgb(255, 255, 255); color: rgb(20, 20, 20); border: 1px solid rgb(120, 120, 120); padding: 8px; z-index: 10; }
.k-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .3); z-index: 20; }
.k-dialog { position: fixed; top: 120px; left: 120px; z-index: 21; }
.k-switch { width: 40px; height: 20px; }
`;

/** A：在宿主页面挂一个 Shadow DOM 容器 */
function mountShadow(hostEl: HTMLElement): Root {
  const shadow = hostEl.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);
  const root = document.createElement('div');
  root.className = 'k-root';
  const app = document.createElement('div');
  const portal = document.createElement('div');
  portal.setAttribute('data-k-portal', '');
  root.append(app, portal);
  shadow.appendChild(root);
  const r = createRoot(app);
  r.render(<App portal={portal} />);
  return r;
}

/** B：父页面的 React 渲染进另一个（同源 iframe 的）文档 */
function mountIntoDoc(doc: Document): Root {
  const style = doc.createElement('style');
  style.textContent = CSS.replace(':host { all: initial; }', '');
  doc.head.appendChild(style);
  const root = doc.createElement('div');
  root.className = 'k-root';
  const app = doc.createElement('div');
  const portal = doc.createElement('div');
  root.append(app, portal);
  doc.body.appendChild(root);
  const r = createRoot(app);
  r.render(<App portal={portal} />);
  return r;
}

(window as any).KamiSpike = { mountShadow, mountIntoDoc };
