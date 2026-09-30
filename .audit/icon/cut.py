"""抠图 v2：米白背景 → 透明 PNG（悬浮球用）。用法：python .audit/icon/cut.py

v1 的教训：填充容差（22）比皮肤与背景的色差（21）还大，于是填充从背景**渗进脸里**，
把脸和部分头发吃成透明。v2 改成：
  1. 键控阈值收紧到 8（平背景的实测距离 ≤2，皮肤 21、发丝高光 17、白衣 33 都远在阈值外）；
  2. 只把「与画面外相连」和「被主体包围的大块封闭背景」判成背景 —— 主体内部即使
     有像素恰好接近背景色（皮肤高光）也不会被吃，因为它跟背景不连通；
  3. 紧贴背景的那一圈里，色差仍小于 25 的像素判成**混色边**，一并透明掉（去掉奶白色描边）；
  4. 缩放走「预乘 → LANCZOS 缩放 → 反预乘」，这样边缘不会出现黑边或白边。
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw.png')
T_KEY = 8        # <= 这个距离并且与背景连通：背景
T_HOLE = 3       # 封闭背景判定要更严：平背景实测 d<=2，头发高光落在 4-8 —— 用 8 会把高光吃掉
T_FRINGE = 25    # 紧贴背景的那一圈里，色差小于它的一律算混色边（透明）
MIN_HOLE = 800   # 封闭背景连通域的最小面积
BALL_SIZE = 192
CUT_SIZE = 256

im = Image.open(RAW).convert('RGB')
a = np.asarray(im).astype(np.float32)
h, w, _ = a.shape


def geodesic_fill(seed, allow):
    """从 seed 出发、只能在 allow 里四连通扩散，返回 (填到的区域, 轮数)。"""
    cur = (seed & allow).copy()
    it = 0
    while True:
        it += 1
        nxt = cur.copy()
        nxt[1:, :] |= cur[:-1, :]
        nxt[:-1, :] |= cur[1:, :]
        nxt[:, 1:] |= cur[:, :-1]
        nxt[:, :-1] |= cur[:, 1:]
        nxt &= allow
        if np.array_equal(nxt, cur):
            return cur, it
        cur = nxt


corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3),
                          a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
bg = np.median(corners, axis=0)
d = np.abs(a - bg).max(axis=2)
print('背景色 RGB =', bg.round(1), ' 键控阈值 =', T_KEY)

hard = d <= T_KEY
seed = np.zeros((h, w), bool)
seed[0, :] = seed[-1, :] = True
seed[:, 0] = seed[:, -1] = True
bgmask, iters = geodesic_fill(seed, hard)
print('外部背景 %.1f%%（%d 轮）' % (100.0 * bgmask.mean(), iters))

# 封闭背景：与画面外不连通、但颜色几乎与背景同色的大块（左上那缕头发圈出来的米白区域）。
# 判定用更严的 T_HOLE：平背景 d<=2，头发高光落在 4-8，用 T_KEY 当门槛会把高光吃掉（v2 实测）。
flat = (d <= T_HOLE) & (~bgmask)
seen = np.zeros((h, w), bool)
holes = []
for sy, sx in np.argwhere(flat):
    if seen[sy, sx]:
        continue
    comp = []
    q = [(sy, sx)]
    seen[sy, sx] = True
    while q:
        y, x = q.pop()
        comp.append((y, x))
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and flat[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    if len(comp) >= MIN_HOLE:
        cy = sum(p[0] for p in comp) / len(comp)
        cx = sum(p[1] for p in comp) / len(comp)
        md = float(np.mean([d[y, x] for y, x in comp]))
        holes.append((comp[0][0], comp[0][1], len(comp), md, cx, cy))
print('封闭背景 %d 块：%s' % (len(holes), '；'.join('%d px 均差%.2f @(%d,%d)' % (n, md, cx, cy) for _, _, n, md, cx, cy in holes)))
for sy, sx, _, _, _, _ in holes:
    hs = np.zeros((h, w), bool)
    hs[sy, sx] = True
    got, _ = geodesic_fill(hs, hard & (~bgmask))
    bgmask |= got

# 混色边：紧贴背景、色差仍小于 T_FRINGE 的一圈
ring = np.zeros((h, w), bool)
for _ in range(2):
    nxt = ring.copy()
    nxt[1:, :] |= ring[:-1, :]
    nxt[:-1, :] |= ring[1:, :]
    nxt[:, 1:] |= ring[:, :-1]
    nxt[:, :-1] |= ring[:, 1:]
    ring = nxt | bgmask
fringe = ring & (~bgmask) & (d < T_FRINGE)
transparent = bgmask | fringe
alpha = np.where(transparent, 0.0, 255.0).astype(np.uint8)
print('全透明 %.1f%%（其中混色边 %.2f%%）' % (100.0 * transparent.mean(), 100.0 * fringe.mean()))

rgba = np.dstack([a, alpha.astype(np.float32)])
ys, xs = np.where(alpha > 0)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = int(0.015 * max(y1 - y0, x1 - x0))
y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
y1, x1 = min(h - 1, y1 + pad), min(w - 1, x1 + pad)
print('主体外框 (%d,%d,%d,%d) → %dx%d' % (x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1))
rgba = rgba[y0:y1 + 1, x0:x1 + 1]


def scaled(rgba_arr, size, circle=False):
    """预乘 → 缩放 → 反预乘 → （可选）圆形裁切，返回 PIL Image。"""
    src = Image.fromarray(rgba_arr.astype(np.uint8), 'RGBA')
    sw, sh = src.size
    if circle:
        side = min(sw, sh)
        # 圆形取景：对准主体的上 2/3（脸和骰子都在这里），而不是死板居中
        cy = int(sh * 0.40)
        cx = sw // 2
        half = side // 2
        top = max(0, min(sh - side, cy - half))
        left = max(0, min(sw - side, cx - half))
        src = src.crop((left, top, left + side, top + side))
        sw = sh = side
    ratio = size / float(max(sw, sh))
    nw, nh = max(1, int(round(sw * ratio))), max(1, int(round(sh * ratio)))
    arr = np.asarray(src).astype(np.float32)
    al = arr[..., 3:4] / 255.0
    pre = np.dstack([arr[..., :3] * al, arr[..., 3]])
    small = np.asarray(Image.fromarray(pre.astype(np.uint8), 'RGBA').resize((nw, nh), Image.LANCZOS)).astype(np.float32)
    a2 = small[..., 3:4] / 255.0
    rgb = np.clip(small[..., :3] / np.maximum(a2, 1e-3), 0, 255)
    out = np.dstack([rgb, small[..., 3]]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    if circle:
        m = Image.new('L', (nw, nh), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(m).ellipse((0, 0, nw - 1, nh - 1), fill=255)
        m = m.filter(__import__('PIL.ImageFilter', fromlist=['ImageFilter']).GaussianBlur(0.6))
        img.putalpha(Image.fromarray((np.asarray(img)[..., 3].astype(np.float32) * (np.asarray(m) / 255.0)).astype(np.uint8)))
    return img


cut = scaled(rgba, CUT_SIZE)
cut.save(os.path.join(HERE, 'icon-cutout.png'))
# 全分辨率版（1254 宽）留给用户自己拿去用（README / 别处当图标），不参与构建内联
Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(os.path.join(HERE, 'icon-cutout-full.png'))
ball = scaled(rgba, BALL_SIZE, circle=True)
ball.save(os.path.join(HERE, 'icon-ball.png'))
for f in ('icon-cutout.png', 'icon-ball.png'):
    print('%s  %d bytes  %s' % (f, os.path.getsize(os.path.join(HERE, f)), Image.open(os.path.join(HERE, f)).size))

for name, bgc in (('cutout-preview-dark.png', (32, 34, 38)), ('cutout-preview-light.png', (255, 255, 255)),
                  ('ball-preview-dark.png', (32, 34, 38)), ('ball-preview-light.png', (255, 255, 255))):
    src = ball if name.startswith('ball') else cut
    size = (src.size[0] * 2, src.size[1] * 2)
    plate = Image.new('RGBA', size, bgc + (255,))
    big = src.resize(size, Image.NEAREST)
    plate.alpha_composite(big)
    plate.convert('RGB').save(os.path.join(HERE, name))
print('预览已写')
