/**
 * Căn hàng “Hoạt động của cô” ↔ “Hoạt động của trẻ” trong kế hoạch ngày.
 *
 * Hai cột nằm chung một hàng của bảng; các cô căn câu của trẻ ngang câu của cô bằng ĐOẠN RỖNG ở cột trẻ
 * (đã kiểm trên giáo án thật: không dùng ngắt dòng mềm hay giãn đoạn). Khi bộ sửa làm câu của cô dài/ngắn đi
 * thì số dòng xuống hàng đổi và câu của trẻ trôi lệch. File này:
 *   - đo số dòng mỗi đoạn bằng bảng độ rộng Times New Roman nhúng sẵn (không phụ thuộc phông máy),
 *   - alignmentMap(): trên BẢN GỐC, mỗi đoạn trẻ có chữ đứng ngang dòng nào của đoạn cô nào,
 *   - realign(): sau khi sửa, chỉ thêm/bớt đoạn rỗng ở cột trẻ để các cặp đó lại đứng ngang nhau,
 *   - checkAlign(): báo cặp đang lệch (Issue mức "xem").
 * Hàm thuần trên chuỗi XML (word/document.xml, kèm word/styles.xml nếu có) — chạy được cả trình duyệt lẫn Node.
 */
import JSZip from 'jszip';
import { charEm } from './fonts/metrics';
import { mismatchReason } from './tre-rules';
import { Issue } from './types';

// ======================================================================================
// 1. Quét XML
// ======================================================================================
export interface El { tag: string; s: number; e: number; is: number; ie: number }

/** các phần tử con (theo thứ tự) tên thuộc tags trong xml[from,to); bỏ qua phần bên trong mỗi phần tử tìm được */
export function scan(xml: string, from: number, to: number, tags: string[]): El[] {
  const out: El[] = [];
  const re = new RegExp(`<w:(${tags.join('|')})\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < to) {
    const tag = m[1];
    if (m[2] === '/') { out.push({ tag, s: m.index, e: re.lastIndex, is: re.lastIndex, ie: re.lastIndex }); continue; }
    const cre = new RegExp(`<(/?)w:${tag}\\b[^>]*?(/?)>`, 'g');
    cre.lastIndex = re.lastIndex;
    let depth = 1, c: RegExpExecArray | null, end = -1, after = -1;
    while ((c = cre.exec(xml))) {
      if (c[2] === '/') continue;
      if (c[1]) { if (--depth === 0) { end = c.index; after = cre.lastIndex; break; } } else depth++;
    }
    if (end < 0) break;
    out.push({ tag, s: m.index, e: after, is: re.lastIndex, ie: end });
    re.lastIndex = after;
  }
  return out;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
export const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const attr = (tagXml: string, name: string): string | undefined => tagXml.match(new RegExp(`\\sw:${name}="([^"]*)"`))?.[1];
const num = (v: string | undefined) => (v === undefined || v === '' || isNaN(+v) ? undefined : +v);

// ======================================================================================
// 2. Định dạng (styles.xml)
// ======================================================================================
interface PPr { before?: number; after?: number; line?: number; lineRule?: string; left?: number; right?: number; first?: number; hanging?: number; jc?: string }
interface RPr { sz?: number; b?: boolean; i?: boolean; caps?: boolean; sp?: number; scale?: number }
interface StyleDef { id: string; type: string; basedOn?: string; pPr: PPr; rPr: RPr; isDefault: boolean }
export interface StyleDb { defaults: { pPr: PPr; rPr: RPr }; styles: Map<string, StyleDef>; defaultPara?: string }

