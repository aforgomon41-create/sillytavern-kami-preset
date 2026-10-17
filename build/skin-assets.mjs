import fs from 'node:fs';
import path from 'node:path';

export const SKIN_ASSET_LIMIT = 256 * 1024;
export const SKIN_ASSET_TOTAL_LIMIT = 768 * 1024;
export const PRESET_ASSET_TOTAL_LIMIT = 2 * 1024 * 1024;

function inside(base, file) {
  const relative = path.relative(base, file);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function imageSize(data, ext) {
  if (ext === '.png' && data.length >= 33 && data.toString('ascii', 12, 16) === 'IHDR' && data.readUInt32BE(8) === 13) {
    for (let at = 8; at + 12 <= data.length;) {
      const len = data.readUInt32BE(at), kind = data.toString('ascii', at + 4, at + 8);
      if (at + 12 + len > data.length) throw Error('装饰图片数据不完整');
      if (kind === 'acTL') throw Error('装饰资源须为静态图片，动效由皮肤档位控制');
      at += 12 + len;
    }
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  let size;
  if (ext === '.webp') for (let at = 12; at + 8 <= data.length;) {
    const kind = data.toString('ascii', at, at + 4), len = data.readUInt32LE(at + 4), start = at + 8;
    if (start + len > data.length) throw Error('装饰图片数据不完整');
    if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && len >= 1 && (data[start] & 2))) throw Error('装饰资源须为静态图片，动效由皮肤档位控制');
    if (!size && kind === 'VP8X' && len >= 10) size = [1 + data.readUIntLE(start + 4, 3), 1 + data.readUIntLE(start + 7, 3)];
    if (!size && kind === 'VP8 ' && len >= 10) size = [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff];
    if (kind === 'VP8L' && len >= 5 && data[start] === 47) {
      const bits = data.readUInt32LE(start + 1); if (!size) size = [1 + (bits & 0x3fff), 1 + (bits >>> 14 & 0x3fff)];
    }
    at = start + len + (len % 2);
  }
  if (size) return size;
  throw Error('不能读取装饰图片尺寸');
}

// Embed each source image once in the manager's skin table, never in per-frame CSS.
export function packSkinAssets(root, id, meta, budget) {
  if (meta.assets === undefined) return meta;
  if (!meta.assets || typeof meta.assets !== 'object' || Array.isArray(meta.assets)) throw Error(id + ': assets 必须是资源名到本地文件的映射');
  const project = fs.realpathSync(root), skinRoot = fs.realpathSync(path.join(project, 'src', 'skins'));
  const base = fs.realpathSync(path.join(skinRoot, id));
  if (!inside(project, skinRoot) || !inside(skinRoot, base)) throw Error(id + ': 皮肤目录真实路径越出项目皮肤目录');
  const assets = {};
  let total = 0;
  for (const [name, source] of Object.entries(meta.assets)) {
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(name)) throw Error(id + ': 非法装饰资源名 ' + name);
    if (typeof source !== 'string' || !source.startsWith('assets/') || source.includes('\\')) throw Error(id + ': 装饰资源必须放在皮肤自己的 assets/ 目录');
    const file = fs.realpathSync(path.resolve(base, source));
    if (!inside(path.join(base, 'assets'), file)) throw Error(id + ': 装饰资源越出 assets/ 目录');
    const ext = path.extname(file).toLowerCase();
    const mime = {'.png': 'image/png', '.webp': 'image/webp'}[ext];
    if (!mime) throw Error(id + ': 装饰资源只支持 PNG、WebP');
    const size = fs.statSync(file).size;
    total += size;
    if (!size || size > SKIN_ASSET_LIMIT || total > SKIN_ASSET_TOTAL_LIMIT) throw Error(id + ': 装饰图片超出体积限制，请先按实际显示尺寸压缩');
    if (budget && (budget.bytes || 0) + total > PRESET_ASSET_TOTAL_LIMIT) throw Error('整份预设的装饰图片超过 2 MiB，请减少或压缩素材');
    const data = fs.readFileSync(file);
    const valid = ext === '.png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw Error(id + ': 图片内容与扩展名不符 ' + source);
    const [width, height] = imageSize(data, ext);
    if (!width || !height || width > 4096 || height > 4096 || width * height > 4194304) throw Error(id + ': 装饰图片像素尺寸过大');
    assets[name] = 'data:' + mime + ';base64,' + data.toString('base64');
  }
  if (budget) budget.bytes = (budget.bytes || 0) + total;
  return {...meta, assets};
}
