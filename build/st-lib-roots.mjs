#!/usr/bin/env node
/**
 * 酒馆安装目录的定位（构建期取 showdown / DOMPurify 用）
 * ------------------------------------------------------------
 * 为什么要集中一处：正文外壳的端到端检查（build/verify-body-shell.mjs ④）和预览台的
 * /vendor/showdown.js、/vendor/dompurify.js（test/harness/server.mjs）都要读**酒馆自带的**
 * 这两个库。@cross-platform 2026-11-12：原来两处各写死一份 Windows 绝对路径，
 * 换机器 / 在 WSL 里构建就找不到（默认列表里那条 D:/SillyTavern/SillyTavern 实际上不存在）。
 *
 * 查找顺序：
 *   ① 环境变量 KAMI_ST_ROOT —— 显式指定，优先。多个目录用系统分隔符（Windows 是 ;，Linux 是 :），
 *      也接受一律用 ; 分隔（Windows 上的老写法）。
 *   ② 自动探测：本仓库所在目录的**兄弟目录**里像酒馆的那些（SillyTavern、SillyTavern-1.19.0 …）。
 *      这样只要把本仓库放在酒馆旁边，Windows / WSL / Linux 都不用设环境变量。
 *   ③ 几个常见布局兜底（老 Windows 安装器路径、/workspace/st-test、~/SillyTavern）。
 * 判定标准：目录下真的有 node_modules/showdown/dist/showdown.min.js。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 测试用的库相对路径（酒馆安装目录下） */
export const VENDOR_LIBS = {
  'showdown.js': 'node_modules/showdown/dist/showdown.min.js',
  'dompurify.js': 'node_modules/dompurify/dist/purify.min.js',
};

/** KAMI_ST_ROOT 拆成目录数组：先按系统分隔符，再按 ;（Windows 老写法） */
function fromEnv() {
  const raw = process.env.KAMI_ST_ROOT;
  if (!raw) { return []; }
  const out = [];
  for (const part of String(raw).split(path.delimiter)) {
    for (const one of part.split(';')) {
      const s = one.trim();
      if (s) { out.push(s); }
    }
  }
  return out;
}

/** 兄弟目录里像酒馆的那些（名字以 SillyTavern 开头，或有 package.json 里写 sillytavern） */
function siblings(repoRoot) {
  const out = [];
  let dir = path.resolve(repoRoot);
  for (let depth = 0; depth < 2; depth++) {
    dir = path.dirname(dir);
    let names = [];
    try { names = fs.readdirSync(dir); } catch { break; }
    for (const n of names) {
      if (!/^sillytavern/i.test(n)) { continue; }
      out.push(path.join(dir, n));
    }
    /* 安装器风格的下一层：<父>/data/sillytavern/<版本> */
    const installers = names.filter((n) => /sillytavern|launcher/i.test(n));
    for (const n of installers) {
      for (const sub of [path.join(dir, n, 'data', 'sillytavern')]) {
        try {
          for (const v of fs.readdirSync(sub)) { out.push(path.join(sub, v)); }
        } catch { /* 没有就算了 */ }
      }
    }
  }
  return out;
}

function commonPlaces() {
  const out = [];
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) { out.push(path.join(home, 'SillyTavern'), path.join(home, 'sillytavern')); }
  if (process.platform === 'win32') {
    /* Windows 上的常见位置：启动器把酒馆放在 <安装目录>/data/sillytavern/<版本> 下。
       启动器 2026-11 起装在 C:\Program Files\SillyTavern Launcher GUI（旧 D 盘路径已不存在），
       版本目录跟着当前酒馆版本走，这里两个都试。 */
    const PF = 'C:/Program Files/SillyTavern Launcher GUI/data/sillytavern';
    out.push(
      PF + '/1.19.0',
      'C:/Program Files/SillyTavern Launcher GUI/data/sillytavern/1.18.0',
      'D:/sillytavern-software/SillyTavern Launcher GUI/data/sillytavern/1.19.0',
      'D:/sillytavern-software/SillyTavern Launcher GUI/data/sillytavern/1.18.0',
    );
  } else {
    /* Linux / WSL 上的常见位置 */
    out.push('/workspace/st-test/SillyTavern', '/opt/SillyTavern', '/srv/SillyTavern');
  }
  return out;
}

/** 候选目录（去重、按顺序），不一定都存在 */
export function candidateRoots(repoRoot) {
  const seen = new Set();
  const out = [];
  for (const p of [...fromEnv(), ...siblings(repoRoot), ...commonPlaces()]) {
    const abs = path.resolve(p);
    const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
    if (seen.has(key)) { continue; }
    seen.add(key);
    out.push(abs);
  }
  return out;
}

/**
 * 在候选目录里找某个库文件；找不到返回 null。
 * 按候选顺序取第一个存在的：本机 1.18 与 1.19 的 showdown(2.1.0) / dompurify(3.4.2) 版本完全一致，
 * 两份都装了 node_modules 时用哪份做构建检查结果都一样。
 */
export function findVendorFile(name, repoRoot) {
  const rel = VENDOR_LIBS[name];
  if (!rel) { return null; }
  for (const root of candidateRoots(repoRoot)) {
    const f = path.join(root, rel);
    if (fs.existsSync(f)) { return f; }
  }
  return null;
}

/** 找不到库时给人的提示（同一句话两处共用，免得以后又各写一遍） */
export const MISSING_HINT = '设环境变量 KAMI_ST_ROOT 指向酒馆根目录（该目录下要有 node_modules/showdown）；'
  + '多个目录用系统分隔符分隔（Windows 用 ;，Linux 用 :）。把本仓库放在酒馆旁边时可以不用设。';
