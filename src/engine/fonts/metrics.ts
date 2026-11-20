/**
 * Đo độ rộng chữ theo Times New Roman (bảng nhúng sẵn, không phụ thuộc phông của máy đang chạy).
 * Đơn vị trả về: em (1 = đúng cỡ chữ). Chữ Việt có dấu: tra bảng, thiếu thì lấy chữ gốc (NFD).
 */
import { TIMES_B, TIMES_BI, TIMES_I, TIMES_R } from './times-widths';

type Tbl = Map<number, number>;
const parse = (s: string): Tbl => {
  const m: Tbl = new Map();
  for (const part of s.split(',')) {
    const i = part.indexOf(':');
    m.set(parseInt(part.slice(0, i), 16), +part.slice(i + 1));
  }
  return m;
};
let cache: Tbl[] | null = null;
const tables = (): Tbl[] => (cache ??= [parse(TIMES_R), parse(TIMES_B), parse(TIMES_I), parse(TIMES_BI)]);

/** độ rộng 1 ký tự (em) */
export function charEm(ch: string, bold = false, italic = false): number {
  const t = tables()[(bold ? 1 : 0) + (italic ? 2 : 0)];
  const c = ch.codePointAt(0)!;
  if (c === 0xa0 || c === 0x202f) return (t.get(0x20) ?? 250) / 1000;
  let w = t.get(c);
  if (w === undefined) {
    const base = ch.normalize('NFD')[0];
    w = base && base !== ch ? t.get(base.codePointAt(0)!) : undefined;
  }
  if (w === undefined) w = c >= 0x2e80 ? 1000 : 500; // chữ Á, biểu tượng… (hiếm trong giáo án)
  return w / 1000;
}
