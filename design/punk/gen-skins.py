"""朋克系列 7 款新皮肤的生成器：python3 design/punk/gen-skins.py <仓库根>
   生成 src/skins-next/<id>/ 下的 skin.json / skin.css / fonts.src.json；改样式请改这里再重跑。
   方案见 docs/朋克皮肤系列方案.md；「霓虹」「齿轮」是从世界观挪过来的手写皮肤，不由本脚本生成。
   装饰图形全部是 SVG 遮罩（mask + background: var(--k-…)），跟着配色变色，不占素材预算。"""
import json, os, sys, urllib.parse, math

ROOT = sys.argv[1]
SK = os.path.join(ROOT, 'src/skins-next')
ICONS = json.load(open(os.path.join(SK, 'cog/skin.json')))['icons']

SANS = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif'
SERIF = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", STSong, SimSun, serif'
OPT = '[data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]'
PANEL = '[data-k="panel"]'
DLG = '[data-k="dialog"][data-k-part="content"]'
BOTH = PANEL + ', ' + DLG
HEAD = PANEL + ' > [data-k-part="head"], ' + DLG + ' > [data-k-part="head"]'
TITLE = PANEL + ' > [data-k-part="head"] > [data-k-part="title"], ' + DLG + ' > [data-k-part="head"] > [data-k-part="title"]'
BD = PANEL + ' > [data-k-ornament="surface-backdrop"], ' + DLG + ' > [data-k-ornament="surface-backdrop"]'
MSG = '[data-k="msg-view"] > [data-k-ornament="surface-backdrop"]'
CORNER = '[data-k="card"] > [data-k-ornament="card-corner"]'
FULL = '[data-k-surface][data-k-motion="full"]'


def enc(svg):
    return "url(\"data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/;,'()-.") .replace('"', "'") + "\")"


def mask(svg, extra='center / contain no-repeat'):
    u = enc(svg)
    return '-webkit-mask: ' + u + ' ' + extra + '; mask: ' + u + ' ' + extra + ';'


def svg(vb, body):
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + vb + "'>" + body + "</svg>"


def pseudo(sel, which):
    return ', '.join(s.strip() + '::' + which for s in sel.split(','))


def opt_block(colors):
    out = ['[data-k-surface] { ' + ' '.join('--k-opt-%s: %s;' % (k, v) for k, v in colors.items()) + ' }']
    for k in colors:
        out.append(OPT + '[data-k-type="%s"] { --k-opt: var(--k-opt-%s); }' % (k, k))
    out.append(OPT + ' { box-shadow: inset 3px 0 0 var(--k-opt, transparent); }')
    out.append(OPT + ' > [data-k-part="item-head"] > [data-k-part="type"] > [data-k="badge"] { background: color-mix(in srgb, var(--k-opt, var(--k-accent)) 16%, transparent); '
               'color: color-mix(in srgb, var(--k-opt, var(--k-accent)) 42%, var(--k-on)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-opt, var(--k-accent)) 45%, transparent); }')
    return '\n'.join(out)


# ───────── 形状（viewBox 0 0 24 24，除非另写） ─────────
def wedge_fan(cx, cy, r, a0, a1, n):
    """放射扇面：从 a0 到 a1 度分 n 份，隔一份填一块"""
    parts = []
    step = (a1 - a0) / n
    for i in range(0, n, 2):
        p = [(cx, cy)]
        for a in (a0 + i * step, a0 + (i + 1) * step):
            p.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
        parts.append('M' + ' L'.join('%.2f %.2f' % q for q in p) + 'Z')
    return "<path d='" + ' '.join(parts) + "'/>"


FAN = svg('0 0 24 12', wedge_fan(12, 12, 12, 180, 360, 13))
ZIG = svg('0 0 24 24', "<path d='M2 22h20v-4h-3v-4h-3v-4h-2V6h-4v4H8v4H5v4H2z'/>")
SUNBURST = svg('0 0 48 24', wedge_fan(24, 24, 24, 180, 360, 25))
TUBE = svg('0 0 24 24', "<path fill-rule='evenodd' d='M8 1h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z'/>"
            "<path d='M9 13V8.5l1.5 2.2L12 7.5l1.5 3.2L15 8.5V13h-1.2v-1.8l-.3.6L12 9.6l-1.5 2.2-.3-.6V13z'/>"
            "<rect x='6.5' y='17.5' width='11' height='2' rx='.5'/><rect x='8.4' y='19.5' width='1.4' height='3.5'/><rect x='11.3' y='19.5' width='1.4' height='3.5'/><rect x='14.2' y='19.5' width='1.4' height='3.5'/>")


def sine(w, h, cycles, sw):
    pts = []
    for i in range(0, 97):
        t = i / 96
        pts.append('%.2f %.2f' % (t * w, h / 2 - math.sin(t * cycles * math.pi * 2) * (h / 2 - sw)))
    return svg('0 0 %d %d' % (w, h), "<path d='M" + ' L'.join(pts) + "' fill='none' stroke='#000' stroke-width='%s' stroke-linecap='round'/>" % sw)


SINE_S = sine(24, 12, 1.5, 1.6)
SINE_L = sine(72, 14, 3, 1.4)
ATOM = svg('0 0 24 24', "<g fill='none' stroke='#000' stroke-width='1.5'><ellipse cx='12' cy='12' rx='10.5' ry='4'/>"
            "<ellipse cx='12' cy='12' rx='10.5' ry='4' transform='rotate(60 12 12)'/><ellipse cx='12' cy='12' rx='10.5' ry='4' transform='rotate(-60 12 12)'/></g><circle cx='12' cy='12' r='2.2'/>")
ATOM_THIN = ATOM.replace("stroke-width='1.5'", "stroke-width='.6'")
STAR4 = svg('0 0 24 24', "<path d='M12 0 13.8 10.2 24 12 13.8 13.8 12 24 10.2 13.8 0 12 10.2 10.2z'/>")
BOOMERANG = svg('0 0 24 24', "<path d='M1 22C5 9 13 3 23 2 16 7 12 12 9 22 6.5 18 4 18 1 22z'/>")
LEAF = svg('0 0 24 24', "<path d='M3 21C3 10 10 3 22 2c-1 12-8 19-19 19z'/>")


def sun_svg():
    body = "<circle cx='12' cy='12' r='5'/>"
    for i in range(8):
        a = i * 45
        body += "<rect x='11' y='1' width='2' height='5' rx='1' transform='rotate(%d 12 12)'/>" % a
    return svg('0 0 24 24', body)


SUN = sun_svg()
ARCH = svg('0 0 24 30', "<path d='M0 30V12a12 12 0 0 1 24 0v18z'/>")
VINE = svg('0 0 80 16', "<path d='M2 12C14 2 22 14 34 8s20-6 30 0 12 2 14 -2' fill='none' stroke='#000' stroke-width='1.6' stroke-linecap='round'/>"
            "<path d='M18 6c3-5 8-5 9-4-2 3-5 5-9 4zM44 9c2 5 7 6 8 5-1-3-4-6-8-5zM62 5c2-4 6-4 7-3-2 2-4 4-7 3z'/>")
KITE = svg('0 0 24 24', "<path d='M12 1 18.5 8 12 15 5.5 8z'/><path d='M12 15c-2.5 2.5 2.5 4.5 0 8' fill='none' stroke='#000' stroke-width='1.3' stroke-linecap='round'/>")
KITE_BIG = svg('0 0 24 26', "<g fill='none' stroke='#000' stroke-width='.45'><path d='M12 1 19 8.5 12 16 5 8.5z M12 1V16 M5 8.5H19'/>"
               "<path d='M12 16c-3 3 3 5 0 9.5'/><path d='M10.6 19.5l-1.4.8M13.4 21.6l1.4.8'/></g>")
KNOT = svg('0 0 24 24', "<circle cx='12' cy='12' r='2.6'/><path d='M12 9.5C9 3 3 6 9.5 11M12 14.5c3 6.5 9 3.5 2.5-1' fill='none' stroke='#000' stroke-width='1.5' stroke-linecap='round'/>")
SILK_WAVE = svg('0 0 120 20', "<path d='M0 10c15-8 25 8 40 0s25-8 40 0 25 8 40 0M0 16c15-8 25 8 40 0s25-8 40 0 25 8 40 0' fill='none' stroke='#000' stroke-width='.8'/>")
KITE_LINE = svg('0 0 80 14', "<path d='M2 3C22 14 46 14 70 6' fill='none' stroke='#000' stroke-width='1.3' stroke-linecap='round'/><path d='M70 2l7 4-7 4-3-4z'/>")
# ───────── 骸巢（生物机械）的形状 ─────────
VERTEBRA = svg('0 0 24 24', "<path d='M12 1.5 13.4 7h-2.8z'/>"
               "<path d='M1.5 10.5c3-1.8 5.4-1.8 7 .2L8 13c-2-.6-4-.2-6.5 1z M22.5 10.5c-3-1.8-5.4-1.8-7 .2L16 13c2-.6 4-.2 6.5 1z'/>"
               "<path fill-rule='evenodd' d='M12 7c3.7 0 6.2 2.5 6.2 5.6S15.7 18.4 12 18.4 5.8 15.7 5.8 12.6 8.3 7 12 7zm0 3.2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z'/>"
               "<path d='M9.2 17.6 7.6 22.5h2.1l1.2-4.4zM14.8 17.6l1.6 4.9h-2.1l-1.2-4.4z'/>")


def ribcage(sw):
    ribs = ''
    for i, (y, wd, dy) in enumerate(((5, 8.5, 4), (9.5, 9.5, 4.5), (14, 9, 4.5), (18.5, 7, 3.5))):
        ribs += "M12 %s c-%s 0-%s %s-%s %s M12 %s c%s 0 %s %s %s %s " % (y, wd * .45, wd, dy * .4, wd, dy, y, wd * .45, wd, dy * .4, wd, dy)
    return svg('0 0 24 24', "<path d='M12 1.5V23' fill='none' stroke='#000' stroke-width='%s' stroke-linecap='round' stroke-dasharray='2.2 1'/>" % (sw * 1.3) +
               "<path d='" + ribs + "' fill='none' stroke='#000' stroke-width='%s' stroke-linecap='round'/>" % sw)


