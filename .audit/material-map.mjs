// 量「材质分区度」：每套皮肤给 面板/卡片/按钮/标签/选项卡/条目 各用了什么底色（只读）
import fs from 'node:fs';
import path from 'node:path';
const SKIN_DIR = 'src/skins';
const COMPS = [['面板本体', /\.kami-drop(?![\w-])/], ['卡片', /\.kami-card(?![\w-])/], ['按钮', /\.kami-btn(?![\w-])/],
  ['小标签', /\.kami-chip(?![\w-])/], ['选项卡', /\.kami-tab(?![\w-])/], ['条目卡', /\.kami-item(?![\w-])/],
  ['正文块', /\.kami-card-body(?![\w-])/], ['输入框', /\.kami-(number|text|textarea|select)(?![\w-])/]];

function rules(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /(^|[}])\s*([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(code))) {
    const sel = m[2].trim(), body = m[3];
    if (!sel || sel.startsWith('from') || sel.startsWith('to') || /^[0-9.]+%$/.test(sel)) continue;
    const decls = {};
    for (const d of body.split(';')) { const i = d.indexOf(':'); if (i > 0) decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); }
    out.push({ sel, decls });
  }
  return out;
}

const ids = fs.readdirSync(SKIN_DIR).filter(d => fs.existsSync(path.join(SKIN_DIR, d, 'skin.css'))).sort();
console.log('皮肤            面板本体      卡片        按钮        小标签      选项卡      正文块');
for (const id of ids) {
  const rs = rules(fs.readFileSync(path.join(SKIN_DIR, id, 'skin.css'), 'utf8'));
  const cell = (rx) => {
    const vals = new Set();
    for (const r of rs) {
      if (!rx.test(r.sel)) continue;
      const v = r.decls['background-color'] || r.decls['background'] || r.decls['background-image'];
      if (v && !/^\s*(none|transparent)\s*$/.test(v)) vals.add(v.replace(/var\(([^,)]+)[^)]*\)/g, '$1').slice(0, 18));
    }
    if (!vals.size) return '—';
    return [...vals].slice(0, 3).join(' + ') + (vals.size > 3 ? ` …(${vals.size})` : '');
  };
  const cells = COMPS.map(([, rx]) => cell(rx));
  console.log(id.padEnd(16) + cells.map(c => c.padEnd(12)).join(''));
}
