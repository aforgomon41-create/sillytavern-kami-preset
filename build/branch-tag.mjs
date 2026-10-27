/**
 * 支线标记与产物命名（2026-10-27）
 * ------------------------------------------------------------------
 * 为什么需要：大改动（例如前端重构）在独立支线上做，支线产物绝不能和 main 的正式产物混淆，
 * 也不能被发版脚本、远程更新当成正式版。所以支线构建出来的产物名带上支线后缀：
 *
 *   main：  kami-v0.93-5-20261027.json
 *   支线：  kami-v0.93-1-20261027-frontend-rewrite.json
 *
 * 规则：
 *   · 支线名取自 git 当前分支（git rev-parse --abbrev-ref HEAD）；环境变量 KAMI_BRANCH 可覆盖
 *     （CI 的 detached HEAD、或想手动指定时用；设成空串 = 按 main 处理）。
 *   · main / master、detached HEAD、取不到 git（例如下载的 zip 源码）→ 不加后缀。
 *   · 后缀只保留小写字母、数字和连字符（feature/foo → feature-foo），最长 40 个字符。
 *   · 构建号按「版本 + 支线」各自计数：支线从 -1 开始，不会顶掉 main 的序号，同一天的多次构建也不互相覆盖。
 *
 * 后缀放在日期**之后**：现有所有按 `v<版本>-<构建号>-<日期>` 解析的代码（远程更新、预设设置、引导）
 * 都能照常读出版本与构建号；只有锚定了 `<日期>.json$` 的地方需要认可选后缀，见下面的 ARTIFACT_RE。
 */
import { execFileSync } from 'node:child_process';

const MAIN_BRANCHES = new Set(['main', 'master']);

/** 把任意分支名规整成产物后缀；返回 '' 表示按 main 处理（不加后缀） */
export function normalizeBranchTag(name) {
  const raw = String(name == null ? '' : name).trim();
  if (!raw || raw === 'HEAD' || MAIN_BRANCHES.has(raw)) { return ''; }
  const tag = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return MAIN_BRANCHES.has(tag) ? '' : tag;
}

/** 当前构建所在的支线后缀（'' = main） */
export function currentBranchTag(root) {
  if (Object.prototype.hasOwnProperty.call(process.env, 'KAMI_BRANCH')) {
    return normalizeBranchTag(process.env.KAMI_BRANCH);
  }
  try {
    const name = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    return normalizeBranchTag(name);
  } catch (e) {
    return '';
  }
}

/**
 * 现行产物文件名：kami-v<大>.<两位小>-<构建号>-<日期>[-<支线>].json
 * 捕获组：1 大版本、2 小版本两位、3 构建号、4 日期、5 支线（main 产物为 undefined）
 */
export const ARTIFACT_RE = /^kami-v(\d+)\.(\d+)-(\d{1,4})-(\d{8})(?:-([a-z0-9][a-z0-9-]*))?\.json$/i;

/** 解析产物文件名；认不出返回 null */
export function parseArtifactName(file) {
  const m = ARTIFACT_RE.exec(String(file || ''));
  if (!m) { return null; }
  return { major: +m[1], minorDigits: m[2], build: +m[3], date: m[4], branch: (m[5] || '').toLowerCase() };
}

/** 拼产物文件名 */
export function artifactName(major, minorDigits, build, dateTag, branch) {
  return 'kami-v' + major + '.' + minorDigits + '-' + build + '-' + dateTag + (branch ? '-' + branch : '') + '.json';
}

/** 工作区里被检出成 CRLF 的受控文本文件（.gitattributes 生效前的老检出会有）；取不到 git 返回 [] */
export function crlfWorkingFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--eol'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024
    });
    return out.split('\n').filter(line => /\bw\/(?:crlf|mixed)\b/.test(line))
      .map(line => line.split('\t').pop()).filter(Boolean);
  } catch (e) {
    return [];
  }
}