const toggle = (xml: string, tag: string): boolean | undefined => {
  const m = xml.match(new RegExp(`<w:${tag}(?:\\s[^>]*?)?/?>`));
  if (!m) return undefined;
  const v = attr(m[0], 'val');
  return !(v === '0' || v === 'false' || v === 'off');
};
function parseRPr(inner: string): RPr {
  const sz = num(attr(inner.match(/<w:sz\b[^>]*>/)?.[0] ?? '', 'val'));
  const sp = num(attr(inner.match(/<w:spacing[^>]*>/)?.[0] ?? '', 'val'));          // giãn/nén khoảng cách chữ (1/20 điểm)
  const sc = num(attr(inner.match(/<w:w [^>]*>/)?.[0] ?? '', 'val'));                 // co giãn chiều ngang chữ (%)
  return { sz: sz === undefined ? undefined : sz / 2, b: toggle(inner, 'b'), i: toggle(inner, 'i'), caps: toggle(inner, 'caps'), sp: sp === undefined ? undefined : sp / 20, scale: sc === undefined ? undefined : sc / 100 };
}
export function parsePPr(inner: string): PPr {
  const body = inner.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '');
  const sp = body.match(/<w:spacing\b[^>]*>/)?.[0] ?? '';
  const ind = body.match(/<w:ind\b[^>]*>/)?.[0] ?? '';
  return {
    before: num(attr(sp, 'before')), after: num(attr(sp, 'after')), line: num(attr(sp, 'line')), lineRule: attr(sp, 'lineRule'),
    left: num(attr(ind, 'left') ?? attr(ind, 'start')), right: num(attr(ind, 'right') ?? attr(ind, 'end')),
    first: num(attr(ind, 'firstLine')), hanging: num(attr(ind, 'hanging')),
    jc: attr(body.match(/<w:jc[ />][^>]*>|<w:jc>/)?.[0] ?? "", "val"),
  };
}
const mergeObj = <T extends object>(base: T, over: T): T => {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) if (v !== undefined) out[k] = v;
  return out as T;
};
const mergeP = (a: PPr, b: PPr): PPr => {
  const m = mergeObj(a, b);
  if (b.first !== undefined && b.hanging === undefined) m.hanging = undefined;
  if (b.hanging !== undefined && b.first === undefined) m.first = undefined;
  return m;
};

export function parseStyles(stylesXml: string | undefined): StyleDb {
  const db: StyleDb = { defaults: { pPr: {}, rPr: {} }, styles: new Map() };
  if (!stylesXml) return db;
  const dd = stylesXml.match(/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/)?.[1] ?? '';
  db.defaults.rPr = parseRPr(dd.match(/<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/)?.[1] ?? '');
  db.defaults.pPr = parsePPr(dd.match(/<w:pPrDefault>([\s\S]*?)<\/w:pPrDefault>/)?.[1] ?? '');
  for (const m of stylesXml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = attr(m[1], 'styleId');
    if (!id) continue;
    const type = attr(m[1], 'type') ?? 'paragraph';
    const body = m[2];
    const def: StyleDef = {
      id, type, isDefault: attr(m[1], 'default') === '1',
      basedOn: attr(body.match(/<w:basedOn\b[^>]*>/)?.[0] ?? '', 'val'),
      pPr: parsePPr(body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? ''),
      rPr: parseRPr(body.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ''),
    };
    db.styles.set(id, def);
    if (type === 'paragraph' && def.isDefault) db.defaultPara = id;
  }
  return db;
}
function styleChain(db: StyleDb, id: string | undefined): StyleDef[] {
  const out: StyleDef[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const s = db.styles.get(id);
    if (!s) break;
    out.unshift(s);
    id = s.basedOn;
  }
  return out;
}

// ======================================================================================
// 3. Đo đoạn văn
// ======================================================================================
/** chiều cao 1 dòng đơn của Times New Roman = (ascent + descent + lineGap) / unitsPerEm = (1825+443+87)/2048 */
const TNR_LINE = 1.1499;
const FIT_SLACK = 1e-6;
/** dòng căn đều hai bên (jc=both): Word nén dấu cách tới ~18% để kéo thêm được chữ để kéo thêm được chữ — đo trên giáo án thật (99,8% đúng số dòng) */
const SHRINK = 0.18;

export interface ParaGeo {
  idx: number;          // thứ tự đoạn trong ô (từ 0, tính cả đoạn rỗng)
  s: number; e: number; // vị trí trong XML
  text: string;
  blank: boolean;       // không có chữ nhìn thấy và không có hình/ngắt trang -> "đoạn rỗng"
  y0: number;           // mép trên (điểm, tính từ đầu nội dung ô), gồm khoảng cách trước
  before: number; lineH: number; lines: number; after: number;
  y1: number;           // mép dưới, gồm khoảng cách sau
}
export const firstTop = (p: ParaGeo) => p.y0 + p.before;
export const lineTop = (p: ParaGeo, i: number) => p.y0 + p.before + i * p.lineH;

export interface TblCtx { db: StyleDb; tblStyle: StyleDef[]; marL: number; marR: number; marT: number }
interface Seg { ch: string; w: number; space: boolean; hyph: boolean; nb: boolean }

