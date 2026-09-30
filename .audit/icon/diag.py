"""诊断：量一量这张图的背景色与主体色差，决定抠图阈值（不写任何产物，只打印读数）。
用法：python .audit/icon/diag.py
"""
import numpy as np
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(HERE, 'raw.png')).convert('RGB')
a = np.asarray(im).astype(np.int16)
h, w, _ = a.shape
print('尺寸', w, 'x', h)

ring = 6
border = np.concatenate([
    a[:ring].reshape(-1, 3), a[-ring:].reshape(-1, 3),
    a[:, :ring].reshape(-1, 3), a[:, -ring:].reshape(-1, 3)])
print('边框均值', border.mean(axis=0).round(1), '中位', np.median(border, axis=0))
print('边框标准差', border.std(axis=0).round(1))
print('四角', a[3, 3], a[3, -4], a[-4, 3], a[-4, -4])

bg = np.median(border, axis=0)
d = np.abs(a - bg).max(axis=2)

def probe(name, x, y):
    print('%-14s (%4d,%4d) RGB=%s  与背景差=%d' % (name, x, y, a[y, x], d[y, x]))

for name, x, y in [
    ('背景左上', 40, 40), ('背景右上', 1200, 60), ('背景下中', 620, 1220),
    ('头发高光', 640, 300), ('头发中间调', 470, 520), ('头发暗部', 300, 800),
    ('头顶小辫', 520, 90), ('皮肤脸颊', 900, 700), ('骰子亮面', 500, 1050),
    ('骰子暗面', 800, 1150), ('衣服白', 1050, 950), ('眼白/眼', 660, 640),
]:
    probe(name, min(x, w - 1), min(y, h - 1))

for t in (4, 6, 8, 10, 12, 16, 20, 24, 30, 40):
    print('距离 <= %2d 的像素占比 %.4f' % (t, float((d <= t).mean())))
print('距离 >= 60 的像素占比 %.4f（明显是主体）' % float((d >= 60).mean()))
