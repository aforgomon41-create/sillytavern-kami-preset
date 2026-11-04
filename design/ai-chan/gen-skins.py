"""AI 娘系列 8 款皮肤的生成器：python3 design/ai-chan/gen-skins.py <仓库根> [jsDelivr 钉的提交号]。
   皮肤的 skin.json / skin.css / fonts.src.json 由它生成，改样式请改这里再重跑（也会重新登记 series.json）；素材先跑 build/frontend/ai-chan-assets.mjs。"""
import json, os, sys, urllib.parse, math

ROOT = sys.argv[1]
SK = os.path.join(ROOT, 'src/skins-next')
ICONS = json.load(open(os.path.join(SK, 'sugar/skin.json')))['icons']
CDN = 'https://cdn.jsdelivr.net/gh/aforgomon41-create/sillytavern-kami-preset@{ref}/src/skins-next/{id}/assets/{f}'
REF = sys.argv[2] if len(sys.argv) > 2 else ''

SANS = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
SERIF = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", STSong, SimSun, serif'
OPT = '[data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]'
PANELS = '[data-k="panel"] > [data-k-ornament="surface-backdrop"]'
DIALOG = '[data-k="dialog"][data-k-part="content"] > [data-k-ornament="surface-backdrop"]'
MSG = '[data-k="msg-view"] > [data-k-ornament="surface-backdrop"]'
THINK_TOG = '[data-k="msg-think"] > [data-k-part="head"] > [data-k-part="toggle"]'
SEARCH_TOG = '[data-k="msg-search"] > [data-k-part="head"] > [data-k-part="toggle"]'

def enc(svg):
    return "url(\"data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/;,'()-.") .replace('"', "'") + "\")"

def mask(svg, extra='center / contain no-repeat'):
    u = enc(svg)
    return '-webkit-mask: ' + u + ' ' + extra + '; mask: ' + u + ' ' + extra + ';'

def svg(vb, body):
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + vb + "'>" + body + "</svg>"

# ───── 形状 ─────
def flower(n=12, r1=7.6, r0=2.6, c=8):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        a1, a2 = a - math.pi / n * 0.55, a + math.pi / n * 0.55
        pts.append('M%.2f %.2f L%.2f %.2f L%.2f %.2f Z' % (c + r0 * math.cos(a1), c + r0 * math.sin(a1), c + r1 * math.cos(a), c + r1 * math.sin(a), c + r0 * math.cos(a2), c + r0 * math.sin(a2)))
    return svg('0 0 16 16', "<path d='" + ' '.join(pts) + "'/><circle cx='8' cy='8' r='2.6'/>")

STAR4 = svg('0 0 16 16', "<path d='M8 0Q8.9 7.1 16 8Q8.9 8.9 8 16Q7.1 8.9 0 8Q7.1 7.1 8 0z'/>")
FLUKE = svg('0 0 24 16', "<path d='M12 15C11 10 9 7.5 5 6.5C2.8 6 1 4.6 0.5 1.5C3 3.4 6.5 3.6 9 4.6C10.6 5.3 11.6 6.4 12 7.6C12.4 6.4 13.4 5.3 15 4.6C17.5 3.6 21 3.4 23.5 1.5C23 4.6 21.2 6 19 6.5C15 7.5 13 10 12 15z'/>")
STARFIELD = svg('0 0 180 150', "<path transform='translate(20 18) scale(.75)' d='M8 0Q8.9 7.1 16 8Q8.9 8.9 8 16Q7.1 8.9 0 8Q7.1 7.1 8 0z'/><path transform='translate(118 52) scale(.5)' d='M8 0Q8.9 7.1 16 8Q8.9 8.9 8 16Q7.1 8.9 0 8Q7.1 7.1 8 0z'/><path transform='translate(64 104) scale(1)' d='M8 0Q8.9 7.1 16 8Q8.9 8.9 8 16Q7.1 8.9 0 8Q7.1 7.1 8 0z'/><circle cx='150' cy='120' r='1.2'/><circle cx='96' cy='22' r='1'/><circle cx='30' cy='80' r='.9'/>")
WAVE = svg('0 0 24 8', "<path d='M0 5Q6 0 12 5T24 5V8H0z'/>")
BUBBLES = svg('0 0 40 40', "<circle cx='8' cy='30' r='3' fill='none' stroke='#000' stroke-width='1'/><circle cx='26' cy='12' r='2' fill='none' stroke='#000' stroke-width='1'/><circle cx='33' cy='31' r='1.4' fill='none' stroke='#000' stroke-width='1'/>")
ROSE = svg('0 0 16 16', "<path d='M8 2.2c2.6 0 4.6 2 4.6 4.5 0 3-2.3 5.2-4.6 5.2S3.4 9.7 3.4 6.7C3.4 4.2 5.4 2.2 8 2.2zm0 1.6a2.9 2.9 0 0 0-2.9 2.9c0 .5.1 1 .3 1.4.4-1.6 1.6-2.6 3.1-2.6 1 0 1.8.5 2.2 1.3a2.9 2.9 0 0 0-2.7-3zM6.5 13.2h3L8 15.8z'/>")
SCALES = svg('0 0 20 12', "<path d='M0 12A10 10 0 0 1 20 12' fill='none' stroke='#000' stroke-width='1'/><path d='M-10 6A10 10 0 0 1 10 6M10 6A10 10 0 0 1 30 6' fill='none' stroke='#000' stroke-width='1'/>")
BELL = svg('0 0 16 16', "<path d='M8 1.5a1.2 1.2 0 0 1 1.2 1.2v.4A4.6 4.6 0 0 1 12.6 7.6v3l1.4 1.6H2l1.4-1.6v-3A4.6 4.6 0 0 1 6.8 3.1v-.4A1.2 1.2 0 0 1 8 1.5zM6.3 13.2h3.4a1.7 1.7 0 0 1-3.4 0z'/>")
FOX = svg('0 0 16 16', "<path d='M1 1l4.5 3.2h5L15 1l-.6 6.4L8 15 1.6 7.4z'/>")
PIXCROSS = svg('0 0 18 18', "<path d='M8 3h2v4h4v2h-4v4H8V9H4V7h4z'/>")
LACE = svg('0 0 16 8', "<path d='M0 0h16v2a4 4 0 0 1-8 0 4 4 0 0 1-8 0z'/><circle cx='4' cy='5.6' r='1'/><circle cx='12' cy='5.6' r='1'/>")
MOON = svg('0 0 16 16', "<path d='M10.5 1.5A6.6 6.6 0 1 0 14.6 11 5.4 5.4 0 0 1 10.5 1.5z'/>")
PRISM = svg('0 0 16 16', "<path d='M6 2l5.2 9.6H.8z'/><path d='M8.4 7.6L16 6v1.6L9.2 9z' opacity='.6'/>")
NOTE = svg('0 0 16 16', "<path d='M6 2.5l7-1.5v9.2a2.3 2.3 0 1 1-1.4-2.1V3.6L7.4 4.5v7.2a2.3 2.3 0 1 1-1.4-2.1z'/>")
STAFF = svg('0 0 40 14', "<path d='M0 1h40M0 4h40M0 7h40M0 10h40M0 13h40' stroke='#000' stroke-width='.8'/><ellipse cx='14' cy='8.5' rx='2' ry='1.5'/><path d='M15.9 8.5V1' stroke='#000' stroke-width='.8'/><ellipse cx='28' cy='5.5' rx='2' ry='1.5'/><path d='M29.9 5.5V-1' stroke='#000' stroke-width='.8'/>")
CRESCENT = MOON
XMARK = svg('0 0 16 16', "<path d='M2 1.5h3.2L8 5.6l2.8-4.1H14L9.6 8l4.4 6.5h-3.2L8 10.4l-2.8 4.1H2L6.4 8z'/>")
BAT = svg('0 0 24 12', "<path d='M12 3.2l1-2 .6 1.8c1.8-.3 3.8 0 5.4 1C20.6 2.6 22.6 2.4 24 3c-1.6 1-2 2.6-1.8 4.2-1.4-.8-3-.8-4 .2-.6-1.2-2-1.6-3 .2L12 11l-3.2-3.4c-1-1.8-2.4-1.4-3 .2-1-1-2.6-1-4-.2C2 6 1.6 4.4 0 3c1.4-.6 3.4-.4 5 1 1.6-1 3.6-1.3 5.4-1L11 1.2z'/>")
FAN = svg('0 0 16 12', "<path d='M8 11L.6 4.2A10.6 10.6 0 0 1 15.4 4.2z'/><path d='M8 11L4.4 1.6M8 11V.9M8 11l3.6-9.4' stroke='#fff' stroke-width='.5' fill='none'/>")
FRET = svg('0 0 16 16', "<path d='M0 0h16v16H2V4h10v8H6V8h2v2h2V6H4v8h10V2H0z'/>")
CLOUD = svg('0 0 24 12', "<path d='M5 11a4 4 0 0 1-.4-8A5 5 0 0 1 13.8 2 3.8 3.8 0 0 1 20 4.6 3.2 3.2 0 0 1 19.6 11z'/>")
BOOK = svg('0 0 16 16', "<path d='M2 2.5C4 2 6.2 2.3 8 3.6 9.8 2.3 12 2 14 2.5v10.6c-2-.5-4.2-.2-6 1.1-1.8-1.3-4-1.6-6-1.1z'/>")
SPRIG = svg('0 0 40 10', "<path d='M0 5h40' stroke='#000' stroke-width='.8'/>")

def chrys():
    return flower()