function paraGeo(xml: string, el: El, idx: number, tc: TblCtx, widthTw: number, marL: number, marR: number, y0: number): ParaGeo {
  const pxml = xml.slice(el.s, el.e);
  const pPrXml = pxml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? '';
  const styleId = attr(pPrXml.match(/<w:pStyle\b[^>]*>/)?.[0] ?? '', 'val') ?? tc.db.defaultPara;
  const chain = styleChain(tc.db, styleId);
  let pp = mergeP(tc.db.defaults.pPr, {});
  for (const s of tc.tblStyle) pp = mergeP(pp, s.pPr);
  for (const s of chain) pp = mergeP(pp, s.pPr);
  pp = mergeP(pp, parsePPr(pPrXml));
  let baseR: RPr = mergeObj({}, tc.db.defaults.rPr);
  for (const s of tc.tblStyle) baseR = mergeObj(baseR, s.rPr);
  for (const s of chain) baseR = mergeObj(baseR, s.rPr);
  const markR = mergeObj(baseR, parseRPr(pPrXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ''));

  // chữ theo từng run (bỏ phần bị xoá có theo dõi thay đổi)
  const body = pxml.slice(pPrXml ? pxml.indexOf('</w:pPr>') + 8 : pxml.indexOf('>') + 1).replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '');
  const segs: (Seg | 'br' | 'tab')[] = [];
  let text = '', maxSz = 0, visible = false, special = false;
  for (const rm of body.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const inner = rm[1];
    const rprXml = inner.match(/^\s*<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
    let rr = baseR;
    const rs = attr(rprXml.match(/<w:rStyle\b[^>]*>/)?.[0] ?? '', 'val');
    for (const s of styleChain(tc.db, rs)) rr = mergeObj(rr, s.rPr);
    rr = mergeObj(rr, parseRPr(rprXml));
    const sz = rr.sz ?? 11, bold = !!rr.b, ital = !!rr.i;
    for (const m of inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b([^>]*)\/>|<w:cr\s*\/>|<w:noBreakHyphen\s*\/>|<w:(?:drawing|pict|object)\b/g)) {
      if (m[1] !== undefined) {
        let t = decode(m[1]).normalize('NFC');
        if (rr.caps) t = t.toUpperCase();
        if (t.length) maxSz = Math.max(maxSz, sz);
        for (const ch of t) {
          text += ch;
          if (/\S/.test(ch) && ch !== ' ') visible = true;
          segs.push({ ch, w: charEm(ch, bold, ital) * sz * (rr.scale ?? 1) + (rr.sp ?? 0), space: ch === ' ', hyph: ch === '-' || ch === '–', nb: ch === ' ' });
        }
      } else if (m[0].startsWith('<w:tab')) { segs.push('tab'); text += '\t'; maxSz = Math.max(maxSz, sz); }
      else if (m[0].startsWith('<w:br') || m[0].startsWith('<w:cr')) {
        if (/w:type="page"|w:type="column"/.test(m[2] ?? '')) special = true;
        segs.push('br'); text += '\n';
      } else if (m[0].startsWith('<w:noBreakHyphen')) { text += '-'; visible = true; segs.push({ ch: '-', w: charEm('-', bold, ital) * sz, space: false, hyph: false, nb: true }); }
      else special = true;
    }
  }
  if (/<w:sectPr\b/.test(pPrXml)) special = true;
  const sz = Math.max(maxSz, markR.sz ?? 11);

  // khung chữ
  const leftBase = (pp.left ?? 0) / 20, right = (pp.right ?? 0) / 20;
  const firstOff = ((pp.first ?? 0) - (pp.hanging ?? 0)) / 20;
  const availRest = (widthTw - marL - marR) / 20 - leftBase - right;
  const availFirst = availRest - firstOff;

  // ngắt dòng theo từ (như Word): chỗ ngắt = sau dấu cách, sau gạch nối; từ dài hơn dòng bị cắt theo ký tự
  const both = pp.jc === 'both' || pp.jc === 'distribute';
  let lines = 1, x = 0, avail = availFirst, lineSp = 0;
  let i = 0;
  while (i < segs.length) {
    const sg = segs[i];
    if (sg === 'br') { lines++; x = 0; lineSp = 0; avail = availRest; i++; continue; }
    if (sg === 'tab') { x = Math.ceil((x + 0.5) / 36) * 36; i++; continue; }
    // một "từ": các ký tự không phải dấu cách (kết thúc ở gạch nối) + dấu cách theo sau
    let j = i, wordW = 0;
    for (; j < segs.length; j++) {
      const t = segs[j];
      if (t === 'br' || t === 'tab' || t.space) break;
      wordW += t.w;
      if (t.hyph && j + 1 < segs.length) { const n = segs[j + 1]; if (n !== 'br' && n !== 'tab' && !n.space && j > i) { j++; break; } }
    }
    let spW = 0, k = j;
    while (k < segs.length) { const t = segs[k]; if (t === 'br' || t === 'tab' || !t.space) break; spW += t.w; k++; }
    if (j > i) {
      if (x + wordW - (both ? SHRINK * lineSp : 0) > avail + FIT_SLACK) {
        if (x > 0) { lines++; x = 0; lineSp = 0; avail = availRest; }
        if (wordW > avail) {
          // từ dài hơn cả dòng: cắt theo ký tự
          for (let q = i; q < j; q++) {
            const t = segs[q] as Seg;
            if (x + t.w > avail + FIT_SLACK && x > 0) { lines++; x = 0; lineSp = 0; avail = availRest; }
            x += t.w;
          }
          x += spW; lineSp += spW; i = k; continue;
        }
      }
      x += wordW;
    }
    x += spW; lineSp += spW; i = k === i ? i + 1 : k;
  }

  // khoảng cách đoạn, độ cao dòng
  const natural = sz * TNR_LINE;
  const ln = pp.line ?? 240, rule = pp.lineRule ?? 'auto';
  const lineH = rule === 'exact' ? ln / 20 : rule === 'atLeast' ? Math.max(natural, ln / 20) : natural * (ln / 240);
  const before = (pp.before ?? 0) / 20, after = (pp.after ?? 0) / 20;
  return {
    idx, s: el.s, e: el.e, text, blank: !visible && !special, y0, before, lineH, lines, after,
    y1: y0 + before + lines * lineH + after,
  };
}

