/**
 * XML nhỏ gọn cho word/document.xml: đọc thành cây rồi ghi lại y nguyên (không cần DOM, chạy cả Node lẫn trình duyệt).
 * Chữ trong thẻ giữ nguyên dạng đã mã hoá (&amp; …); chỉ khi tạo chữ mới thì dùng esc().
 */
export interface XEl { tag: string; attrs: [string, string][]; kids: XNode[]; selfClose?: boolean }
export type XNode = XEl | string; // string = đoạn chữ thô (đã mã hoá)

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const unesc = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

export function parseXml(xml: string): { head: string; root: XEl } {
  let i = 0;
  const m0 = xml.match(/^(?:\uFEFF)?(?:<\?xml[^>]*\?>\s*)?/);
  const head = m0 ? m0[0] : '';
  i = head.length;
  const stack: XEl[] = [];
  let root: XEl | null = null;
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  re.lastIndex = i;
  let m: RegExpExecArray | null;
  const push = (n: XNode) => { if (stack.length) stack[stack.length - 1].kids.push(n); };
  while ((m = re.exec(xml))) {
    if (m.index > i) push(xml.slice(i, m.index));
    i = re.lastIndex;
    if (!m[2]) { push(m[0]); continue; } // chú thích, <?pi?>
    if (m[1]) { stack.pop(); continue; }
    const attrs: [string, string][] = [];
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.push([a[1], a[2] ?? a[3]]);
    const el: XEl = { tag: m[2], attrs, kids: [], selfClose: m[4] === '/' };
    if (stack.length) push(el); else root = el;
    if (!el.selfClose) stack.push(el);
  }
  if (!root) throw new Error('XML rỗng');
  return { head, root };
}

export function serialize(n: XNode): string {
  if (typeof n === 'string') return n;
  const a = n.attrs.map(([k, v]) => ` ${k}="${v}"`).join('');
  if (!n.kids.length && n.selfClose !== false) return `<${n.tag}${a}/>`;
  return `<${n.tag}${a}>${n.kids.map(serialize).join('')}</${n.tag}>`;
}

export const isEl = (n: XNode): n is XEl => typeof n !== 'string';
export const els = (n: XEl, tag?: string): XEl[] => n.kids.filter((k): k is XEl => isEl(k) && (!tag || k.tag === tag));
export const el1 = (n: XEl, tag: string) => els(n, tag)[0];
export const attr = (n: XEl, k: string) => n.attrs.find(a => a[0] === k)?.[1];
export const setAttr = (n: XEl, k: string, v: string) => { const a = n.attrs.find(x => x[0] === k); if (a) a[1] = v; else n.attrs.push([k, v]); };
export function clone<T extends XNode>(n: T): T {
  if (typeof n === 'string') return n;
  const e = n as XEl;
  return { ...e, attrs: e.attrs.map(a => [...a] as [string, string]), kids: e.kids.map(k => clone(k)) } as T;
}
export const mk = (tag: string, attrs: [string, string][] = [], kids: XNode[] = []): XEl => ({ tag, attrs, kids });

/** chữ của đoạn w:p (nối các w:t, w:tab) */
export function paraText(p: XEl): string {
  let out = '';
  const walk = (n: XEl) => {
    for (const k of n.kids) {
      if (!isEl(k)) continue;
      if (k.tag === 'w:t') out += unesc(k.kids.filter((x): x is string => typeof x === 'string').join(''));
      else if (k.tag === 'w:tab') out += '\t';
      else if (k.tag === 'w:br') out += '\n';
      else walk(k);
    }
  };
  walk(p);
  return out;
}

/** mọi phần tử hậu duệ có tên tag (không đi vào bên trong phần tử đã khớp) */
export function descendants(n: XEl, tag: string): XEl[] {
  const out: XEl[] = [];
  const walk = (e: XEl) => { for (const k of e.kids) if (isEl(k)) { if (k.tag === tag) out.push(k); else walk(k); } };
  walk(n);
  return out;
}