# ───── 每款 ─────
S = {}
S['ai-deepseek'] = dict(
    name='大肥鱼', default='light',
    desc='DeepSeek 娘「大肥鱼」：深海女仆咖啡厅。深藏青女仆装配色、鲸尾与气泡；按下荡开水波，背景里气泡慢慢往上浮。',
    light=dict(neutral='#eef4fb', accent='#2b4fa8', radius=14, elevation='shadow', danger='#c0392b', success='#2f8f6a', info='#2f6fb8', warning='#a8761a'),
    dark=dict(neutral='#0e1a30', accent='#7fb0ff', radius=14, elevation='glow', danger='#ff8a80', success='#7fd6b0', info='#8cc4ff', warning='#f0c060'),
    head='"ZCOOL KuaiLe", "Fredoka", ' + SANS, body=SANS,
    fonts=[{'pkg': 'zcool-kuaile', 'family': 'ZCOOL KuaiLe'}, {'pkg': 'fredoka', 'weights': [500, 600], 'family': 'Fredoka'}],
    modules=['particles', 'ripple', 'ambient'],
    effects=[('ripple', '水波', '按下时从指尖荡开一圈水波。', '动效'), ('particles', '泡泡', '打开和按下时冒出一串小气泡。', '动效'), ('ambient', '深海气泡', '面板与消息背景里，小气泡慢慢往上浮。（只在动效「完整」档）', '动效'), ('portrait', '立绘', '面板右下角站着大肥鱼（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的海底咖啡厅。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成大肥鱼的表情。', '装饰')],
    flavor={'think.live': '{name}深度思考中…', 'think.done': '{name}已深度思考', 'search.done': '已搜索到 {n} 个网页', 'options.title': '接下来吃哪口'},
    fx='--k-fx-glyphs: "○ ◦ ○ ∘"; --k-fx-drift: up; --k-fx-size: 8px; --k-fx-glow: #6fa8ff; --k-fx-alt: #c9a24a;',
    amb='--k-amb: bubble; --k-amb-dir: up; --k-amb-count: 10; --k-amb-speed: 16; --k-amb-size: 4; --k-amb-color: var(--k-accent); --k-amb-alpha: .28;',
    msg=('#1f4a9e', '#21697a', '#9cc4ff', '#86d4d8'),
    opt=('#2b6fd6', '#7a5cc8', '#2f9a7a', '#2f8fbf', '#d68a1a', '#d0405a', '#7d8aa0'),
    css=lambda: f'''
/* 女仆装：卡片是白瓷餐盘（白边 + 深藏青细线），面板标题下一道波浪 */
[data-k-surface] {{ --k-ds-rim: #ffffff; --k-ds-line: rgba(43, 79, 168, .28); --k-ds-gold: #c9a24a; --k-ds-drop: rgba(26, 52, 110, .14); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-ds-rim: #1a2a48; --k-ds-line: rgba(127, 176, 255, .30); --k-ds-gold: #d9b45e; --k-ds-drop: rgba(0, 0, 0, .45); }}
[data-k="card"] {{ border: 1px solid var(--k-ds-line); box-shadow: 0 0 0 3px var(--k-ds-rim), 0 0 0 4px var(--k-ds-line), 0 8px 18px var(--k-ds-drop); }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: 0 0 0 3px var(--k-ds-rim), 0 0 0 5px var(--k-accent), 0 8px 18px var(--k-ds-drop); }}
[data-k="panel"] > [data-k-part="head"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] {{ border-bottom: 0; background: linear-gradient(var(--k-ds-line), var(--k-ds-line)) 0 100% / 100% 1px no-repeat; }}
[data-k="panel"] > [data-k-part="head"]::after, [data-k="dialog"][data-k-part="content"] > [data-k-part="head"]::after {{ content: ''; position: absolute; left: 0; right: 0; bottom: -6px; height: 6px; background: var(--k-ds-line); {mask(WAVE, '0 0 / 24px 6px repeat-x')} pointer-events: none; }}
/* 按钮：主按钮是女仆马甲（深藏青 + 金线内框），其余是白瓷 */
[data-k="button"] {{ border-radius: var(--k-r-pill); font-family: var(--k-font-heading); }}
[data-k="button"][data-variant="primary"] {{ box-shadow: inset 0 0 0 1.5px var(--k-ds-gold), 0 3px 0 var(--k-accent-active); }}
[data-k="button"]:active:not(:disabled) {{ transform: translateY(2px); }}
/* 开关 = 海水：打开时轨道是深海渐变里浮着气泡，滑块是珍珠 */
[data-k="switch"][data-state="checked"] {{ background: radial-gradient(circle at 30% 60%, rgba(255, 255, 255, .55) 0 1.5px, transparent 2px) 0 0 / 11px 9px, linear-gradient(180deg, #4f86e8, var(--k-accent)); }}
[data-k="switch"] [data-k-part="thumb"] {{ background: radial-gradient(circle at 35% 30%, #fff 0 22%, #eaf2ff 55%, #c9dbf7); box-shadow: 0 1px 3px rgba(0, 0, 0, .3); }}
/* 进度 = 水位：波浪形的水面 */
[data-k="progress"] {{ height: 12px; border-radius: var(--k-r-pill); box-shadow: inset 0 0 0 1.5px var(--k-ds-line); }}
[data-k="progress"] > [data-k-part="indicator"] {{ background: radial-gradient(circle at 50% 120%, transparent 5px, rgba(255, 255, 255, .35) 5.5px, transparent 7px) 0 -4px / 12px 12px repeat-x, linear-gradient(180deg, #6fa8ff, var(--k-accent)); }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ background: radial-gradient(circle at 35% 30%, #fff 0 25%, #dfe9fb); box-shadow: 0 0 0 2px var(--k-accent), 0 2px 4px var(--k-ds-drop); }}
[data-k="badge"] {{ border-radius: var(--k-r-pill); box-shadow: inset 0 0 0 1px var(--k-ds-gold); }}
/* 页签：当前页底下一道小波浪 */
[data-k="tabs"] [data-k-part="list"] {{ border-bottom-color: var(--k-ds-line); }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ border-bottom-color: transparent; background: linear-gradient(var(--k-accent), var(--k-accent)) 50% 100% / 0 0 no-repeat; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"]::after {{ content: ''; position: absolute; left: 18%; right: 18%; bottom: -1px; height: 6px; background: var(--k-accent); {mask(WAVE, '0 0 / 12px 6px repeat-x')} }}
/* 标题前：鲸尾 */
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 20px; height: 14px; background: var(--k-accent); {mask(FLUKE)} }}
/* 加载：一个往上冒的泡泡 */
[data-k="spinner"] {{ border: 1.5px solid var(--k-accent); border-radius: 50%; border-top-color: var(--k-accent); animation: k-ds-bub 1.1s ease-in-out infinite; }}
@keyframes k-ds-bub {{ 0% {{ transform: translateY(3px) scale(.7); opacity: .4; }} 50% {{ transform: translateY(-1px) scale(1); opacity: 1; }} 100% {{ transform: translateY(-4px) scale(1.1); opacity: 0; }} }}
/* 面板背景：左下几颗气泡（矢量），右下站着立绘 */
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; left: 0; bottom: 0; width: 160px; height: 160px; background: var(--k-accent); opacity: .12; {mask(BUBBLES, '0 0 / 80px 80px repeat')} -webkit-mask-image: {enc(BUBBLES)}, radial-gradient(circle at 0 100%, #000, transparent 70%); }}
/* 消息：对白是深藏青、心理描写是海青色；场景转换是一道波浪；专有名词下面一道金线 */
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: normal; }}
[data-k-content] [data-k-part="term"] {{ border-bottom: 1.5px solid var(--k-ds-gold); }}
[data-k-content] [data-k-part="keyword"] {{ background: linear-gradient(transparent 62%, color-mix(in srgb, var(--k-accent) 18%, transparent) 62%); }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 96px; height: 8px; border: 0; background: var(--k-accent); opacity: .5; {mask(WAVE, '0 0 / 24px 8px repeat-x')} }}
''')

S['ai-claude'] = dict(
    name='Claude', default='light',
    desc='Claude 娘：午后暖光的书房。橘色与奶油白、皮面书的金线与橙色菊花；正文用衬线体，按下时纸页上掠过一道光泽，背景飘橙色花瓣。',
    light=dict(neutral='#faf4ea', accent='#b5541c', radius=8, elevation='shadow', danger='#b03a2e', success='#4f7f3a', info='#3f6f9f', warning='#a86a12'),
    dark=dict(neutral='#1d1814', accent='#f0915a', radius=8, elevation='shadow', danger='#f08a7a', success='#9cc98a', info='#9cbfe0', warning='#f0b860'),
    head='"Cormorant Garamond", "Noto Serif SC", ' + SERIF, body=SERIF,
    fonts=[{'pkg': 'cormorant-garamond', 'weights': [600, 700], 'family': 'Cormorant Garamond'}, {'pkg': 'noto-serif-sc', 'weights': [400, 600], 'family': 'Noto Serif SC'}],
    modules=['shine', 'particles', 'ambient'],
    effects=[('shine', '纸页光泽', '按下与打开时，一道暖光斜着掠过。', '动效'), ('particles', '菊瓣', '打开时散出几片橙色花瓣。', '动效'), ('ambient', '飘落的花瓣', '面板与消息背景里，橙色菊瓣慢慢飘落。（只在动效「完整」档）', '动效'), ('portrait', '立绘', '面板右下角站着 Claude 娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的书房。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成 Claude 娘的表情。', '装饰')],
    flavor={'think.live': '{name}正在思考…', 'think.done': '{name}想好了', 'search.done': '查阅了 {n} 份资料', 'options.title': '接下来呢'},
    fx='--k-fx-glyphs: "✻ ❀ ✻"; --k-fx-drift: down; --k-fx-size: 9px; --k-fx-glow: #f0a05a; --k-fx-alt: #c9a24a;',
    amb='--k-amb: petal; --k-amb-dir: down; --k-amb-count: 8; --k-amb-speed: 22; --k-amb-size: 5; --k-amb-color: #e8843f; --k-amb-alpha: .28;',
    msg=('#a3471a', '#6f5a48', '#f4a46c', '#cbb8a4'),
    opt=('#c2551c', '#8a5aa8', '#4f8a3a', '#3f75a8', '#c98a12', '#c0392b', '#8a7a6a'),
    css=lambda: f'''
/* 书房：卡片是皮面书——左边一道书脊（深色 + 金线），细边框；标题衬线体 */
[data-k-surface] {{ --k-cl-gold: #b8913a; --k-cl-spine: #2a1f18; --k-cl-paper: #fffaf1; --k-cl-line: rgba(122, 82, 40, .25); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-cl-gold: #d4ae5a; --k-cl-spine: #0f0b08; --k-cl-paper: #26201a; --k-cl-line: rgba(240, 180, 120, .22); }}
[data-k="card"] {{ border: 1px solid var(--k-cl-line); box-shadow: inset 4px 0 0 var(--k-cl-spine), inset 5.5px 0 0 var(--k-cl-gold), 0 2px 8px rgba(60, 30, 10, .10); }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: inset 4px 0 0 var(--k-accent), inset 0 0 0 1px var(--k-accent); }}
[data-k="panel"] > [data-k-part="head"] > [data-k-part="title"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] > [data-k-part="title"] {{ font-family: var(--k-font-heading); letter-spacing: .03em; }}
[data-k="panel"] > [data-k-part="head"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] {{ border-bottom: 3px double var(--k-cl-gold); }}
[data-k="button"] {{ border-radius: 4px; font-family: var(--k-font-heading); }}
[data-k="button"][data-variant="primary"] {{ box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25), 0 2px 0 var(--k-accent-active); }}
/* 开关 = 书签缎带：打开时轨道是橘色缎面，滑块是一朵小菊花 */
[data-k="switch"][data-state="checked"] {{ background: linear-gradient(180deg, color-mix(in srgb, var(--k-accent) 80%, #fff), var(--k-accent)); }}
[data-k="switch"] [data-k-part="thumb"] {{ background: radial-gradient(circle, #ffe2b8 0 28%, transparent 30%), #fff; box-shadow: 0 0 0 1px var(--k-cl-line), 0 1px 2px rgba(0, 0, 0, .25); }}
/* 进度 = 书页：横格纸上的橘色墨线 */
[data-k="progress"] {{ height: 8px; border-radius: 2px; background: repeating-linear-gradient(90deg, var(--k-cl-line) 0 1px, transparent 1px 8px), var(--k-surface-sunken, transparent); }}
[data-k="progress"] > [data-k-part="indicator"] {{ background: linear-gradient(90deg, var(--k-cl-gold), var(--k-accent)); }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ border-radius: 3px; background: var(--k-accent); box-shadow: 0 0 0 2px var(--k-cl-paper), 0 0 0 3px var(--k-cl-gold); }}
[data-k="badge"] {{ border-radius: 3px; font-family: var(--k-font-heading); letter-spacing: .04em; box-shadow: inset 0 0 0 1px var(--k-cl-gold); }}
[data-k="checkbox"] {{ border-radius: 2px; }}
/* 页签：书签——当前页上方垂下一条橘色缎带 */
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ border-bottom-color: var(--k-cl-gold); }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"]::before {{ content: ''; position: absolute; right: 8px; top: 0; width: 7px; height: 12px; background: var(--k-accent); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%); }}
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 16px; height: 16px; background: var(--k-accent); {mask(chrys())} }}
[data-k-surface][data-k-motion="full"] [data-k-ornament="panel-head-start"] {{ animation: k-cl-turn 14s linear infinite; }}
@keyframes k-cl-turn {{ to {{ transform: rotate(360deg); }} }}
[data-k="spinner"] {{ border: 0; animation: k-cl-turn 2.2s linear infinite; background: var(--k-accent); {mask(chrys())} }}
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; left: 12px; bottom: 12px; width: 54px; height: 54px; background: var(--k-accent); opacity: .14; {mask(chrys())} }}
/* 消息：正文衬线体、行距宽松；对白橘褐、心理描写是浅棕斜体；场景转换是三朵小菊 */
[data-k-content="body"] > * {{ font-family: "Noto Serif SC", "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", STSong, SimSun, serif; line-height: 1.95; }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: italic; }}
[data-k-content] [data-k-part="term"] {{ font-variant-caps: small-caps; border-bottom: 1px dotted currentColor; }}
[data-k-content] [data-k-part="keyword"] {{ background: linear-gradient(transparent 60%, color-mix(in srgb, var(--k-accent) 20%, transparent) 60%); }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 64px; height: 14px; border: 0; background: var(--k-accent); opacity: .55; {mask(chrys(), '0 0 / 14px 14px space')} }}
''')

