/** Mẫu chung: mở đầu, thỏa thuận chơi, giới thiệu bài, nhận xét – khen, kết thúc. */
import type { GioiThieu, KetThuc, MoDau, NhanXet, ThoaThuan } from '../types';
import { autoSize, C, Ctx, FONT, PAL } from './common';

const rainbow = (text: string, size: number, palette = PAL) =>
  text.split(' ').map((w, i, a) => ({ text: w + (i < a.length - 1 ? ' ' : ''), options: { color: palette[i % palette.length], fontFace: FONT, fontSize: size } }));

export function moDau(c: Ctx, d: MoDau): void {
  c.bg();
  c.box('header', [
    { text: d.donViChuQuan ?? '', options: { fontSize: 14, color: C.dkgreen, breakLine: true, fontFace: FONT } },
    { text: d.truong.toUpperCase(), options: { fontSize: 20, color: C.red, fontFace: FONT } },
  ], { x: 3.17, y: 0.2, w: 7.0, h: 1.0, fill: C.white, line: C.gold, lw: 3, shadow: true, font: FONT });
  c.add({ n: 'header', e: 'flyT', d: 200, t: 1000 });

  c.box('card', '', { x: 3.1, y: 1.55, w: 7.13, h: 5.4, fill: C.white, line: C.green, lw: 4, dash: true, shadow: true, transparency: 6 });
  c.add({ n: 'card', e: 'zoom', d: 600, t: 600 });
  if (d.loaiTiet) {
    c.box('tag', [{ text: d.loaiTiet, options: { fontFace: FONT, fontSize: 16, color: C.white } }], { x: 5.17, y: 1.75, w: 3.0, h: 0.5, fill: C.orange, line: C.white, lw: 3, shape: 'pill', font: FONT });
    c.add({ n: 'tag', e: 'pop', d: 1100, t: 500 });
  }
  c.text('title', rainbow(d.tenHoatDong.toUpperCase(), autoSize(d.tenHoatDong, 6.6, 1.6, 44, 22, true), [C.red, C.green, C.purple]), { x: 3.25, y: 2.4, w: 6.83, h: 1.7, font: FONT });
  c.add({ n: 'title', e: 'pop', d: 1500, t: 800, l: 'pulse', lo: { amp: 105000, t: 900 } });
  const rows: [string, string, string][] = [['Chủ đề: ', d.chuDe, C.gold], ['Lớp: ', d.lop, C.red], ['Giáo viên: ', d.giaoVien, C.pink]];
  rows.forEach(([lab, val, col], i) => {
    const y = 4.4 + i * 0.7;
    c.box(`row${i}`, [{ text: lab, options: { bold: true, color: col } }, { text: val, options: { bold: true, color: C.ink } }], { x: 3.7, y, w: 6.0, h: 0.55, size: 21, align: 'left' });
    c.add({ n: `row${i}`, e: 'flyR', d: 2300 + i * 300, t: 600 });
  });
  c.pic('nhanvat-trai', d.assets?.nhanVat, 0.3, 2.6, 2.7, 4.3, 'bottom');
  c.pic('trangtri-phai', d.assets?.trangTri, 10.4, 2.6, 2.7, 4.3, 'bottom');
  c.add({ n: 'nhanvat-trai', e: 'flyL', d: 700, t: 1000, l: 'bob' }, { n: 'trangtri-phai', e: 'flyR', d: 1100, t: 1000, l: 'bob', lo: { t: 1000 } });
}

export function thoaThuan(c: Ctx, d: ThoaThuan): void {
  c.bg();
  c.ribbon(d.tieuDe ?? 'THỎA THUẬN CHƠI');
  const n = Math.min(5, d.cacDieu.length);
  const rh = Math.min(1.05, 5.0 / n), gap = 0.18;
  const y0 = 1.75;
  for (let i = 0; i < n; i++) {
    const y = y0 + i * (rh + gap);
    c.box(`dieu${i}`, d.cacDieu[i], { x: 1.7, y, w: 9.9, h: rh, fill: C.white, line: PAL[i % PAL.length], lw: 4, shadow: true, size: autoSize(d.cacDieu[i], 8.9, rh - 0.1, 28, 14), color: C.ink, align: 'left', margin: 0.6 });
    c.box(`so${i}`, [{ text: String(i + 1), options: { fontFace: FONT, fontSize: 28, color: C.white } }], { x: 1.45, y: y + rh / 2 - 0.4, w: 0.8, h: 0.8, shape: 'oval', fill: PAL[i % PAL.length], line: C.white, lw: 3, font: FONT });
    c.add({ n: `dieu${i}`, e: 'flyR', t: 600, c: true }, { n: `so${i}`, e: 'pop', t: 500 });
  }
  c.addMusic();
}