RIBCAGE = ribcage(1.5)
RIBCAGE_THIN = ribcage(.45)


def hose(w=80, h=14, amp=2.5):
    body = ''
    for x in range(1, w - 2, 4):
        cy = h / 2 + amp * math.sin(x / w * 2 * math.pi)
        body += "<rect x='%d' y='%.2f' width='3' height='%.2f' rx='1.4'/>" % (x, cy - (h / 2 - 2), h - 4)
    return svg('0 0 %d %d' % (w, h), body)


HOSE = hose()
# 背景竖着的一根脊柱：一节椎骨，按纵向平铺
SPINE_TILE = svg('0 0 24 13', "<path d='M7.2 5.2 1.2 8.6l.6 1.2 6.4-2.6zM16.8 5.2l6 3.4-.6 1.2-6.4-2.6z'/>"
                 "<path fill-rule='evenodd' d='M12 1.4c3.4 0 5.6 1.9 5.6 4.6S15.4 11.4 12 11.4 6.4 8.7 6.4 6 8.6 1.4 12 1.4zm0 2.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z'/>")


def escapement(n=15, ro=11.5, ri=8.5, hole=3):
    pts = []
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = a0 + 2 * math.pi / n * 0.55
        a2 = a0 + 2 * math.pi / n
        pts.append((12 + ri * math.cos(a0), 12 + ri * math.sin(a0)))
        pts.append((12 + ro * math.cos(a1), 12 + ro * math.sin(a1)))   # 斜齿尖（擒纵轮的钩齿）
        pts.append((12 + ri * math.cos(a2 - 0.02), 12 + ri * math.sin(a2 - 0.02)))
    d = 'M' + ' L'.join('%.2f %.2f' % p for p in pts) + 'Z'
    d += ' M12 %.1f a%.1f %.1f 0 1 0 0.01 0z' % (12 - hole, hole, hole)
    spokes = ''.join("<rect x='11.4' y='3.6' width='1.2' height='5' transform='rotate(%d 12 12)'/>" % a for a in (0, 90, 180, 270))
    return svg('0 0 24 24', "<path fill-rule='evenodd' d='" + d + "'/>" + spokes)


ESC = escapement()
DIVIDER = svg('0 0 24 24', "<circle cx='12' cy='3.5' r='2'/><path d='M12 4 6.5 22.5M12 4l5.5 18.5M8.2 14.5a7 7 0 0 0 7.6 0' fill='none' stroke='#000' stroke-width='1.5' stroke-linecap='round'/>")
VITRUVIAN = svg('0 0 24 24', "<g fill='none' stroke='#000' stroke-width='.3'><circle cx='12' cy='12' r='11.3'/><rect x='2.6' y='2.6' width='18.8' height='18.8'/>"
                 "<path d='M2.6 2.6 21.4 21.4M21.4 2.6 2.6 21.4M12 .7V23.3M.7 12H23.3'/><circle cx='12' cy='12' r='5.4'/></g>")
ARC = svg('0 0 80 16', "<path d='M5 14A40 40 0 0 1 75 14' fill='none' stroke='#000' stroke-width='1.2'/><circle cx='5' cy='14' r='1.8'/><circle cx='75' cy='14' r='1.8'/><circle cx='40' cy='3' r='1.2'/>")
GRILLE = svg('0 0 24 24', "<circle cx='12' cy='12' r='12'/>")


def big_ornament(sel, shape, color, size, pos, opacity, anim=None):
    css = pseudo(sel, 'before') + ' { content: \'\'; position: absolute; ' + pos + ' width: %s; height: %s; background: %s; opacity: %s; ' % (size[0], size[1], color, opacity) + mask(shape) + ' }'
    return css


def common_tail(stroke):
    return '\n'.join([
        BD.replace(', ', ' , ') and (PANEL + ' > [data-k-ornament="surface-backdrop"], ' + DLG + ' > [data-k-ornament="surface-backdrop"] { display: block; }'),
        MSG + ' { display: block; }',
        CORNER + ' { display: block; }',
        '[data-k-icon] svg { ' + stroke + ' }',
    ])


SKINS = []

# ═════════════════════════════════ 铁翼 · 柴油朋克 ═════════════════════════════════
IRON_CSS = r'''/* 铁翼 —— 柴油朋克。装饰艺术（Art Deco）的战争机器：飞艇舱的仪表与宣传海报。
   浅色海报纸 + 宣传红 + 枪灰；深色枪灰 + 装饰艺术金。直角与阶梯切角，放射线，拉丝钢与镀铬。
   招牌：beam 探照灯光柱；环境：探照灯光带扫过。（design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #b3261e; --k-fx-alt: #7d838b; --k-fx-trace: center; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #f6e7b0; --k-fx-alt: #d9b85c; }
[data-k-surface] { --k-iron-chrome: #7d838b; --k-iron-hi: #eef0f2; --k-iron-lo: #3d4248; --k-iron-red: #b3261e; --k-iron-ray: rgba(30, 32, 36, .06); --k-iron-badge: #9e221b; }
[data-k-surface][data-k-scheme="dark"] { --k-iron-chrome: #9aa0a8; --k-iron-hi: #f2f4f6; --k-iron-lo: #2a2e33; --k-iron-red: #c8342a; --k-iron-ray: rgba(217, 184, 92, .06); --k-iron-badge: #a82a20; }
:host, [data-k-surface] { --k-amb: sweep; --k-amb-angle: -18; --k-amb-speed: 12; --k-amb-color: #b3261e; --k-amb-alpha: .05; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #f6e7b0; --k-amb-alpha: .07; }

/* ───────── 面板：镀铬双线框（外框 + 内收 6px 的细线） ───────── */
@@BOTH@@ { border-radius: 0; border: 2px solid var(--k-iron-chrome); outline: 1px solid color-mix(in srgb, var(--k-iron-chrome) 70%, transparent); outline-offset: -7px; box-shadow: 0 18px 40px rgba(0, 0, 0, .35); }
@@HEAD@@ { border-bottom: 3px double var(--k-iron-chrome); }
[data-k-surface][data-k-effects~="rays"] @@HEADX@@ { background-image: repeating-conic-gradient(from -90deg at 50% 100%, var(--k-iron-ray) 0 5deg, transparent 5deg 10deg); }
@@TITLE@@ { font-weight: 400; letter-spacing: .14em; text-transform: uppercase; }

/* ───────── 卡片：阶梯切角 ───────── */
[data-k="card"] { border-radius: 0; border: 1px solid color-mix(in srgb, var(--k-iron-chrome) 75%, transparent);
  clip-path: polygon(0 8px, 4px 8px, 4px 4px, 8px 4px, 8px 0, calc(100% - 8px) 0, calc(100% - 8px) 4px, calc(100% - 4px) 4px, calc(100% - 4px) 8px, 100% 8px, 100% calc(100% - 8px), calc(100% - 4px) calc(100% - 8px), calc(100% - 4px) calc(100% - 4px), calc(100% - 8px) calc(100% - 4px), calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px), 4px calc(100% - 4px), 4px calc(100% - 8px), 0 calc(100% - 8px)); }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-accent); box-shadow: inset 4px 0 0 var(--k-accent), inset 0 0 0 1px var(--k-accent); }

/* ───────── 按钮：镀铬铭牌；开关：重型闸刀；进度：燃油表分格 ───────── */
[data-k="button"] { border-radius: 0; border-color: var(--k-iron-chrome); letter-spacing: .1em; box-shadow: inset 0 1px 0 color-mix(in srgb, var(--k-iron-hi) 45%, transparent), 0 2px 0 var(--k-iron-lo); }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 2px 3px rgba(0, 0, 0, .35); }
[data-k="switch"] { border-radius: 2px; background: linear-gradient(180deg, #3e4349, #24282c); border-color: var(--k-iron-lo); }
[data-k="switch"][data-state="checked"] { background: linear-gradient(180deg, var(--k-iron-red), color-mix(in srgb, var(--k-iron-red) 60%, #000)); border-color: var(--k-iron-red); }
[data-k="switch"] [data-k-part="thumb"] { border-radius: 1px; background: linear-gradient(90deg, var(--k-iron-lo), var(--k-iron-hi) 50%, var(--k-iron-lo)); }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { border-radius: 1px; background: linear-gradient(90deg, var(--k-iron-lo), var(--k-iron-hi) 50%, var(--k-iron-lo)); border-color: var(--k-iron-lo); }
[data-k="progress"] { border-radius: 0; box-shadow: inset 0 0 0 1px var(--k-iron-chrome); }
[data-k="progress"] [data-k-part="indicator"] { background-image: repeating-linear-gradient(90deg, var(--k-accent) 0 10px, transparent 10px 13px); }
[data-k="tabs"] [data-k-part="list"] { border-bottom: 3px double var(--k-iron-chrome); }
[data-k="tabs"] [data-k-part="tab"] { letter-spacing: .08em; }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 -3px 0 var(--k-accent); }
/* 徽章 = 宣传红的军徽签 */
[data-k="badge"][data-tone="accent"] { border-radius: 0; background: var(--k-iron-badge); color: #fff6ec; letter-spacing: .08em; box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 30%, transparent), 2px 2px 0 var(--k-iron-lo); }
[data-k="spinner"] { border-radius: 0; border-color: var(--k-iron-chrome); }
[data-k-surface][data-k-effects~="steel"] [data-k-level="bg"] { background-image: repeating-linear-gradient(0deg, var(--k-iron-ray) 0 1px, transparent 1px 3px); }

/* ───────── 角饰：放射扇面 + 阶梯金字塔 ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 24px; height: 12px; background: var(--k-fx-alt); @@FAN@@ }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 14px; height: 14px; background: var(--k-iron-chrome); @@ZIG@@ }
@@CORNER@@ { right: 6px; bottom: 6px; width: 14px; height: 14px; background: var(--k-iron-chrome); opacity: .5; @@ZIG@@ }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { background: var(--k-accent); opacity: .9; }
/* 面板背景：底部正中一轮放射日芒 + 右上三道流线 */
[data-k-surface][data-k-effects~="rays"] @@BD_BEFORE@@ { content: ''; position: absolute; left: 50%; bottom: -2px; width: 460px; height: 230px; margin-left: -230px; background: var(--k-fx-alt); opacity: .07; @@SUNBURST@@ }
@@BD_AFTER@@ { content: ''; position: absolute; right: 0; top: 58px; width: 38%; height: 9px; opacity: .3; background: repeating-linear-gradient(180deg, var(--k-iron-chrome) 0 1px, transparent 1px 4px); }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 0; top: 10px; width: 120px; height: 9px; opacity: .25; background: repeating-linear-gradient(180deg, var(--k-iron-chrome) 0 1px, transparent 1px 4px); }

/* ───────── 消息正文：宣传海报的黑体 ───────── */
[data-k-content="body"] > * { font-family: @@SANS@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #9e221b; --k-msg-thought: #474c52; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #e2c36c; --k-msg-thought: #b2b8bf; }
[data-k-content] [data-k-part="dialogue"] { font-weight: 600; }
[data-k-content] [data-k-part="thought"] { font-style: italic; }
[data-k-content] [data-k-part="name"] { letter-spacing: .08em; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 44px; height: 22px; border: 0; background: var(--k-msg-dialogue); opacity: .6; @@FAN@@ }
'''
SKINS.append(dict(
    id='iron', name='铁翼', css=IRON_CSS,
    description='柴油朋克：装饰艺术风的战争机器——海报纸 / 枪灰、宣传红与装饰艺术金；阶梯切角、放射线、镀铬双线框；探照灯光柱扫过。',
    credits='字体 Limelight（OFL）；放射线、阶梯角饰为 SVG 绘制。',
    fonts=[{'pkg': 'limelight', 'family': 'Limelight'}],
    heading='"Limelight", ' + SANS, body=SANS,
    light=dict(neutral='#ece6da', accent='#a8231b', radius=0, elevation='shadow', danger='#9a1f1a', success='#3d6a3a', info='#2f5a7a', warning='#8a6200'),
    dark=dict(neutral='#1b1d1f', accent='#d9b85c', radius=0, elevation='outline', danger='#ee8a7a', success='#9cc48a', info='#8fb8d8', warning='#f0c860'),
    modules=['beam', 'trace', 'ambient'],
    effects=[('beam', '探照灯', '按下与打开时一道探照灯光柱从下方扫过。', '动效'),
             ('trace', '描金线', '打开时一道线从中间向两端描出。', '动效'),
             ('ambient', '光带', '探照灯光带缓缓扫过背景。（只在动效「完整」档）', '动效'),
             ('rays', '放射线', '面板标题栏与背景的装饰艺术放射线。', '装饰'),
             ('steel', '拉丝钢', '底层一层细密的拉丝钢纹。', '质感')],
    flavor={'think.done': '{name}的航迹推算', 'think.live': '{name}推算中', 'search.done': '截获 {n} 份电报', 'options.title': '下一道指令'},
    opts=dict(action='#b3261e', persona='#6a4a7a', plot='#3d6a4a', info='#2f5a7a', fun='#b08a20', nsfw='#8a1c3a', other='#5a6068'),
    stroke='stroke-width: 2; stroke-linecap: square; stroke-linejoin: miter;',
    shapes=dict(FAN=FAN, ZIG=ZIG, SUNBURST=SUNBURST),
))

