/**
 * Sửa tay chữ trong ô bảng của file Word, GIỮ NGUYÊN định dạng (đậm/nghiêng/cỡ chữ, gộp ô, căn lề…).
 * Thuần chuỗi + JSZip, chạy được cả Node lẫn trình duyệt (không cần DOM).
 *
 * Cách làm: so sánh chữ cũ và chữ mới theo từ (LCS), chỉ thay đúng các đoạn khác nhau trực tiếp trong
 * các nút <w:t> của đoạn; phần không đổi giữ nguyên từng run (đậm một phần vẫn đậm). Chữ thêm vào lấy định
 * dạng của ký tự đứng trước. Đoạn thêm mới sao chép <w:pPr> và định dạng chữ của đoạn bên cạnh.
 *
 * Định vị: ParaLoc = { tbl, row, cell, para }
 *   tbl  = thứ tự bảng trong document.xml (bảng ngoài trước, bảng lồng sau, theo thứ tự xuất hiện của <w:tbl>)
 *   row, cell = hàng, ô (đếm <w:tr>, <w:tc>; ô gộp dọc "continue" vẫn được đếm, nhưng không liệt kê để sửa)
 *   para = thứ tự đoạn <w:p> con trực tiếp của ô (đoạn trong bảng lồng thuộc ô của bảng lồng đó)
 * Mỗi đoạn còn có `docPara` = thứ tự <w:p> trong toàn document.xml (khớp với bản xem trước, xem align.ts).
 */
import JSZip from 'jszip';

// ---------- kiểu dữ liệu ----------
export interface ParaLoc { tbl: number; row: number; cell: number; para: number }
export interface EditablePara {
  loc: ParaLoc;
  text: string;          // chữ hiện tại ("\t" = tab, "\n" = xuống dòng trong đoạn)
  docPara: number;       // thứ tự <w:p> trong document.xml
  colName: string;       // tên cột, vd "Hoạt động của cô"
  where: string;         // vd "Thứ ba – Hoạt động của cô"
}
export interface EditableCell {
  tbl: number; row: number; cell: number;
  where: string; colName: string; day: string | null;
  span: number; vMerge: null | 'restart' | 'continue';
  paras: EditablePara[];
}
export interface TextEdit {
  loc: ParaLoc;
  newText?: string;          // thay chữ của đoạn
  remove?: boolean;          // xóa đoạn (ô luôn giữ lại ít nhất 1 đoạn)
  insertBefore?: string[];   // thêm đoạn mới phía trên
  insertAfter?: string[];    // thêm đoạn mới phía dưới
  expect?: string;           // chữ cũ mong đợi; lệch thì báo lỗi (tránh sửa nhầm khi file đã đổi)
}
export interface ApplyOptions { highlight?: boolean }   // tô vàng chữ mới
export interface ApplyReport { changedParas: number; inserted: number; removed: number }

// ---------- tiện ích XML ----------
const enc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const MARK_ON = '', MARK_OFF = '';

function findClose(xml: string, tag: string, from: number): { end: number; after: number } | null {
  let depth = 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[2] === '/') continue;
    if (m[1]) { if (--depth === 0) return { end: m.index, after: re.lastIndex }; } else depth++;
  }
  return null;
}