export interface CellGeo { paras: ParaGeo[]; height: number; ctx: TblCtx; widthTw: number; marL: number; marR: number; s: number; e: number }

function cellGeo(xml: string, tc: El, ctx: TblCtx, widthTw: number): CellGeo {
  const pr = xml.slice(tc.is, tc.ie).match(/^\s*<w:tcPr>([\s\S]*?)<\/w:tcPr>/)?.[1] ?? '';
  const mar = pr.match(/<w:tcMar>([\s\S]*?)<\/w:tcMar>/)?.[1] ?? '';
  const side = (n: string, d: number) => num(attr(mar.match(new RegExp(`<w:${n}\\b[^>]*>`))?.[0] ?? '', 'w')) ?? d;
  const marL = side('left', side('start', ctx.marL)), marR = side('right', side('end', ctx.marR));
  const paras: ParaGeo[] = [];
  let y = 0;
  for (const el of scan(xml, tc.is, tc.ie, ['p', 'tbl'])) {
    if (el.tag !== 'p') continue; // bảng lồng nhau: bỏ qua (không có trong mẫu của tổ)
    const g = paraGeo(xml, el, paras.length, ctx, widthTw, marL, marR, y);
    paras.push(g);
    y = g.y1;
  }
  return { paras, height: y, ctx, widthTw, marL, marR, s: tc.s, e: tc.e };
}

// ======================================================================================
// 4. Tìm các hàng có cặp ô cô/trẻ
// ======================================================================================
export interface AlignOpts { styles?: string }

interface PairRow { table: number; row: number; coCi: number; treCi: number; label: string; coEl: El; treEl: El; co: CellGeo; tre: CellGeo }