# ═════════════════════════════════ 灯丝 · 真空管朋克 ═════════════════════════════════
TUBE_CSS = r'''/* 灯丝 —— 真空管朋克。电子管收音机与示波器实验台：电木外壳、网罩、琥珀灯丝、示波器绿线、数码管读数。
   招牌：scope 示波器波形；环境：指示灯闪烁。（design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #b05a10; --k-fx-alt: #2f7a4a; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #ffb347; --k-fx-alt: #6cf0a0; }
[data-k-surface] { --k-tube-amber: #b05a10; --k-tube-green: #2f7a4a; --k-tube-bake: #5a3a22; --k-tube-dot: rgba(60, 40, 20, .08); }
[data-k-surface][data-k-scheme="dark"] { --k-tube-amber: #ffb347; --k-tube-green: #6cf0a0; --k-tube-bake: #4a3020; --k-tube-dot: rgba(255, 179, 71, .07); }
:host, [data-k-surface] { --k-amb: blink; --k-amb-count: 10; --k-amb-speed: 6; --k-amb-size: 2.5; --k-amb-color: #b05a10; --k-amb-alpha: .3; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #ffb347; --k-amb-alpha: .5; }

/* ───────── 面板：电木外壳（大圆角、厚边） ───────── */
@@BOTH@@ { border-radius: 18px; border: 3px solid var(--k-tube-bake); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08), 0 18px 40px rgba(0, 0, 0, .35); }
@@HEAD@@ { border-bottom: 1px solid color-mix(in srgb, var(--k-tube-bake) 60%, transparent); background: radial-gradient(ellipse at 50% 140%, color-mix(in srgb, var(--k-tube-amber) 20%, transparent), transparent 70%); }
@@TITLE@@ { letter-spacing: .08em; }
/* 卡片：喇叭网罩的细点 */
[data-k="card"] { border-radius: 12px; border: 1px solid color-mix(in srgb, var(--k-tube-bake) 45%, transparent); }
[data-k-surface][data-k-effects~="grille"] [data-k="card"] { background-image: radial-gradient(circle, var(--k-tube-dot) 1px, transparent 1.5px); background-size: 6px 6px; }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-tube-amber); box-shadow: 0 0 0 1.5px var(--k-tube-amber), 0 0 14px color-mix(in srgb, var(--k-tube-amber) 35%, transparent); }

/* ───────── 按钮：电木按键；开关：拨动开关 + 指示灯；滑块：旋钮；进度：调谐刻度盘 ───────── */
[data-k="button"] { border-radius: 10px; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, .2), 0 1px 0 rgba(255, 255, 255, .15); }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: translateY(1px); box-shadow: inset 0 2px 3px rgba(0, 0, 0, .3); }
[data-k="switch"] { background: linear-gradient(180deg, #3a2616, #24160c); border-color: var(--k-tube-bake); }
[data-k="switch"] [data-k-part="thumb"] { background: radial-gradient(circle at 40% 40%, #d8d0c4, #8a8278 60%, #4a443c); }
[data-k="switch"][data-state="checked"] [data-k-part="thumb"] { background: radial-gradient(circle at 40% 40%, #fff3d0, #ffb347 45%, #a85a00); box-shadow: 0 0 8px #ffb347; }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { background: radial-gradient(circle, var(--k-tube-bake) 0 42%, transparent 44%), repeating-conic-gradient(var(--k-tube-bake) 0 8deg, #20140a 8deg 16deg); border: 2px solid var(--k-tube-amber); }
[data-k="progress"] { border-radius: 4px; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--k-on) 30%, transparent) 0 1px, transparent 1px 6px), var(--k-sunken); }
[data-k="progress"] [data-k-part="indicator"] { background: linear-gradient(90deg, transparent calc(100% - 3px), #e03a1f calc(100% - 3px)), color-mix(in srgb, var(--k-tube-amber) 40%, transparent); }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 -2px 0 var(--k-tube-amber); }
/* 徽章 = 数码管读数（深底琥珀字） */
[data-k="badge"][data-tone="accent"] { border-radius: 3px; background: #1a0e06; color: #ffb347; text-shadow: 0 0 4px #ff8a1a; font-family: "Michroma", @@SANS@@; box-shadow: inset 0 0 0 1px #3a2010; }
[data-k="spinner"] { border-color: var(--k-tube-amber); }

/* ───────── 角饰：电子管（灯丝在完整动效下呼吸发光）+ 正弦波 ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 18px; height: 18px; background: var(--k-tube-amber); @@TUBE@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="filament"] [data-k-ornament="panel-head-start"] { animation: k-tube-glow 2.6s ease-in-out infinite; }
@keyframes k-tube-glow { 0%, 100% { opacity: .65; } 50% { opacity: 1; } }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 20px; height: 10px; background: var(--k-tube-green); @@SINE_S@@ }
@@CORNER@@ { right: 6px; bottom: 6px; width: 13px; height: 13px; background: var(--k-tube-amber); opacity: .45; @@TUBE@@ }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { opacity: 1; }
/* 面板背景：右下角一面圆形喇叭网罩 + 左上一小块示波器网格 */
@@BD_BEFORE@@ { content: ''; position: absolute; right: -40px; bottom: -40px; width: 210px; height: 210px; opacity: .14; background: radial-gradient(circle, var(--k-tube-amber) 1.3px, transparent 1.8px) 0 0 / 8px 8px; @@GRILLE@@ }
@@BD_AFTER@@ { content: ''; position: absolute; left: 18px; top: 64px; width: 140px; height: 84px; border-radius: 10px; opacity: .1;
  background: linear-gradient(var(--k-tube-green) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, var(--k-tube-green) 1px, transparent 1px) 0 0 / 14px 14px; }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 12px; top: 8px; width: 140px; height: 18px; background: var(--k-tube-green); opacity: .18; @@SINE_L@@ }

/* ───────── 消息正文 ───────── */
[data-k-content="body"] > * { font-family: @@SANS@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #96490c; --k-msg-thought: #2a6a42; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #ffb347; --k-msg-thought: #6cf0a0; }
[data-k-content] [data-k-part="name"] { letter-spacing: .06em; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 72px; height: 14px; border: 0; background: var(--k-msg-thought); opacity: .7; @@SINE_L@@ }
'''
SKINS.append(dict(
    id='tube', name='灯丝', css=TUBE_CSS,
    description='真空管朋克：电子管收音机与示波器实验台——电木外壳、喇叭网罩、琥珀灯丝、示波器绿线、数码管读数；示波器波形扫过。',
    credits='字体 Michroma（OFL）；电子管、正弦波为 SVG 绘制。',
    fonts=[{'pkg': 'michroma', 'family': 'Michroma'}],
    heading='"Michroma", ' + SANS, body=SANS,
    light=dict(neutral='#efe8dc', accent='#9a4f10', radius=14, elevation='shadow', danger='#a02a1a', success='#2f6a42', info='#2f5a7a', warning='#8a5a00'),
    dark=dict(neutral='#14110d', accent='#ffb347', radius=14, elevation='glow', danger='#ff8a6a', success='#6cf0a0', info='#8fc8e8', warning='#ffd060'),
    modules=['scope', 'scan', 'ambient'],
    effects=[('scope', '示波器', '按下与打开时一段示波器波形扫过，带荧光余晖。', '动效'),
             ('scan', '扫描', '打开时一道扫描线自上而下。', '动效'),
             ('ambient', '指示灯', '背景里零星的指示灯明灭。（只在动效「完整」档）', '动效'),
             ('filament', '灯丝', '面板标题前的电子管，灯丝慢慢呼吸发光。', '装饰'),
             ('grille', '网罩', '卡片铺一层喇叭网罩的细点。', '质感')],
    flavor={'think.done': '{name}的信号', 'think.live': '{name}调谐中', 'search.done': '收到 {n} 路电波', 'options.title': '调谐频道'},
    opts=dict(action='#c06a14', persona='#8a4a6a', plot='#3f7a4a', info='#2f6a8a', fun='#b08a20', nsfw='#a02a2a', other='#6a5a48'),
    stroke='stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;',
    shapes=dict(TUBE=TUBE, SINE_S=SINE_S, SINE_L=SINE_L, GRILLE=GRILLE),
))