interface El { tag: string; s: number; e: number; is: number; ie: number }
/** các phần tử con trực tiếp (theo thứ tự) trong khoảng [from, to) có tên thuộc tags (không có tiền tố w:) */
function kids(xml: string, from: number, to: number, tags: string[]): El[] {
  const out: El[] = [];
  const re = new RegExp(`<w:(${tags.join('|')})\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < to) {
    if (m[2] === '/') { out.push({ tag: m[1], s: m.index, e: re.lastIndex, is: re.lastIndex, ie: re.lastIndex }); continue; }
    const c = findClose(xml, `w:${m[1]}`, re.lastIndex);
    if (!c) break;
    out.push({ tag: m[1], s: m.index, e: c.after, is: re.lastIndex, ie: c.end });
    re.lastIndex = c.after;
  }
  return out;
}

// ---------- run và nút chữ trong 1 đoạn ----------
interface Tok { kind: 't' | 'tab' | 'br' | 'x'; raw: string; text: string; orig: string; start: number }
interface Run { s: number; e: number; open0: string; rPr: string; toks: Tok[]; touched: boolean }

const PROTECT_TAGS = ['w:drawing', 'w:pict', 'mc:AlternateContent', 'w:object'];

/** thay phần hộp văn bản/hình bằng dấu cách (cùng độ dài) để không đụng vào run của đoạn lồng bên trong */
function maskProtected(p: string): string {
  let out = p;
  for (const tag of PROTECT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*?(/?)>`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(out))) {
      if (m[1] === '/') continue;
      const c = findClose(out, tag, re.lastIndex);
      if (!c) break;
      out = out.slice(0, re.lastIndex) + ' '.repeat(c.end - re.lastIndex) + out.slice(c.end);
      re.lastIndex = c.after;
    }
  }
  return out;
}

const TOK_RE = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:t\s*\/>|<w:tab\s*\/>|<w:br\s*\/>|<w:br\s+[^>]*?\/>/g;

function parseRuns(p: string): Run[] {
  const masked = maskProtected(p);
  const runs: Run[] = [];
  for (const m of masked.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)) {
    const s = m.index!, e = s + m[0].length;
    const open0 = p.slice(s, s + m[0].match(/^<w:r\b[^>]*>/)![0].length);
    let cs = s + open0.length;
    const mr = masked.slice(cs, e).match(/^\s*(<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\s*\/>)/);
    let rPr = '';
    if (mr) { rPr = p.slice(cs, cs + mr[0].length).trim(); cs += mr[0].length; }
    const ce = e - '</w:r>'.length;
    const toks: Tok[] = [];
    let last = cs;
    const body = masked.slice(cs, ce);
    for (const t of body.matchAll(TOK_RE)) {
      const a = cs + t.index!, b = a + t[0].length;
      if (a > last) toks.push({ kind: 'x', raw: p.slice(last, a), text: '', orig: '', start: 0 });
      last = b;
      const raw = p.slice(a, b);
      if (t[0].startsWith('<w:tab')) toks.push({ kind: 'tab', raw, text: '\t', orig: '\t', start: 0 });
      else if (t[0].startsWith('<w:br')) {
        if (/w:type="(page|column)"/.test(raw)) toks.push({ kind: 'x', raw, text: '', orig: '', start: 0 });
        else toks.push({ kind: 'br', raw, text: '\n', orig: '\n', start: 0 });
      } else {
        const inner = raw.match(/^<w:t(?:\s[^>]*)?>([\s\S]*)<\/w:t>$/)?.[1] ?? '';
        const text = dec(inner);
        toks.push({ kind: 't', raw, text, orig: text, start: 0 });
      }
    }
    if (last < ce) toks.push({ kind: 'x', raw: p.slice(last, ce), text: '', orig: '', start: 0 });
    runs.push({ s, e, open0, rPr, toks, touched: false });
  }
  let pos = 0;
  for (const r of runs) for (const t of r.toks) if (t.kind !== 'x') { t.start = pos; pos += t.orig.length; }
  return runs;
}

const bearing = (runs: Run[]) => runs.flatMap(r => r.toks.filter(t => t.kind !== 'x'));
const textOfRuns = (runs: Run[]) => bearing(runs).map(t => t.orig).join('');
export const paragraphText = (p: string) => textOfRuns(parseRuns(p));

