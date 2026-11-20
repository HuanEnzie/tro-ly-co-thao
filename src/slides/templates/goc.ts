/** Mẫu hoạt động góc: 5 góc dạng dải ngang có chip, và quá trình chơi (1 hình động + nhạc dài). */
import type { Goc, QuaTrinhChoi } from '../types';
import { autoSize, C, Ctx, FONT } from './common';

const BAND = [C.red, C.orange, C.green, C.purple, C.teal];

export function goc(c: Ctx, d: Goc): void {
  c.bg();
  c.ribbon(d.tieuDe ?? 'HOẠT ĐỘNG GÓC', { size: 38 });
  const n = Math.min(5, d.goc.length);
  const y0 = 1.6, gap = 0.1, bh = (7.2 - y0 - gap * (n - 1)) / n;
  d.goc.slice(0, n).forEach((g, i) => {
    const y = y0 + i * (bh + gap), col = BAND[i % BAND.length];
    c.box(`dai${i}`, '', { x: 0.45, y, w: 12.43, h: bh, fill: C.white, line: col, lw: 4, shadow: true, shape: 'pill', transparency: 4 });
    c.box(`ten${i}`, [{ text: g.ten, options: { fontFace: FONT, fontSize: autoSize(g.ten, 2.9, bh - 0.2, 22, 12, true), color: C.white } }], { x: 0.55, y: y + 0.07, w: 3.2, h: bh - 0.14, fill: col, line: C.white, lw: 3, shape: 'pill', font: FONT });
    const hasIcon = !!g.hinh;
    if (hasIcon) c.pic(`bieutuong${i}`, g.hinh, 3.85, y + 0.06, bh, bh - 0.12);
    const cx0 = hasIcon ? 3.85 + bh + 0.1 : 3.95, cx1 = 12.7;
    const k = Math.max(1, Math.min(5, g.hoatDong.length)), cg = 0.12, cw = (cx1 - cx0 - cg * (k - 1)) / k;
    g.hoatDong.slice(0, k).forEach((h, j) => {
      c.box(`chip${i}_${j}`, h, { x: cx0 + j * (cw + cg), y: y + 0.13, w: cw, h: bh - 0.26, fill: 'FFF3E0', line: col, lw: 2, shape: 'pill', size: autoSize(h, cw - 0.2, bh - 0.3, 20, 10), color: C.ink, bold: true, margin: 0.08 });
    });
    c.add({ n: `dai${i}`, e: 'flyR', t: 650, c: true }, { n: `ten${i}`, e: 'pop', t: 500, d: 200 });
    if (hasIcon) c.add({ n: `bieutuong${i}`, e: 'pop', t: 500, d: 250 });
    g.hoatDong.slice(0, k).forEach((_, j) => c.add({ n: `chip${i}_${j}`, e: 'pop', t: 400, d: 350 + j * 120 }));
  });
  c.addMusic();
}

export function quaTrinhChoi(c: Ctx, d: QuaTrinhChoi): void {
  c.bg();
  c.ribbon(d.tieuDe ?? 'QUÁ TRÌNH CHƠI', { size: 36 });
  c.box('khung', '', { x: 1.5, y: 1.6, w: 10.33, h: 5.6, fill: C.white, line: C.gold, lw: 6, shadow: true });
  c.add({ n: 'khung', e: 'zoom', d: 800, t: 600 });
  c.pic('hinh', d.hinh, 1.7, 1.75, 9.93, 5.3);
  c.add({ n: 'hinh', e: 'fade', d: 1300, t: 700 });
  c.pic('trangtri', d.assets?.trangTri, 0.2, 5.0, 1.3, 2.2, 'bottom');
  c.add({ n: 'trangtri', e: 'flyL', d: 1500, t: 800, l: 'bob' });
  c.addMusic();
}