const cellPlain = (xml: string, el: El) => decode([...xml.slice(el.is, el.ie).matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join(' ')).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

function findPairRows(xml: string, opts: AlignOpts): PairRow[] {
  const db = parseStyles(opts.styles);
  const b0 = xml.indexOf('<w:body');
  const b1 = xml.lastIndexOf('</w:body>');
  if (b0 < 0 || b1 < 0) return [];
  const out: PairRow[] = [];
  const tbls = scan(xml, xml.indexOf('>', b0) + 1, b1, ['tbl']);
  tbls.forEach((tbl, ti) => {
    const tblPr = xml.slice(tbl.is, tbl.ie).match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/)?.[1] ?? '';
    const grid = [...(xml.slice(tbl.is, tbl.ie).match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/)?.[1] ?? '').matchAll(/<w:gridCol\b[^>]*>/g)].map(m => num(attr(m[0], 'w')) ?? 0);
    const cm = tblPr.match(/<w:tblCellMar>([\s\S]*?)<\/w:tblCellMar>/)?.[1] ?? '';
    const side = (n: string, d: number) => num(attr(cm.match(new RegExp(`<w:${n}\\b[^>]*>`))?.[0] ?? '', 'w')) ?? d;
    const tblStyleId = attr(tblPr.match(/<w:tblStyle\b[^>]*>/)?.[0] ?? '', 'val');
    const ctx: TblCtx = { db, tblStyle: styleChain(db, tblStyleId), marL: side('left', side('start', 108)), marR: side('right', side('end', 108)), marT: side('top', 0) };
    const rows = scan(xml, tbl.is, tbl.ie, ['tr']);
    let coCol = -1, treCol = -1;
    rows.forEach((tr, ri) => {
      const cells = scan(xml, tr.is, tr.ie, ['tc']);
      const starts: number[] = [];
      let g = 0;
      for (const tc of cells) {
        starts.push(g);
        g += num(attr(xml.slice(tc.is, tc.ie).match(/<w:gridSpan\b[^>]*>/)?.[0] ?? '', 'val')) ?? 1;
      }
      if (coCol < 0) {
        const ci = cells.findIndex(tc => /hoạt động của cô/.test(cellPlain(xml, tc)));
        const ti2 = cells.findIndex(tc => /hoạt động của trẻ/.test(cellPlain(xml, tc)));
        // hàng tiêu đề có thể gộp dọc: chỉ cần 2 tiêu đề cùng hàng
        if (ci >= 0 && ti2 >= 0) { coCol = starts[ci]; treCol = starts[ti2]; }
        return;
      }
      const ci = starts.indexOf(coCol), tj = starts.indexOf(treCol);
      if (ci < 0 || tj < 0) return;
      const wOf = (tc: El, col: number, span: number) => {
        const w = num(attr(xml.slice(tc.is, tc.ie).match(/<w:tcW\b[^>]*>/)?.[0] ?? '', 'w'));
        const ty = attr(xml.slice(tc.is, tc.ie).match(/<w:tcW\b[^>]*>/)?.[0] ?? '', 'type');
        if (w && (!ty || ty === 'dxa')) return w;
        let s = 0; for (let k = col; k < col + span; k++) s += grid[k] ?? 0;
        return s || 2000;
      };
      const spanOf = (tc: El) => num(attr(xml.slice(tc.is, tc.ie).match(/<w:gridSpan\b[^>]*>/)?.[0] ?? '', 'val')) ?? 1;
      const co = cells[ci], tre = cells[tj];
      if (/<w:vMerge\b(?![^>]*w:val="restart")/.test(xml.slice(co.is, Math.min(co.ie, co.is + 400))) ) return;
      const label = cells[0] ? cellPlain(xml, cells[0]).split(/\s{2,}| (?=ngày)/)[0].replace(/^(thứ \S+).*/, '$1') : '';
      out.push({
        table: ti, row: ri, coCi: ci, treCi: tj, label, coEl: co, treEl: tre,
        co: cellGeo(xml, co, ctx, wOf(co, coCol, spanOf(co))),
        tre: cellGeo(xml, tre, ctx, wOf(tre, treCol, spanOf(tre))),
      });
    });
  });
  return out;
}

/** hàng có cặp ô cô/trẻ + hình học từng đoạn (dùng cho suggest-tre và bộ kiểm) */
export const layoutRows = findPairRows;
export type { PairRow };

// ======================================================================================
// 5. Bản đồ căn hàng
// ======================================================================================
export interface AlignPair {
  table: number; row: number;
  treOrd: number;      // đoạn trẻ có chữ thứ mấy trong ô (từ 0)
  coPara: number;      // đoạn cô (chỉ số tuyệt đối trong ô, tính cả đoạn rỗng)
  coLine: number;      // dòng thứ mấy của đoạn cô (từ 0); có thể >= số dòng nếu trẻ nằm dưới hết chữ của cô
  beyond: boolean;     // true: nằm dưới đoạn cô cuối (coLine tính từ đầu đoạn đó)
  coLines: number;     // số dòng của đoạn cô lúc đo
  dy: number;          // lệch (điểm) giữa đỉnh dòng trẻ và dòng cô lúc đo
  treText: string; coText: string;
}
export interface AlignRowInfo { table: number; row: number; coParas: number; treText: number }
export interface AlignmentMap { pairs: AlignPair[]; rows: AlignRowInfo[] }

const tolOf = (p: ParaGeo) => Math.max(2, p.lineH * 0.5);