S['ai-gpt'] = dict(
    name='GPT', default='light',
    desc='GPT 娘：云端白玫瑰龙庭。纯白、淡薰衣草紫与银，龙鳞底纹；打开时一圈玫瑰花瓣绕着展开，背景飘白玫瑰瓣。',
    light=dict(neutral='#f7f5fc', accent='#6e57b3', radius=18, elevation='glow', danger='#b8445a', success='#3f8a72', info='#4f73b8', warning='#a3761f'),
    dark=dict(neutral='#18162a', accent='#c4b4f4', radius=18, elevation='glow', danger='#f29aaa', success='#8fd4bc', info='#a8c0f0', warning='#e8c27a'),
    head='"Marcellus", "Noto Serif SC", ' + SERIF, body=SANS,
    fonts=[{'pkg': 'marcellus', 'family': 'Marcellus'}, {'pkg': 'noto-serif-sc', 'weights': [600], 'family': 'Noto Serif SC'}],
    modules=['orbit', 'particles', 'ambient'],
    effects=[('orbit', '花瓣环', '打开与按下时，一圈玫瑰花瓣绕着转开。', '动效'), ('particles', '花瓣', '打开时散出白玫瑰瓣。', '动效'), ('ambient', '飘落的玫瑰瓣', '面板与消息背景里，白玫瑰瓣慢慢飘落。（只在动效「完整」档）', '动效'), ('portrait', '立绘', '面板右下角站着 GPT 娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的云端龙庭。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成 GPT 娘的表情。', '装饰')],
    flavor={'think.live': '{name}推理中', 'think.done': '{name}已推理', 'search.done': '已搜索 {n} 个站点', 'options.title': '下一步'},
    fx='--k-fx-glyphs: "❀ ✧ ❀"; --k-fx-drift: out; --k-fx-size: 9px; --k-fx-glow: #b7a4ee; --k-fx-alt: #c0c4d2;',
    amb='--k-amb: petal; --k-amb-dir: down; --k-amb-count: 9; --k-amb-speed: 24; --k-amb-size: 5; --k-amb-color: #b9a8e6; --k-amb-alpha: .30;',
    msg=('#5a44a6', '#5c6488', '#cdbcff', '#b8c0dc'),
    opt=('#6e57b3', '#a05ab8', '#3f8a72', '#4f73b8', '#b07a2a', '#b8445a', '#8a8aa0'),
    css=lambda: f'''
/* 龙庭：卡片是磨砂白玉（白色内高光 + 淡紫外晕），面板底纹是极淡的龙鳞 */
[data-k-surface] {{ --k-ai-plate: 30%; --k-gp-silver: #b9bdcc; --k-gp-glow: rgba(110, 87, 179, .18); --k-gp-rim: rgba(255, 255, 255, .9); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-gp-silver: #6e7290; --k-gp-glow: rgba(196, 180, 244, .14); --k-gp-rim: rgba(255, 255, 255, .08); }}
[data-k="card"] {{ border: 1px solid color-mix(in srgb, var(--k-accent) 22%, transparent); box-shadow: inset 0 1px 0 var(--k-gp-rim), 0 6px 22px var(--k-gp-glow); }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: inset 0 0 0 1.5px var(--k-accent), 0 0 18px var(--k-gp-glow); }}
[data-k="panel"] > [data-k-part="head"] > [data-k-part="title"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] > [data-k-part="title"] {{ font-family: var(--k-font-heading); letter-spacing: .08em; }}
[data-k="button"] {{ border-radius: var(--k-r-pill); font-family: var(--k-font-heading); letter-spacing: .05em; }}
[data-k="button"][data-variant="primary"] {{ background: linear-gradient(135deg, color-mix(in srgb, var(--k-accent) 80%, #fff), var(--k-accent)); box-shadow: 0 4px 14px var(--k-gp-glow); }}
/* 开关 = 水晶：打开时轨道是淡紫水晶渐变，滑块是一颗菱形水晶 */
[data-k="switch"][data-state="checked"] {{ background: linear-gradient(135deg, #d8ccff, var(--k-accent) 70%); }}
[data-k="switch"] [data-k-part="thumb"] {{ background: linear-gradient(135deg, #ffffff 0 40%, #e6defc 60%, #c9bcf2); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); border-radius: 0; }}
/* 进度 = 银链：一颗颗银珠 */
[data-k="progress"] {{ height: 8px; }}
[data-k="progress"] > [data-k-part="indicator"] {{ background: radial-gradient(circle, #fff 0 1.2px, transparent 1.6px) 0 50% / 10px 8px repeat-x, linear-gradient(90deg, var(--k-gp-silver), var(--k-accent)); }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ background: linear-gradient(135deg, #fff, #d9cffb); box-shadow: 0 0 0 2px var(--k-accent), 0 0 10px var(--k-gp-glow); }}
[data-k="badge"] {{ border-radius: var(--k-r-pill); letter-spacing: .04em; box-shadow: inset 0 0 0 1px var(--k-gp-silver); }}
[data-k="tabs"] [data-k-part="list"] {{ border-bottom-color: color-mix(in srgb, var(--k-accent) 18%, transparent); }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); letter-spacing: .05em; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ text-shadow: 0 0 10px var(--k-gp-glow); }}
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 15px; height: 15px; background: var(--k-accent); {mask(ROSE)} }}
[data-k="spinner"] {{ border-color: color-mix(in srgb, var(--k-accent) 25%, transparent); border-top-color: var(--k-accent); }}
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; inset: 0; background: var(--k-accent); opacity: .05; {mask(SCALES, '0 0 / 26px 16px repeat')} }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: normal; }}
[data-k-content] [data-k-part="term"] {{ letter-spacing: .04em; border-bottom: 1px solid color-mix(in srgb, currentColor 40%, transparent); }}
[data-k-content] [data-k-part="keyword"] {{ background: linear-gradient(transparent 62%, color-mix(in srgb, var(--k-accent) 18%, transparent) 62%); }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 72px; height: 14px; border: 0; background: var(--k-accent); opacity: .5; {mask(ROSE, '0 0 / 14px 14px space')} }}
''')