// ---------- tô vàng (giống fixer.ts) ----------
const RPR_AFTER_HIGHLIGHT = ['u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
function withHighlight(rPr: string): string {
  const hl = '<w:highlight w:val="yellow"/>';
  const m = rPr.match(/^<w:rPr>([\s\S]*)<\/w:rPr>$/);
  if (!m) return `<w:rPr>${hl}</w:rPr>`;
  const inner = m[1].replace(/<w:highlight\b[^>]*\/>/g, '');
  let pos = inner.length;
  for (const t of RPR_AFTER_HIGHLIGHT) {
    const i = inner.search(new RegExp(`<w:${t}\\b`));
    if (i >= 0 && i < pos) pos = i;
  }
  return `<w:rPr>${inner.slice(0, pos)}${hl}${inner.slice(pos)}</w:rPr>`;
}

// ---------- so sánh chữ cũ/mới ----------
export interface Hunk { s: number; e: number; text: string }

/** các chỗ khác nhau giữa a và b (vị trí theo a), tính theo từ rồi khớp dài nhất */
export function diffHunks(a: string, b: string): Hunk[] {
  if (a === b) return [];
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const A = a.slice(p, a.length - q), B = b.slice(p, b.length - q);
  const tokenize = (s: string) => s.match(/\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu) ?? [];
  const ta = tokenize(A), tb = tokenize(B);
  if (!ta.length || !tb.length || ta.length * tb.length > 3_000_000) return [{ s: p, e: p + A.length, text: B }];
  const n = ta.length, m = tb.length, W = m + 1;
  const dp = new Int32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * W + j] = ta[i] === tb[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const hunks: Hunk[] = [];
  let i = 0, j = 0, off = 0;
  let cur: Hunk | null = null;
  const close = () => { if (cur) { hunks.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && ta[i] === tb[j]) { close(); off += ta[i].length; i++; j++; }
    else if (j < m && (i >= n || dp[i * W + j + 1] >= dp[(i + 1) * W + j])) {
      cur ??= { s: p + off, e: p + off, text: '' };
      cur.text += tb[j++];
    } else {
      cur ??= { s: p + off, e: p + off, text: '' };
      cur.e += ta[i].length; off += ta[i].length; i++;
    }
  }
  close();
  return hunks;
}

// ---------- ghi chữ mới vào 1 đoạn ----------
function textToXml(text: string): string {
  let out = '', buf = '';
  const flush = () => { if (buf) { out += `<w:t xml:space="preserve">${enc(buf)}</w:t>`; buf = ''; } };
  for (const ch of text) {
    if (ch === '\t') { flush(); out += '<w:tab/>'; } else if (ch === '\n') { flush(); out += '<w:br/>'; } else buf += ch;
  }
  flush();
  return out;
}

function serializeRun(r: Run): string {
  const on = withHighlight(r.rPr);
  let out = '', cur = '', hl = false;
  const flush = () => { if (cur) out += `${r.open0}${hl ? on : r.rPr}${cur}</w:r>`; cur = ''; };
  for (const t of r.toks) {
    if (t.kind === 'x' || (t.text === t.orig)) { cur += t.raw; continue; }
    let buf = '';
    const flushBuf = () => { if (buf) { cur += textToXml(buf); buf = ''; } };
    for (const ch of t.text) {
      if (ch === MARK_ON) { flushBuf(); flush(); hl = true; }
      else if (ch === MARK_OFF) { flushBuf(); flush(); hl = false; }
      else buf += ch;
    }
    flushBuf();
  }
  flush();
  return out;
}

const pPrOf = (p: string): { xml: string; rPr: string } => {
  const open = p.match(/^<w:p\b[^>]*?>/);
  if (!open || p.endsWith('/>') && !p.includes('</w:p>')) return { xml: '', rPr: '' };
  const i = p.indexOf('<w:pPr', open[0].length);
  if (i < 0 || p.slice(open[0].length, i).trim()) return { xml: '', rPr: '' };
  const c = findClose(p, 'w:pPr', p.indexOf('>', i) + 1);
  if (!c) return { xml: '', rPr: '' };
  let xml = p.slice(i, c.after).replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '');
  const rPr = xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0].replace(/<w:(ins|del)\b[^>]*\/>/g, '') ?? '';
  xml = xml.replace(/<w:pPrChange\b[\s\S]*?<\/w:pPrChange>/g, '');
  return { xml, rPr };
};

