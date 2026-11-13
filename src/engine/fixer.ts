/**
 * Tự sửa lỗi CHẮC CHẮN ngay trong file Word (không cần AI): chính tả theo từ điển, gõ đúp chữ, lặp chữ,
 * dấu cách thừa/thiếu, dấu câu. Sửa thẳng vào XML nên giữ nguyên định dạng; chỗ sửa được tô vàng.
 * Lỗi nội dung, chương trình, cấu trúc KHÔNG tự sửa — cô quyết.
 */
import JSZip from 'jszip';
import { DICT } from './rules/spelling';
import { L } from './text';

export interface Change { before: string; after: string; context: string; rule: string }
interface Edit { s: number; e: number; text: string; rule: string }

const enc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

const OK_REPEAT = new Set(['ba', 'chi', 'chành', 'rềnh', 'ràng', 'cò', 'ò', 'la', 'ha', 'hi', 'tùng', 'cắc', 'tí', 'xinh', 'rung', 'linh', 'từng', 'dần', 'nu', 'na', 'ì', 'oa', 'te', 'bập', 'bùng', 'meo', 'gâu', 'chíp', 'ộp', 'quạc', 'bim', 'bíp', 'tích', 'tắc', 'xa', 'hì']);
const DICT_RE = DICT.filter(([a, b]) => a !== b).map(([w, r, cs]) => ({ re: new RegExp(`(?<!${L})${w.replace(/ /g, '\\s+')}(?!${L})`, cs ? 'gu' : 'giu'), r }));
/** dòng chấm chấm để điền tay / dòng canh lề chữ ký: không sửa phần trình bày */
const isLeader = (t: string) => /[.…_]{4,}/.test(t) || / {5,}/.test(t) || /\t/.test(t);

export interface FixOptions { hdSpace?: boolean } // KH ngày: “HĐ1” -> “HĐ 1”

