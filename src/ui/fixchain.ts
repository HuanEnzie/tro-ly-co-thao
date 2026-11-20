/**
 * Chuỗi “Tạo bản sửa”: sửa chắc chắn (fixDocx) → căn lại hàng cô–trẻ (realign, theo bản gốc) → điền câu trẻ đã tích (applySuggestions).
 * Căn trước, điền sau: câu điền vào đúng đoạn rỗng ngang hàng với câu cô trên bố cục đã căn.
 * Không phụ thuộc React để chạy được cả trong scripts/verify.
 */
import { AlignOpts, checkAlign, readXml, realign } from '../engine/align';
import { Change, fixDocx, FixOptions } from '../engine/fixer';
import { applySuggestions, Chosen, Slot, suggestTre } from '../engine/suggest-tre';
import { Issue } from '../engine/types';

export interface ChainOptions extends FixOptions {
  /** căn lại cột trẻ theo bản gốc sau khi sửa */
  align?: boolean;
  /** các chỗ trẻ cô đã tích để điền (id, text tuỳ chọn) */
  fill?: Chosen[];
}
export interface ChainResult {
  data: Uint8Array;
  changes: Change[];
  align?: { changed: number; unresolved: string[] };
  fill?: { applied: string[]; skipped: { id: string; reason: string }[] };
}

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function runFixChain(orig: ArrayBuffer | Uint8Array, opt: ChainOptions = {}): Promise<ChainResult> {
  const { align, fill, ...fixOpt } = opt;
  const fixed = await fixDocx(orig, fixOpt);
  let data = fixed.data;
  const out: ChainResult = { data, changes: fixed.changes };
  if (!align && !(fill && fill.length)) return out;

  const o = await readXml(orig), f = await readXml(data);
  const styles = f.styles ?? o.styles;
  let xml = f.document;
  if (align) {
    const r = realign(o.document, xml, { styles });
    xml = r.xml;
    out.align = { changed: r.changes.reduce((n, c) => n + c.count, 0), unresolved: r.unresolved };
  }
  if (fill && fill.length) {
    const r = applySuggestions(xml, fill, { styles });
    xml = r.xml;
    out.fill = { applied: r.applied, skipped: r.skipped };
  }
  f.zip.file('word/document.xml', xml);
  data = await f.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: MIME });
  return { ...out, data };
}

/** những chỗ trẻ còn trống có câu đề xuất (suggestion khác null) */
export async function listFillSlots(data: ArrayBuffer | Uint8Array): Promise<Slot[]> {
  const { document, styles } = await readXml(data);
  return suggestTre(document, { styles }).slots.filter(s => s.suggestion);
}

/** lỗi mức “xem” về căn hàng/khớp cô–trẻ, thêm vào kết quả soát KH ngày */
export async function alignIssues(data: ArrayBuffer | Uint8Array): Promise<Issue[]> {
  const { document, styles } = await readXml(data);
  const opts: AlignOpts = { styles };
  const seen = new Set<string>();
  return [...suggestTre(document, opts).mismatches, ...checkAlign(document, undefined, opts)].filter(i => {
    const k = `${i.rule}|${i.where}|${i.found}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}
