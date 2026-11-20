/** Mẫu LQVT (đếm và nối số lượng) và LQCC (tìm chữ trong từ). */
import type { DemNoiSoLuong, TimChu } from '../types';
import { ANSWER, autoSize, baseLetter, C, Ctx, FONT, PAL, permutation } from './common';

export function demNoiSoLuong(c: Ctx, d: DemNoiSoLuong): void {
  c.bg();
  c.ribbon(d.tieuDe ?? 'ĐẾM VÀ NỐI SỐ LƯỢNG', { size: 32 });
  const n = Math.max(2, Math.min(4, d.nhom.length));
  const perm = permutation(n, d.thuTuSo);
  const gap = 0.18, y0 = 1.65, rh = Math.min(1.4, (7.1 - y0 - gap * (n - 1)) / n);
  const lx = 0.9, lw = 6.6, bx = 10.6, bd = Math.min(1.0, rh - 0.1);
  const yOf = (pos: number) => y0 + pos * (rh + gap);
  for (let i = 0; i < n; i++) {
    const g = d.nhom[i], q = Math.max(1, Math.min(10, g.soLuong));
    const y = yOf(i);
    c.box(`nhom${i}`, '', { x: lx, y, w: lw, h: rh, fill: C.white, line: PAL[i % PAL.length], lw: 5, shadow: true });
    c.add({ n: `nhom${i}`, e: 'zoom', d: 700 + i * 250, t: 500 });
    const perRow = q > 5 ? 5 : q, rows = q > 5 ? 2 : 1;
    const cell = Math.min((lw - 0.3) / perRow, (rh - 0.16) / rows, 0.95);
    const gw = cell * perRow, gx = lx + (lw - gw) / 2, gy = y + (rh - cell * rows) / 2;
    for (let k = 0; k < q; k++) {
      const nm = `vat${i}_${k}`;
      c.pic(nm, g.hinh, gx + (k % perRow) * cell + 0.03, gy + Math.floor(k / perRow) * cell + 0.03, cell - 0.06, cell - 0.06);
      c.add({ n: nm, e: 'pop', d: 900 + i * 250 + k * 60, t: 400 });
    }
  }
  for (let i = 0; i < n; i++) {
    const pos = perm[i];
    c.box(`so${pos}`, [{ text: String(Math.max(1, Math.min(10, d.nhom[i].soLuong))), options: { fontFace: FONT, fontSize: Math.round(bd * 46), color: C.white } }], { x: bx, y: yOf(pos) + (rh - bd) / 2, w: bd, h: bd, shape: 'oval', fill: ANSWER[pos % 4].c, line: C.white, lw: 4, font: FONT, shadow: true, color: ANSWER[pos % 4].t });
    c.add({ n: `so${pos}`, e: 'pop', d: 1000 + pos * 250, t: 500 });
  }
  for (let i = 0; i < n; i++) {
    const ya = yOf(i) + rh / 2, yb = yOf(perm[i]) + rh / 2, xa = lx + lw, xb = bx;
    c.s.addShape(c.pres.ShapeType.line, { x: xa, y: Math.min(ya, yb), w: xb - xa, h: Math.abs(yb - ya) || 0.0001, flipV: yb < ya, line: { color: PAL[i % PAL.length], width: 6 }, objectName: c.uniq(`noi${i}`) });
    c.add({ n: `noi${i}`, e: 'wipe', t: 800, c: true });
  }
  c.addMusic();
}

export function timChu(c: Ctx, d: TimChu): void {
  c.bg();
  c.ribbon(d.tieuDe ?? `TÌM CHỮ CÁI "${d.chu.toUpperCase()}"`, { size: 32 });
  const chu = baseLetter(d.chu);
  const big = `${d.chu.toUpperCase()}${d.chu.toLowerCase()}`;
  c.box('chu', [{ text: big, options: { fontFace: FONT, fontSize: 110, color: C.red } }], { x: 0.7, y: 1.8, w: 4.2, h: 4.4, fill: C.white, line: C.gold, lw: 6, shadow: true, font: FONT });
  c.add({ n: 'chu', e: 'pop', d: 900, t: 800, l: 'pulse', lo: { amp: 103000, t: 1000 } });
  const n = Math.max(2, Math.min(4, d.cacTu.length));
  const cols = n <= 2 ? 1 : 2, rows = Math.ceil(n / cols);
  const gx0 = 5.3, gx1 = 12.7, gy0 = 1.7, gy1 = 7.0, gap = 0.25;
  const cw = (gx1 - gx0 - gap * (cols - 1)) / cols, ch = (gy1 - gy0 - gap * (rows - 1)) / rows;
  const hit: { name: string; x: number; y: number }[] = [];
  d.cacTu.slice(0, n).forEach((w, i) => {
    const x = gx0 + (i % cols) * (cw + gap), y = gy0 + Math.floor(i / cols) * (ch + gap);
    c.box(`tu${i}`, '', { x, y, w: cw, h: ch, fill: C.white, line: PAL[(i + 2) % PAL.length], lw: 4, shadow: true });
    const ph = ch - 1.0;
    c.pic(`hinh${i}`, w.hinh, x + 0.15, y + 0.1, cw - 0.3, ph);
    const size = autoSize(w.tu, cw - 0.3, 0.8, 40, 18, true);
    c.text(`chu${i}`, [{ text: w.tu, options: { fontFace: FONT, fontSize: size, color: C.ink } }], { x: x + 0.1, y: y + ch - 0.95, w: cw - 0.2, h: 0.85, font: FONT });
    c.add({ n: `tu${i}`, e: 'zoom', d: 1500 + i * 300, t: 500 }, { n: `hinh${i}`, e: 'pop', d: 1600 + i * 300, t: 500 }, { n: `chu${i}`, e: 'fade', d: 1700 + i * 300, t: 500 });
    if ([...w.tu.normalize('NFC')].some(ch2 => baseLetter(ch2) === chu)) hit.push({ name: `tu${i}`, x, y });
  });
  // "tới": tô đỏ chữ cái cần tìm trong các từ có chữ đó + vòng xanh lá quanh thẻ
  let first = true;
  d.cacTu.slice(0, n).forEach((w, i) => {
    if (!hit.some(h => h.name === `tu${i}`)) return;
    const x = gx0 + (i % cols) * (cw + gap), y = gy0 + Math.floor(i / cols) * (ch + gap);
    const runs = [...w.tu.normalize('NFC')].map(ch2 => ({ text: ch2, options: baseLetter(ch2) === chu ? { fontFace: FONT, fontSize: autoSize(w.tu, cw - 0.3, 0.8, 40, 18, true), color: C.red } : { fontFace: FONT, fontSize: autoSize(w.tu, cw - 0.3, 0.8, 40, 18, true), color: C.ink } }));
    c.text(`sang${i}`, runs, { x: x + 0.1, y: y + ch - 0.95, w: cw - 0.2, h: 0.85, font: FONT });
    c.box(`vong${i}`, '', { x: x - 0.1, y: y - 0.1, w: cw + 0.2, h: ch + 0.2, line: C.dkgreen, lw: 8 });
    c.add(first ? { n: `sang${i}`, e: 'appear', c: true } : { n: `sang${i}`, e: 'appear' }, { n: `vong${i}`, e: 'pop', t: 500, d: 150 });
    first = false;
  });
  if (first) throw new Error('tim-chu: không có từ nào chứa chữ "' + d.chu + '"');
  c.addMusic();
}