function pairsOfRow(r: PairRow): AlignPair[] {
  const out: AlignPair[] = [];
  const co = r.co.paras;
  if (!co.length) return out;
  let ord = 0;
  for (const tp of r.tre.paras) {
    if (tp.blank) continue;
    const T = firstTop(tp);
    let best: { k: number; i: number; d: number } | null = null;
    for (const cp of co) for (let i = 0; i < cp.lines; i++) {
      const d = Math.abs(lineTop(cp, i) - T);
      if (!best || d < best.d - 1e-6) best = { k: cp.idx, i, d };
    }
    const last = co[co.length - 1];
    const lastBottom = lastTextBottom(co);
    let pair: AlignPair;
    if (best && best.d <= tolOf(co[best.k]) + 1e-6) {
      pair = { table: r.table, row: r.row, treOrd: ord, coPara: best.k, coLine: best.i, beyond: false, coLines: co[best.k].lines, dy: T - lineTop(co[best.k], best.i), treText: tp.text, coText: co[best.k].text };
    } else if (T >= lastBottom - tolOf(last)) {
      const i = last.lines + Math.round((T - lastBottom) / last.lineH);
      pair = { table: r.table, row: r.row, treOrd: ord, coPara: last.idx, coLine: i, beyond: true, coLines: last.lines, dy: T - lineTop(last, i), treText: tp.text, coText: last.text };
    } else {
      pair = { table: r.table, row: r.row, treOrd: ord, coPara: best!.k, coLine: best!.i, beyond: false, coLines: co[best!.k].lines, dy: T - lineTop(co[best!.k], best!.i), treText: tp.text, coText: co[best!.k].text };
    }
    out.push(pair);
    ord++;
  }
  return out;
}
/** mép dưới của đoạn cô cuối cùng (không tính khoảng cách sau) */
const lastTextBottom = (co: ParaGeo[]) => { const l = co[co.length - 1]; return l.y0 + l.before + l.lines * l.lineH; };

export function alignmentMap(origXml: string, opts: AlignOpts = {}): AlignmentMap {
  const rows = findPairRows(origXml, opts);
  const map: AlignmentMap = { pairs: [], rows: [] };
  for (const r of rows) {
    map.pairs.push(...pairsOfRow(r));
    map.rows.push({ table: r.table, row: r.row, coParas: r.co.paras.length, treText: r.tre.paras.filter(p => !p.blank).length });
  }
  return map;
}

// ======================================================================================
// 6. Căn lại sau khi sửa
// ======================================================================================
export interface AlignChange {
  table: number; row: number; label: string;
  action: 'them' | 'bo';  // thêm / bỏ đoạn rỗng
  count: number;
  before: string;         // câu của trẻ ngay sau chỗ thay đổi (để cô nhận ra)
  note: string;
}
export interface RealignResult { xml: string; changes: AlignChange[]; unresolved: string[] }

const stripIds = (p: string) => p.replace(/\sw14:(paraId|textId)="[^"]*"/g, '');

/** đo 1 đoạn <w:p> (chuỗi XML) như thể nó nằm trong ô này */
export function measureInCell(cell: CellGeo, pXml: string): ParaGeo {
  const fake = `<w:body>${pXml}</w:body>`;
  const el = scan(fake, 0, fake.length, ['p'])[0];
  return paraGeo(fake, el, 0, cell.ctx, cell.widthTw, cell.marL, cell.marR, 0);
}

/** đoạn rỗng mẫu để nhân bản: ưu tiên đoạn rỗng sẵn có trong ô; không có thì dựng từ định dạng đoạn trẻ gần nhất */
export function blankTemplate(xml: string, cell: CellGeo, near: number): string {
  const blanks = cell.paras.filter(p => p.blank && !/<w:sectPr\b/.test(xml.slice(p.s, p.e)) && !/<w:br\b/.test(xml.slice(p.s, p.e)));
  if (blanks.length) {
    const b = blanks.reduce((a, c) => (Math.abs(c.idx - near) < Math.abs(a.idx - near) ? c : a));
    return stripIds(xml.slice(b.s, b.e));
  }
  const ref = cell.paras.find(p => !p.blank) ?? cell.paras[0];
  const pPr = ref ? (xml.slice(ref.s, ref.e).match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '') : '';
  return `<w:p>${pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '')}</w:p>`;
}

/** độ cao (điểm) của 1 đoạn rỗng mẫu khi đặt vào ô này */
export function blankHeight(_xml: string, cell: CellGeo, tplXml: string, _near: number): number {
  const g = measureInCell(cell, tplXml);
  return g.y1 - g.y0;
}

interface Op { pos: number; end: number; ins: string }

export interface RealignOptions extends AlignOpts { map?: AlignmentMap }

/**
 * Sau khi sửa (fixedXml), thêm/bớt đoạn rỗng ở cột trẻ để mỗi đoạn trẻ lại đứng ngang đoạn cô đã gắn lúc còn bản gốc.
 * Chỉ thêm/xóa đoạn rỗng (nhân bản định dạng đoạn rỗng sẵn có), không đổi chữ.
 * Hàng mà cột cô không đổi thì không đụng tới.
 */