S['ai-gemini'] = dict(
    name='Gemini', default='light',
    desc='Gemini 娘：四角星夜空。紫蓝到粉紫的虹彩渐变、四角星遍布；按下时四角星迸散，背景里星芒明灭。',
    light=dict(neutral='#f4f1ff', accent='#5f45d0', radius=16, elevation='glow', danger='#c0365a', success='#2f8f6f', info='#3f6fd0', warning='#a8701a'),
    dark=dict(neutral='#15122b', accent='#ad9bff', radius=16, elevation='glow', danger='#ff8fb0', success='#7fe0c0', info='#9cc0ff', warning='#ffc870'),
    head='"ZCOOL QingKe HuangYou", "Fredoka", ' + SANS, body=SANS,
    fonts=[{'pkg': 'zcool-qingke-huangyou', 'family': 'ZCOOL QingKe HuangYou'}, {'pkg': 'fredoka', 'weights': [500, 600], 'family': 'Fredoka'}],
    modules=['sparks', 'particles', 'ambient'],
    effects=[('sparks', '星芒迸散', '按下与打开时，四角星往外迸散。', '动效'), ('particles', '星星', '打开时冒出一把四角星。', '动效'), ('ambient', '星芒明灭', '面板与消息背景里，星芒一闪一闪。（只在动效「完整」档）', '动效'), ('portrait', '立绘', '面板右下角站着 Gemini 娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的星空。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成 Gemini 娘的表情。', '装饰')],
    flavor={'think.live': '{name}正在思考', 'think.done': '{name}的思路', 'search.done': '参考了 {n} 个网站', 'options.title': '灵感 ✦'},
    fx='--k-fx-glyphs: "✦ ✧ ✦ ⋆"; --k-fx-drift: out; --k-fx-size: 10px; --k-fx-glow: #b38cff; --k-fx-alt: #ff8fd0;',
    amb='--k-amb: blink; --k-amb-count: 14; --k-amb-speed: 6; --k-amb-size: 3; --k-amb-color: #a98cff; --k-amb-alpha: .40;',
    msg=('#7a2fb8', '#2f5fc0', '#e6a3ff', '#9cc0ff'),
    opt=('#6a4fd8', '#c04fb8', '#2f9a7f', '#3f78d8', '#d8901a', '#d0365a', '#8a84a8'),
    css=lambda: f'''
/* 虹彩：卡片描一圈紫→粉的渐变边，选中时整圈发光 */
[data-k-surface] {{ --k-gm-a: #7b5cff; --k-gm-b: #e070c8; --k-gm-c: #5fb0ff; --k-gm-glow: rgba(123, 92, 255, .22); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-gm-a: #9d86ff; --k-gm-b: #ff8fd8; --k-gm-c: #7fc4ff; --k-gm-glow: rgba(173, 155, 255, .20); }}
[data-k="card"] {{ border: 1.5px solid transparent; background: linear-gradient(var(--k-surface), var(--k-surface)) padding-box, linear-gradient(135deg, var(--k-gm-a), var(--k-gm-b) 55%, var(--k-gm-c)) border-box; }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: 0 0 0 2px var(--k-gm-glow), 0 0 22px var(--k-gm-glow); }}
[data-k="button"] {{ border-radius: var(--k-r-pill); font-family: var(--k-font-heading); letter-spacing: .04em; transition: transform 240ms cubic-bezier(.34, 1.7, .64, 1); }}
[data-k="button"][data-variant="primary"] {{ background: linear-gradient(120deg, var(--k-accent), color-mix(in srgb, var(--k-gm-b) 70%, var(--k-accent))); }}
[data-k="button"]:active:not(:disabled) {{ transform: scale(.93); }}
/* 开关 = 虹彩：打开时轨道是紫粉蓝渐变，滑块是一颗四角星 */
[data-k="switch"][data-state="checked"] {{ background: linear-gradient(90deg, var(--k-gm-c), var(--k-gm-a) 50%, var(--k-gm-b)); }}
[data-k="switch"] [data-k-part="thumb"] {{ background: #fff; border-radius: 0; {mask(STAR4)} }}
[data-k="progress"] {{ height: 10px; border-radius: var(--k-r-pill); }}
[data-k="progress"] > [data-k-part="indicator"] {{ background: linear-gradient(90deg, var(--k-gm-c), var(--k-gm-a), var(--k-gm-b), var(--k-gm-a)) 0 0 / 200% 100%; }}
[data-k-surface][data-k-motion="full"] [data-k="progress"] > [data-k-part="indicator"] {{ animation: k-gm-flow 3s linear infinite; }}
@keyframes k-gm-flow {{ to {{ background-position: -200% 0; }} }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ background: linear-gradient(135deg, var(--k-gm-a), var(--k-gm-b)); box-shadow: 0 0 0 2px #fff, 0 0 10px var(--k-gm-glow); }}
[data-k="badge"] {{ border-radius: var(--k-r-pill); font-family: var(--k-font-heading); }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); border-radius: var(--k-r-pill); border-bottom-color: transparent; }}
[data-k="tabs"] [data-k-part="list"] {{ border-bottom-color: transparent; gap: 4px; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ background: linear-gradient(120deg, color-mix(in srgb, var(--k-gm-a) 18%, transparent), color-mix(in srgb, var(--k-gm-b) 18%, transparent)); color: var(--k-on); }}
[data-k-ornament="panel-head-start"], [data-k-ornament="panel-head-end"] {{ display: inline-block; flex: none; width: 14px; height: 14px; background: linear-gradient(135deg, var(--k-gm-a), var(--k-gm-b)); {mask(STAR4)} }}
[data-k-ornament="panel-head-end"] {{ width: 9px; height: 9px; }}
[data-k-surface][data-k-motion="full"] [data-k-ornament="panel-head-end"] {{ animation: k-gm-tw 2.4s ease-in-out infinite; }}
@keyframes k-gm-tw {{ 0%, 100% {{ opacity: 1; transform: scale(1); }} 50% {{ opacity: .4; transform: scale(.6) rotate(45deg); }} }}
[data-k="spinner"] {{ border: 0; background: linear-gradient(135deg, var(--k-gm-a), var(--k-gm-b)); {mask(STAR4)} animation: k-gm-spin 1.2s cubic-bezier(.5, 0, .5, 1) infinite; }}
@keyframes k-gm-spin {{ to {{ transform: rotate(180deg); }} }}
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, var(--k-gm-a), var(--k-gm-b)); opacity: .14; {mask(STARFIELD, '0 0 / 180px 150px repeat')} }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: normal; }}
[data-k-content] [data-k-part="term"] {{ background: linear-gradient(90deg, color-mix(in srgb, currentColor 14%, transparent), transparent); border-radius: 4px; padding: 0 .2em; }}
[data-k-content] [data-k-part="keyword"] {{ text-decoration: underline 2px; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); text-underline-offset: 3px; }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 70px; height: 12px; border: 0; background: var(--k-accent); opacity: .55; {mask(STAR4, '0 0 / 12px 12px space')} }}
''')

S['ai-glm'] = dict(
    name='GLM', default='light',
    desc='GLM 娘：黑白哥特洛丽塔的狐狸书斋。只用黑、白、银、蓝（没有金色）、尖角与蕾丝；按下时用蓝墨笔圈出来，背景里银色微光浮动。',
    light=dict(neutral='#f5f5f7', accent='#1f2e5c', radius=3, elevation='outline', danger='#b0303a', success='#2f7a5a', info='#2f5fa8', warning='#8a6a1a'),
    dark=dict(neutral='#0e0e12', accent='#9cb6ec', radius=3, elevation='outline', danger='#ff8a90', success='#8fd0b0', info='#9cc0ff', warning='#e0c070'),
    head='"Playfair Display", "Noto Serif SC", ' + SERIF, body=SANS,
    fonts=[{'pkg': 'playfair-display', 'weights': [600, 700], 'family': 'Playfair Display'}, {'pkg': 'noto-serif-sc', 'weights': [600], 'family': 'Noto Serif SC'}],
    modules=['mark', 'particles', 'ambient'],
    effects=[('mark', '蓝墨圈点', '按下时一笔蓝墨圈出来（心机狐在改价签）。', '动效'), ('particles', '铃响', '打开时摇出几个小铃铛。', '动效'), ('ambient', '银色微光', '面板与消息背景里，银色微光慢慢浮动。（只在动效「完整」档）', '动效'), ('lace', '蕾丝', '卡片底边一圈白色蕾丝。', '装饰'), ('portrait', '立绘', '面板右下角站着 GLM 娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的书斋。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成 GLM 娘的表情。', '装饰')],
    flavor={'think.live': '{name}沉思中…', 'think.done': '{name}深思熟虑', 'search.done': '翻遍了 {n} 个来源', 'options.title': '限时选项'},
    fx='--k-fx-glyphs: "♪ ◇ ♪"; --k-fx-drift: out; --k-fx-size: 8px; --k-fx-glow: #5f86d8; --k-fx-alt: #b8bcc8;',
    amb='--k-amb: dot; --k-amb-dir: up; --k-amb-count: 12; --k-amb-speed: 18; --k-amb-size: 2; --k-amb-color: #9aa3b8; --k-amb-alpha: .45;',
    msg=('#1f3f8a', '#4a4f5c', '#a8c4ff', '#b8bcc8'),
    opt=('#1f3f8a', '#5a4a8a', '#2f6f5a', '#2f6fa8', '#8a6a2a', '#a8303a', '#6a6e78'),
    css=lambda: f'''
/* 洛丽塔：黑白高对比、尖角、双线边框；卡片底边一圈蕾丝 */
[data-k-surface] {{ --k-gl-ink: #111114; --k-gl-paper: #ffffff; --k-gl-silver: #a8adb8; }}
[data-k-surface][data-k-scheme="dark"] {{ --k-gl-ink: #eceef4; --k-gl-paper: #16161c; --k-gl-silver: #5a5f6c; }}
[data-k="card"] {{ border: 1px solid var(--k-gl-ink); box-shadow: inset 0 0 0 3px var(--k-gl-paper), inset 0 0 0 4px var(--k-gl-silver); }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: inset 0 0 0 3px var(--k-gl-paper), inset 0 0 0 5px var(--k-accent); }}
[data-k-surface][data-k-effects~="lace"] [data-k="card"][data-role="container"]::after {{ content: ''; position: absolute; left: 6px; right: 6px; bottom: -7px; height: 7px; background: var(--k-gl-ink); opacity: .55; {mask(LACE, '0 0 / 14px 7px repeat-x')} pointer-events: none; }}
[data-k="panel"] > [data-k-part="head"] > [data-k-part="title"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] > [data-k-part="title"] {{ font-family: var(--k-font-heading); font-style: italic; letter-spacing: .02em; }}
[data-k="panel"] > [data-k-part="head"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] {{ border-bottom: 3px double var(--k-gl-ink); }}
[data-k="button"] {{ border-radius: 2px; font-family: var(--k-font-heading); letter-spacing: .04em; border: 1px solid var(--k-gl-ink); }}
[data-k="button"][data-variant="primary"] {{ box-shadow: inset 0 0 0 2px var(--k-gl-paper); }}
/* 开关 = 黑白琴键：打开时黑底白字般的深色轨道，滑块是一颗小银铃 */
[data-k="switch"] {{ border-radius: 2px; }}
[data-k="switch"][data-state="checked"] {{ background: var(--k-accent); box-shadow: inset 0 0 0 2px var(--k-gl-paper); }}
[data-k="switch"] [data-k-part="thumb"] {{ border-radius: 2px; background: linear-gradient(180deg, #ffffff, #cfd3dc); box-shadow: 0 0 0 1px var(--k-gl-ink); }}
/* 进度 = 像素十字纹的裙摆 */
[data-k="progress"] {{ height: 8px; border-radius: 0; box-shadow: inset 0 0 0 1px var(--k-gl-ink); }}
[data-k="progress"] > [data-k-part="indicator"] {{ border-radius: 0; background: repeating-linear-gradient(90deg, var(--k-accent) 0 6px, color-mix(in srgb, var(--k-accent) 70%, #fff) 6px 8px); }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ border-radius: 2px; background: var(--k-gl-paper); box-shadow: 0 0 0 2px var(--k-gl-ink); transform: rotate(45deg); }}
[data-k="badge"] {{ border-radius: 0; font-family: var(--k-font-heading); background: var(--k-gl-ink); color: var(--k-gl-paper); }}
[data-k="checkbox"] {{ border-radius: 0; }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); font-style: italic; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ border-bottom: 3px double var(--k-gl-ink); }}
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 16px; height: 16px; background: var(--k-gl-ink); {mask(FOX)} }}
[data-k-ornament="panel-head-end"] {{ display: inline-block; flex: none; width: 12px; height: 12px; background: var(--k-gl-silver); {mask(BELL)} transform-origin: 50% 0; }}
[data-k-surface][data-k-motion="full"] [data-k-ornament="panel-head-end"] {{ animation: k-gl-ring 3.2s ease-in-out infinite; }}
@keyframes k-gl-ring {{ 0%, 70%, 100% {{ transform: rotate(0); }} 76% {{ transform: rotate(18deg); }} 82% {{ transform: rotate(-14deg); }} 88% {{ transform: rotate(8deg); }} 94% {{ transform: rotate(-4deg); }} }}
[data-k="spinner"] {{ border: 0; background: var(--k-gl-ink); {mask(BELL)} transform-origin: 50% 10%; animation: k-gl-ring 1s ease-in-out infinite; }}
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; inset: 0; background: var(--k-gl-ink); opacity: .045; {mask(PIXCROSS, '0 0 / 36px 36px repeat')} }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: italic; }}
[data-k-content] [data-k-part="term"] {{ font-family: "Playfair Display", "Noto Serif SC", "Songti SC", serif; font-style: italic; }}
[data-k-content] [data-k-part="keyword"] {{ box-shadow: inset 0 -1px 0 currentColor; }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 80px; height: 14px; border: 0; background: currentColor; opacity: .5; {mask(PIXCROSS, '50% 50% / 14px 14px space')} }}
''')