/** định dạng chữ mẫu của đoạn: run cuối có chữ, nếu không có thì rPr của dấu đoạn */
function templateRPr(p: string): string {
  const runs = parseRuns(p).filter(r => r.toks.some(t => t.kind !== 'x' && t.orig));
  if (runs.length) return runs[runs.length - 1].rPr;
  return pPrOf(p).rPr;
}

function makeRun(rPr: string, text: string, highlight: boolean): string {
  if (!text) return '';
  return `<w:r>${highlight ? withHighlight(rPr) : rPr}${textToXml(text)}</w:r>`;
}

/** đoạn mới dựa trên đoạn mẫu (cùng pPr và định dạng chữ) */
function newParagraph(anchor: string, text: string, highlight: boolean): string {
  return `<w:p>${pPrOf(anchor).xml}${makeRun(templateRPr(anchor), text, highlight)}</w:p>`;
}

/** thay chữ của 1 đoạn <w:p>…</w:p> bằng newText, giữ định dạng phần không đổi */
export function editParagraph(p: string, newText: string, opt: ApplyOptions = {}): string {
  const runs = parseRuns(p);
  const old = textOfRuns(runs);
  if (old === newText || old.normalize('NFC') === newText.normalize('NFC')) return p;
  const toks = bearing(runs);
  if (!toks.length) { // đoạn trống: tạo run mới theo định dạng dấu đoạn
    const run = makeRun(templateRPr(p), newText, !!opt.highlight);
    if (/^<w:p\b[^>]*\/>$/.test(p)) return p.replace(/\s*\/>$/, '>') + run + '</w:p>';
    return p.slice(0, p.length - '</w:p>'.length) + run + '</w:p>';
  }
  const owner = new Map<Tok, Run>();
  for (const r of runs) for (const t of r.toks) owner.set(t, r);
  for (const h of diffHunks(old, newText).sort((x, y) => y.s - x.s)) {
    const ins = h.text ? (opt.highlight ? MARK_ON + h.text + MARK_OFF : h.text) : '';
    if (h.e > h.s) {
      let placed = false;
      for (const t of toks) {
        const a = t.start, b = a + t.orig.length;
        if (!(a < h.e && h.s < b)) continue;
        const ls = Math.max(0, h.s - a), le = Math.min(t.orig.length, h.e - a);
        t.text = t.text.slice(0, ls) + (placed ? '' : ins) + t.text.slice(le);
        placed = true;
        owner.get(t)!.touched = true;
      }
    } else { // chỉ chèn: lấy định dạng ký tự đứng trước
      let t = [...toks].reverse().find(x => x.start + x.orig.length === h.s && x.orig.length > 0);
      let ls = t ? t.orig.length : 0;
      if (!t) { t = toks.find(x => x.start >= h.s) ?? toks[toks.length - 1]; ls = t.start >= h.s ? 0 : t.orig.length; }
      t.text = t.text.slice(0, ls) + ins + t.text.slice(ls);
      owner.get(t)!.touched = true;
    }
  }
  let out = '', last = 0;
  for (const r of runs) {
    out += p.slice(last, r.s) + (r.touched ? serializeRun(r) : p.slice(r.s, r.e));
    last = r.e;
  }
  return out + p.slice(last);
}

// ---------- đọc cấu trúc bảng ----------
interface ParaEl { s: number; e: number; para: number; doc: number }
interface CellEl { s: number; e: number; vMerge: null | 'restart' | 'continue'; span: number; grid: number; paras: ParaEl[] }
interface TblEl { idx: number; rows: CellEl[][] }