# ═════════════════════════════════ 星芒 · 原子朋克 ═════════════════════════════════
ATOM_CSS = r'''/* 星芒 —— 原子朋克。1950 年代「明日世界」太空展馆：奶油白、薄荷绿、原子橙；回旋镖与腰果形的不对称圆角、
   胶囊按钮、原子轨道、四芒星。招牌：starburst 原子星芒；环境：星星闪烁。（design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #d9532a; --k-fx-alt: #3f9e90; --k-fx-glyphs: "✦ ✧ ⋆"; --k-fx-drift: out; --k-fx-size: 8px; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #ff8a5c; --k-fx-alt: #7fd6c4; }
[data-k-surface] { --k-atom-mint: #3f9e90; --k-atom-orange: #d9532a; --k-atom-chrome: #b8c0c8; }
[data-k-surface][data-k-scheme="dark"] { --k-atom-mint: #7fd6c4; --k-atom-orange: #ff8a5c; --k-atom-chrome: #8c9aa8; }
:host, [data-k-surface] { --k-amb: glyph; --k-amb-glyphs: "✦ ✧ ⋆"; --k-amb-dir: float; --k-amb-count: 9; --k-amb-speed: 10; --k-amb-size: 6; --k-amb-color: #d9532a; --k-amb-alpha: .3; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #7fd6c4; --k-amb-alpha: .4; }

/* ───────── 面板：回旋镖形的不对称圆角 + 错位的橙色投影 ───────── */
@@BOTH@@ { border-radius: 30px 8px 30px 8px; border: 2px solid var(--k-atom-mint); box-shadow: 8px 8px 0 color-mix(in srgb, var(--k-atom-orange) 35%, transparent), 0 20px 40px rgba(0, 0, 0, .22); }
@@HEAD@@ { border-bottom: 2px solid color-mix(in srgb, var(--k-atom-mint) 50%, transparent); background: linear-gradient(100deg, color-mix(in srgb, var(--k-atom-mint) 16%, transparent), transparent 60%); }
@@TITLE@@ { letter-spacing: .04em; }
[data-k="card"] { border-radius: 18px 6px 18px 6px; border: 1.5px solid color-mix(in srgb, var(--k-atom-mint) 55%, transparent); }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-atom-orange); box-shadow: 0 0 0 2px color-mix(in srgb, var(--k-atom-orange) 40%, transparent), 4px 4px 0 color-mix(in srgb, var(--k-atom-orange) 25%, transparent); }

/* ───────── 胶囊按钮；开关：火箭控制台；滑块：带光环的行星；进度：倒计时 ───────── */
[data-k="button"] { border-radius: 999px; letter-spacing: .03em; box-shadow: 0 3px 0 color-mix(in srgb, var(--k-atom-mint) 50%, transparent); }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 color-mix(in srgb, var(--k-atom-mint) 50%, transparent); }
[data-k="switch"] { border-radius: 999px; }
[data-k="switch"][data-state="checked"] { background: linear-gradient(90deg, var(--k-atom-mint), var(--k-atom-orange)); border-color: transparent; }
[data-k="switch"] [data-k-part="thumb"] { background: radial-gradient(circle at 35% 35%, #fff, #e8ecef 55%, var(--k-atom-chrome)); }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { background: radial-gradient(circle at 35% 35%, #fff, var(--k-atom-chrome)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k-atom-orange) 40%, transparent); }
[data-k="progress"] { border-radius: 999px; }
[data-k="progress"] [data-k-part="indicator"] { background: linear-gradient(90deg, var(--k-atom-mint), var(--k-atom-orange)); }
[data-k="tabs"] [data-k-part="tab"] { border-radius: 999px; }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 0 0 1.5px var(--k-atom-orange); }
[data-k="badge"][data-tone="accent"] { border-radius: 999px; background: #ffb08a; color: #3a1606; }
[data-k="spinner"] { border-color: var(--k-atom-mint); border-top-color: var(--k-atom-orange); }

/* ───────── 角饰：原子（完整动效下轨道慢转）+ 四芒星 ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 20px; height: 20px; background: var(--k-atom-mint); @@ATOM@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="orbit"] [data-k-ornament="panel-head-start"] { animation: k-atom-spin 14s linear infinite; }
@keyframes k-atom-spin { to { transform: rotate(360deg); } }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 14px; height: 14px; background: var(--k-atom-orange); @@STAR4@@ }
@@CORNER@@ { right: 7px; bottom: 7px; width: 12px; height: 12px; background: var(--k-atom-orange); opacity: .6; @@STAR4@@ }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { opacity: 1; width: 16px; height: 16px; }
/* 面板背景：右上一枚大原子轮廓 + 左下一道回旋镖 */
@@BD_BEFORE@@ { content: ''; position: absolute; right: -60px; top: -40px; width: 250px; height: 250px; background: var(--k-atom-mint); opacity: .09; @@ATOM_THIN@@ }
[data-k-surface][data-k-effects~="chrome"] @@BD_AFTER@@ { content: ''; position: absolute; left: -20px; bottom: -10px; width: 170px; height: 170px; background: var(--k-atom-orange); opacity: .08; @@BOOMERANG@@ }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 10px; top: 8px; width: 22px; height: 22px; background: var(--k-atom-orange); opacity: .22; @@STAR4@@ }

/* ───────── 消息正文 ───────── */
[data-k-content="body"] > * { font-family: @@SANS@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #a83a16; --k-msg-thought: #2c6488; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #7fd6c4; --k-msg-thought: #a8c8ff; }
[data-k-content] [data-k-part="name"] { font-family: "Righteous", @@SANS@@; letter-spacing: .03em; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 30px; height: 30px; border: 0; background: var(--k-msg-dialogue); opacity: .55; @@ATOM@@ }
'''
SKINS.append(dict(
    id='atom', name='星芒', css=ATOM_CSS,
    description='原子朋克：1950 年代「明日世界」太空展馆——奶油白、薄荷绿、原子橙；回旋镖圆角、胶囊按钮、原子轨道；星芒弹开。',
    credits='字体 Righteous（OFL）；原子、星芒、回旋镖为 SVG 绘制。',
    fonts=[{'pkg': 'righteous', 'family': 'Righteous'}],
    heading='"Righteous", ' + SANS, body=SANS,
    light=dict(neutral='#fbf4e4', accent='#b8441c', radius=20, elevation='shadow', danger='#b02a2a', success='#2f7a6a', info='#2c6488', warning='#9a6a00'),
    dark=dict(neutral='#13202e', accent='#7fd6c4', radius=20, elevation='glow', danger='#ff8a7a', success='#7fd6c4', info='#a8c8ff', warning='#ffd070'),
    modules=['starburst', 'particles', 'ambient'],
    effects=[('starburst', '星芒', '按下与打开时一颗原子星芒弹开、转一下。', '动效'),
             ('particles', '星屑', '打开、按下时迸出几颗小星。', '动效'),
             ('ambient', '星光', '背景里星星忽明忽暗。（只在动效「完整」档）', '动效'),
             ('orbit', '原子轨道', '面板标题前的原子轨道慢慢转。', '装饰'),
             ('chrome', '回旋镖', '面板背景左下一道回旋镖弧线。', '装饰')],
    flavor={'think.done': '{name}的明日计算', 'think.live': '{name}计算中', 'search.done': '调出 {n} 份未来档案', 'options.title': '明日选项'},
    opts=dict(action='#d9532a', persona='#b0508a', plot='#3f9e90', info='#3a78b8', fun='#d8a020', nsfw='#c03050', other='#7a8590'),
    stroke='stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;',
    shapes=dict(ATOM=ATOM, ATOM_THIN=ATOM_THIN, STAR4=STAR4, BOOMERANG=BOOMERANG),
))

