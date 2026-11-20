/** Mẫu thơ/truyện (tranh từng đoạn + chữ) và âm nhạc (tên bài, lời, nhạc). */
import type { AmNhac, ThoTruyen } from '../types';
import { autoSize, C, columns, Ctx, FONT, PAL } from './common';

export function thoTruyen(c: Ctx, d: ThoTruyen): void {
  c.bg();
  c.ribbon(d.tenBai, { size: 34 });
  if (d.tacGia) {
    c.box('tacgia', d.tacGia, { x: 3.0, y: 1.38, w: 7.33, h: 0.4, size: 16, color: C.brown, bold: true });
    c.add({ n: 'tacgia', e: 'fade', d: 900, t: 500 });
  }
  const n = Math.max(1, Math.min(3, d.doan.length));
  const cols = columns(n, 0.6, 12.73, 0.3);
  cols.forEach((col, i) => {
    const ph = n === 1 ? 3.2 : 3.0;
    c.box(`khung${i}`, '', { x: col.x, y: 1.9, w: col.w, h: ph + 0.2, fill: C.white, line: PAL[i % PAL.length], lw: 5, shadow: true });
    c.pic(`hinh${i}`, d.doan[i].hinh, col.x + 0.1, 2.0, col.w - 0.2, ph);
    const th = 7.2 - (2.0 + ph + 0.35);
    c.box(`chu${i}`, d.doan[i].chu, { x: col.x, y: 2.0 + ph + 0.2, w: col.w, h: th, fill: C.white, line: C.gold, lw: 3, size: autoSize(d.doan[i].chu, col.w - 0.3, th - 0.15, n === 1 ? 30 : 24, 12), color: C.ink, shadow: true, margin: 0.15 });
    // đoạn đầu tự hiện, các đoạn sau mỗi "tới" một đoạn
    const click = i > 0 ? { c: true } : { d: 1000 };
    c.add({ n: `khung${i}`, e: 'zoom', t: 600, ...click }, { n: `hinh${i}`, e: 'pop', t: 600, d: 150 }, { n: `chu${i}`, e: 'flyB', t: 600, d: 350 });
  });
  c.addMusic();
}

const KIEU = { 'nghe-hat': 'Nghe hát', 'day-hat': 'Dạy hát', 'tro-choi': 'Trò chơi âm nhạc' } as const;

export function amNhac(c: Ctx, d: AmNhac): void {
  c.bg();
  c.ribbon(d.tenBai, { size: 34 });
  const kieu = KIEU[d.kieu ?? 'nghe-hat'];
  c.box('kieu', [{ text: kieu, options: { fontFace: FONT, fontSize: 18, color: C.white } }], { x: 9.2, y: 1.45, w: 2.6, h: 0.5, fill: C.purple, line: C.white, lw: 3, shape: 'pill', font: FONT });
  c.add({ n: 'kieu', e: 'pop', d: 900, t: 500 });
  const n = Math.max(1, d.loi.length);
  const loiH = 5.0;
  const size = Math.min(34, Math.floor((loiH * 72) / (n * 1.45)), autoSize(d.loi.reduce((a, b) => (b.length > a.length ? b : a), ''), 7.3, 1, 34, 12));
  c.box('loi', '', { x: 1.0, y: 2.05, w: 8.0, h: loiH + 0.2, fill: C.white, line: C.gold, lw: 5, shadow: true, transparency: 4 });
  c.add({ n: 'loi', e: 'zoom', d: 900, t: 600 });
  d.loi.forEach((line, i) => {
    const lh = loiH / n;
    c.text(`dong${i}`, line, { x: 1.2, y: 2.15 + i * lh, w: 7.6, h: lh, size, color: PAL[i % PAL.length], bold: true, font: FONT });
    c.add({ n: `dong${i}`, e: 'flyR', d: 1400 + i * 250, t: 500 });
  });
  c.pic('nhanvat', d.assets?.nhanVat, 9.4, 2.4, 3.5, 4.6, 'bottom');
  c.pic('trangtri', d.assets?.trangTri, 9.9, 1.9, 2.4, 1.2);
  c.add({ n: 'nhanvat', e: 'flyR', d: 1100, t: 900, l: 'bob' }, { n: 'trangtri', e: 'pop', d: 1500, t: 600, l: 'drift', lo: { amp: 0.02, dy: -0.03, t: 1800 } });
  c.addMusic();
}