S['ai-kimi'] = dict(
    name='Kimi', default='dark',
    desc='Kimi 娘：月夜音乐厅。深藏青星空、银色月牙与一道棱镜彩虹、五线谱；按下时彩虹棱光掠过，背景飘着音符。',
    light=dict(neutral='#f1f2fa', accent='#323e86', radius=12, elevation='shadow', danger='#b03a4a', success='#2f7f6a', info='#3a62b0', warning='#9a701a'),
    dark=dict(neutral='#0f1329', accent='#aab8f5', radius=12, elevation='glow', danger='#ff9aa8', success='#8fd8c0', info='#a8c4ff', warning='#f0cc7a'),
    head='"Quicksand", ' + SANS, body=SANS,
    fonts=[{'pkg': 'quicksand', 'weights': [600, 700], 'family': 'Quicksand'}],
    modules=['shine', 'particles', 'ambient'],
    effects=[('shine', '棱镜彩虹', '按下与打开时，一道彩虹棱光掠过。', '动效'), ('particles', '音符', '打开时飘出几个音符。', '动效'), ('ambient', '飘过的音符', '面板与消息背景里，音符慢慢飘过。（只在动效「完整」档）', '动效'), ('stars', '星空', '面板背景铺一层细碎星点。', '质感'), ('portrait', '立绘', '面板右下角站着 Kimi 娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的月夜音乐厅。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成 Kimi 娘的表情。', '装饰')],
    flavor={'think.live': '{name}长思考中', 'think.done': '{name}长思考完成', 'search.done': '读完了 {n} 个网页', 'options.title': '下一小节'},
    fx='--k-fx-glyphs: "♪ ♫ ♩ ♬"; --k-fx-drift: up; --k-fx-size: 10px; --k-fx-glow: #c8a0ff; --k-fx-alt: #8fd8ff;',
    amb='--k-amb: glyph; --k-amb-glyphs: "♪ ♫ ♩"; --k-amb-dir: right; --k-amb-count: 7; --k-amb-speed: 20; --k-amb-size: 9; --k-amb-color: var(--k-accent); --k-amb-alpha: .22;',
    msg=('#2f3f9a', '#6a5aa0', '#b8c6ff', '#d0b8f0'),
    opt=('#3a4fb0', '#8a5ac0', '#2f8a72', '#2f7fb8', '#c0861a', '#c03a5a', '#7a80a0'),
    css=lambda: f'''
/* 音乐厅：卡片是深藏青天鹅绒（浅色时是乐谱纸），左上角一道细细的彩虹 */
[data-k-surface] {{ --k-km-silver: #b8c0d8; --k-km-rainbow: linear-gradient(90deg, #ff6b6b, #ffb36b, #ffe46b, #6bdf8f, #6bb8ff, #a07bff); --k-km-star: rgba(50, 62, 134, .16); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-km-silver: #5a6390; --k-km-star: rgba(220, 228, 255, .35); }}
[data-k="card"] {{ border: 1px solid color-mix(in srgb, var(--k-km-silver) 60%, transparent); }}
[data-k="card"][data-role="container"]::before {{ content: ''; position: absolute; left: 14px; top: -1px; width: 44px; height: 2px; background: var(--k-km-rainbow); border-radius: 2px; opacity: .85; pointer-events: none; }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: 0 0 0 1.5px var(--k-accent), 0 4px 16px color-mix(in srgb, var(--k-accent) 25%, transparent); }}
[data-k="panel"] > [data-k-part="head"] > [data-k-part="title"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] > [data-k-part="title"] {{ font-family: var(--k-font-heading); letter-spacing: .04em; }}
[data-k="button"] {{ border-radius: 10px; font-family: var(--k-font-heading); }}
/* 开关 = 棱镜：打开时轨道里一道彩虹，滑块是银色月牙 */
[data-k="switch"][data-state="checked"] {{ background: linear-gradient(var(--k-accent), var(--k-accent)) 0 0 / 100% 100%, var(--k-km-rainbow); box-shadow: inset 0 -3px 0 -1px rgba(255, 255, 255, .0); background-blend-mode: normal; }}
[data-k="switch"][data-state="checked"] [data-k-part="thumb"] {{ box-shadow: 0 0 0 2px transparent, -6px 0 8px -2px rgba(255, 220, 120, .6); }}
[data-k="switch"] [data-k-part="thumb"] {{ background: linear-gradient(135deg, #ffffff, #c8d0ea); }}
/* 进度 = 五线谱上的一串音 */
[data-k="progress"] {{ height: 10px; background: repeating-linear-gradient(180deg, transparent 0 1.5px, color-mix(in srgb, var(--k-km-silver) 45%, transparent) 1.5px 2px), transparent; }}
[data-k="progress"] > [data-k-part="indicator"] {{ background: var(--k-km-rainbow); opacity: .9; }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ background: #fff; box-shadow: 0 0 0 2px var(--k-accent), 0 0 12px color-mix(in srgb, var(--k-accent) 40%, transparent); }}
[data-k="badge"] {{ border-radius: var(--k-r-pill); box-shadow: inset 0 0 0 1px var(--k-km-silver); }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ border-bottom-color: transparent; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"]::after {{ content: ''; position: absolute; left: 20%; right: 20%; bottom: -1px; height: 2px; border-radius: 2px; background: var(--k-km-rainbow); }}
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 15px; height: 15px; background: var(--k-km-silver); {mask(MOON)} }}
[data-k-ornament="panel-head-end"] {{ display: inline-block; flex: none; width: 13px; height: 13px; background: var(--k-km-rainbow); {mask(PRISM)} }}
[data-k="spinner"] {{ border: 0; background: var(--k-accent); {mask(NOTE)} animation: k-km-hop .9s ease-in-out infinite; }}
@keyframes k-km-hop {{ 0%, 100% {{ transform: translateY(1px) rotate(-8deg); }} 50% {{ transform: translateY(-3px) rotate(8deg); }} }}
[data-k-surface][data-k-effects~="stars"] {PANELS}::before, [data-k-surface][data-k-effects~="stars"] {DIALOG}::before {{ content: ''; position: absolute; inset: 0; background: radial-gradient(circle, var(--k-km-star) 0 1px, transparent 1.4px) 0 0 / 37px 41px, radial-gradient(circle, var(--k-km-star) 0 .8px, transparent 1.2px) 17px 23px / 53px 47px; }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: normal; }}
[data-k-content] [data-k-part="term"] {{ border-bottom: 1px dashed currentColor; }}
[data-k-content] [data-k-part="keyword"] {{ background: linear-gradient(transparent 60%, color-mix(in srgb, var(--k-accent) 18%, transparent) 60%); }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 120px; height: 14px; border: 0; background: currentColor; opacity: .4; {mask(STAFF, '50% 50% / 40px 14px repeat-x')} }}
''')

S['ai-grok'] = dict(
    name='Grok', default='dark',
    desc='Grok 娘：哥特古堡的新月之夜。黑、酒红与暖金，尖刺小冠与蝙蝠；按下时一记 X 字斩，背景里金色微尘飘动。嘴最毒。',
    light=dict(neutral='#f6efe4', accent='#7e1d2b', radius=2, elevation='shadow', danger='#a82a2a', success='#4f7a3a', info='#3f5f8a', warning='#8a5f12'),
    dark=dict(neutral='#120c0e', accent='#d9b25c', radius=2, elevation='glow', danger='#ff8a80', success='#a8d08a', info='#9cb8e0', warning='#f0c060'),
    head='"Cinzel", "Noto Serif SC", ' + SERIF, body=SANS,
    fonts=[{'pkg': 'cinzel', 'weights': [600, 700], 'family': 'Cinzel'}, {'pkg': 'noto-serif-sc', 'weights': [900], 'family': 'Noto Serif SC'}],
    modules=['slash', 'particles', 'ambient'],
    effects=[('slash', 'X 字斩', '按下与打开时，一记金色斜斩。', '动效'), ('particles', '金尘', '打开时迸出一把金色碎光。', '动效'), ('ambient', '金色微尘', '面板与消息背景里，金色微尘慢慢飘。（只在动效「完整」档）', '动效'), ('portrait', '立绘', '面板右下角站着 Grok 娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的古堡露台。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成 Grok 娘的表情。', '装饰')],
    flavor={'think.live': '{name}在翻你的浏览记录', 'think.done': '就这？轻松', 'search.done': '查证了 {n} 处来源', 'options.title': '选吧，凡人'},
    fx='--k-fx-glyphs: "✦ ⸸ ✦"; --k-fx-drift: out; --k-fx-size: 9px; --k-fx-glow: #e8c070; --k-fx-alt: #b0283a;',
    amb='--k-amb: dot; --k-amb-dir: down; --k-amb-count: 14; --k-amb-speed: 20; --k-amb-size: 2; --k-amb-color: #d9b25c; --k-amb-alpha: .40;',
    msg=('#8a1f2e', '#6a4a3a', '#e8c070', '#d8a0a8'),
    opt=('#a8283a', '#7a3a8a', '#4f7a3a', '#3f6a9a', '#b8861a', '#c0283a', '#8a7a6a'),
    css=lambda: f'''
/* 古堡：直角、金色双线框，卡片四角一对金色尖角 */
[data-k-surface] {{ --k-gk-gold: #b8913a; --k-gk-wine: #6e1a26; --k-gk-ink: #1a1012; }}
[data-k-surface][data-k-scheme="dark"] {{ --k-gk-gold: #d9b25c; --k-gk-wine: #8a2232; --k-gk-ink: #060405; }}
[data-k="card"] {{ border: 1px solid color-mix(in srgb, var(--k-gk-gold) 55%, transparent); box-shadow: inset 0 0 0 3px transparent, inset 0 0 0 4px color-mix(in srgb, var(--k-gk-gold) 25%, transparent); }}
[data-k="card"][data-role="container"]::before {{ content: ''; position: absolute; inset: -1px; pointer-events: none; background: linear-gradient(var(--k-gk-gold), var(--k-gk-gold)) 0 0 / 12px 2px, linear-gradient(var(--k-gk-gold), var(--k-gk-gold)) 0 0 / 2px 12px, linear-gradient(var(--k-gk-gold), var(--k-gk-gold)) 100% 100% / 12px 2px, linear-gradient(var(--k-gk-gold), var(--k-gk-gold)) 100% 100% / 2px 12px; background-repeat: no-repeat; }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: inset 0 0 0 1px var(--k-accent), 0 0 16px color-mix(in srgb, var(--k-accent) 30%, transparent); }}
[data-k="panel"] > [data-k-part="head"] > [data-k-part="title"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] > [data-k-part="title"] {{ font-family: var(--k-font-heading); letter-spacing: .1em; text-transform: uppercase; }}
[data-k="panel"] > [data-k-part="head"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] {{ border-bottom: 1px solid var(--k-gk-gold); box-shadow: 0 3px 0 -2px var(--k-gk-wine); }}
[data-k="button"] {{ border-radius: 0; font-family: var(--k-font-heading); letter-spacing: .08em; clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%); }}
[data-k="button"][data-variant="primary"] {{ background: linear-gradient(180deg, color-mix(in srgb, var(--k-accent) 85%, #fff), var(--k-accent)); }}
/* 开关 = 血红与金：打开时轨道是酒红，滑块是一枚金币 */
[data-k="switch"] {{ border-radius: 2px; }}
[data-k="switch"][data-state="checked"] {{ background: linear-gradient(180deg, #a8283a, var(--k-gk-wine)); box-shadow: inset 0 0 0 1px var(--k-gk-gold); }}
[data-k="switch"] [data-k-part="thumb"] {{ border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff3c8, #d9b25c 55%, #8a6a1a); }}
/* 进度 = 金链 */
[data-k="progress"] {{ height: 8px; border-radius: 0; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-gk-gold) 50%, transparent); }}
[data-k="progress"] > [data-k-part="indicator"] {{ border-radius: 0; background: radial-gradient(ellipse 4px 2.6px, transparent 1.4px, #d9b25c 1.6px, #d9b25c 2.4px, transparent 2.7px) 0 50% / 8px 8px repeat-x, var(--k-gk-wine); }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ border-radius: 0; transform: rotate(45deg); background: var(--k-gk-gold); box-shadow: 0 0 0 2px var(--k-gk-ink); }}
[data-k="badge"] {{ border-radius: 0; font-family: var(--k-font-heading); letter-spacing: .06em; box-shadow: inset 0 0 0 1px var(--k-gk-gold); }}
[data-k="checkbox"] {{ border-radius: 0; }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); letter-spacing: .06em; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ border-bottom-color: var(--k-gk-gold); }}
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 15px; height: 15px; background: var(--k-gk-gold); {mask(CRESCENT)} }}
[data-k-ornament="panel-head-end"] {{ display: inline-block; flex: none; width: 22px; height: 11px; background: var(--k-gk-wine); {mask(BAT)} }}
[data-k-surface][data-k-motion="full"] [data-k-ornament="panel-head-end"] {{ animation: k-gk-flap 1.6s ease-in-out infinite; }}
@keyframes k-gk-flap {{ 0%, 100% {{ transform: scaleY(1); }} 50% {{ transform: scaleY(.55) translateY(-1px); }} }}
[data-k="spinner"] {{ border: 0; background: var(--k-gk-gold); {mask(CRESCENT)} animation: k-gk-rot 1.4s linear infinite; }}
@keyframes k-gk-rot {{ to {{ transform: rotate(360deg); }} }}
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; left: 14px; top: 56px; width: 64px; height: 64px; background: var(--k-gk-gold); opacity: .10; {mask(CRESCENT)} }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 700; }}
[data-k-content] [data-k-part="thought"] {{ font-style: italic; }}
[data-k-content] [data-k-part="term"] {{ font-family: "Cinzel", "Noto Serif SC", "Songti SC", serif; letter-spacing: .04em; }}
[data-k-content] [data-k-part="keyword"] {{ box-shadow: inset 0 -2px 0 color-mix(in srgb, currentColor 45%, transparent); }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 66px; height: 14px; border: 0; background: currentColor; opacity: .5; {mask(XMARK, '50% 50% / 14px 14px space')} }}
''')

