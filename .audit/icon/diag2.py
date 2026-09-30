"""诊断二：看距离图沿几条线的剖面，找出填充卡在哪。
用法：python .audit/icon/diag2.py
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(HERE, 'raw.png')).convert('RGB')
a = np.asarray(im).astype(np.float32)
h, w, _ = a.shape
corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3),
                          a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
bg = np.median(corners, axis=0)
d = np.abs(a - bg).max(axis=2)

print('背景色', bg)
for y in (5, 100, 300, 627, 900, 1200, 1248):
    row = d[y]
    # 打印这一行上 d 首次超过阈值的位置，以及 d<=22 的连续段
    segs = []
    inrun = False
    for x in range(w):
        ok = row[x] <= 22
        if ok and not inrun:
            start = x; inrun = True
        elif not ok and inrun:
            segs.append((start, x - 1)); inrun = False
    if inrun:
        segs.append((start, w - 1))
    big = [s for s in segs if s[1] - s[0] > 20]
    print('y=%4d  d<=22 的长段(>20px): %s' % (y, big[:6]))
    print('         x=0..40 的 d: %s' % np.round(row[:40:4]).astype(int).tolist())
for x in (5, 300, 627, 1000, 1248):
    col = d[:, x]
    segs = []
    inrun = False
    for y in range(h):
        ok = col[y] <= 22
        if ok and not inrun:
            start = y; inrun = True
        elif not ok and inrun:
            segs.append((start, y - 1)); inrun = False
    if inrun:
        segs.append((start, h - 1))
    big = [s for s in segs if s[1] - s[0] > 20]
    print('x=%4d  d<=22 的长段(>20px): %s' % (x, big[:6]))
    print('         y=0..40 的 d: %s' % np.round(col[:40:4]).astype(int).tolist())
