// 量「组件形状语言」：每套皮肤的 选项卡/小标签/按钮/卡片 各用什么圆角（只读）
import fs from 'node:fs';
import path from 'node:path';
const SKIN_DIR = 'src/skins';
const COMPS = [['选项卡 .kami-tab', /\.kami-tab(?![\w-])/], ['小标签 .kami-chip', /\.kami-chip(?![\w-])/],
  ['徽章 .kami-badge', /\.kami-badge(?![\w-])/], ['按钮 .kami-btn', /\.kami-btn(?![\w-])/], ['卡片 .kami-card', /\.kami-card(?![\w-])/]];

function rules(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; const re = /(^|[}])\s*([^{}@]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(code))) {
    const sel = m[2].trim(); if (!sel || sel.startsWith('from') || /^[0-9.]+%$/.test(sel)) continue;
    const d = {}; for (const s of m[3].split(';')) { const i = s.indexOf(':'); if (i > 0) d[s.slice(0, i).trim().toLowerCase()] = s.slice(i + 1).trim(); }
    out.push({ sel, d });
  }
  return out;
}
const short = v => String(v).replace(/\s+/g, ' ').slice(0, 26);
const ids = fs.readdirSync(SKIN_DIR).filter(d => fs.existsSync(path.join(SKIN_DIR, d, 'skin.css'))).sort();
const rows = [];
for (const id of ids) {
  const rs = rules(fs.readFileSync(path.join(SKIN_DIR, id, 'skin.css'), 'utf8'));
  const cell = (rx) => {
    const vals = [];
    for (const r of rs) { if (!rx.test(r.sel)) continue; const v = r.d['border-radius']; if (v && !vals.includes(v)) vals.push(v); }
    return vals.length ? vals.map(short).join(' ') : '—';
  };
  rows.push([id, ...COMPS.map(([, rx]) => cell(rx))]);
}
console.log(['皮肤'.padEnd(10), ...COMPS.map(([n]) => n.padEnd(24))].join(''));
for (const r of rows) console.log([r[0].padEnd(10), ...r.slice(1).map(c => c.padEnd(24))].join(''));
/* 统计：用到「胶囊」档的套数 */
let pill = 0, none0 = 0;
for (const r of rows) {
  const all = r.slice(1).join(' ');
  if (/pill/.test(all)) pill++;
  if (/^\s*—/.test(r[4]) === false && /(^|\s)0(px)?(\s|$)/.test(r[5] || '')) none0++;
}
console.log(`\n用到 --kami-r-pill（胶囊档）的皮肤：${pill} / ${rows.length}`);
