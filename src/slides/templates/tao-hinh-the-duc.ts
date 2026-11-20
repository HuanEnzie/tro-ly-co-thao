/** Mẫu tạo hình (≥3 tranh mẫu + các bước) và thể dục (sơ đồ đội hình + các phần). */
import type { DoiHinh, TaoHinh, TheDuc } from '../types';
import { autoSize, C, columns, Ctx, FONT, PAL } from './common';

export function taoHinh(c: Ctx, d: TaoHinh): void {
  if (d.tranhMau.length < 3) throw new Error('tao-hinh: cần ít nhất 3 tranh mẫu');
  c.bg();
  c.ribbon(d.de, { size: 30 });
  const n = Math.min(4, d.tranhMau.length);
  const hasSteps = d.cacBuoc.length > 0;
  const top = 1.55, ph = hasSteps ? 3.15 : 5.2;
  columns(n, 0.7, 12.63, 0.3).forEach((col, i) => {
    c.box(`khung${i}`, '', { x: col.x, y: top, w: col.w, h: ph, fill: C.white, line: PAL[i % PAL.length], lw: 5, shadow: true });
    c.pic(`mau${i}`, d.tranhMau[i], col.x + 0.1, top + 0.1, col.w - 0.2, ph - 0.55);
    c.box(`tenmau${i}`, `Tranh mẫu ${i + 1}`, { x: col.x + 0.1, y: top + ph - 0.45, w: col.w - 0.2, h: 0.38, size: 15, color: C.brown, bold: true });
    c.add({ n: `khung${i}`, e: 'zoom', d: 1000 + i * 350, t: 500 }, { n: `mau${i}`, e: 'pop', d: 1100 + i * 350, t: 600 }, { n: `tenmau${i}`, e: 'fade', d: 1300 + i * 350, t: 400 });
  });
  const m = Math.min(5, d.cacBuoc.length);
  if (m) {
    const sy = top + ph + 0.25, sh = 7.3 - sy;
    columns(m, 0.7, 12.63, 0.2).forEach((col, i) => {
      const b = d.cacBuoc[i];
      c.box(`buoc${i}`, '', { x: col.x, y: sy, w: col.w, h: sh, fill: C.white, line: C.gold, lw: 4, shadow: true });
      c.box(`stt${i}`, [{ text: String(i + 1), options: { fontFace: FONT, fontSize: 18, color: C.white } }], { x: col.x - 0.1, y: sy - 0.15, w: 0.5, h: 0.5, shape: 'oval', fill: PAL[i % PAL.length], line: C.white, lw: 2, font: FONT });
      const hasPic = !!b.hinh;
      if (hasPic) c.pic(`hbuoc${i}`, b.hinh, col.x + 0.1, sy + 0.3, col.w - 0.2, sh * 0.45);
      c.box(`cbuoc${i}`, b.chu, { x: col.x + 0.08, y: hasPic ? sy + 0.3 + sh * 0.45 : sy + 0.3, w: col.w - 0.16, h: hasPic ? sh * 0.5 - 0.3 : sh - 0.4, size: autoSize(b.chu, col.w - 0.3, hasPic ? sh * 0.45 : sh - 0.5, 20, 11), color: C.ink, margin: 0.03 });
      c.add({ n: `buoc${i}`, e: 'flyB', t: 500, c: true }, { n: `stt${i}`, e: 'pop', t: 400 }, ...(hasPic ? [{ n: `hbuoc${i}`, e: 'pop' as const, t: 500 }] : []), { n: `cbuoc${i}`, e: 'fade', t: 500, d: 200 });
    });
  }
  c.addMusic();
}

