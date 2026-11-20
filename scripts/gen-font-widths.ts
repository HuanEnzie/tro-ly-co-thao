/**
 * Sinh src/engine/fonts/times-widths.ts: độ rộng ký tự Times New Roman (thường/đậm/nghiêng/đậm nghiêng)
 * đọc thẳng từ file font trên máy (C:/Windows/Fonts). Chạy 1 lần: npx tsx scripts/gen-font-widths.ts
 * (Chỉ cần chạy lại khi muốn đổi tập ký tự.)
 */
import { readFileSync, writeFileSync } from 'node:fs';

function parse(buf: Buffer) {
  const tables: Record<string, number> = {};
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) tables[buf.toString('ascii', 12 + i * 16, 16 + i * 16)] = buf.readUInt32BE(20 + i * 16);
  const upm = buf.readUInt16BE(tables.head + 18);
  const nHM = buf.readUInt16BE(tables.hhea + 34);
  const adv = (g: number) => buf.readUInt16BE(tables.hmtx + Math.min(g, nHM - 1) * 4);
  // cmap: tìm bảng Unicode định dạng 4 (BMP) hoặc 12
  const cm = tables.cmap, nt = buf.readUInt16BE(cm + 2);
  let off = -1;
  for (let i = 0; i < nt; i++) {
    const pid = buf.readUInt16BE(cm + 4 + i * 8), eid = buf.readUInt16BE(cm + 6 + i * 8), o = cm + buf.readUInt32BE(cm + 8 + i * 8);
    if (pid === 3 && eid === 1) off = o;
  }
  if (off < 0) throw new Error('không có cmap 3,1');
  const segX2 = buf.readUInt16BE(off + 6), seg = segX2 / 2;
  const endO = off + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
  const glyph = (c: number): number => {
    for (let i = 0; i < seg; i++) {
      if (c > buf.readUInt16BE(endO + i * 2)) continue;
      const st = buf.readUInt16BE(startO + i * 2);
      if (c < st) return 0;
      const ro = buf.readUInt16BE(rangeO + i * 2), d = buf.readInt16BE(deltaO + i * 2);
      if (ro === 0) return (c + d) & 0xffff;
      const g = buf.readUInt16BE(rangeO + i * 2 + ro + (c - st) * 2);
      return g ? (g + d) & 0xffff : 0;
    }
    return 0;
  };
  return { upm, width: (c: number) => { const g = glyph(c); return g ? Math.round(adv(g) * 1000 / upm) : -1; } };
}

const files = { r: 'times.ttf', b: 'timesbd.ttf', i: 'timesi.ttf', bi: 'timesbi.ttf' } as const;
const ranges: [number, number][] = [[0x20, 0x7e], [0xa0, 0x17f], [0x1a0, 0x1b0], [0x1ea0, 0x1ef9], [0x2010, 0x2026], [0x2030, 0x203a], [0x20ab, 0x20ab], [0x2190, 0x2193], [0x2022, 0x2022]];
let out = `// Sinh tự động bởi scripts/gen-font-widths.ts từ Times New Roman (đơn vị: 1/1000 em). Đừng sửa tay.\n`;
out += `// Định dạng: mỗi kiểu chữ là chuỗi "mãKýTự:độRộng,..." (mã thập lục phân).\n`;
for (const [k, f] of Object.entries(files)) {
  const font = parse(readFileSync('C:/Windows/Fonts/' + f));
  const parts: string[] = [];
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) { const w = font.width(c); if (w >= 0) parts.push(`${c.toString(16)}:${w}`); }
  out += `export const TIMES_${k.toUpperCase()} = '${parts.join(',')}';\n`;
  console.log(k, parts.length, 'ký tự; A=', font.width(65), 'a=', font.width(97), 'ế=', font.width(0x1ebf), 'space=', font.width(32));
}
writeFileSync('src/engine/fonts/times-widths.ts', out);