/** các chỗ sửa trong 1 đoạn (theo vị trí ký tự) */
export function editsFor(raw: string, opt: FixOptions = {}): Edit[] {
  // dấu cách không ngắt (U+00A0) coi như dấu cách thường; cùng độ dài nên vị trí không lệch
  const text = raw.replace(/ /g, ' ');
  const edits: Edit[] = [];
  const add = (s: number, e: number, t: string, rule: string) => {
    if (raw.slice(s, e) === t) return;
    if (edits.some(x => s < x.e && e > x.s)) return; // không chồng lên chỗ sửa khác
    edits.push({ s, e, text: t, rule });
  };
  const each = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { for (const m of text.matchAll(re)) fn(m); };

  for (const d of DICT_RE) each(d.re, m => {
    const up = m[0][0] === m[0][0].toUpperCase() && m[0][0] !== m[0][0].toLowerCase() && d.r[0] === d.r[0].toLowerCase();
    add(m.index!, m.index! + m[0].length, up ? d.r[0].toUpperCase() + d.r.slice(1) : d.r, 'chinh-ta.tu-dien');
  });
  each(new RegExp(`(?<!${L})([bcdđghklmnpqrstvx])\\1(?=\\p{Ll})`, 'gu'), m => add(m.index!, m.index! + 2, m[1], 'chinh-ta.go-dup'));
  each(new RegExp(`(?<!${L})(\\p{L}+)(\\s+)\\1(?!${L})`, 'giu'), m => {
    if (!OK_REPEAT.has(m[1].toLowerCase())) add(m.index! + m[1].length, m.index! + m[0].length, '', 'chinh-ta.lap-chu');
  });
  if (isLeader(text)) return edits.sort((a, b) => a.s - b.s);

  each(/(?<=\S) {2,}(?=\S)/g, m => add(m.index!, m.index! + m[0].length, ' ', 'trinh-bay.cach-thua'));
  each(/(?<=[\p{L}\p{N}”)])\s+(?=[,;:!?](?![.,]))/gu, m => add(m.index!, m.index! + m[0].length, '', 'trinh-bay.cach-truoc-dau'));
  each(/(?<=[\p{L}\p{N}])\s+(?=\.(?!\.))/gu, m => add(m.index!, m.index! + m[0].length, '', 'trinh-bay.cach-truoc-dau'));
  each(/(?<=\p{L}):(?=\p{L})/gu, m => add(m.index!, m.index! + 1, ': ', 'trinh-bay.sau-hai-cham'));
  each(/(?<![\d/.,])\d\.(?=\p{Lu})/gu, m => add(m.index!, m.index! + 2, m[0] + ' ', 'trinh-bay.danh-so'));
  each(/^(\s*[-+])(?=\p{L})/gu, m => add(m.index!, m.index! + m[0].length, m[1] + ' ', 'trinh-bay.gach-dau-dong'));
  each(/\(\s+/g, m => add(m.index!, m.index! + m[0].length, '(', 'trinh-bay.ngoac'));
  each(/(?<=\S)\s+\)/g, m => add(m.index!, m.index! + m[0].length, ')', 'trinh-bay.ngoac'));
  each(/“\s+/g, m => add(m.index!, m.index! + m[0].length, '“', 'trinh-bay.ngoac-kep'));
  each(/(?<=\S)\s+”/g, m => add(m.index!, m.index! + m[0].length, '”', 'trinh-bay.ngoac-kep'));
  each(/(?<=[\p{L}?!.,:])\((?=\p{L})/gu, m => add(m.index!, m.index! + 1, ' (', 'trinh-bay.truoc-ngoac'));
  each(/(?<![.…])\.\.(?![.…])/g, m => add(m.index!, m.index! + 2, '.', 'trinh-bay.hai-cham-cuoi'));
  each(/‘([^’”]*)”/g, m => add(m.index!, m.index! + 1, '“', 'trinh-bay.ngoac-lech'));
  if (opt.hdSpace) each(/HĐ(?=\d)/g, m => add(m.index!, m.index! + 2, 'HĐ ', 'trinh-bay.hd-so'));
  return edits.sort((a, b) => a.s - b.s);
}

export const applyEdits = (text: string, edits: Edit[]) =>
  [...edits].sort((a, b) => b.s - a.s).reduce((t, e) => t.slice(0, e.s) + e.text + t.slice(e.e), text);

