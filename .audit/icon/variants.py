"""悬浮球观感的候选方案对比图（**只出图，不改项目任何文件**）。
用法：python .audit/icon/variants.py  → .audit/icon/variants.png

背景：原图是一张方图，主体在**下边**（73% 实心）与**右边**（43% 实心）被画面硬切掉了，
所以现在这颗球的下面和右面各有一条突兀的直线。下面五个方案都是纯后期处理（不补画、不重绘）。
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'design', 'icon', 'kami-icon-cutout.png')
OUT = os.path.join(HERE, 'variants.png')
CELL = 190


def load():
    return Image.open(SRC).convert('RGBA')


def circle_mask(size, blur=0.8):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, size[0] - 1, size[1] - 1), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def fit(im, box_w, box_h):
    r = min(box_w / im.size[0], box_h / im.size[1])
    return im.resize((max(1, int(im.size[0] * r)), max(1, int(im.size[1] * r))), Image.LANCZOS)


def square(im, size):
    """等比放进正方形画布，居中（不裁切）"""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    f = fit(im, size, size)
    canvas.alpha_composite(f, ((size - f.size[0]) // 2, (size - f.size[1]) // 2))
    return canvas


def variant_none(im, size):
    """现状：原样缩小"""
    return square(im, size)


def variant_fade(im, size):
    """B：下边与右边做 alpha 渐隐（让它"化开"，而不是被切断）"""
    src = im.convert('RGBA')
    a = np.asarray(src).astype(np.float32)
    h, w = a.shape[:2]
    yy = np.linspace(0, 1, h)[:, None]
    xx = np.linspace(0, 1, w)[None, :]
    # 下边最后 22% 渐隐；右边最后 12% 渐隐（取两者较小值）
    fy = np.clip((1.0 - yy) / 0.22, 0, 1)
    fx = np.clip((1.0 - xx) / 0.12, 0, 1)
    k = np.minimum(fy, fx)
    a[..., 3] *= k
    out = Image.fromarray(a.astype(np.uint8), 'RGBA')
    return square(out, size)


def variant_circle(im, size):
    """A：圆形裁切（把两条直线藏进圆的边缘里）"""
    s = square(im, size)
    s.putalpha(Image.fromarray((np.asarray(s)[..., 3].astype(np.float32) * (np.asarray(circle_mask((size, size))) / 255.0)).astype(np.uint8)))
    return s


def variant_coin(im, size, disc=(38, 40, 48, 255), ring=None):
    """C：圆形底板 + 剪影（"币"式）。裁线落在圆边上，看起来是有意为之；
       顺带解决浅色头发压在浅色背景上看不清的问题。"""
    s = square(im, size)
    plate = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.ellipse((0, 0, size - 1, size - 1), fill=disc)
    if ring:
        d.ellipse((1, 1, size - 2, size - 2), outline=ring[0], width=ring[1])
    # 剪影放大一点、往上挪一点：让最有信息量的头部与骰子占满圆
    big = s.resize((int(size * 1.22), int(size * 1.22)), Image.LANCZOS)
    plate.alpha_composite(big, (int(-size * 0.11), int(-size * 0.16)))
    plate.putalpha(Image.fromarray((np.asarray(plate)[..., 3].astype(np.float32) * (np.asarray(circle_mask((size, size), 1.0)) / 255.0)).astype(np.uint8)))
    return plate


def variant_bust(im, size):
    """D：只取半身（头 + 骰子 + 手），把两条裁线排除在画面外，再进圆"""
    w, h = im.size
    bust = im.crop((0, 0, w, int(h * 0.66)))
    s = square(bust, size)
    s.putalpha(Image.fromarray((np.asarray(s)[..., 3].astype(np.float32) * (np.asarray(circle_mask((size, size))) / 255.0)).astype(np.uint8)))
    return s


def label(im, text):
    out = Image.new('RGBA', (im.size[0], im.size[1] + 22), (0, 0, 0, 0))
    out.alpha_composite(im, (0, 22))
    d = ImageDraw.Draw(out)
    d.text((4, 4), text, fill=(255, 255, 255, 255))
    return out


src = load()
variants = [
    ('现状（原样）', variant_none(src, CELL)),
    ('A 圆形裁切', variant_circle(src, CELL)),
    ('B 下/右渐隐', variant_fade(src, CELL)),
    ('C 圆形底板', variant_coin(src, CELL, (38, 40, 48, 255))),
    ('C2 圆底·浅', variant_coin(src, CELL, (238, 234, 228, 255))),
    ('D 只取半身', variant_bust(src, CELL)),
]
pad = 10
sheet_w = len(variants) * (CELL + pad) + pad
sheet_h = 2 * (CELL + 22 + pad) + pad
sheet = Image.new('RGB', (sheet_w, sheet_h), (24, 25, 28))
for row, bgc in enumerate(((255, 255, 255), (24, 25, 28))):
    for col, (name, v) in enumerate(variants):
        tile = label(v, name)
        plate = Image.new('RGBA', tile.size, bgc + (255,))
        plate.alpha_composite(tile)
        sheet.paste(plate.convert('RGB'), (pad + col * (CELL + pad), pad + row * (CELL + 22 + pad)))
sheet.save(OUT)
print('已写', OUT, sheet.size, os.path.getsize(OUT), 'bytes')
