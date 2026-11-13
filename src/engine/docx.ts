/**
 * Đọc file .docx thành đoạn văn + bảng (chạy được cả trình duyệt lẫn Node, không cần DOM).
 * Chỉ đọc chữ và cấu trúc bảng (ô gộp dọc/ngang); định dạng chữ không cần cho việc soát.
 */
import JSZip from 'jszip';

export interface Cell {
  lines: string[];                       // mỗi đoạn trong ô là 1 dòng (giữ cả dòng trống)
  vMerge: null | 'restart' | 'continue'; // ô gộp dọc
  span: number;                          // gộp ngang (gridSpan)
}
export interface Row { cells: Cell[] }
export interface Table { rows: Row[] }
export type Block = { t: 'p'; text: string } | { t: 'tbl'; tbl: Table };
export interface DocModel {
  blocks: Block[];
  paras: string[];                       // đoạn văn ngoài bảng
  tables: Table[];
  page: { w: number; h: number } | null; // khổ giấy (twip)
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** vị trí thẻ đóng khớp với thẻ mở w:tag (có tính lồng nhau) */
function findClose(xml: string, tag: string, from: number): { end: number; after: number } | null {
  let depth = 1;
  const re = new RegExp(`<(/?)w:${tag}\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[2] === '/') continue;           // thẻ tự đóng
    if (m[1]) { if (--depth === 0) return { end: m.index, after: re.lastIndex }; }
    else depth++;
  }
  return null;
}

/** các phần tử con (theo thứ tự) có tên thuộc tags, bỏ qua phần bên trong mỗi phần tử */
function children(xml: string, tags: string[]): { tag: string; inner: string; open: string }[] {
  const out: { tag: string; inner: string; open: string }[] = [];
  const re = new RegExp(`<w:(${tags.join('|')})\\b[^>]*?(/?)>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[2] === '/') { out.push({ tag: m[1], inner: '', open: m[0] }); continue; }
    const c = findClose(xml, m[1], re.lastIndex);
    if (!c) break;
    out.push({ tag: m[1], inner: xml.slice(re.lastIndex, c.end), open: m[0] });
    re.lastIndex = c.after;
  }
  return out;
}

function paraText(xml: string): string {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:noBreakHyphen\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) out += decode(m[1]);
    else if (m[0].startsWith('<w:tab')) out += '\t';
    else if (m[0].startsWith('<w:br')) out += '\n';
    else out += '-';
  }
  return out.replace(/ /g, ' ').normalize('NFC');
}

function parseTable(xml: string): Table {
  const rows: Row[] = [];
  for (const tr of children(xml, ['tr'])) {
    const cells: Cell[] = [];
    for (const tc of children(tr.inner, ['tc'])) {
      const firstP = tc.inner.search(/<w:(p|tbl)\b/);
      const pr = firstP >= 0 ? tc.inner.slice(0, firstP) : tc.inner;
      const vm = pr.match(/<w:vMerge(?:\s+w:val="(\w+)")?\s*\/>/);
      const span = +(pr.match(/<w:gridSpan\s+w:val="(\d+)"/)?.[1] ?? 1);
      const lines: string[] = [];
      for (const ch of children(tc.inner, ['p', 'tbl'])) {
        if (ch.tag === 'p') lines.push(...paraText(ch.inner).split('\n'));
        else for (const r of parseTable(ch.inner).rows) for (const c of r.cells) lines.push(...c.lines);
      }
      cells.push({ lines, vMerge: vm ? (vm[1] === 'restart' ? 'restart' : 'continue') : null, span });
    }
    rows.push({ cells });
  }
  return { rows };
}

export async function readDocx(data: ArrayBuffer | Uint8Array): Promise<DocModel> {
  const zip = await JSZip.loadAsync(data);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('Không phải file Word (.docx)');
  const xml = await f.async('string');
  const body = xml.slice(xml.indexOf('<w:body'), xml.lastIndexOf('</w:body>'));
  const blocks: Block[] = [];
  for (const ch of children(body, ['p', 'tbl'])) {
    if (ch.tag === 'p') blocks.push({ t: 'p', text: paraText(ch.inner) });
    else blocks.push({ t: 'tbl', tbl: parseTable(ch.inner) });
  }
  const pg = body.match(/<w:pgSz\b[^>]*?w:w="(\d+)"[^>]*?w:h="(\d+)"/);
  return {
    blocks,
    paras: blocks.filter((b): b is { t: 'p'; text: string } => b.t === 'p').map(b => b.text),
    tables: blocks.filter((b): b is { t: 'tbl'; tbl: Table } => b.t === 'tbl').map(b => b.tbl),
    page: pg ? { w: +pg[1], h: +pg[2] } : null,
  };
}

/** chữ của cả ô, gộp dòng */
export const cellText = (c: Cell | undefined) => (c ? c.lines.join('\n') : '');
