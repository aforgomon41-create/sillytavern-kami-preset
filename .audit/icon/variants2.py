"""候选方案对比图 v2（只出图，不改项目）。用法：python .audit/icon/variants2.py

关键约束（第一版对比图试出来的）：**任何一条硬切边都必须落在"看不见的地方"**——
要么被圆形/方形边界吃掉（让主体溢出圆），要么渐隐掉。
把主体"缩小到圆内"是没用的：那条直线会变成画面正中的一道硬边，比现在还难看。
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'design', 'icon', 'kami-icon-cutout.png')
OUT = os.path.join(HERE, 'variants2.png')
CELL = 190


def circle_mask(size, blur=0.9):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, size[0] - 1, size[1] - 1), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def apply_circle(im, size, blur=0.9):
    out = im.copy()
    out.putalpha(Image.fromarray((np.asarray(out)[..., 3].astype(np.float32) *
                                  (np.asarray(circle_mask((size, size), blur)) / 255.0)).astype(np.uint8)))
    return out


def overfill(im, size, scale, dx, dy):
    """把主体放大到 size*scale，再按 (dx,dy) 偏移 —— 让硬切边掉到圆外"""
    s = int(size * scale)
    big = im.resize((int(im.size[0] * s / max(im.size)), int(im.size[1] * s / max(im.size))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(big, (int(dx), int(dy)))
    return canvas


def tile_plain(im, size):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    r = min(size / im.size[0], size / im.size[1])
    f = im.resize((int(im.size[0] * r), int(im.size[1] * r)), Image.LANCZOS)
    canvas.alpha_composite(f, ((size - f.size[0]) // 2, (size - f.size[1]) // 2))
    return canvas


def v_now(im, size):
    return tile_plain(im, size)


def v_circle(im, size):
    return apply_circle(overfill(im, size, 1.30, -size * 0.17, -size * 0.13), size)


def v_coin(im, size, disc):
    plate = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(plate).ellipse((0, 0, size - 1, size - 1), fill=disc)
    plate.alpha_composite(overfill(im, size, 1.30, -size * 0.17, -size * 0.13))
    return apply_circle(plate, size, 1.0)


def v_fade(im, size, bottom=0.20, right=0.10):
    a = np.asarray(tile_plain(im, size)).astype(np.float32)
    h, w = a.shape[:2]
    fy = np.clip((1.0 - np.linspace(0, 1, h))[:, None] / bottom, 0, 1)
    fx = np.clip((1.0 - np.linspace(0, 1, w))[None, :] / right, 0, 1)
    a[..., 3] *= np.minimum(fy, fx)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def v_face(im, size):
    """头部特写：只取脸那一片（含骰子上缘），溢出圆裁 —— 64px 下最好认"""
    w, h = im.size
    crop = im.crop((int(w * 0.16), int(h * 0.02), int(w * 0.98), int(h * 0.62)))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    r = max(size / crop.size[0], size / crop.size[1]) * 1.08
    f = crop.resize((int(crop.size[0] * r), int(crop.size[1] * r)), Image.LANCZOS)
    out.alpha_composite(f, ((size - f.size[0]) // 2, int(-size * 0.06)))
    return apply_circle(out, size)


def label(im, text):
    out = Image.new('RGBA', (im.size[0], im.size[1] + 22), (0, 0, 0, 0))
    out.alpha_composite(im, (0, 22))
    ImageDraw.Draw(out).text((4, 4), text, fill=(255, 255, 255, 255))
    return out


src = Image.open(SRC).convert('RGBA')
variants = [
    ('现状', v_now(src, CELL)),
    ('A 圆裁·透明', v_circle(src, CELL)),
    ('B 下/右渐隐', v_fade(src, CELL)),
    ('C 圆底·深', v_coin(src, CELL, (34, 36, 44, 255))),
    ('C2 圆底·浅', v_coin(src, CELL, (240, 236, 229, 255))),
    ('D 头部特写·圆裁', v_face(src, CELL)),
]
pad = 10
sheet = Image.new('RGB', (len(variants) * (CELL + pad) + pad, 2 * (CELL + 22 + pad) + pad), (24, 25, 28))
for row, bgc in enumerate(((255, 255, 255), (24, 25, 28))):
    for col, (name, v) in enumerate(variants):
        t = label(v, name)
        plate = Image.new('RGBA', t.size, bgc + (255,))
        plate.alpha_composite(t)
        sheet.paste(plate.convert('RGB'), (pad + col * (CELL + pad), pad + row * (CELL + 22 + pad)))
sheet.save(OUT)
print('已写', OUT, sheet.size, os.path.getsize(OUT), 'bytes')
