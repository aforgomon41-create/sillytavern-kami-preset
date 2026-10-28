/**
 * 消息前端的解析（纯函数，可单测）。输入是聊天原始数据里的一条回复（chat[mesid].mes），**流式生成时是写到一半的文本**：
 * 标签可能没闭合、最后一个「」可能没收口、JSON 可能只写了一半。所有函数都要容忍这些情况，不抛错。
 *
 * 预设的输出格式（📌 输出规范）：
 *   <nyaruko_think>显式思维链</nyaruko_think>（部分模型）
 *   <out_body><introduction>…<search_results>…</search_results>…</introduction>
 *   <content>正文</content><appendix>…<options>[JSON]</options>…</appendix></out_body>
 * 正文：段首两个全角空格；对白「」；内心想法 *…*；角色名 <n>名字</n>；关键词 **…**；场景转换 ___；
 * 每个步骤前一行 <!-- 步骤n/Tokenm --> 注释（不显示）。另外 【名称】 是指代专有名词的写法。
 */
import { readWebSearchRecords } from '../../scripts/_search-pure.js';

/** 一段被标签包住的内容：closed=false 表示流式生成中、还没写到闭合标签 */
export interface Block { text: string; closed: boolean }

export interface SearchSource { id: string; url: string; title: string }
export interface SearchFact { text: string; source_ids: string[] }
export interface SearchRecord { origin: 'service' | 'native'; world: string; facts: SearchFact[]; sources: SearchSource[]; status?: 'not_found' | 'budget_exceeded' | 'no_new_facts' }

export interface OptionItem { title: string; type: string; content: string }

export interface Reply {
  think: Block | null;
  search: SearchRecord[];
  /** 搜索资料块写到一半（流式） */
  searchPending: boolean;
  body: Block | null;
  options: { items: OptionItem[]; closed: boolean } | null;
}

/** 取第一个 <tag>…</tag>；没闭合时取到文本末尾（closed=false） */
export function takeTag(raw: string, tag: string): Block | null {
  const open = raw.indexOf('<' + tag + '>');
  if (open < 0) { return null; }
  const from = open + tag.length + 2;
  const close = raw.indexOf('</' + tag + '>', from);
  return close < 0 ? { text: raw.slice(from), closed: false } : { text: raw.slice(from, close), closed: true };
}

/** 文本末尾写了一半的标签（例如流式时停在 "<cont"）要去掉，免得闪一下尖括号 */
const dropPartialTag = (s: string): string => s.replace(/<\/?[A-Za-z_]*$/, '');

const KNOWN = ['nyaruko_think', 'out_body', 'introduction', 'content', 'appendix', 'options', 'search_results', 'summary', 'char_setting', 'image', 'medium', 'medium_content', 'image_Tag', 'MakeImage', 'god'];

/** 拆一条回复。没有 <content> 的老消息 / 普通消息：去掉已知的结构标签后整段当正文 */
export function splitReply(raw: string): Reply {
  const think = takeTag(raw, 'nyaruko_think');
  const body = takeTag(raw, 'content');
  const opt = takeTag(raw, 'options');
  const search = readWebSearchRecords(raw) as SearchRecord[];
  const searchOpen = (raw.match(/<search_results>/g) || []).length;
  const searchClosed = (raw.match(/<\/search_results>/g) || []).length;
  let main = body;
  if (!main) {
    let rest = raw;
    /* 结构外壳（out_body / introduction / appendix）只去掉标签本身，其余已知块整块去掉 */
    rest = rest.replace(/<\/?(?:out_body|introduction|appendix)>/g, '');
    for (const t of KNOWN) { rest = rest.replace(new RegExp('<' + t + '>[\\s\\S]*?(?:</' + t + '>|$)', 'g'), ''); }
    main = rest.trim() ? { text: rest, closed: true } : null;
  }
  return {
    think: think ? { text: dropPartialTag(think.text).trim(), closed: think.closed } : null,
    search, searchPending: searchOpen > searchClosed,
    body: main ? { text: dropPartialTag(main.text), closed: main.closed } : null,
    options: opt ? { items: opt.closed ? (parseOptions(opt.text) || []) : [], closed: opt.closed } : null
  };
}

/* ───────── 行动选项 ───────── */