export function realign(origXml: string, fixedXml: string, opts: RealignOptions = {}): RealignResult {
  const origRows = findPairRows(origXml, opts);
  const fixedRows = findPairRows(fixedXml, opts);
  const map = opts.map ?? alignmentMap(origXml, opts);
  const changes: AlignChange[] = [];
  const unresolved: string[] = [];
  const ops: Op[] = [];
  const key = (r: { table: number; row: number }) => `${r.table}:${r.row}`;
  const origBy = new Map(origRows.map(r => [key(r), r]));

  for (const fr of fixedRows) {
    const or = origBy.get(key(fr));
    if (!or) continue;
    const coSame = or.co.paras.length === fr.co.paras.length && or.co.paras.every((p, i) => p.text === fr.co.paras[i].text);
    if (coSame) continue;
    const pairs = map.pairs.filter(p => p.table === fr.table && p.row === fr.row);
    if (!pairs.length) continue;
    if (or.co.paras.length !== fr.co.paras.length) { unresolved.push(`${fr.label || 'hàng ' + fr.row}: số đoạn bên cô đổi, bỏ qua căn lại`); continue; }
    const treNE = fr.tre.paras.filter(p => !p.blank);
    if (treNE.length !== or.tre.paras.filter(p => !p.blank).length) { unresolved.push(`${fr.label || 'hàng ' + fr.row}: số câu bên trẻ đổi, bỏ qua căn lại`); continue; }
    const oldTre = or.tre.paras.filter(p => !p.blank);
    const tre = fr.tre;
    let cursor = 0;
    for (let j = 0; j < treNE.length; j++) {
      const pr = pairs.find(p => p.treOrd === j);
      const para = treNE[j];
      // đoạn rỗng hiện có nằm giữa câu j-1 và câu j
      const prevIdx = j ? treNE[j - 1].idx : -1;
      const gap = tre.paras.filter(p => p.blank && p.idx > prevIdx && p.idx < para.idx);
      if (!pr) { cursor += gap.reduce((s, g) => s + (g.y1 - g.y0), 0) + (para.y1 - para.y0); continue; }
      const oldCo = or.co.paras[pr.coPara], newCo = fr.co.paras[pr.coPara];
      const nl = pr.beyond ? Math.max(0, newCo.lines + (pr.coLine - oldCo.lines)) : Math.min(pr.coLine, newCo.lines - 1);
      const delta = lineTop(newCo, nl) - lineTop(oldCo, pr.coLine);
      const target = firstTop(oldTre[j]) + delta;          // chỗ đỉnh dòng đầu của câu trẻ phải đứng
      const needTop = target - para.before;                // mép trên của đoạn trẻ
      const tpl = blankTemplate(fixedXml, tre, para.idx);
      const th = blankHeight(fixedXml, tre, tpl, para.idx);
      // chọn số dòng rỗng k sao cho mép trên đoạn gần needTop nhất
      let k = 0, acc = 0;
      for (; k < 300; k++) {
        const h = gap[k] ? gap[k].y1 - gap[k].y0 : th;
        if (cursor + acc + h / 2 <= needTop) acc += h; else break;
      }
      if (k < gap.length) {
        const drop = gap.slice(k);
        for (const d of drop) ops.push({ pos: d.s, end: d.e, ins: '' });
        changes.push({ table: fr.table, row: fr.row, label: fr.label, action: 'bo', count: drop.length, before: para.text.trim(), note: `Bỏ ${drop.length} dòng trống trước câu của trẻ “${para.text.trim()}”` });
      } else if (k > gap.length) {
        const add = k - gap.length;
        ops.push({ pos: para.s, end: para.s, ins: tpl.repeat(add) });
        changes.push({ table: fr.table, row: fr.row, label: fr.label, action: 'them', count: add, before: para.text.trim(), note: `Thêm ${add} dòng trống trước câu của trẻ “${para.text.trim()}”` });
      }
      const kept = Math.min(k, gap.length);
      const keptH = gap.slice(0, kept).reduce((s, g) => s + (g.y1 - g.y0), 0) + Math.max(0, k - gap.length) * th;
      const top = cursor + keptH;
      if (top > needTop + th / 2 + 1e-6) unresolved.push(`${fr.label || 'hàng ' + fr.row}: câu trẻ “${para.text.trim().slice(0, 30)}” không lùi lên được vì câu trên của trẻ còn dài`);
      cursor = top + (para.y1 - para.y0);
    }
  }
  // áp từ cuối lên đầu để vị trí không lệch
  ops.sort((a, b) => b.pos - a.pos || b.end - a.end);
  let xml = fixedXml;
  for (const op of ops) xml = xml.slice(0, op.pos) + op.ins + xml.slice(op.end);
  return { xml, changes, unresolved };
}