# ═════════════════════════════════ 向阳 · 太阳朋克 ═════════════════════════════════
SOLAR_CSS = r'''/* 向阳 —— 太阳朋克。彩绘玻璃温室：晨光白、叶绿、阳光金；拱窗顶、铅条分隔的彩色玻璃、藤蔓、太阳能板格子。
   全系列唯一以浅色为主、自然系的一款。招牌：sprout 藤蔓发芽；环境：叶片飘落。（design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #3f7d3a; --k-fx-alt: #d09a1c; --k-fx-glyphs: "· ∙"; --k-fx-drift: up; --k-fx-size: 6px; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #9fd88a; --k-fx-alt: #f0c45a; }
[data-k-surface] { --k-sol-gold: #c8901c; --k-sol-lead: #3a4a3a; --k-sol-g1: rgba(90, 160, 80, .16); --k-sol-g2: rgba(230, 180, 60, .16); --k-sol-g3: rgba(90, 160, 210, .16); }
[data-k-surface][data-k-scheme="dark"] { --k-sol-gold: #f0c45a; --k-sol-lead: #4a6050; --k-sol-g1: rgba(159, 216, 138, .12); --k-sol-g2: rgba(240, 196, 90, .12); --k-sol-g3: rgba(120, 180, 230, .12); }
:host, [data-k-surface] { --k-amb: petal; --k-amb-dir: down; --k-amb-angle: 12; --k-amb-count: 8; --k-amb-speed: 18; --k-amb-size: 6; --k-amb-color: #6aa84f; --k-amb-alpha: .35; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #9fd88a; --k-amb-alpha: .25; }

/* ───────── 面板：拱窗顶 + 铅条边 ───────── */
@@BOTH@@ { border-radius: 36px 36px 12px 12px; border: 2px solid var(--k-sol-lead); box-shadow: 0 18px 40px rgba(30, 50, 20, .2); }
@@HEAD@@ { border-bottom: 2px solid var(--k-sol-lead); }
/* 彩绘玻璃：斜向错开的色块，铅条（细深线）分隔 */
[data-k-surface][data-k-effects~="glass"] @@HEADX@@ { background: repeating-linear-gradient(90deg, transparent 0 38px, color-mix(in srgb, var(--k-sol-lead) 35%, transparent) 38px 39.5px), linear-gradient(180deg, transparent 0 55%, color-mix(in srgb, var(--k-sol-lead) 30%, transparent) 55% calc(55% + 1.5px), transparent calc(55% + 1.5px)), repeating-linear-gradient(90deg, var(--k-sol-g1) 0 39.5px, var(--k-sol-g2) 39.5px 79px, var(--k-sol-g3) 79px 118.5px, var(--k-sol-g2) 118.5px 158px); }
@@TITLE@@ { letter-spacing: .05em; }
[data-k="card"] { border-radius: 14px; border: 1.5px solid color-mix(in srgb, var(--k-sol-lead) 40%, transparent); }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-accent); box-shadow: inset 0 0 0 1px var(--k-accent), 0 0 14px color-mix(in srgb, var(--k-sol-gold) 30%, transparent); }

/* ───────── 开关：向日葵；滑块：一片叶子；进度：植物生长；页签：拱窗 ───────── */
[data-k="button"] { border-radius: 999px; border-color: color-mix(in srgb, var(--k-accent) 50%, transparent); }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: scale(.97); }
[data-k="switch"] [data-k-part="thumb"] { background: radial-gradient(circle, #6a3e12 0 30%, var(--k-sol-gold) 33% 62%, #e8b84a 65%); }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { border-radius: 0 100% 0 100%; background: var(--k-accent); border-color: var(--k-sol-lead); }
[data-k="progress"] { border-radius: 999px; }
[data-k="progress"] [data-k-part="indicator"] { background: linear-gradient(90deg, #6aa84f, var(--k-accent)); }
[data-k="tabs"] [data-k-part="tab"] { border-radius: 14px 14px 0 0; }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 2px 0 var(--k-sol-gold); }
[data-k="badge"][data-tone="accent"] { border-radius: 10px 2px 10px 2px; background: #dcefd0; color: #1f4a1c; }
[data-k="spinner"] { border-color: var(--k-accent); border-right-color: var(--k-sol-gold); }

/* ───────── 角饰：一片叶子 + 太阳（完整动效下慢转） ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 17px; height: 17px; background: var(--k-accent); @@LEAF@@ }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 16px; height: 16px; background: var(--k-sol-gold); @@SUN@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="sun"] [data-k-ornament="panel-head-end"] { animation: k-sol-spin 24s linear infinite; }
@keyframes k-sol-spin { to { transform: rotate(360deg); } }
@@CORNER@@ { right: 6px; bottom: 6px; width: 13px; height: 13px; background: var(--k-accent); opacity: .5; @@LEAF@@ }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { opacity: 1; background: var(--k-sol-gold); }
/* 面板背景：右下一扇彩绘玻璃拱窗 + 左上一小块太阳能板 */
[data-k-surface][data-k-effects~="glass"] @@BD_BEFORE@@ { content: ''; position: absolute; right: 18px; bottom: -6px; width: 150px; height: 188px; opacity: .2;
  background: linear-gradient(90deg, transparent 49%, var(--k-sol-lead) 49% 51%, transparent 51%), linear-gradient(transparent 58%, var(--k-sol-lead) 58% 60%, transparent 60%), conic-gradient(from 20deg at 50% 60%, var(--k-sol-g1), var(--k-sol-g2), var(--k-sol-g3), var(--k-sol-g1)); @@ARCH@@ }
@@BD_AFTER@@ { content: ''; position: absolute; left: 22px; top: 66px; width: 110px; height: 66px; opacity: .1; transform: skewX(-14deg);
  background: linear-gradient(var(--k-sol-lead) 1px, transparent 1px) 0 0 / 14px 11px, linear-gradient(90deg, var(--k-sol-lead) 1px, transparent 1px) 0 0 / 14px 11px; }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 8px; top: 6px; width: 100px; height: 20px; background: var(--k-accent); opacity: .2; @@VINE@@ }

/* ───────── 消息正文 ───────── */
[data-k-content="body"] > * { font-family: @@SERIF@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #2f6a2b; --k-msg-thought: #7a5010; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #9fd88a; --k-msg-thought: #e8bf62; }
[data-k-content] [data-k-part="thought"] { font-style: italic; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 80px; height: 16px; border: 0; background: var(--k-msg-dialogue); opacity: .6; @@VINE@@ }
'''
SKINS.append(dict(
    id='solar', name='向阳', css=SOLAR_CSS,
    description='太阳朋克：彩绘玻璃温室——晨光白、叶绿、阳光金；拱窗顶、铅条分隔的彩色玻璃、藤蔓与太阳能板；藤蔓发芽、叶片飘落。',
    credits='字体 Federo（OFL）；叶片、太阳、拱窗、藤蔓为 SVG 绘制。',
    fonts=[{'pkg': 'federo', 'family': 'Federo'}],
    heading='"Federo", ' + SERIF, body=SERIF,
    light=dict(neutral='#f6f8ee', accent='#3f7d3a', radius=16, elevation='shadow', danger='#a83228', success='#3f7d3a', info='#2f6a90', warning='#8a6200'),
    dark=dict(neutral='#13201a', accent='#9fd88a', radius=16, elevation='glow', danger='#f08a7a', success='#9fd88a', info='#8fc8e8', warning='#f0c45a'),
    modules=['sprout', 'particles', 'ambient'],
    effects=[('sprout', '发芽', '按下与打开时一根藤蔓长出、展开几片叶子。', '动效'),
             ('particles', '花粉', '打开、按下时飘起几粒花粉。', '动效'),
             ('ambient', '落叶', '叶片从上方缓缓飘落。（只在动效「完整」档）', '动效'),
             ('sun', '太阳', '面板标题后的小太阳慢慢转。', '装饰'),
             ('glass', '彩绘玻璃', '标题栏与面板背景的彩绘玻璃。', '装饰')],
    flavor={'think.done': '{name}的光合', 'think.live': '{name}光合中', 'search.done': '采集 {n} 份种子', 'options.title': '生长方向'},
    opts=dict(action='#3f7d3a', persona='#a0508a', plot='#c8901c', info='#2f78a0', fun='#d0a020', nsfw='#c04050', other='#7a8a70'),
    stroke='stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;',
    shapes=dict(LEAF=LEAF, SUN=SUN, ARCH=ARCH, VINE=VINE),
))