export function gioiThieu(c: Ctx, d: GioiThieu): void {
  c.bg();
  const hasImg = !!d.hinh;
  const tw = hasImg ? 6.6 : 11.0;
  c.box('card', '', { x: 0.7, y: 1.2, w: hasImg ? 7.0 : 11.9, h: 5.6, fill: C.white, line: C.gold, lw: 5, shadow: true, transparency: 6 });
  c.add({ n: 'card', e: 'zoom', d: 0, t: 600 });
  c.text('title', rainbow(d.tieuDe, autoSize(d.tieuDe, tw, 2.6, 54, 24, true), [C.red, C.green, C.purple, C.orange]), { x: 0.9, y: 1.8, w: tw, h: 2.8, font: FONT, align: 'center' });
  c.add({ n: 'title', e: 'pop', d: 500, t: 800, l: 'pulse', lo: { amp: 104000, t: 1000 } });
  if (d.phuDe) {
    c.box('phude', d.phuDe, { x: 1.1, y: 4.8, w: tw - 0.4, h: 1.3, fill: C.soft, shape: 'pill', size: autoSize(d.phuDe, tw - 1.0, 1.1, 26, 14), color: C.brown });
    c.add({ n: 'phude', e: 'flyB', d: 1100, t: 600 });
  }
  if (hasImg) {
    c.pic('hinh', d.hinh, 8.0, 1.3, 4.7, 5.4);
    c.add({ n: 'hinh', e: 'pop', d: 900, t: 700, l: 'bob' });
  }
  c.addMusic();
}

export function nhanXet(c: Ctx, d: NhanXet): void {
  c.bg();
  c.ribbon(d.tieuDe ?? 'NHẬN XÉT – KHEN');
  const n = Math.min(6, d.anhSanPham.length);
  const cols = n === 1 ? 1 : n === 2 || n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gx0 = 0.5, gx1 = 8.3, gy0 = 1.65, gy1 = 7.0, gap = 0.2;
  const cw = (gx1 - gx0 - gap * (cols - 1)) / cols, ch = (gy1 - gy0 - gap * (rows - 1)) / rows;
  for (let i = 0; i < n; i++) {
    const x = gx0 + (i % cols) * (cw + gap), y = gy0 + Math.floor(i / cols) * (ch + gap);
    c.box(`khung${i}`, '', { x, y, w: cw, h: ch, fill: C.white, line: PAL[i % PAL.length], lw: 5, shadow: true });
    c.pic(`anh${i}`, d.anhSanPham[i], x + 0.1, y + 0.1, cw - 0.2, ch - 0.2);
    c.add({ n: `khung${i}`, e: 'zoom', d: 300 + i * 250, t: 500 }, { n: `anh${i}`, e: 'fade', d: 500 + i * 250, t: 500 });
  }
  const m = Math.min(4, d.loiKhen.length), rh = Math.min(1.1, 5.2 / Math.max(1, m));
  for (let i = 0; i < m; i++) {
    const y = 1.8 + i * (rh + 0.2);
    c.box(`khen${i}`, d.loiKhen[i], { x: 8.7, y, w: 4.2, h: rh, fill: C.white, line: C.gold, lw: 4, shadow: true, size: autoSize(d.loiKhen[i], 3.4, rh - 0.1, 22, 12), align: 'left', margin: 0.55 });
    c.box(`sao${i}`, '', { x: 8.82, y: y + rh / 2 - 0.25, w: 0.5, h: 0.5, shape: 'star', fill: C.yellow, line: C.gold, lw: 1.5 });
    c.add({ n: `khen${i}`, e: 'flyR', t: 600, c: true }, { n: `sao${i}`, e: 'spin', t: 600 });
  }
  c.addMusic();
}

export function ketThuc(c: Ctx, d: KetThuc): void {
  c.bg();
  c.pic('nhanvat', d.assets?.nhanVat, 0.5, 2.0, 3.6, 5.0, 'bottom');
  c.pic('trangtri', d.assets?.trangTri, 9.3, 2.0, 3.6, 5.0, 'bottom');
  c.add({ n: 'nhanvat', e: 'flyL', d: 800, t: 1000, l: 'bob' }, { n: 'trangtri', e: 'flyR', d: 1000, t: 1000, l: 'bob', lo: { t: 1000 } });
  const sao: [number, number, number][] = [[1.0, 0.8, 0.9], [11.2, 0.7, 1.0], [4.4, 1.2, 0.6], [8.6, 1.0, 0.7]];
  sao.forEach(([x, y, s], i) => {
    c.box(`sao${i}`, '', { x, y, w: s, h: s, shape: 'star', fill: C.yellow, line: C.gold, lw: 2 });
    c.add({ n: `sao${i}`, e: 'spin', d: 200 + i * 200, t: 600, l: 'pulse', lo: { amp: 112000, t: 900 } });
  });
  const hi = d.loiChao ?? 'Xin chào và hẹn gặp lại!';
  c.box('loichao', [{ text: hi, options: { fontFace: FONT, fontSize: autoSize(hi, 7.6, 1.5, 48, 22, true), color: C.white } }], { x: 2.9, y: 2.2, w: 7.53, h: 2.0, fill: C.gold, line: C.white, lw: 5, shape: 'pill', font: FONT, shadow: true, outline: C.brown });
  c.add({ n: 'loichao', e: 'pop', d: 400, t: 800, l: 'pulse', lo: { amp: 104000, t: 1000 } });
  const cam = d.loiCamOn ?? 'Cảm ơn các cô đã về dự!';
  c.box('camon', cam, { x: 3.4, y: 4.6, w: 6.53, h: 1.0, fill: C.white, line: C.green, lw: 4, shape: 'pill', size: autoSize(cam, 5.8, 0.8, 28, 14), color: C.dkgreen, shadow: true });
  c.add({ n: 'camon', e: 'flyB', d: 1400, t: 700 });
  c.addMusic();
}