/** toạ độ (0–1) các bạn trong sơ đồ đội hình */
function formation(kind: DoiHinh, n: number): [number, number][] {
  const pts: [number, number][] = [];
  const row = (k: number, y: number, x0 = 0.08, x1 = 0.92) => { for (let i = 0; i < k; i++) pts.push([k === 1 ? 0.5 : x0 + ((x1 - x0) * i) / (k - 1), y]); };
  if (kind === 'hang-ngang') row(n, 0.6);
  else if (kind === 'hang-doc') for (let i = 0; i < n; i++) pts.push([0.5, 0.12 + (0.8 * i) / Math.max(1, n - 1)]);
  else if (kind === 'hai-hang') { const a = Math.ceil(n / 2); row(a, 0.35); row(n - a, 0.8); }
  else if (kind === 'vong-tron') for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n - Math.PI / 2; pts.push([0.5 + 0.38 * Math.cos(t), 0.5 + 0.38 * Math.sin(t)]); }
  else { const cols = Math.ceil(Math.sqrt(n * 1.6)); for (let i = 0; i < n; i++) pts.push([0.12 + (0.76 * (i % cols)) / Math.max(1, cols - 1), 0.2 + (0.6 * Math.floor(i / cols)) / Math.max(1, Math.ceil(n / cols) - 1)]); }
  return pts;
}

export function theDuc(c: Ctx, d: TheDuc): void {
  c.bg();
  c.ribbon(d.tenBai, { size: 32 });
  const n = Math.max(4, Math.min(24, d.soTre ?? 12));
  const bx = 0.5, by = 1.7, bw = 6.3, bh = 5.3;
  c.box('san', 'ĐỘI HÌNH', { x: bx, y: by, w: bw, h: bh, fill: C.mint, line: C.green, lw: 4, size: 14, color: C.dkgreen, valign: 'top', bold: true, transparency: 10 });
  c.add({ n: 'san', e: 'zoom', d: 900, t: 500 });
  const ps = formation(d.doiHinh, n);
  const ds = 0.42;
  ps.forEach(([px, py], i) => {
    c.box(`be${i}`, '', { x: bx + 0.35 + px * (bw - 0.7) - ds / 2, y: by + 0.5 + py * (bh - 1.0) - ds / 2, w: ds, h: ds, shape: 'oval', fill: PAL[i % PAL.length], line: C.white, lw: 2 });
    c.add({ n: `be${i}`, e: 'pop', d: 1300 + i * 70, t: 350 });
  });
  const cx = d.doiHinh === 'vong-tron' ? bx + bw / 2 - 0.3 : bx + bw / 2 - 0.3;
  const cy = d.doiHinh === 'hang-doc' ? by + bh * 0.5 : d.doiHinh === 'vong-tron' ? by + bh / 2 - 0.3 : by + bh - 0.75;
  c.box('co', '', { x: d.doiHinh === 'hang-doc' ? bx + bw - 1.0 : cx, y: cy, w: 0.6, h: 0.6, shape: 'star', fill: C.yellow, line: C.gold, lw: 2 });
  c.box('co-nhan', 'Cô', { x: d.doiHinh === 'hang-doc' ? bx + bw - 1.2 : cx - 0.2, y: cy + 0.6, w: 1.0, h: 0.35, size: 15, color: C.brown, bold: true });
  c.add({ n: 'co', e: 'spin', d: 1300 + n * 70, t: 500 }, { n: 'co-nhan', e: 'fade', d: 1500 + n * 70, t: 400 });
  const m = Math.max(1, Math.min(4, d.cacPhan.length)), rh = Math.min(1.25, 5.3 / m - 0.15);
  for (let i = 0; i < m; i++) {
    const y = by + i * (rh + 0.15), p = d.cacPhan[i];
    c.box(`phan${i}`, '', { x: 7.1, y, w: 5.75, h: rh, fill: C.white, line: PAL[i % PAL.length], lw: 4, shadow: true });
    c.box(`ten${i}`, [{ text: p.phan, options: { fontFace: FONT, fontSize: 15, color: C.white } }], { x: 7.2, y: y + 0.1, w: 1.6, h: rh - 0.2, fill: PAL[i % PAL.length], shape: 'pill', font: FONT });
    c.box(`nd${i}`, p.noiDung, { x: 8.9, y: y + 0.05, w: 3.85, h: rh - 0.1, size: autoSize(p.noiDung, 3.6, rh - 0.15, 20, 11), align: 'left', margin: 0.05 });
    c.add({ n: `phan${i}`, e: 'flyR', t: 600, c: true }, { n: `ten${i}`, e: 'pop', t: 400 }, { n: `nd${i}`, e: 'fade', t: 500, d: 200 });
  }
  c.addMusic();
}