# ═════════════════════════════════ 纸鸢 · 丝绸朋克 ═════════════════════════════════
SILK_CSS = r'''/* 纸鸢 —— 丝绸朋克。竹骨绢面的机关风筝：生绢、朱红、靛蓝 / 靛夜与灯笼金；竹节细双框、框角绑结、风筝线。
   招牌：ribbon 绢带飘出；环境：小风筝向右飘。（design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #b8322a; --k-fx-alt: #2c4a6e; --k-fx-dir: down; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #e8a33a; --k-fx-alt: #e0564a; }
[data-k-surface] { --k-silk-bamboo: #8a7a4a; --k-silk-indigo: #2c4a6e; --k-silk-red: #b8322a; --k-silk-tag-bg: #f3e3c8; --k-silk-tag-fg: #6a1a14; }
[data-k-surface][data-k-scheme="dark"] { --k-silk-bamboo: #b8a46a; --k-silk-indigo: #7f9fcf; --k-silk-red: #e0564a; --k-silk-tag-bg: #2a3448; --k-silk-tag-fg: #f0c890; }
:host, [data-k-surface] { --k-amb: glyph; --k-amb-glyphs: "◇ ◆"; --k-amb-dir: right; --k-amb-count: 6; --k-amb-speed: 22; --k-amb-size: 6; --k-amb-color: #b8322a; --k-amb-alpha: .25; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #e8a33a; --k-amb-alpha: .3; }

/* ───────── 面板：竹节细双框 ───────── */
@@BOTH@@ { border-radius: 4px; border: 1px solid var(--k-silk-bamboo); outline: 1px solid color-mix(in srgb, var(--k-silk-bamboo) 70%, transparent); outline-offset: -5px; box-shadow: 0 16px 36px rgba(0, 0, 0, .25); }
@@HEAD@@ { border-bottom: 1px solid var(--k-silk-bamboo); background: linear-gradient(180deg, color-mix(in srgb, var(--k-silk-indigo) 10%, transparent), transparent); }
/* 志莽行书字面偏小、笔画细：只给面板大标题和角色名用并放大；小节标题走宋体（字体种子），保证看得清 */
@@TITLE@@ { font-family: "Zhi Mang Xing", @@SERIF@@; font-size: 1.9em; font-weight: 400; letter-spacing: .04em; line-height: 1; }
/* 卡片：四角朱红绑结 */
[data-k="card"] { border-radius: 3px; border: 1px solid color-mix(in srgb, var(--k-silk-bamboo) 70%, transparent); }
[data-k-surface][data-k-effects~="knots"] [data-k="card"] { background-image: radial-gradient(circle, var(--k-silk-red) 2px, transparent 2.6px), radial-gradient(circle, var(--k-silk-red) 2px, transparent 2.6px), radial-gradient(circle, var(--k-silk-red) 2px, transparent 2.6px), radial-gradient(circle, var(--k-silk-red) 2px, transparent 2.6px);
  background-size: 6px 6px; background-repeat: no-repeat; background-position: 1px 1px, calc(100% - 1px) 1px, 1px calc(100% - 1px), calc(100% - 1px) calc(100% - 1px); }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-accent); box-shadow: inset 0 0 0 1px var(--k-accent); }

/* ───────── 开关：风筝线轴；滑块：菱形风筝；进度：放线 ───────── */
[data-k="button"] { border-radius: 2px; border-color: var(--k-silk-bamboo); letter-spacing: .1em; }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: translateY(1px); }
[data-k="switch"] [data-k-part="thumb"] { background: radial-gradient(circle, var(--k-silk-bamboo) 0 28%, #f5efe2 31% 54%, var(--k-silk-bamboo) 57%); }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { border-radius: 0; border: 0; background: var(--k-accent); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
[data-k="progress"] { border-radius: 0; height: 6px; }
[data-k="progress"] [data-k-part="indicator"] { background: linear-gradient(90deg, color-mix(in srgb, var(--k-accent) 30%, transparent), var(--k-accent)); }
[data-k="tabs"] [data-k-part="list"] { border-bottom: 1px solid var(--k-silk-bamboo); }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 -2px 0 var(--k-accent); }
/* 徽章 = 绢签 */
[data-k="badge"][data-tone="accent"] { border-radius: 0; background: var(--k-silk-tag-bg); color: var(--k-silk-tag-fg); box-shadow: inset 3px 0 0 var(--k-silk-red); }
[data-k="spinner"] { border-color: var(--k-silk-bamboo); border-top-color: var(--k-accent); }

/* ───────── 角饰：小风筝 + 绑结 ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 16px; height: 16px; background: var(--k-accent); @@KITE@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="kite"] [data-k-ornament="panel-head-start"] { animation: k-silk-sway 4s ease-in-out infinite; transform-origin: 50% 20%; }
@keyframes k-silk-sway { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 14px; height: 14px; background: var(--k-silk-red); @@KNOT@@ }
@@CORNER@@ { right: 7px; bottom: 7px; width: 12px; height: 12px; background: var(--k-silk-indigo); opacity: .45; @@KITE@@ }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { opacity: 1; background: var(--k-accent); }
/* 面板背景：右上一只大风筝骨架 + 底部两道绢纹 */
[data-k-surface][data-k-effects~="kite"] @@BD_BEFORE@@ { content: ''; position: absolute; right: -10px; top: 40px; width: 180px; height: 195px; background: var(--k-silk-indigo); opacity: .18; @@KITE_BIG@@ }
@@BD_AFTER@@ { content: ''; position: absolute; left: 0; right: 0; bottom: 6px; height: 22px; background: var(--k-silk-indigo); opacity: .1; @@SILK_WAVE_TILE@@ }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 8px; top: 6px; width: 90px; height: 16px; background: var(--k-silk-indigo); opacity: .22; @@KITE_LINE@@ }

/* ───────── 消息正文 ───────── */
[data-k-content="body"] > * { font-family: @@SERIF@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #a02a22; --k-msg-thought: #2c4a6e; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #f0b450; --k-msg-thought: #9fb8e0; }
[data-k-content] [data-k-part="name"] { font-family: "Zhi Mang Xing", @@SERIF@@; font-size: 1.45em; letter-spacing: .02em; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 80px; height: 14px; border: 0; background: var(--k-msg-thought); opacity: .6; @@KITE_LINE@@ }
'''
SKINS.append(dict(
    id='silk', name='纸鸢', css=SILK_CSS,
    description='丝绸朋克：竹骨绢面的机关风筝——生绢、朱红、靛蓝 / 靛夜与灯笼金；竹节细双框、框角绑结、风筝线；绢带飘出、风筝远去。',
    credits='字体志莽行书（Zhi Mang Xing，OFL）；风筝、绑结、绢纹为 SVG 绘制。',
    fonts=[{'pkg': 'zhi-mang-xing', 'family': 'Zhi Mang Xing'}],
    heading=SERIF, body=SERIF,
    light=dict(neutral='#f5efe2', accent='#b0302a', radius=4, elevation='shadow', danger='#a01e1e', success='#3a6a3a', info='#2c4a6e', warning='#8a6200'),
    dark=dict(neutral='#121a26', accent='#e8a33a', radius=4, elevation='shadow', danger='#f08070', success='#9cc48a', info='#9fb8e0', warning='#f0c060'),
    modules=['ribbon', 'unroll', 'ambient'],
    effects=[('ribbon', '绢带', '按下与打开时一条绢带飘出、随风摆动。', '动效'),
             ('unroll', '展卷', '打开时像绢画一样从上往下展开。', '动效'),
             ('ambient', '风筝', '小风筝从左往右飘过背景。（只在动效「完整」档）', '动效'),
             ('kite', '风筝', '标题前的小风筝随风摆；面板背景一只大风筝骨架。', '装饰'),
             ('knots', '绑结', '卡片四角的朱红绑结。', '装饰')],
    flavor={'think.done': '{name}的机关推演', 'think.live': '{name}推演中', 'search.done': '收到 {n} 封飞鸢书', 'options.title': '放线方向'},
    opts=dict(action='#b8322a', persona='#8a3a6a', plot='#2c4a6e', info='#3a7a8a', fun='#c89020', nsfw='#a01e3c', other='#6a6050'),
    stroke='stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;',
    shapes=dict(KITE=KITE, KNOT=KNOT, KITE_BIG=KITE_BIG, KITE_LINE=KITE_LINE),
    extra={'SILK_WAVE_TILE': mask(SILK_WAVE, '0 0 / 120px 22px repeat-x')},
))