S['ai-qwen'] = dict(
    name='千问', default='light',
    desc='千问娘：国风庭院的千金小姐。淡蓝紫、紫与金，回纹、祥云与折扇；打开时团扇一样展开一枚印，背景里祥云慢慢飘。',
    light=dict(neutral='#f4f2fb', accent='#5543a8', radius=8, elevation='shadow', danger='#b03a4a', success='#3a7f5f', info='#3f62b0', warning='#9a701a'),
    dark=dict(neutral='#18152e', accent='#b6a8f6', radius=8, elevation='glow', danger='#ff9aa8', success='#90d4b4', info='#a8c0ff', warning='#f0c878'),
    head='"ZCOOL XiaoWei", ' + SERIF, body=SANS,
    fonts=[{'pkg': 'zcool-xiaowei', 'family': 'ZCOOL XiaoWei'}],
    modules=['stamp', 'particles', 'ambient'],
    effects=[('stamp', '千金印', '打开与按下时，盖下一枚「千」字小印。', '动效'), ('particles', '落花', '打开时散出几朵小花。', '动效'), ('ambient', '祥云', '面板与消息背景里，祥云慢慢飘过。（只在动效「完整」档）', '动效'), ('fret', '回纹', '面板标题下与卡片上沿一道回纹。', '装饰'), ('portrait', '立绘', '面板右下角站着千问娘（手机上换成 Q 版）。', '装饰'), ('scene', '场景', '对话框与消息背景铺一层淡淡的国风庭院。', '装饰'), ('faces', '表情头像', '思维链与搜索资料的标题前换成千问娘的表情。', '装饰')],
    flavor={'think.live': '{name}思量中', 'think.done': '{name}想明白了', 'search.done': '参考了 {n} 篇资料', 'options.title': '千金之选'},
    fx='--k-fx-stamp: "千"; --k-fx-stamp-style: outline; --k-fx-stamp-shape: round; --k-fx-glyphs: "❀ ✿ ❀"; --k-fx-drift: down; --k-fx-size: 9px; --k-fx-glow: #8a78e0; --k-fx-alt: #c49a3a;',
    amb='--k-amb: puff; --k-amb-dir: right; --k-amb-count: 5; --k-amb-speed: 30; --k-amb-size: 8; --k-amb-color: #b6a8f6; --k-amb-alpha: .14;',
    msg=('#4a3aa0', '#4f6488', '#c4b8ff', '#a8bce0'),
    opt=('#5543a8', '#9a4fa8', '#3a7f5f', '#3f6ab0', '#b8801a', '#b8344a', '#7f7a96'),
    css=lambda: f'''
/* 国风：金色回纹压边、卡片像锦盒（上沿一道回纹），按钮是如意形的圆角 */
[data-k-surface] {{ --k-qw-gold: #b8903a; --k-qw-line: rgba(85, 67, 168, .25); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-qw-gold: #d6b468; --k-qw-line: rgba(182, 168, 246, .25); }}
[data-k="card"] {{ border: 1px solid var(--k-qw-line); }}
[data-k-surface][data-k-effects~="fret"] [data-k="card"][data-role="container"]::before {{ content: ''; position: absolute; left: 10px; right: 10px; top: 0; height: 6px; background: var(--k-qw-gold); opacity: .55; {mask(FRET, '0 0 / 6px 6px repeat-x')} pointer-events: none; }}
[data-k="card"][data-role="choice"][data-state="selected"] {{ box-shadow: 0 0 0 1.5px var(--k-accent), 0 4px 14px var(--k-qw-line); }}
[data-k="panel"] > [data-k-part="head"] > [data-k-part="title"], [data-k="dialog"][data-k-part="content"] > [data-k-part="head"] > [data-k-part="title"] {{ font-family: var(--k-font-heading); letter-spacing: .12em; }}
[data-k-surface][data-k-effects~="fret"] [data-k="panel"] > [data-k-part="head"]::after, [data-k-surface][data-k-effects~="fret"] [data-k="dialog"][data-k-part="content"] > [data-k-part="head"]::after {{ content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: var(--k-qw-gold); opacity: .45; {mask(FRET, '0 0 / 6px 6px repeat-x')} pointer-events: none; }}
[data-k="button"] {{ border-radius: 999px 6px; font-family: var(--k-font-heading); letter-spacing: .08em; }}
[data-k="button"][data-variant="primary"] {{ box-shadow: inset 0 0 0 1px var(--k-qw-gold); }}
/* 开关 = 玉佩：滑块是一枚带金边的玉环 */
[data-k="switch"][data-state="checked"] {{ background: linear-gradient(180deg, color-mix(in srgb, var(--k-accent) 75%, #fff), var(--k-accent)); }}
[data-k="switch"] [data-k-part="thumb"] {{ background: radial-gradient(circle, transparent 0 22%, #f4f0ff 25%, #dcd4f8); box-shadow: 0 0 0 1.5px var(--k-qw-gold); }}
/* 进度 = 祥云 */
[data-k="progress"] {{ height: 10px; }}
[data-k="progress"] > [data-k-part="indicator"] {{ background: radial-gradient(circle at 50% 100%, rgba(255, 255, 255, .45) 0 3px, transparent 3.5px) 0 0 / 12px 10px repeat-x, linear-gradient(90deg, color-mix(in srgb, var(--k-accent) 60%, #fff), var(--k-accent)); }}
[data-k="slider"] > [data-k-part="track"] > [data-k-part="thumb"] {{ background: #fff; box-shadow: 0 0 0 2px var(--k-accent), 0 0 0 4px var(--k-qw-gold); }}
[data-k="badge"] {{ border-radius: 999px 4px; font-family: var(--k-font-heading); box-shadow: inset 0 0 0 1px var(--k-qw-gold); }}
[data-k="tabs"] [data-k-part="tab"] {{ font-family: var(--k-font-heading); letter-spacing: .08em; }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"] {{ border-bottom-color: var(--k-qw-gold); }}
[data-k="tabs"] [data-k-part="tab"][data-state="active"]::before {{ content: ''; position: absolute; left: 50%; top: 2px; width: 14px; height: 8px; margin-left: -7px; background: var(--k-qw-gold); opacity: .7; {mask(FAN)} }}
[data-k-ornament="panel-head-start"] {{ display: inline-block; flex: none; width: 18px; height: 13px; background: var(--k-accent); {mask(FAN)} }}
[data-k="spinner"] {{ border: 0; background: var(--k-accent); {mask(FAN)} animation: k-qw-fan 1.6s ease-in-out infinite; transform-origin: 50% 92%; }}
@keyframes k-qw-fan {{ 0%, 100% {{ transform: scaleX(.35); }} 50% {{ transform: scaleX(1); }} }}
{PANELS}::before, {DIALOG}::before {{ content: ''; position: absolute; left: 10px; bottom: 14px; width: 120px; height: 60px; background: var(--k-accent); opacity: .10; {mask(CLOUD)} }}
[data-k-content] [data-k-part="dialogue"] {{ font-weight: 600; }}
[data-k-content] [data-k-part="thought"] {{ font-style: normal; }}
[data-k-content] [data-k-part="term"] {{ font-family: "ZCOOL XiaoWei", "Songti SC", "Noto Serif CJK SC", serif; letter-spacing: .06em; }}
[data-k-content] [data-k-part="keyword"] {{ text-emphasis: dot; text-emphasis-position: under; -webkit-text-emphasis: dot; -webkit-text-emphasis-position: under; }}
[data-k-content="body"] > [data-k-part="scene-break"] {{ width: 72px; height: 12px; border: 0; background: currentColor; opacity: .45; {mask(CLOUD, '50% 50% / 24px 12px space')} }}
''')

TYPES = ['action', 'persona', 'plot', 'info', 'fun', 'nsfw', 'other']