const pick = (o: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) { return v.trim(); } }
  return '';
};
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** 选项 JSON（与旧前端 frontend-options.html 的容错一致：外面夹了别的字也能取出数组；中英文字段名都认） */
export function parseOptions(raw: string): OptionItem[] | null {
  let data: unknown = null;
  try { data = JSON.parse(raw); } catch (e) {
    const a = raw.indexOf('['), b = raw.lastIndexOf(']');
    if (a >= 0 && b > a) { try { data = JSON.parse(raw.slice(a, b + 1)); } catch (e2) { data = null; } }
  }
  if (data && !Array.isArray(data) && Array.isArray((data as { options?: unknown }).options)) { data = (data as { options: unknown[] }).options; }
  if (!Array.isArray(data)) { return null; }
  const out: OptionItem[] = [];
  for (const it of data) {
    if (typeof it === 'string' && it.trim()) { out.push({ title: clip(it.trim(), 12), type: '其他', content: it.trim() }); continue; }
    if (!it || typeof it !== 'object') { continue; }
    const o = it as Record<string, unknown>;
    const title = pick(o, ['title', '标题', 'name', '名称']);
    const type = pick(o, ['type', '类型', 'kind', 'category']);
    const content = pick(o, ['content', '内容', 'text', '文本', 'desc', '描述', 'description']);
    if (!title && !content) { continue; }
    out.push({ title: title || clip(content, 12), type: type || '其他', content: content || title });
  }
  return out.length ? out : null;
}

/* ───────── 正文 ───────── */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'dialogue'; open: string; close: string; kids: Inline[] }
  | { t: 'thought'; kids: Inline[] }
  | { t: 'keyword'; kids: Inline[] }
  | { t: 'name'; v: string }
  | { t: 'term'; v: string };

export type BodyBlock = { t: 'para'; kids: Inline[] } | { t: 'scene' };

/** 去掉不显示的东西：步骤注释（含流式时写到一半的 "<!--"）、图片 / HTML 美化块（由各自的功能处理） */
export function cleanBody(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*$/, '')
    .replace(/<(image|medium|MakeImage|image_Tag)>[\s\S]*?(?:<\/\1>|$)/g, '');
}

const PAIRS: Record<string, string> = { '「': '」', '『': '』', '“': '”' };

/**
 * 行内切分。规则按位置从左到右匹配，先出现的先吃；对白里还可以有角色名 / 关键词 / 心理描写，递归切。
 * 流式时最后一个「 可能没收口：吃到段末，close 为空串。
 */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = (): void => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (s.startsWith('<n>', i)) {
      const e = s.indexOf('</n>', i + 3);
      flush(); out.push({ t: 'name', v: e < 0 ? s.slice(i + 3) : s.slice(i + 3, e) });
      i = e < 0 ? s.length : e + 4; continue;
    }
    if (PAIRS[c]) {
      const close = PAIRS[c]!;
      let depth = 0, e = -1;
      for (let j = i + 1; j < s.length; j++) {
        if (s[j] === c) { depth++; } else if (s[j] === close) { if (depth === 0) { e = j; break; } depth--; }
      }
      flush();
      out.push({ t: 'dialogue', open: c, close: e < 0 ? '' : close, kids: parseInline(e < 0 ? s.slice(i + 1) : s.slice(i + 1, e)) });
      i = e < 0 ? s.length : e + 1; continue;
    }
    if (s.startsWith('**', i)) {
      const e = s.indexOf('**', i + 2);
      if (e > i + 2) { flush(); out.push({ t: 'keyword', kids: parseInline(s.slice(i + 2, e)) }); i = e + 2; continue; }
    }
    if (c === '*' && s[i + 1] !== '*') {
      const e = s.indexOf('*', i + 1);
      if (e > i + 1) { flush(); out.push({ t: 'thought', kids: parseInline(s.slice(i + 1, e)) }); i = e + 1; continue; }
    }
    if (c === '【') {
      const e = s.indexOf('】', i + 1);
      if (e > i + 1) { flush(); out.push({ t: 'term', v: s.slice(i + 1, e) }); i = e + 1; continue; }
    }
    buf += c; i++;
  }
  flush();
  return out;
}

/** 正文切成段落与场景转换。每个非空行是一段（段首的全角 / 半角空格去掉，缩进交给 CSS，电脑手机都是两字） */
export function parseBody(text: string): BodyBlock[] {
  const out: BodyBlock[] = [];
  for (const line0 of cleanBody(text).split(/\r?\n/)) {
    const line = line0.replace(/^[\s　]+|[\s　]+$/g, '');
    if (!line) { continue; }
    if (/^(?:_{3,}|-{3,}|\*{3,})$/.test(line)) { out.push({ t: 'scene' }); continue; }
    out.push({ t: 'para', kids: parseInline(line) });
  }
  return out;
}

/** 字数：去掉空白与标记后的字符数（按字计，不是 token） */
export function countChars(text: string): number {
  const s = cleanBody(text).replace(/<\/?n>/g, '').replace(/\*+/g, '').replace(/[\s　]/g, '');
  return Array.from(s).length;
}

/** 来源的站点名（收起时的一行摘要用） */
export function siteOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}