# ═════════════════════════════════ 骸巢 · 生物朋克 ═════════════════════════════════
# 用户 2026-11-07：生物朋克要的是吉格尔式的生物机械（参照：游戏《蔑视》、电影《异形》），不是微生物 → 「孢子」整款重做为「骸巢」
HIVE_CSS = r'''/* 骸巢 —— 生物朋克。吉格尔式的生物机械：骨骼、肋骨与脊椎长成的建筑，湿亮的黑色外壳，带肋的软管，括约肌一样开合的肉门。
   浅色是风干的骨与筋膜（骨白 + 干血赭）；深色是湿黑的甲壳 + 骨色，肉色只在开关打开、对白里透出来。
   招牌：iris 肉门旋开；环境：黏液从上沿挂下、坠落。（design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #7a2a1c; --k-fx-alt: #8a7a5c; --k-fx-ink: #5a2418; --k-fx-size: 10px; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #b4573c; --k-fx-alt: #c9b48a; --k-fx-ink: #3a1810; }
[data-k-surface] { --k-hv-bone: #a8987a; --k-hv-bone-hi: #e8dcc0; --k-hv-flesh: #8a3324; --k-hv-shell: #2c2a28; --k-hv-rib: rgba(60, 40, 28, .12); --k-hv-wet: rgba(255, 255, 255, .35); --k-hv-tag-bg: #e6d9bc; --k-hv-tag-fg: #3a1a10; --k-hv-vig: rgba(90, 50, 28, .16); }
[data-k-surface][data-k-scheme="dark"] { --k-hv-bone: #c9b48a; --k-hv-bone-hi: #efe2c4; --k-hv-flesh: #a8472f; --k-hv-shell: #33302d; --k-hv-rib: rgba(201, 180, 138, .08); --k-hv-wet: rgba(220, 230, 235, .12); --k-hv-tag-bg: #c9b48a; --k-hv-tag-fg: #1a0f0a; --k-hv-vig: rgba(0, 0, 0, .45); }
:host, [data-k-surface] { --k-amb: ooze; --k-amb-count: 5; --k-amb-speed: 14; --k-amb-size: 5; --k-amb-color: #6a3a26; --k-amb-alpha: .35; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #9aa39a; --k-amb-alpha: .3; }

/* ───────── 面板：湿亮的甲壳外框（顶上一道高光），标题栏是一排肋骨 ───────── */
@@BOTH@@ { border-radius: 26px 26px 10px 10px / 34px 34px 10px 10px; border: 2px solid var(--k-hv-shell); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-hv-bone) 30%, transparent), inset 0 10px 18px -12px var(--k-hv-wet), 0 22px 44px rgba(0, 0, 0, .45); }
@@HEAD@@ { border-bottom: 1px solid color-mix(in srgb, var(--k-hv-bone) 45%, transparent); }
[data-k-surface][data-k-effects~="ribs"] @@HEADX@@ { background-image: linear-gradient(180deg, var(--k-hv-wet), transparent 45%), repeating-linear-gradient(90deg, var(--k-hv-rib) 0, color-mix(in srgb, var(--k-hv-bone) 22%, transparent) 2.5px, var(--k-hv-rib) 5px, transparent 6px 8px); background-size: 100% 100%, 100% 62%; background-repeat: no-repeat; }
@@TITLE@@ { letter-spacing: .1em; }
/* 卡片：左边一节节脊椎 */
[data-k="card"] { border-radius: 16px 6px 16px 6px; border: 1px solid color-mix(in srgb, var(--k-hv-bone) 40%, transparent); box-shadow: inset 0 6px 10px -8px var(--k-hv-wet); }
[data-k-surface][data-k-effects~="ribs"] [data-k="card"] { background-image: repeating-linear-gradient(180deg, color-mix(in srgb, var(--k-hv-bone) 38%, transparent) 0 7px, transparent 7px 10px); background-size: 4px calc(100% - 24px); background-position: 6px 12px; background-repeat: no-repeat; }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-hv-flesh); box-shadow: inset 0 0 0 1px var(--k-hv-flesh), 0 0 16px color-mix(in srgb, var(--k-hv-flesh) 30%, transparent); }

/* ───────── 按钮：骨质的甲片；开关：带肋的软管 + 一节椎骨；进度：软管里灌满的体液 ───────── */
[data-k="button"] { border-radius: 14px 5px 14px 5px; border-color: color-mix(in srgb, var(--k-hv-bone) 55%, transparent); letter-spacing: .06em; box-shadow: inset 0 1px 0 var(--k-hv-wet), inset 0 -2px 0 rgba(0, 0, 0, .25); }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: scale(.96, 1.03); }
[data-k="switch"] { background: repeating-linear-gradient(90deg, #26221f 0 3px, #3a3530 3px 5px); border-color: var(--k-hv-shell); }
[data-k="switch"][data-state="checked"] { background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--k-hv-flesh) 75%, #000) 0 3px, var(--k-hv-flesh) 3px 5px); border-color: var(--k-hv-flesh); }
[data-k="switch"] [data-k-part="thumb"] { background: radial-gradient(circle at 50% 55%, #2a1a12 0 20%, var(--k-hv-bone-hi) 25% 48%, var(--k-hv-bone) 62%, #6a5a40); }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { background: radial-gradient(circle at 50% 55%, #2a1a12 0 20%, var(--k-hv-bone-hi) 25% 48%, var(--k-hv-bone) 62%, #6a5a40); border-color: var(--k-hv-shell); }
[data-k="progress"] { border-radius: 999px; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--k-on) 14%, transparent) 0 2px, transparent 2px 6px), var(--k-sunken); }
[data-k="progress"] [data-k-part="indicator"] { background: linear-gradient(180deg, var(--k-hv-wet), transparent 45%), repeating-linear-gradient(90deg, var(--k-hv-flesh) 0 4px, color-mix(in srgb, var(--k-hv-flesh) 70%, #000) 4px 6px); }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 -2px 0 var(--k-hv-bone); }
/* 徽章 = 一片骨签 */
[data-k="badge"][data-tone="accent"] { border-radius: 8px 2px 8px 2px; background: var(--k-hv-tag-bg); color: var(--k-hv-tag-fg); box-shadow: inset 0 -1px 0 rgba(0, 0, 0, .25); }
[data-k="spinner"] { border-color: var(--k-hv-bone); border-top-color: var(--k-hv-flesh); }
/* 底层四周压暗，像洞穴深处 */
[data-k-surface][data-k-effects~="ribs"] [data-k-level="bg"] { background-image: radial-gradient(ellipse 80% 70% at 50% 40%, transparent 55%, var(--k-hv-vig)); }

/* ───────── 角饰：一节椎骨（完整动效下慢慢「呼吸」）+ 一副肋骨 ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 19px; height: 19px; background: var(--k-hv-bone); @@VERTEBRA@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="breathe"] [data-k-ornament="panel-head-start"] { animation: k-hv-breathe 5s ease-in-out infinite; }
@keyframes k-hv-breathe { 0%, 100% { transform: scale(1); } 45% { transform: scale(1.1, .94); } }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 16px; height: 16px; background: var(--k-hv-bone); @@RIBCAGE@@ }
@@CORNER@@ { right: 6px; bottom: 6px; width: 14px; height: 14px; background: var(--k-hv-bone); opacity: .5; @@VERTEBRA@@ }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { opacity: 1; background: var(--k-hv-flesh); }
/* 面板背景：右侧一根贯穿上下的脊柱 + 左下一副大肋骨 */
@@BD_BEFORE@@ { content: ''; position: absolute; right: 14px; top: 0; bottom: 0; width: 46px; background: var(--k-hv-bone); opacity: .08; @@SPINE_TILE@@ }
[data-k-surface][data-k-effects~="ribs"] @@BD_AFTER@@ { content: ''; position: absolute; left: -30px; bottom: -40px; width: 240px; height: 240px; background: var(--k-hv-bone); opacity: .08; @@RIBCAGE_THIN@@ }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 8px; top: 6px; width: 90px; height: 16px; background: var(--k-hv-bone); opacity: .2; @@HOSE@@ }
/* 消息左缘一根细脊椎，贯穿整条消息 */
[data-k-surface][data-k-effects~="ribs"] @@MSG_AFTER@@ { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 22px; background: var(--k-hv-bone); opacity: .12; @@SPINE_TILE_S@@ }

/* ───────── 消息正文 ───────── */
[data-k-content="body"] > * { font-family: @@SANS@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #7a2418; --k-msg-thought: #4a4838; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #d99a76; --k-msg-thought: #9ea8ac; }
[data-k-content] [data-k-part="thought"] { font-style: italic; }
[data-k-content] [data-k-part="name"] { font-family: "Grenze Gotisch", @@SANS@@; letter-spacing: .04em; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 84px; height: 14px; border: 0; background: var(--k-msg-dialogue); opacity: .5; @@HOSE@@ }
'''
SKINS.append(dict(
    id='hive', name='骸巢', css=HIVE_CSS,
    description='生物朋克：吉格尔式的生物机械——骨骼与肋骨长成的建筑、湿亮的黑色甲壳、带肋的软管；肉门旋开、黏液垂落。',
    credits='字体 Grenze Gotisch（OFL）；椎骨、肋骨、脊柱、软管为 SVG 绘制。',
    fonts=[{'pkg': 'grenze-gotisch', 'family': 'Grenze Gotisch'}],
    heading='"Grenze Gotisch", ' + SANS, body=SANS,
    light=dict(neutral='#d8ccb4', accent='#7a2a1c', radius=10, elevation='shadow', danger='#8a1e14', success='#4a6a3a', info='#3a5a6a', warning='#7a5a10',
               # 浅色不要纸白：表面压成风干的骨色（引擎默认把浅色表面推到接近白）
               tokens={'bg': '#ddd0b5', 'surface-1': '#e8dcc3', 'surface-2': '#ddcfb2', 'surface-3': '#d3c3a3', 'sunken': '#d6c7a8', 'control': '#dccdae', 'control-hover': '#d2c2a1', 'control-active': '#c8b795'}),
    dark=dict(neutral='#0f0e0d', accent='#c9b48a', radius=10, elevation='shadow', danger='#e0806a', success='#9ab88a', info='#9ab4c0', warning='#e0c070'),
    modules=['iris', 'ink', 'ambient'],
    effects=[('iris', '肉门', '按下与打开时一扇带肋的肉门拧着旋开。', '动效'),
             ('ink', '体液', '打开时一团暗色的体液晕开。', '动效'),
             ('ambient', '黏液', '黏液从上沿挂下、拉长、坠落。（只在动效「完整」档）', '动效'),
             ('breathe', '呼吸', '面板标题前的椎骨慢慢起伏，像活的。', '装饰'),
             ('ribs', '骨肋', '标题栏的肋骨纹、卡片左侧的脊椎、面板背景的大肋骨。', '质感')],
    flavor={'think.done': '{name}的孕育记录', 'think.live': '{name}孕育中', 'search.done': '剥出 {n} 块残骸', 'options.title': '下一道肉门'},
    opts=dict(action='#8a3324', persona='#6a3a5a', plot='#5a6a3a', info='#3a5a6a', fun='#a07a20', nsfw='#9a1a2a', other='#6a6052'),
    stroke='stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;',
    shapes=dict(VERTEBRA=VERTEBRA, RIBCAGE=RIBCAGE, RIBCAGE_THIN=RIBCAGE_THIN, HOSE=HOSE),
    extra={'SPINE_TILE': mask(SPINE_TILE, 'center top / 46px 25px repeat-y'), 'SPINE_TILE_S': mask(SPINE_TILE, 'center top / 22px 12px repeat-y'),
           'MSG_AFTER': pseudo(MSG, 'after')},
))

