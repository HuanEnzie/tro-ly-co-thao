/**
 * Gợi ý câu cho cột “Hoạt động của trẻ” ở những chỗ ngang câu của cô mà ô trẻ đang trống,
 * và báo chỗ cột trẻ ghi không khớp cột cô. Chỉ ĐỀ XUẤT: cô tích mới điền (applySuggestions), không sửa chữ cô đã viết.
 * Luật chữ nằm ở tre-rules.ts; file này gắn luật vào vị trí trong XML (dùng bộ đo dòng của align.ts).
 */
import { AlignOpts, CellGeo, PairRow, ParaGeo, blankTemplate, checkAlign, encode, firstTop, layoutRows, measureInCell } from './align';
import { TreKind, TRE_SUGGEST, classifyCo } from './tre-rules';
import { Issue } from './types';

export interface Slot {
  id: string;                 // "bảng:hàng:đoạn cô" — dùng để chọn trong applySuggestions
  table: number; row: number; label: string;
  coPara: number; coText: string;
  kind: TreKind | null;       // luật nhận ra loại việc nào (null = không chắc, để AI)
  suggestion: string | null;  // câu đề xuất, vd "- Trẻ trả lời"
  target: { type: 'blank'; para: number } | { type: 'pad'; blanks: number } | null; // chỗ điền: đoạn rỗng ngang hàng / thêm dòng trống cuối ô
}

const isCandidate = (text: string) => /^\s*[-+–]\s*\S/.test(text);
const COMPLETE = (t: string) => t.replace(/\s+/g, ' ').trim();

/** cô đoạn c đã có chữ của trẻ nằm trong khoảng dòng của nó chưa */
function covered(c: ParaGeo, tre: CellGeo): boolean {
  const cs = firstTop(c), ce = cs + c.lines * c.lineH;
  return tre.paras.some(t => {
    if (t.blank) return false;
    const ts = firstTop(t), te = ts + t.lines * t.lineH;
    return Math.min(te, ce) - Math.max(ts, cs) > 0.5 * Math.min(c.lineH, t.lineH);
  });
}

function slotsOfRow(r: PairRow): Slot[] {
  const out: Slot[] = [];
  for (const c of r.co.paras) {
    if (c.blank) continue;
    const text = COMPLETE(c.text);
    const kind = classifyCo(text);
    if (!kind && !isCandidate(text)) continue;       // tiêu đề, "* TCVĐ:", "a. Khởi động"… không cần câu trẻ
    if (covered(c, r.tre)) continue;
    const cs = firstTop(c), tol = 0.5 * c.lineH;
    // đoạn rỗng của trẻ đỉnh dòng đầu trùng đỉnh dòng đầu của cô
    let blank: ParaGeo | null = null;
    for (const t of r.tre.paras) if (t.blank && Math.abs(firstTop(t) - cs) <= tol && (!blank || Math.abs(firstTop(t) - cs) < Math.abs(firstTop(blank) - cs))) blank = t;
    let target: Slot['target'] = null;
    if (blank) target = { type: 'blank', para: blank.idx };
    else if (r.tre.height <= cs + tol) target = { type: 'pad', blanks: -1 };
    out.push({
      id: `${r.table}:${r.row}:${c.idx}`, table: r.table, row: r.row, label: r.label, coPara: c.idx, coText: text,
      kind, suggestion: kind ? TRE_SUGGEST[kind] : null, target,
    });
  }
  return out;
}

export interface TreSuggestions { slots: Slot[]; mismatches: Issue[] }

/** các chỗ trẻ còn trống + câu đề xuất, và các chỗ cột trẻ không khớp cột cô (Issue mức "xem") */
export function suggestTre(xml: string, opts: AlignOpts = {}): TreSuggestions {
  const slots = layoutRows(xml, opts).flatMap(slotsOfRow);
  return { slots, mismatches: checkAlign(xml, undefined, opts).filter(i => i.rule === 'can-hang.khong-khop') };
}

export interface Chosen { id: string; text?: string }
export interface ApplyResult { xml: string; applied: string[]; skipped: { id: string; reason: string }[] }

/** rPr dùng cho chữ mới: lấy của câu trẻ gần nhất trong ô, không có thì lấy rPr dấu đoạn */
function runProps(xml: string, tre: CellGeo, near: number): string {
  const cands = tre.paras.filter(p => !p.blank).sort((a, b) => Math.abs(a.idx - near) - Math.abs(b.idx - near));
  for (const p of cands) {
    const rpr = xml.slice(p.s, p.e).match(/<w:r\b[^>]*>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1];
    if (rpr) return rpr;
  }
  const own = tre.paras.find(p => p.idx === near);
  const mark = own ? xml.slice(own.s, own.e).match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/)?.[1] : undefined;
  return mark ? mark.replace(/<w:(ins|del|moveFrom|moveTo)\b[^>]*\/>/g, '') : '';
}