function scan(xml: string): TblEl[] {
  const docStarts: number[] = [];
  for (const m of xml.matchAll(/<w:p(?=[\s>/])/g)) docStarts.push(m.index!);
  const docIdx = (off: number) => {
    let lo = 0, hi = docStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (docStarts[mid] < off) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const tables: TblEl[] = [];
  const visit = (t: El) => {
    const info: TblEl = { idx: tables.length, rows: [] };
    tables.push(info);
    for (const tr of kids(xml, t.is, t.ie, ['tr'])) {
      const cells: CellEl[] = [];
      let grid = 0;
      for (const tc of kids(xml, tr.is, tr.ie, ['tc'])) {
        const ch = kids(xml, tc.is, tc.ie, ['p', 'tbl']);
        const pr = xml.slice(tc.is, ch.length ? ch[0].s : tc.ie);
        const vm = pr.match(/<w:vMerge(?:\s+w:val="(\w+)")?\s*\/>/);
        const span = +(pr.match(/<w:gridSpan\s+w:val="(\d+)"/)?.[1] ?? 1);
        const paras: ParaEl[] = [];
        for (const c of ch) {
          if (c.tag === 'p') paras.push({ s: c.s, e: c.e, para: paras.length, doc: docIdx(c.s) });
          else visit(c);
        }
        cells.push({ s: tc.s, e: tc.e, vMerge: vm ? (vm[1] === 'restart' ? 'restart' : 'continue') : null, span, grid, paras });
        grid += span;
      }
      info.rows.push(cells);
    }
  };
  const bs = xml.indexOf('<w:body'), be = xml.lastIndexOf('</w:body>');
  if (bs < 0) throw new Error('Không phải file Word (.docx)');
  for (const c of kids(xml, xml.indexOf('>', bs) + 1, be, ['p', 'tbl'])) if (c.tag === 'tbl') visit(c);
  return tables;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** liệt kê các ô (kèm đoạn) có thể sửa; bỏ ô gộp dọc phần "continue" */
export function listCells(xml: string): EditableCell[] {
  const tables = scan(xml);
  const out: EditableCell[] = [];
  for (const t of tables) {
    const text = t.rows.map(row => row.map(c => c.paras.map(p => paragraphText(xml.slice(p.s, p.e)))));
    const firstText = (r: number) => clean(text[r][0]?.find(x => x.trim()) ?? '');
    const thuRow = (r: number) => /^Thứ\s/i.test(firstText(r));
    let hdr = t.rows.findIndex((_, r) => thuRow(r));
    if (hdr < 0) hdr = t.rows.length > 1 ? 1 : 0;
    // tên cột: lấy tiêu đề dưới cùng phủ cột đó
    const colNames: string[] = [];
    for (let r = 0; r < hdr; r++) for (let c = 0; c < t.rows[r].length; c++) {
      const cell = t.rows[r][c];
      const name = clean(text[r][c].filter(x => x.trim()).join(' / '));
      if (!name || cell.vMerge === 'continue') continue;
      for (let g = cell.grid; g < cell.grid + cell.span; g++) colNames[g] = name;
    }
    t.rows.forEach((row, r) => {
      let day: string | null = null;
      for (let k = r; k >= 0 && !day; k--) if (thuRow(k)) day = firstText(k).match(/^Thứ\s+\p{L}+/iu)?.[0] ?? null;
      row.forEach((cell, c) => {
        if (cell.vMerge === 'continue') return;
        const own = clean(text[r][c].find(x => x.trim()) ?? '');
        const colName = r < hdr ? '' : cell.span > 1 ? own : colNames[cell.grid] ?? '';
        const where = r < hdr
          ? `Tiêu đề bảng – ${own || `ô ${c + 1}`}`
          : [day, colName].filter(Boolean).join(' – ') || `Bảng ${t.idx + 1}, hàng ${r + 1}, ô ${c + 1}`;
        out.push({
          tbl: t.idx, row: r, cell: c, where, colName, day, span: cell.span, vMerge: cell.vMerge,
          paras: cell.paras.map(p => ({
            loc: { tbl: t.idx, row: r, cell: c, para: p.para },
            text: text[r][c][p.para], docPara: p.doc, colName, where,
          })),
        });
      });
    });
  }
  return out;
}

/** mọi đoạn trong ô bảng có thể sửa (dạng phẳng) */
export function listEditable(xml: string): EditablePara[] {
  return listCells(xml).flatMap(c => c.paras);
}

// ---------- áp dụng các chỗ sửa ----------
export interface CellItem { orig: number | null; text: string }

/**
 * Chuyển danh sách đoạn người dùng đang sửa trong khung (mỗi mục: đoạn gốc số mấy hoặc mới + chữ)
 * thành các TextEdit. origTexts = chữ gốc từng đoạn của ô.
 */
export function editsFromItems(cell: { tbl: number; row: number; cell: number }, origTexts: string[], items: CellItem[]): TextEdit[] {
  const loc = (para: number): ParaLoc => ({ ...cell, para });
  const list = items.length ? items : [{ orig: null, text: '' }];
  const keptSet = new Set(list.filter(x => x.orig !== null).map(x => x.orig as number));
  const edits = new Map<number, TextEdit>();
  const get = (i: number) => { let e = edits.get(i); if (!e) edits.set(i, e = { loc: loc(i), expect: origTexts[i] }); return e; };
  for (let i = 0; i < origTexts.length; i++) if (!keptSet.has(i)) get(i).remove = true;
  let anchor = -1;          // đoạn gốc gần nhất còn giữ phía trên
  const pendingTop: string[] = [];
  for (const it of list) {
    if (it.orig !== null) {
      anchor = it.orig;
      if (it.text !== origTexts[it.orig]) get(it.orig).newText = it.text;
    } else if (anchor >= 0) (get(anchor).insertAfter ??= []).push(it.text);
    else pendingTop.push(it.text);
  }
  if (pendingTop.length) {
    const first = [...keptSet].sort((a, b) => a - b)[0];
    if (first !== undefined) (get(first).insertBefore ??= []).push(...pendingTop);
    else { // xóa hết đoạn gốc, chỉ còn đoạn mới: dùng đoạn 0 làm nền
      const e = get(0); delete e.remove; e.newText = pendingTop[0]; if (pendingTop.length > 1) e.insertAfter = pendingTop.slice(1);
    }
  }
  return [...edits.values()];
}

export function applyTextEditsXml(xml: string, edits: TextEdit[], opt: ApplyOptions = {}): { xml: string; report: ApplyReport } {
  const tables = scan(xml);
  const report: ApplyReport = { changedParas: 0, inserted: 0, removed: 0 };
  const byPara = new Map<string, { el: ParaEl; cellKey: string; ed: TextEdit }>();
  const cellInfo = new Map<string, { total: number; removed: number; inserts: number }>();
  for (const ed of edits) {
    const { tbl, row, cell, para } = ed.loc;
    const el = tables[tbl]?.rows[row]?.[cell]?.paras[para];
    if (!el) throw new Error(`Không tìm thấy đoạn (bảng ${tbl + 1}, hàng ${row + 1}, ô ${cell + 1}, đoạn ${para + 1})`);
    if (ed.expect !== undefined) {
      const cur = paragraphText(xml.slice(el.s, el.e));
      if (cur !== ed.expect) throw new Error(`Đoạn đã thay đổi so với lúc mở (bảng ${tbl + 1}, hàng ${row + 1}, ô ${cell + 1}, đoạn ${para + 1})`);
    }
    const key = `${tbl}/${row}/${cell}/${para}`;
    const prev = byPara.get(key);
    const merged: TextEdit = prev ? { ...prev.ed, ...ed, insertBefore: [...(prev.ed.insertBefore ?? []), ...(ed.insertBefore ?? [])], insertAfter: [...(prev.ed.insertAfter ?? []), ...(ed.insertAfter ?? [])] } : ed;
    byPara.set(key, { el, cellKey: `${tbl}/${row}/${cell}`, ed: merged });
  }
  for (const { cellKey, ed } of byPara.values()) {
    const ci = cellInfo.get(cellKey) ?? { total: tables[ed.loc.tbl].rows[ed.loc.row][ed.loc.cell].paras.length, removed: 0, inserts: 0 };
    if (ed.remove) ci.removed++;
    ci.inserts += (ed.insertBefore?.length ?? 0) + (ed.insertAfter?.length ?? 0);
    cellInfo.set(cellKey, ci);
  }
  const repl: { s: number; e: number; text: string }[] = [];
  for (const { el, cellKey, ed } of byPara.values()) {
    const orig = xml.slice(el.s, el.e);
    const ci = cellInfo.get(cellKey)!;
    let body = orig;
    let remove = !!ed.remove;
    if (remove && ci.removed >= ci.total && ci.inserts === 0 && ed.loc.para === ci.total - 1) remove = false;   // ô phải còn ít nhất 1 đoạn: giữ đoạn cuối, xóa chữ
    const clearInstead = !!ed.remove && !remove;
    if (remove) { body = ''; report.removed++; }
    else {
      const nt = clearInstead ? '' : ed.newText;
      if (nt !== undefined) {
        const edited = editParagraph(orig, nt, opt);
        if (edited !== orig) report.changedParas++;
        body = edited;
      }
    }
    const before = (ed.insertBefore ?? []).map(t => newParagraph(orig, t, !!opt.highlight)).join('');
    const after = (ed.insertAfter ?? []).map(t => newParagraph(orig, t, !!opt.highlight)).join('');
    report.inserted += (ed.insertBefore?.length ?? 0) + (ed.insertAfter?.length ?? 0);
    repl.push({ s: el.s, e: el.e, text: before + body + after });
  }
  let out = xml;
  for (const r of repl.sort((a, b) => b.s - a.s)) out = out.slice(0, r.s) + r.text + out.slice(r.e);
  return { xml: out, report };
}

export type DocxInput = ArrayBuffer | Uint8Array | JSZip;

async function loadZip(input: DocxInput): Promise<JSZip> {
  return input instanceof JSZip ? input : JSZip.loadAsync(input);
}

/** đọc document.xml của file .docx */
export async function readDocumentXml(input: DocxInput): Promise<string> {
  const f = (await loadZip(input)).file('word/document.xml');
  if (!f) throw new Error('Không phải file Word (.docx)');
  return f.async('string');
}

/** sửa chữ theo ô và trả file .docx mới (ArrayBuffer); không đụng file gốc (zip nhận vào được nạp lại, không bị sửa) */
export async function applyTextEdits(input: DocxInput, edits: TextEdit[], opt: ApplyOptions = {}): Promise<{ data: ArrayBuffer; report: ApplyReport }> {
  const zip = input instanceof JSZip ? await JSZip.loadAsync(await input.generateAsync({ type: 'uint8array' })) : await JSZip.loadAsync(input);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('Không phải file Word (.docx)');
  const { xml, report } = applyTextEditsXml(await f.async('string'), edits, opt);
  zip.file('word/document.xml', xml);
  const data = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { data, report };
}

/** XML của một đoạn theo vị trí (dùng cho kiểm tra/chẩn đoán) */
export function getParagraphXml(xml: string, loc: ParaLoc): string | null {
  const el = scan(xml)[loc.tbl]?.rows[loc.row]?.[loc.cell]?.paras[loc.para];
  return el ? xml.slice(el.s, el.e) : null;
}

/** chữ của MỌI đoạn <w:p> trong document.xml theo thứ tự xuất hiện (chỉ số = docPara) */
export function listAllParagraphTexts(xml: string): string[] {
  const out: string[] = [];
  const re = /<w:p(?=[\s>/])[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] === '/') { out.push(''); continue; }
    const c = findClose(xml, 'w:p', re.lastIndex);
    if (!c) { out.push(''); continue; }
    out.push(paragraphText(xml.slice(m.index, c.after)));
    // không nhảy qua đoạn: đoạn lồng bên trong (hộp văn bản) cũng được đếm riêng
  }
  return out;
}