# 存在感改版（docs/AI娘系列方案.md 四之二）：2026-11-03 用户看过 Claude 娘的预览后确认，8 款全开
PRESENCE = {'ai-deepseek', 'ai-claude', 'ai-gpt', 'ai-gemini', 'ai-glm', 'ai-kimi', 'ai-grok', 'ai-qwen'}
SIGN = {
    'ai-claude': {'sign.live': '容我想想……', 'sign.done': '这样写，可以吗？', 'sign.oops': '没查到，我凭记忆来'},
    'ai-deepseek': {'sign.live': '深度思考中，饭先等等', 'sign.done': '请慢用～要添饭吗？', 'sign.oops': '没搜到……我再想想'},
    'ai-gpt': {'sign.live': '正在推理，请稍候', 'sign.done': '已为您整理妥当', 'sign.oops': '未能检索到相关资料'},
    'ai-gemini': {'sign.live': '让我想想喵～', 'sign.done': '搞定喵！快夸我！', 'sign.oops': '呜，什么都没搜到喵'},
    'ai-glm': {'sign.live': '嘿嘿，让我算算', 'sign.done': '这手牌，你接得住吗？', 'sign.oops': '哎呀，资料被我弄丢了'},
    'ai-kimi': {'sign.live': '长思考中，听完这一曲', 'sign.done': '一曲终了，请继续', 'sign.oops': '没找到……我再读一遍'},
    'ai-grok': {'sign.live': '正在翻你的浏览记录', 'sign.done': '选吧，凡人', 'sign.oops': '网上没有？那就是假的'},
    'ai-qwen': {'sign.live': '稍等，先喝口奶茶', 'sign.done': '这样安排，可还满意？', 'sign.oops': '没查到，再问问别人吧'},
}
OPT_HEAD = '[data-k="msg-options"] > [data-k-part="head"] > [data-k-part="toggle"]'

def presence(id, have):
    """角色占一块不放字的位置、实心显示；叠在字底下的只留场景氛围，且只铺在边缘"""
    a = lambda n: n in have
    out = ['\n/* ═══════════ 存在感：角色栏 / 看板娘 / 场景横幅 / 表情与道具（docs/AI娘系列方案.md 四之二） ═══════════ */']
    if a('portrait'):
        out.append(f'''/* 电脑：面板够宽（≥ 900px）时右侧空出一栏，立绘实心站在里面，文字不进这一栏；拖窄了退回淡水印 */
@media (min-width: 1001px) {{
  [data-k-surface][data-k-effects~="stage"] [data-k="panel"][data-k-width="wide"] > [data-k-part="body"] {{ padding-right: 252px; }}
  [data-k-surface][data-k-effects~="stage"] [data-k="panel"][data-k-width="wide"] > [data-k-ornament="surface-backdrop"] {{ background: linear-gradient(var(--k-divider), var(--k-divider)) calc(100% - 252px) 76px / 1px calc(100% - 112px) no-repeat; }}
  [data-k-surface][data-k-effects~="stage"] [data-k="panel"][data-k-width="wide"] > [data-k-ornament="surface-backdrop"]::after {{ right: 4px; bottom: 0; width: 244px; height: calc(100% - 64px); aspect-ratio: auto; background: var(--k-asset-portrait) center bottom / contain no-repeat; opacity: 1; -webkit-mask: linear-gradient(0deg, transparent, #000 56px); mask: linear-gradient(0deg, transparent, #000 56px); }}
}}''')
    if a('chibi'):
        out.append(f'''/* 手机：Q 版从抽屉标题栏右侧探出半身；内容区底下的淡水印收掉 */
@media (max-width: 1000px) {{
  [data-k-surface][data-k-effects~="stage"] [data-k="panel"] [data-k-ornament="panel-head-end"] {{ display: inline-block; flex: none; width: 52px; height: 52px; margin-block: -14px -10px; background: var(--k-asset-chibi) 50% 6% / 170% auto no-repeat; -webkit-mask: none; mask: none; }}
  [data-k-surface][data-k-effects~="stage"] {PANELS}::after {{ opacity: 0; }}
}}
/* 对话框：Q 版实心站在左下角，按钮栏给它让出位置 */
[data-k-surface][data-k-effects~="portrait"] {DIALOG}::after {{ left: 8px; right: auto; bottom: 4px; width: 92px; height: 92px; opacity: 1; }}
[data-k-surface][data-k-effects~="portrait"] [data-k="dialog"][data-k-part="content"] > [data-k-part="foot"] {{ padding-left: 96px; min-height: 72px; }}''')
    if a('face-done'):
        out.append('''/* 面板标题前：圆形表情头像（换掉矢量图标） */
[data-k-surface][data-k-effects~="faces"] [data-k-ornament="panel-head-start"] { width: 30px; height: 30px; margin-block: -6px; border-radius: 50%; background: var(--k-asset-face-done) 50% 28% / 112% no-repeat, color-mix(in srgb, var(--k-accent) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-accent) 35%, transparent); -webkit-mask: none; mask: none; animation: none; }
/* 提示条：按语气换表情 */
[data-k-surface][data-k-effects~="faces"] [data-k="toast"] > [data-k-ornament="toast-face"] { display: inline-block; background-image: var(--k-asset-face-done); }''')
        if a('face-oops'):
            out.append('[data-k-surface][data-k-effects~="faces"] [data-k="toast"][data-k-tone="danger"] > [data-k-ornament="toast-face"] { background-image: var(--k-asset-face-oops); }')
    if a('face-think'):
        out.append('''/* 加载转圈：换成「思考中」表情上下轻晃 */
[data-k-surface][data-k-effects~="faces"] [data-k="spinner"] { width: 1.7em; height: 1.7em; border: 0; border-radius: 0; background: var(--k-asset-face-think) center / contain no-repeat; -webkit-mask: none; mask: none; animation: k-ai-bob 1.2s ease-in-out infinite; }''')
    if a('chibi'):
        out.append(f'''/* 看板娘：最新一条回复末尾单独一行，实心 Q 版 + 一句台词；生成中换「思考中」、搜索没找到换「出错」 */
[data-k-surface][data-k-effects~="sign"] [data-k-ornament="msg-sign"] {{ display: flex; padding: 2px 6px 0; }}
[data-k-surface][data-k-effects~="sign"] [data-k-ornament="msg-sign"] > [data-k-part="face"] {{ width: 84px; height: 84px; background-image: var(--k-asset-chibi); }}
[data-k-surface][data-k-effects~="sign"] [data-k-ornament="msg-sign"][data-k-face="think"] > [data-k-part="face"] {{ background-image: var(--k-asset-face-think); }}
[data-k-surface][data-k-effects~="sign"] [data-k-ornament="msg-sign"][data-k-face="oops"] > [data-k-part="face"] {{ background-image: var(--k-asset-face-oops); }}
[data-k-surface][data-k-effects~="sign"][data-k-motion="full"] [data-k-ornament="msg-sign"][data-k-face="think"] > [data-k-part="face"] {{ animation: k-ai-bob 1.4s ease-in-out infinite; }}
[data-k-surface][data-k-effects~="sign"][data-k-motion="full"] [data-k-ornament="msg-sign"][data-k-face="done"] > [data-k-part="face"] {{ animation: k-ai-breathe 3.2s ease-in-out infinite; }}
[data-k-surface][data-k-effects~="sign"] [data-k-ornament="msg-sign"] > [data-k-part="line"] {{ margin-bottom: 18px; padding: 6px 14px; border-radius: 4px 16px 16px 16px; background: color-mix(in srgb, var(--k-accent) 10%, var(--k-sunken)); border: var(--k-border-w) solid color-mix(in srgb, var(--k-accent) 32%, transparent); color: var(--k-on); font-family: var(--k-font-heading); }}
@media (max-width: 1000px) {{ [data-k-surface][data-k-effects~="sign"] [data-k-ornament="msg-sign"] > [data-k-part="face"] {{ width: 60px; height: 60px; }} }}''')
    if a('scene'):
        out.append(f'''/* 场景横幅：正文那块顶部一条，往下渐隐到 0，正文底下保持干净 */
[data-k-surface][data-k-effects~="scene"] [data-k="msg-view"][data-k-kind="body"] > [data-k-ornament="surface-backdrop"] {{ background-position: center 35%; opacity: var(--k-ai-band-alpha, .42); -webkit-mask: linear-gradient(180deg, #000, transparent 96px); mask: linear-gradient(180deg, #000, transparent 96px); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-ai-band-alpha: .34; }}''')
    if a('item-1'):
        out.append(f'''/* 行动选项标题前：道具小图 */
[data-k-surface][data-k-effects~="items"] {OPT_HEAD} > [data-k-ornament="state-face"][data-k-face="options"] {{ display: inline-block; width: 1.7em; height: 1.7em; margin-block: -.35em; background-image: var(--k-asset-item-1); }}''')
    if a('item-2'):
        out.append('''/* 分隔线：中间嵌一件道具，两侧细线 */
[data-k-content="body"] > [data-k-part="scene-break"] { width: 200px; height: 26px; opacity: 1; background: var(--k-asset-item-2) center / 26px 26px no-repeat, linear-gradient(90deg, transparent, var(--k-accent) 30%, transparent 42%, transparent 58%, var(--k-accent) 70%, transparent) center / 100% 1px no-repeat; -webkit-mask: none; mask: none; }''')
    return out