# ═════════════════════════════════ 发条 · 发条朋克 ═════════════════════════════════
CLOCK_CSS = r'''/* 发条 —— 发条朋克。达·芬奇手稿里的机械：手稿纸、赭红粉笔线、圆规作图 / 胡桃木与铁银；擒纵轮、圆规、镜像手稿注记。
   与「齿轮」的区别：齿轮是黄铜仪表，发条是木与铁、银色机件和手稿线。招牌：clockhand 擒纵指针；环境：光柱里的浮尘下落。
   （design/punk/gen-skins.py 生成，改这里无效） */
:host, [data-k-surface] { --k-fx-glow: #9c4128; --k-fx-alt: #6a4a2a; --k-fx-trace: corner; }
[data-k-surface][data-k-scheme="dark"] { --k-fx-glow: #c9ccd2; --k-fx-alt: #c8a878; }
[data-k-surface] { --k-clk-line: rgba(156, 65, 40, .35); --k-clk-iron: #5a5a60; --k-clk-tag: #9c4128; }
[data-k-surface][data-k-scheme="dark"] { --k-clk-line: rgba(201, 204, 210, .25); --k-clk-iron: #a8acb4; --k-clk-tag: #c9ccd2; }
:host, [data-k-surface] { --k-amb: dot; --k-amb-dir: down; --k-amb-count: 12; --k-amb-speed: 22; --k-amb-size: 2; --k-amb-color: #b08a5a; --k-amb-alpha: .35; }
[data-k-surface][data-k-scheme="dark"] { --k-amb-color: #e8d8b0; --k-amb-alpha: .3; }

/* ───────── 面板：铁框 + 手稿辅助线 ───────── */
@@BOTH@@ { border-radius: 4px; border: 1px solid var(--k-clk-iron); box-shadow: 0 16px 36px rgba(0, 0, 0, .3); }
@@HEAD@@ { border-bottom: 1px solid var(--k-clk-line); }
/* 圆规作图：以标题前的擒纵轮为圆心画两道同心圆（外圈被标题栏裁掉一截，像手稿上的辅助线） */
[data-k-surface][data-k-effects~="sketch"] @@HEADX@@ { background-image: radial-gradient(circle at 34px 50%, transparent 0 15px, var(--k-clk-line) 15.5px 16.2px, transparent 16.8px 27px, var(--k-clk-line) 27.5px 28.1px, transparent 28.7px); }
@@TITLE@@ { font-weight: 400; letter-spacing: .03em; }
/* 卡片：四角十字作图记号 */
[data-k="card"] { border-radius: 3px; border: 1px solid color-mix(in srgb, var(--k-clk-iron) 50%, transparent); }
[data-k-surface][data-k-effects~="sketch"] [data-k="card"] { background-image: linear-gradient(var(--k-clk-line), var(--k-clk-line)), linear-gradient(var(--k-clk-line), var(--k-clk-line)), linear-gradient(var(--k-clk-line), var(--k-clk-line)), linear-gradient(var(--k-clk-line), var(--k-clk-line));
  background-size: 10px 1px, 1px 10px, 10px 1px, 1px 10px; background-repeat: no-repeat; background-position: 3px 7px, 7px 3px, calc(100% - 3px) calc(100% - 7px), calc(100% - 7px) calc(100% - 3px); }
[data-k="card"][data-role="choice"][data-state="selected"] { border-color: var(--k-accent); box-shadow: inset 0 0 0 1px var(--k-accent); }

/* ───────── 开关：发条钥匙；滑块：摆锤；进度：擒纵锯齿 ───────── */
[data-k="button"] { border-radius: 3px; border-color: var(--k-clk-iron); font-family: var(--k-font-heading); }
[data-k="button"]:active:not(:disabled), [data-k="icon-button"]:active:not(:disabled) { transform: translateY(1px); }
[data-k="switch"] { background: linear-gradient(180deg, #5a3e28, #3a2616); border-color: var(--k-clk-iron); }
[data-k="switch"][data-state="checked"] { background: linear-gradient(180deg, color-mix(in srgb, var(--k-accent) 80%, #000), color-mix(in srgb, var(--k-accent) 55%, #000)); }
[data-k="switch"] [data-k-part="thumb"] { background: radial-gradient(circle, transparent 0 24%, #c9ccd2 27% 62%, #6a6e76 65%); }
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] { background: radial-gradient(circle at 40% 35%, #fff 0 10%, #a8acb4 40%, #4a4a50); border-color: var(--k-clk-iron); }
[data-k="progress"] { border-radius: 2px; box-shadow: inset 0 0 0 1px var(--k-clk-iron); }
[data-k="progress"] [data-k-part="indicator"] { background: repeating-linear-gradient(120deg, var(--k-accent) 0 5px, color-mix(in srgb, var(--k-accent) 65%, transparent) 5px 8px); }
[data-k="tabs"] [data-k-part="tab"] { font-family: var(--k-font-heading); }
[data-k="tabs"] [data-k-part="tab"][data-state="active"] { box-shadow: inset 0 -2px 0 var(--k-accent); }
/* 徽章 = 手稿编号（描一圈细线） */
[data-k="badge"][data-tone="accent"] { border-radius: 999px; background: transparent; color: var(--k-clk-tag); box-shadow: inset 0 0 0 1px var(--k-clk-tag); }
[data-k="spinner"] { border-style: dotted; border-color: var(--k-clk-iron); }

/* ───────── 角饰：擒纵轮（完整动效下一格一格转）+ 圆规 ───────── */
[data-k-ornament="panel-head-start"] { display: inline-block; flex: none; width: 19px; height: 19px; background: var(--k-clk-iron); @@ESC@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="tick"] [data-k-ornament="panel-head-start"] { animation: k-clk-tick 15s steps(15) infinite; }
@keyframes k-clk-tick { to { transform: rotate(360deg); } }
[data-k-ornament="panel-head-end"] { display: inline-block; flex: none; width: 15px; height: 15px; background: var(--k-accent); @@DIVIDER@@ }
@@CORNER@@ { right: 6px; bottom: 6px; width: 14px; height: 14px; background: var(--k-clk-iron); opacity: .45; @@ESC@@ }
[data-k-surface][data-k-motion="full"][data-k-effects~="tick"] [data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { animation: k-clk-tick 6s steps(15) infinite; }
[data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] { opacity: 1; background: var(--k-accent); }
/* 面板背景：右侧一幅圆规作图（圆、方、对角线）+ 左下一行镜像手稿注记 */
[data-k-surface][data-k-effects~="sketch"] @@BD_BEFORE@@ { content: ''; position: absolute; right: -50px; top: 30px; width: 240px; height: 240px; background: var(--k-fx-glow); opacity: .14; @@VITRUVIAN@@ }
[data-k-surface][data-k-effects~="sketch"] @@BD_AFTER@@ { content: 'macchina · ruota · tempo'; position: absolute; left: 18px; bottom: 10px; font: italic 13px/1 "Almendra", serif; letter-spacing: .08em; color: var(--k-fx-glow); opacity: .22; transform: scaleX(-1); white-space: nowrap; }
@@MSG_BEFORE@@ { content: ''; position: absolute; right: 8px; top: 6px; width: 80px; height: 16px; background: var(--k-fx-glow); opacity: .2; @@ARC@@ }

/* ───────── 消息正文 ───────── */
[data-k-content="body"] > * { font-family: @@SERIF@@; }
[data-k-surface][data-k-scheme="light"] { --k-msg-dialogue: #8a3520; --k-msg-thought: #634426; }
[data-k-surface][data-k-scheme="dark"] { --k-msg-dialogue: #dadde2; --k-msg-thought: #c8a878; }
[data-k-content] [data-k-part="thought"] { font-style: italic; }
[data-k-content] [data-k-part="name"] { font-family: "Almendra", @@SERIF@@; }
[data-k-content="body"] > [data-k-part="scene-break"] { width: 80px; height: 16px; border: 0; background: var(--k-msg-dialogue); opacity: .55; @@ARC@@ }
'''
SKINS.append(dict(
    id='clock', name='发条', css=CLOCK_CSS,
    description='发条朋克：达·芬奇手稿里的机械——手稿纸与赭红粉笔线 / 胡桃木与铁银；擒纵轮、圆规作图、镜像手稿注记；指针一格一格走。',
    credits='字体 Almendra（OFL）；擒纵轮、圆规、作图线为 SVG 绘制。',
    fonts=[{'pkg': 'almendra', 'family': 'Almendra', 'weights': [400, 700]}],
    heading='"Almendra", ' + SERIF, body=SERIF,
    light=dict(neutral='#ebe4d6', accent='#963e26', radius=6, elevation='shadow', danger='#9a2a1a', success='#3d6a3a', info='#2f5a7a', warning='#8a5a00'),
    dark=dict(neutral='#1a140f', accent='#c9ccd2', radius=6, elevation='shadow', danger='#ee8a7a', success='#9cc48a', info='#9fbcd8', warning='#f0c060'),
    modules=['clockhand', 'trace', 'ambient'],
    effects=[('clockhand', '擒纵', '按下与打开时一面小钟，指针一格一格走。', '动效'),
             ('trace', '圆规', '打开时一道线沿面板边缘描一圈。', '动效'),
             ('ambient', '浮尘', '光柱里的浮尘缓缓落下。（只在动效「完整」档）', '动效'),
             ('tick', '擒纵轮', '标题前与选中卡角上的擒纵轮一格一格转。', '装饰'),
             ('sketch', '手稿线', '标题栏的圆规作图、卡角记号、背景的作图与镜像注记。', '装饰')],
    flavor={'think.done': '{name}的手稿', 'think.live': '{name}演算中', 'search.done': '翻出 {n} 页手稿', 'options.title': '下一步机关'},
    opts=dict(action='#9c4128', persona='#6a4a7a', plot='#4a6a3a', info='#3a5a7a', fun='#a07820', nsfw='#8a1c30', other='#6a6058'),
    stroke='stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;',
    shapes=dict(ESC=ESC, DIVIDER=DIVIDER, VITRUVIAN=VITRUVIAN, ARC=ARC),
))


def build_css(sk):
    css = sk['css']
    rep = {
        '@@BOTH@@': BOTH, '@@BOTHX@@': ', '.join('[data-k-surface][data-k-effects~="membrane"] ' + s.strip() for s in BOTH.split(','))[len('[data-k-surface][data-k-effects~="membrane"] '):],
        '@@HEAD@@': HEAD, '@@TITLE@@': TITLE, '@@CORNER@@': CORNER,
        '@@BD_BEFORE@@': pseudo(BD, 'before'), '@@BD_AFTER@@': pseudo(BD, 'after'), '@@MSG_BEFORE@@': pseudo(MSG, 'before'),
        '@@SANS@@': SANS, '@@SERIF@@': SERIF,
    }
    for k, v in sk['shapes'].items():
        rep['@@' + k + '@@'] = mask(v)
    for k, v in sk.get('extra', {}).items():
        rep['@@' + k + '@@'] = v
    # 前缀选择器（[data-k-surface][data-k-effects~="…"] X）遇到逗号分隔的列表时，要给每一项都加前缀
    out = []
    for line in css.split('\n'):
        for tok in ('@@HEADX@@', '@@BOTHX@@'):
            if tok in line:
                prefix, rest = line.split(tok, 1)
                base = HEAD if tok == '@@HEADX@@' else BOTH
                line = ', '.join(prefix + s.strip() for s in base.split(',')) + rest
        for tag in ('@@BD_BEFORE@@', '@@BD_AFTER@@'):
            if tag in line and not line.startswith(tag):
                prefix, rest = line.split(tag, 1)
                which = 'before' if 'BEFORE' in tag else 'after'
                line = ', '.join(prefix + s.strip() + '::' + which for s in BD.split(',')) + rest
        out.append(line)
    css = '\n'.join(out)
    for k, v in rep.items():
        css = css.replace(k, v)
    css += '\n/* ───────── 行动选项：7 种类型各一色；图标线条 ───────── */\n' + opt_block(sk['opts']) + '\n' + common_tail(sk['stroke']) + '\n'
    assert '@@' not in css, (sk['id'], [l for l in css.split('\n') if '@@' in l][:2])
    return css


def manifest(sk):
    def scheme(p):
        seeds = {'neutral': p['neutral'], 'accent': p['accent'], 'radius': p['radius'], 'elevation': p['elevation'],
                 'font': {'heading': sk['heading'], 'body': sk['body']}}
        for t in ('danger', 'success', 'info', 'warning'):
            seeds[t] = p[t]
        out = {'seeds': seeds}
        if p.get('tokens'):
            out['tokens'] = p['tokens']
        return out
    return {
        'id': sk['id'], 'name': sk['name'], 'version': '0.1.0', 'contract': '1.0',
        'description': sk['description'], 'author': '卡密预设', 'credits': sk['credits'],
        'defaultScheme': 'light' if sk['id'] in ('solar', 'atom', 'silk', 'clock') else 'dark',
        'schemes': {'light': scheme(sk['light']), 'dark': scheme(sk['dark'])},
        'modules': sk['modules'],
        'effects': [{'id': i, 'name': n, 'description': d, 'group': g, 'default': True} for i, n, d, g in sk['effects']],
        'flavor': sk['flavor'],
        'icons': ICONS,
    }


for sk in SKINS:
    d = os.path.join(SK, sk['id'])
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'skin.json'), 'w').write(json.dumps(manifest(sk), ensure_ascii=False, indent=2) + '\n')
    open(os.path.join(d, 'skin.css'), 'w').write(build_css(sk))
    open(os.path.join(d, 'fonts.src.json'), 'w').write(json.dumps(sk['fonts'], ensure_ascii=False, indent=1) + '\n')
    print(sk['id'], 'skin.css', len(build_css(sk)), 'B')
