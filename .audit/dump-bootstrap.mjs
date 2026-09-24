// 调查工具（只读）：把 收到的文件/ujlfEYPa.json 里脚本 content 字段抽出来，
// 供人工在酒馆助手的脚本编辑框粘贴（复现「开启该第三方脚本」的用户路径）。
// 用法：node .audit/dump-bootstrap.mjs  →  打印到 stdout，同时写成 .audit/spreset-bootstrap.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const j = JSON.parse(fs.readFileSync(path.join(ROOT, '收到的文件', 'ujlfEYPa.json'), 'utf8'));
fs.writeFileSync(path.join(ROOT, '.audit', 'spreset-bootstrap.js'), j.content, 'utf8');
console.log(j.content);