// ---------- ghi vào XML ----------
const RPR_AFTER_HIGHLIGHT = ['u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];

const MARK_ON = '', MARK_OFF = '';

/** rPr của run + tô vàng (đặt <w:highlight> đúng thứ tự trong rPr để Word không báo lỗi) */
function withHighlight(rPr: string): string {
  const hl = '<w:highlight w:val="yellow"/>';
  const m = rPr.match(/^<w:rPr>([\s\S]*)<\/w:rPr>$/);
  if (!m) return `<w:rPr>${hl}</w:rPr>`;
  let inner = m[1].replace(/<w:highlight\b[^>]*\/>/g, '');
  let pos = inner.length;
  for (const t of RPR_AFTER_HIGHLIGHT) {
    const i = inner.search(new RegExp(`<w:${t}\\b`));
    if (i >= 0 && i < pos) pos = i;
  }
  return `<w:rPr>${inner.slice(0, pos)}${hl}${inner.slice(pos)}</w:rPr>`;
}

/** sửa 1 đoạn <w:p>…</w:p>; trả XML mới + danh sách thay đổi */
function fixParagraph(p: string, opt: FixOptions, changes: Change[]): string {
  // các run và các nút chữ trong run
  const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  const runs: { s: number; e: number; xml: string }[] = [];
  for (const m of p.matchAll(runRe)) runs.push({ s: m.index!, e: m.index! + m[0].length, xml: m[0] });
  type Seg = { run: number; tS: number; tE: number; open: string; text: string; start: number; origLen: number };
  const segs: Seg[] = [];
  let full = '';
  runs.forEach((r, ri) => {
    for (const m of r.xml.matchAll(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)<\/w:t>/g)) {
      const text = dec(m[2]);
      segs.push({ run: ri, tS: m.index!, tE: m.index! + m[0].length, open: m[1], text, start: full.length, origLen: text.length });
      full += text;
    }
  });
  if (!full.trim()) return p;
  const edits = editsFor(full, opt);
  if (!edits.length) return p;

  const touched = new Set<number>();
  // áp từ cuối lên đầu để vị trí không lệch
  for (const ed of [...edits].sort((a, b) => b.s - a.s)) {
    // mọi chỗ sửa đều thay 1 khoảng [s, e) có độ dài > 0: đoạn con đầu tiên chạm khoảng đó nhận chữ mới,
    // các đoạn con sau chỉ bị xoá phần nằm trong khoảng. Sửa từ cuối lên nên vị trí phía trước không lệch.
    let placed = false;
    for (const sg of segs) {
      const a = sg.start, b = sg.start + sg.origLen;
      if (!(a < ed.e && ed.s < b)) continue;
      const ls = Math.max(0, ed.s - a), le = Math.min(sg.origLen, ed.e - a);
      // chữ thay vào được kẹp giữa 2 dấu mốc riêng (vùng Private Use) để lát nữa tách run và tô vàng đúng chỗ
      const ins = ed.text ? MARK_ON + ed.text + MARK_OFF : '';
      if (!placed) { sg.text = sg.text.slice(0, ls) + ins + sg.text.slice(le); placed = true; }
      else sg.text = sg.text.slice(0, ls) + sg.text.slice(le);
      touched.add(sg.run);
    }
    changes.push({ before: full.slice(ed.s, ed.e) || '·', after: ed.text || '(xoá)', rule: ed.rule,
      context: full.slice(Math.max(0, ed.s - 25), Math.min(full.length, ed.e + 25)).trim() });
  }
  // dựng lại từng run: tại dấu mốc, đóng run hiện tại và mở run mới cùng định dạng (phần giữa thêm tô vàng)
  const newRuns = runs.map((r, ri) => {
    const mine = segs.filter(s => s.run === ri);
    if (!mine.length || !touched.has(ri)) return r.xml;
    const open0 = r.xml.match(/^<w:r\b[^>]*>/)![0];
    const rPr = r.xml.slice(open0.length).match(/^\s*<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0].trim() ?? '';
    const on = `</w:t></w:r><w:r>${withHighlight(rPr)}<w:t xml:space="preserve">`;
    const off = `</w:t></w:r><w:r>${rPr}<w:t xml:space="preserve">`;
    let xml = r.xml;
    for (const sg of [...mine].sort((a, b) => b.tS - a.tS)) {
      const open = sg.open.includes('xml:space') ? sg.open : sg.open.replace('<w:t', '<w:t xml:space="preserve"');
      const body = enc(sg.text).split(MARK_ON).join(on).split(MARK_OFF).join(off);
      xml = xml.slice(0, sg.tS) + open + body + '</w:t>' + xml.slice(sg.tE);
    }
    return xml;
  });
  let out = '', last = 0;
  runs.forEach((r, i) => { out += p.slice(last, r.s) + newRuns[i]; last = r.e; });
  return out + p.slice(last);
}

export interface FixResult { data: Uint8Array; changes: Change[] }

export async function fixDocx(input: ArrayBuffer | Uint8Array, opt: FixOptions = {}): Promise<FixResult> {
  const zip = await JSZip.loadAsync(input);
  const changes: Change[] = [];
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('Không phải file Word (.docx)');
  const xml = await f.async('string');
  // mọi đoạn <w:p> (không lồng nhau trong văn bản thường; đoạn trong bảng vẫn là <w:p> riêng)
  const fixed = xml.replace(/<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g, p => (p.endsWith('/>') ? p : fixParagraph(p, opt, changes)));
  zip.file('word/document.xml', fixed);
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { data, changes: changes.reverse() };
}