/** điền chữ vào 1 đoạn rỗng (không đụng định dạng đoạn; bỏ run chỉ có dấu cách nếu có) */
function fillPara(pXml: string, text: string, rPr: string): string {
  let p = pXml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t(?:\s[^>]*)?>\s*<\/w:t>\s*<\/w:r>/g, '');
  if (p.endsWith('/>') && !p.includes('</w:p>')) p = p.slice(0, -2) + '></w:p>';
  const run = `<w:r>${rPr}<w:t xml:space="preserve">${encode(text)}</w:t></w:r>`;
  const i = p.lastIndexOf('</w:p>');
  return p.slice(0, i) + run + p.slice(i);
}

/**
 * Chèn câu đã chọn vào đúng đoạn rỗng ngang hàng với câu của cô. Không bao giờ ghi đè chữ có sẵn.
 * Nếu chỗ cần điền nằm dưới hết cột trẻ thì thêm dòng trống ở cuối ô cho vừa vị trí.
 * Nếu câu mới xuống 2 dòng thì bớt dòng trống kế sau để các câu dưới vẫn thẳng hàng.
 */
export function applySuggestions(xml: string, chosen: Chosen[], opts: AlignOpts = {}): ApplyResult {
  const rows = layoutRows(xml, opts);
  const byId = new Map<string, { slot: Slot; row: PairRow }>();
  for (const r of rows) for (const s of slotsOfRow(r)) byId.set(s.id, { slot: s, row: r });
  const skipped: ApplyResult['skipped'] = [];
  const applied: string[] = [];
  const ops: { pos: number; end: number; ins: string }[] = [];
  const used = new Set<string>();                 // đoạn trẻ đã dùng (tránh dùng 2 lần)
  const padByRow = new Map<string, { row: PairRow; items: { slot: Slot; text: string }[] }>();

  for (const ch of chosen) {
    const hit = byId.get(ch.id);
    if (!hit) { skipped.push({ id: ch.id, reason: 'không còn chỗ trống này (đã có chữ hoặc file đã đổi)' }); continue; }
    const { slot, row } = hit;
    const text = (ch.text ?? slot.suggestion ?? '').trim();
    if (!text) { skipped.push({ id: ch.id, reason: 'chưa có câu để điền' }); continue; }
    if (!slot.target) { skipped.push({ id: ch.id, reason: 'không có đoạn rỗng ngang hàng để điền' }); continue; }
    if (slot.target.type === 'pad') {
      const k = `${row.table}:${row.row}`;
      if (!padByRow.has(k)) padByRow.set(k, { row, items: [] });
      padByRow.get(k)!.items.push({ slot, text });
      continue;
    }
    const tgt = row.tre.paras[slot.target.para];
    const key = `${row.table}:${row.row}:${tgt.idx}`;
    if (used.has(key)) { skipped.push({ id: ch.id, reason: 'đoạn rỗng này đã dùng cho câu khác' }); continue; }
    used.add(key);
    const filled = fillPara(xml.slice(tgt.s, tgt.e), text, runProps(xml, row.tre, tgt.idx));
    const g = measureInCell(row.tre, filled);
    const extra = g.lines - 1;
    const after = row.tre.paras.slice(tgt.idx + 1, tgt.idx + 1 + extra);
    if (extra > 0 && (after.length < extra || after.some(p => !p.blank || used.has(`${row.table}:${row.row}:${p.idx}`)))) {
      skipped.push({ id: ch.id, reason: `câu “${text}” xuống ${g.lines} dòng nhưng không đủ dòng trống bên dưới` });
      used.delete(key);
      continue;
    }
    for (const p of after) { used.add(`${row.table}:${row.row}:${p.idx}`); ops.push({ pos: p.s, end: p.e, ins: '' }); }
    ops.push({ pos: tgt.s, end: tgt.e, ins: filled });
    applied.push(ch.id);
  }

  // chỗ nằm dưới hết cột trẻ: thêm dòng trống + câu mới ở cuối ô
  for (const { row, items } of padByRow.values()) {
    const last = row.tre.paras[row.tre.paras.length - 1];
    if (!last) { for (const it of items) skipped.push({ id: it.slot.id, reason: 'ô trẻ không có đoạn nào' }); continue; }
    const tpl = blankTemplate(xml, row.tre, last.idx);
    const h = Math.max(1, measureInCell(row.tre, tpl).y1);
    const rPr = runProps(xml, row.tre, last.idx);
    let cursor = row.tre.height, ins = '';
    for (const it of items.sort((a, b) => a.slot.coPara - b.slot.coPara)) {
      const co = row.co.paras[it.slot.coPara];
      const filled = fillPara(tpl, it.text, rPr);
      const g = measureInCell(row.tre, filled);
      const n = Math.max(0, Math.round((firstTop(co) - g.before - cursor) / h));
      ins += tpl.repeat(n) + filled;
      cursor += n * h + (g.y1 - g.y0);
      applied.push(it.slot.id);
    }
    ops.push({ pos: last.e, end: last.e, ins });
  }

  ops.sort((a, b) => b.pos - a.pos || b.end - a.end);
  let out = xml;
  for (const op of ops) out = out.slice(0, op.pos) + op.ins + out.slice(op.end);
  return { xml: out, applied, skipped };
}