// ======================================================================================
// 7. Kiểm tra cặp đang lệch
// ======================================================================================
export interface AlignGap { table: number; row: number; label: string; treText: string; coText: string; lines: number }

/** các cặp (theo bản đồ của bản gốc) hiện đang lệch từ 1 dòng trở lên */
export function alignGaps(xml: string, map: AlignmentMap, opts: AlignOpts = {}): AlignGap[] {
  const rows = findPairRows(xml, opts);
  const out: AlignGap[] = [];
  for (const r of rows) {
    const pairs = map.pairs.filter(p => p.table === r.table && p.row === r.row);
    if (!pairs.length) continue;
    const info = map.rows.find(x => x.table === r.table && x.row === r.row);
    const treNE = r.tre.paras.filter(p => !p.blank);
    if (!info || info.coParas !== r.co.paras.length || info.treText !== treNE.length) continue;
    for (const pr of pairs) {
      const cp = r.co.paras[pr.coPara];
      const nl = pr.beyond ? Math.max(0, cp.lines + (pr.coLine - pr.coLines)) : Math.min(pr.coLine, cp.lines - 1);
      const d = firstTop(treNE[pr.treOrd]) - lineTop(cp, nl) - pr.dy; // so với chỗ cô đã căn ở bản gốc
      const lines = Math.round(d / cp.lineH);
      if (Math.abs(d) > cp.lineH * 0.5) out.push({ table: r.table, row: r.row, label: r.label, treText: treNE[pr.treOrd].text.trim(), coText: cp.text.trim(), lines });
    }
  }
  return out;
}

const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Báo các cặp cô ↔ trẻ đang lệch (Issue mức "xem").
 *  - Có bản đồ của bản gốc (map): so đúng từng cặp, báo lệch bao nhiêu dòng.
 *  - Không có bản đồ: chỉ báo trường hợp chắc chắn — câu trẻ đứng ngang câu cô mà hai bên không khớp
 *    (vd cô cho nghe hát, trẻ ghi “Trẻ hát”), vì chưa có bản gốc để biết cô định căn ở đâu.
 */
export function checkAlign(xml: string, map?: AlignmentMap, opts: AlignOpts = {}): Issue[] {
  const issues: Issue[] = [];
  if (map) {
    for (const g of alignGaps(xml, map, opts)) {
      issues.push({
        rule: 'can-hang.lech', level: 'xem', source: 'luat',
        where: `${g.label ? g.label + ' – ' : ''}Hoạt động của trẻ`,
        message: `Câu của trẻ đang ${g.lines > 0 ? 'thấp hơn' : 'cao hơn'} câu của cô ${Math.abs(g.lines)} dòng so với bản gốc`,
        found: `Trẻ: ${clip(g.treText)} — Cô: ${clip(g.coText)}`,
        fix: g.lines > 0 ? `Bỏ ${g.lines} dòng trống bên cột trẻ` : `Thêm ${-g.lines} dòng trống bên cột trẻ`,
      });
    }
    return issues;
  }
  for (const r of findPairRows(xml, opts)) {
    for (const pr of pairsOfRow(r)) {
      const why = mismatchReason(pr.coText, pr.treText);
      if (why) issues.push({ rule: 'can-hang.khong-khop', level: 'xem', source: 'luat', where: `${r.label ? r.label + ' – ' : ''}Hoạt động của trẻ`, message: why, found: `Cô: ${clip(pr.coText.trim())} — Trẻ: ${clip(pr.treText.trim())}` });
    }
  }
  return issues;
}

// ======================================================================================
// 8. Dùng với file .docx (JSZip)
// ======================================================================================
export async function readXml(data: ArrayBuffer | Uint8Array | JSZip): Promise<{ zip: JSZip; document: string; styles?: string }> {
  const zip = data instanceof JSZip ? data : await JSZip.loadAsync(data);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('Không phải file Word (.docx)');
  return { zip, document: await f.async('string'), styles: await zip.file('word/styles.xml')?.async('string') };
}

/** căn lại file đã sửa theo file gốc; trả file .docx mới */
export async function realignDocx(orig: ArrayBuffer | Uint8Array, fixed: ArrayBuffer | Uint8Array): Promise<RealignResult & { data: Uint8Array }> {
  const [o, f] = [await readXml(orig), await readXml(fixed)];
  const r = realign(o.document, f.document, { styles: f.styles ?? o.styles });
  f.zip.file('word/document.xml', r.xml);
  const data = await f.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { ...r, data };
}