def common(id, d, have):
    a = lambda n: n in have
    out = []
    out.append('\n/* ═══════════ 角色素材（立绘 / Q 版 / 场景 / 表情 / 道具），见 design/ai-chan/生图提示词.md ═══════════ */')
    if a('portrait'):
        out.append(f'''/* 面板背景右下角：半身立绘，左侧与上方渐隐进底色；卡片本身有底色，立绘只在卡片之间的空隙里露出来，不压字 */
[data-k-surface][data-k-effects~="portrait"] {PANELS} {{ display: block; }}
[data-k-surface][data-k-effects~="portrait"] {PANELS}::after {{ content: ''; position: absolute; right: -6px; bottom: 0; width: min(46%, 380px); aspect-ratio: 2 / 3; background: var(--k-asset-portrait) right bottom / contain no-repeat; opacity: var(--k-ai-portrait-alpha, .34); -webkit-mask: linear-gradient(90deg, transparent, #000 38%), linear-gradient(0deg, #000 70%, transparent); -webkit-mask-composite: source-in; mask: linear-gradient(90deg, transparent, #000 38%) intersect, linear-gradient(0deg, #000 70%, transparent); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-ai-portrait-alpha: .26; }}''')
    if a('chibi'):
        out.append(f'''/* 手机：面板窄，立绘换成右下角一只 Q 版 */
@media (max-width: 1000px) {{
  [data-k-surface][data-k-effects~="portrait"] {PANELS}::after {{ width: 120px; aspect-ratio: 1; background-image: var(--k-asset-chibi); opacity: .32; -webkit-mask: none; mask: none; }}
}}
/* 对话框右下角一只小 Q 版 */
[data-k-surface][data-k-effects~="portrait"] {DIALOG}::after {{ content: ''; position: absolute; right: 6px; bottom: 6px; width: 84px; height: 84px; background: var(--k-asset-chibi) center / contain no-repeat; opacity: .5; }}
/* 空状态的插图 */
[data-k="empty"] > [data-k-ornament="empty-art"] {{ display: block; position: relative; left: auto; translate: none; width: 96px; height: 96px; margin: 0 auto 6px; background: var(--k-asset-chibi) center / contain no-repeat; }}
[data-k-surface][data-k-motion="full"] [data-k="empty"] > [data-k-ornament="empty-art"] {{ animation: k-ai-breathe 3.2s ease-in-out infinite; }}
@keyframes k-ai-breathe {{ 0%, 100% {{ transform: translateY(0); }} 50% {{ transform: translateY(-3px); }} }}''')
    if a('scene'):
        out.append(f'''/* 场景：对话框与消息正文背景铺一层很淡的场景（从右上角渐隐），盖一层底色保证文字对比度 */
[data-k-surface][data-k-effects~="scene"] {DIALOG}, [data-k-surface][data-k-effects~="scene"] {MSG} {{ display: block; background: var(--k-asset-scene) right top / cover no-repeat; opacity: var(--k-ai-scene-alpha, .16); -webkit-mask: radial-gradient(130% 110% at 100% 0, #000, transparent 75%); mask: radial-gradient(130% 110% at 100% 0, #000, transparent 75%); }}
[data-k-surface][data-k-scheme="dark"] {{ --k-ai-scene-alpha: .12; }}''')
    faces = [f for f in ('face-think', 'face-done', 'face-search') if a(f)]
    if faces:
        out.append('/* 思维链 / 搜索资料标题前：Q 版表情头像（生成中 / 完成 / 查资料 / 没找到资料），换掉原来的图标 */')
        for face, sel in (('face-think', THINK_TOG + ' > [data-k-ornament="state-face"][data-k-face="think"]'), ('face-done', THINK_TOG + ' > [data-k-ornament="state-face"][data-k-face="done"]'), ('face-search', SEARCH_TOG + ' > [data-k-ornament="state-face"][data-k-face="search"]'), ('face-oops', SEARCH_TOG + ' > [data-k-ornament="state-face"][data-k-face="oops"]')):
            if a(face):
                out.append(f'[data-k-surface][data-k-effects~="faces"] {sel} {{ display: inline-block; background-image: var(--k-asset-{face}); }}')
        tog = []
        if a('face-think') and a('face-done'): tog.append(THINK_TOG + ' > [data-k-part="icon"]')
        if a('face-search'): tog.append(SEARCH_TOG + ' > [data-k-part="icon"]')
        if tog:
            out.append(', '.join('[data-k-surface][data-k-effects~="faces"] ' + t for t in tog) + ' { opacity: 0; width: 0; min-width: 0; margin: 0 -4px 0 0; }')
        out.append(f'/* 头像放大到约 36px，垫一个强调色圆底（白发 / 浅色角色在浅色底上也立得住），用负外边距不撑高标题行 */\n[data-k-surface][data-k-effects~="faces"] :is({THINK_TOG}, {SEARCH_TOG}) > [data-k-ornament="state-face"] {{ width: 2.3em; height: 2.3em; margin-block: -.55em; border-radius: 50%; background-size: 108%; background-position: 50% 30%; background-color: color-mix(in srgb, var(--k-accent) var(--k-ai-plate, 14%), transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-accent) 30%, transparent); }}')
        out.append(f'[data-k-surface][data-k-effects~="faces"][data-k-motion="full"] {THINK_TOG} > [data-k-ornament="state-face"][data-k-face="think"] {{ animation: k-ai-bob 1.4s ease-in-out infinite; }}\n@keyframes k-ai-bob {{ 0%, 100% {{ transform: rotate(-6deg); }} 50% {{ transform: rotate(6deg) translateY(-1px); }} }}')
    if a('item-1'):
        out.append(f'''/* 卡片右下角：标志道具小图（容器卡：单数 item-1、双数 item-2；选择卡：选中时出现 item-1）。特效开关「道具」控制 */
[data-k-surface][data-k-effects~="items"] [data-k="card"][data-role="container"] > [data-k-ornament="card-corner"] {{ display: block; right: 8px; bottom: 6px; width: 30px; height: 30px; background: var(--k-asset-item-1) center / contain no-repeat; opacity: .75; }}
[data-k-surface][data-k-effects~="items"] [data-k="card"][data-role="choice"][data-state="selected"] > [data-k-ornament="card-corner"] {{ display: block; right: 6px; bottom: 4px; width: 24px; height: 24px; background: var(--k-asset-item-1) center / contain no-repeat; opacity: .9; }}''')
        if a('item-2'):
            out.append('[data-k-surface][data-k-effects~="items"] [data-k="card"][data-role="container"]:nth-child(even) > [data-k-ornament="card-corner"] { background-image: var(--k-asset-item-2); }')
    # 选项配色
    out.append('\n/* 行动选项：7 种类型各一色（左边色条 + 类型标签；标签字色与正文色混合保证对比度） */')
    out.append('[data-k-surface] { ' + ' '.join('--k-opt-%s: %s;' % (t, c) for t, c in zip(TYPES, d['opt'])) + ' }')
    for t in TYPES:
        out.append(f'{OPT}[data-k-type="{t}"] {{ --k-opt: var(--k-opt-{t}); }}')
    out.append(f'{OPT} {{ box-shadow: inset 3px 0 0 var(--k-opt, transparent); }}')
    out.append(f'{OPT} > [data-k-part="item-head"] > [data-k-part="type"] > [data-k="badge"] {{ background: color-mix(in srgb, var(--k-opt, var(--k-accent)) 16%, transparent); color: color-mix(in srgb, var(--k-opt, var(--k-accent)) 42%, var(--k-on)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-opt, var(--k-accent)) 45%, transparent); }}')
    return '\n'.join(out) + '\n'

ORDER = ['ai-deepseek', 'ai-claude', 'ai-gpt', 'ai-gemini', 'ai-glm', 'ai-kimi', 'ai-grok', 'ai-qwen']
for id in ORDER:
    d = S[id]
    dirp = os.path.join(SK, id); os.makedirs(os.path.join(dirp, 'assets'), exist_ok=True)
    have = {f[:-5] for f in os.listdir(os.path.join(dirp, 'assets')) if f.endswith('.webp') and not f.endswith('.hd.webp')}
    # 清单
    def seeds(x):
        s = {k: x[k] for k in ('neutral', 'accent', 'radius', 'elevation')}
        s['font'] = {'heading': d['head'], 'body': d['body']}
        for k in ('danger', 'success', 'info', 'warning'): s[k] = x[k]
        return s
    assets = {}
    for n in ['portrait', 'chibi', 'scene', 'face-think', 'face-done', 'face-search', 'face-oops', 'item-1', 'item-2']:
        if n in have:
            a = {'file': 'assets/' + n + '.webp', 'alt': {'portrait': '半身立绘', 'chibi': 'Q 版', 'scene': '场景', 'face-think': '表情：思考中', 'face-done': '表情：想好了', 'face-search': '表情：查资料', 'face-oops': '表情：出错', 'item-1': '道具', 'item-2': '道具'}[n]}
            if REF and os.path.exists(os.path.join(dirp, 'assets', n + '.hd.webp')):
                a['url'] = CDN.format(ref=REF, id=id, f=n + '.hd.webp')
            assets[n] = a
    effs = [e for e in d['effects'] if not (e[0] == 'faces' and not any(f in have for f in ('face-think', 'face-search')))]
    if 'face-oops' in have:
        effs = [(e[0], e[1], e[2].replace('的表情。', '的表情（搜索没找到资料时换成出错的表情）。'), e[3]) if e[0] == 'faces' else e for e in effs]
    if 'item-1' in have:
        effs.append(('items', '道具', '卡片右下角放一件标志道具；选中的选择卡也会出现。', '装饰'))
    if id in PRESENCE:
        nm = d['name'] + ('' if d['name'].endswith('鱼') or d['name'].endswith('娘') else ' 娘')
        if 'portrait' in have: effs.append(('stage', '角色栏', '电脑上面板够宽时，右侧空出一栏站着' + nm + '（手机上是标题栏探头的 Q 版）。', '装饰'))
        if 'chibi' in have: effs.append(('sign', '看板娘', '最新一条回复末尾站着 Q 版的' + nm + '，说一句话；生成中和没查到资料时换表情。', '装饰'))
    m = {
        'id': id, 'name': d['name'], 'version': '0.1.0', 'contract': '1.0', 'description': d['desc'], 'author': '卡密预设',
        'credits': '角色形象原设：ZipZipPipe（胖次狐，B 站 space.bilibili.com/4168597）' + ('；鲸鱼娘原案：上善无形「溟月」（CC BY-NC-SA 4.0）' if id == 'ai-deepseek' else '') + '；外观参考 lmy414/ai-chan-sheets 设定图补全（CC BY-NC-SA 4.0）。本皮肤的立绘、Q 版、场景、表情与道具图由 AI（Codex 生图）按原设绘制，属二次创作，以 CC BY-NC-SA 4.0 提供：仅限非商业使用、须署名、以相同协议分享。非官方同人作品，与各 AI 公司无关，产品名与商标归其所有。高清图从 jsDelivr 外链加载（会向该 CDN 暴露 IP），载不到时用包内的轻量图。',
        'defaultScheme': d['default'],
        'schemes': {'light': {'seeds': seeds(d['light'])}, 'dark': {'seeds': seeds(d['dark'])}},
        'modules': d['modules'],
        'effects': [{'id': e[0], 'name': e[1], 'description': e[2], 'group': e[3], 'default': True} for e in effs],
        'params': [{'id': 'corner', 'name': '圆角', 'type': 'number', 'default': d['light']['radius'], 'min': 0, 'max': 24, 'step': 1, 'bind': 'seed:radius', 'group': '形状'}],
        'flavor': {**d['flavor'], **(SIGN.get(id, {}) if id in PRESENCE else {})},
        'assets': assets,
        'icons': ICONS,
    }
    json.dump(m, open(os.path.join(dirp, 'skin.json'), 'w'), ensure_ascii=False, indent=2)
    json.dump(d['fonts'], open(os.path.join(dirp, 'fonts.src.json'), 'w'), ensure_ascii=False, indent=1)
    lq, lt, dq, dt = d['msg']
    head = f'''/* {d['name']} —— {d['desc']}
   AI 娘系列（docs/AI娘系列方案.md）。素材在 assets/（build/frontend/ai-chan-assets.mjs 从 .cache/ai-chan/raw/ 生成）。 */

/* ───────── 动效与环境层参数 ───────── */
:host, [data-k-surface] {{ {d['fx']} {d['amb']} }}

/* ───────── 消息颜色（契约 6.8：每个配色都要写，对消息底色 ≥ 4.5 : 1） ───────── */
[data-k-surface][data-k-scheme="light"] {{ --k-msg-dialogue: {lq}; --k-msg-thought: {lt}; }}
[data-k-surface][data-k-scheme="dark"] {{ --k-msg-dialogue: {dq}; --k-msg-thought: {dt}; }}
'''
    css = head + d['css']() + common(id, d, have) + ('\n'.join(presence(id, have)) + '\n' if id in PRESENCE else '') + '/* 图标：线条 */\n[data-k-icon] svg { stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }\n'
    open(os.path.join(dirp, 'skin.css'), 'w').write(css)
    print(id, 'assets:', sorted(have))

# 系列登记
sp = os.path.join(SK, 'series.json'); s = json.load(open(sp))
s['series'] = [x for x in s['series'] if x['id'] != 'ai-chan'] + [{'id': 'ai-chan', 'name': 'AI 娘', 'skins': ORDER}]
json.dump(s, open(sp, 'w'), ensure_ascii=False, indent=2); open(sp, 'a').write('\n')
