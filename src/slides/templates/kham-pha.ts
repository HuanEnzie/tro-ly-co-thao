/** Mẫu KPKH/KPXH: quan sát – đàm thoại, Rung chuông vàng, Ai nhanh hơn, Ghép đôi. */
import type { AiNhanhHon, GhepDoi, QuanSat, RungChuongVang } from '../types';
import { ANSWER, autoSize, C, columns, Ctx, FONT, permutation, PAL, W } from './common';

export function quanSat(c: Ctx, d: QuanSat): void {
  c.bg();
  c.ribbon(d.tieuDe);
  const n = Math.max(1, Math.min(3, d.hinh.length));
  const cols = columns(n, 0.8, 12.53, 0.3);
  cols.forEach((col, i) => {
    c.box(`khung${i}`, '', { x: col.x, y: 1.6, w: col.w, h: 3.6, fill: C.white, line: PAL[i % PAL.length], lw: 5, shadow: true });
    c.pic(`hinh${i}`, d.hinh[i], col.x + 0.1, 1.7, col.w - 0.2, 3.4);
    c.add({ n: `khung${i}`, e: 'zoom', d: 1100 + i * 350, t: 600 }, { n: `hinh${i}`, e: 'pop', d: 1300 + i * 350, t: 600 });
  });
  const m = Math.min(4, d.cauHoi.length), rh = Math.min(0.75, 1.9 / Math.max(1, m));
  for (let i = 0; i < m; i++) {
    c.box(`cauhoi${i}`, d.cauHoi[i], { x: 1.2, y: 5.4 + i * (rh + 0.08), w: 10.93, h: rh, fill: C.white, line: C.gold, lw: 3, shape: 'pill', size: autoSize(d.cauHoi[i], 10.2, rh - 0.05, 26, 13), color: C.brown, shadow: true });
    c.add({ n: `cauhoi${i}`, e: 'flyB', t: 600, c: true });
  }
  c.addMusic();
}

interface Opt { nhan: string; hinh?: string; chip: string; mau: string; chuMau: string }

/** Dàn ô lựa chọn + một lần "tới": ô sai mờ dần biến mất, ô đúng có vòng sáng, "ĐÚNG RỒI!" và sao. */
function optionsReveal(c: Ctx, opts: Opt[], dung: number, y: number, ch: number, hint?: string): void {
  const n = opts.length;
  const cw = n === 4 ? 2.85 : n === 3 ? 3.7 : 4.6, gap = n === 4 ? 0.3 : 0.45;
  const x0 = (13.333 - (n * cw + (n - 1) * gap)) / 2;
  const chipH = 0.9, chipY = y - 0.45;
  const rings: { x: number; y: number; w: number; h: number }[] = [];
  opts.forEach((o, i) => {
    const x = x0 + i * (cw + gap);
    c.box(`card${i}`, '', { x, y, w: cw, h: ch, fill: C.white, line: o.mau, lw: 6, shadow: true, transparency: 3 });
    if (o.hinh) c.pic(`img${i}`, o.hinh, x + 0.12, y + 0.55, cw - 0.24, ch - 1.25);
    const ly = o.hinh ? y + ch - 0.7 : y + 0.7, lh = o.hinh ? 0.62 : ch - 0.9;
    c.box(`nhan${i}`, o.nhan, { x: x + 0.1, y: ly, w: cw - 0.2, h: lh, size: autoSize(o.nhan, cw - 0.3, lh - 0.02, o.hinh ? 22 : 30, 12), color: C.ink, bold: true });
    c.box(`chip${i}`, [{ text: o.chip, options: { fontFace: FONT, fontSize: n === 4 ? 28 : 32, color: o.chuMau } }], { x: x + 0.1, y: chipY, w: cw - 0.2, h: chipH, fill: o.mau, line: C.white, lw: 4, shape: 'pill', font: FONT, shadow: true });
    c.add(
      { n: `card${i}`, e: 'zoom', d: 1900 + i * 450, t: 500 },
      ...(o.hinh ? [{ n: `img${i}`, e: 'pop' as const, d: 1900 + i * 450, t: 600 }] : []),
      { n: `nhan${i}`, e: 'fade', d: 2000 + i * 450, t: 500 },
      { n: `chip${i}`, e: 'pop', d: 1900 + i * 450, t: 600 },
    );
    rings.push({ x: x - 0.12, y: chipY - 0.12, w: cw + 0.24, h: ch + 0.45 + 0.24 });
  });
  if (hint) {
    c.box('hint', hint, { x: 3.2, y: 6.78, w: 6.93, h: 0.55, fill: C.white, line: C.gold, lw: 3, shape: 'pill', size: 20, color: C.brown, bold: true });
    c.add({ n: 'hint', e: 'fade', d: 1900 + n * 450 + 200, t: 500 });
  }
  const r = rings[dung];
  c.box('vong', '', { x: r.x, y: r.y, w: r.w, h: r.h, line: C.dkgreen, lw: 9, shape: 'round' });
  c.box('dungroi', [{ text: 'ĐÚNG RỒI!', options: { fontFace: FONT, fontSize: 36, color: C.white } }], { x: 4.67, y: 6.55, w: 4.0, h: 0.85, fill: C.green, line: C.white, lw: 5, shape: 'pill', font: FONT, shadow: true, outline: C.dkgreen });
  const sao: [number, number, number][] = [[r.x + r.w - 0.4, r.y - 0.15, 0.7], [r.x - 0.35, r.y + r.h - 0.55, 0.7], [r.x + r.w - 0.35, r.y + r.h - 0.5, 0.7]];
  sao.forEach(([sx, sy, ss], k) => c.box(`sao${k}`, '', { x: sx, y: sy, w: ss, h: ss, shape: 'star', fill: C.yellow, line: C.gold, lw: 2 }));
  // một lần "tới": ô sai biến mất, ô đúng nổi bật
  let first = true;
  const mk = (f: Parameters<Ctx['add']>[0]) => { c.add(first ? { ...f, c: true } : f); first = false; };
  opts.forEach((_, i) => {
    if (i === dung) return;
    for (const p of ['card', 'img', 'nhan', 'chip']) if (p !== 'img' || opts[i].hinh) mk({ n: `${p}${i}`, x: true, xt: 500 });
  });
  if (hint) mk({ n: 'hint', x: true, xt: 400 });
  mk({ n: 'vong', e: 'pop', d: 500, t: 500, l: 'pulse', lo: { amp: 103000, t: 800 } });
  c.add({ n: 'dungroi', e: 'pop', d: 700, t: 600 });
  sao.forEach((_, k) => c.add({ n: `sao${k}`, e: 'spin', d: 900 + k * 200, t: 500, l: 'pulse', lo: { amp: 112000, t: 800 } }));
}

export function rungChuongVang(c: Ctx, d: RungChuongVang): void {
  c.bg();
  const badge = d.soCau && d.tongCau ? `CÂU ${d.soCau}/${d.tongCau}` : undefined;
  c.ribbon('RUNG CHUÔNG VÀNG', { size: 34, badge });
  const long = d.cauHoi.length > 36;
  c.box('banner', d.cauHoi, { x: 0.9, y: 1.5, w: 11.53, h: 0.95, fill: C.white, line: C.brown, lw: 4, shape: 'pill', size: autoSize(d.cauHoi, 10.9, 0.85, long ? 25 : 30, 16), color: '5D3A00', bold: true, shadow: true });
  c.add({ n: 'banner', e: 'pop', d: 1300, t: 700 });
  const n = Math.min(4, d.dapAn.length);
  if (n >= 2) {
    const dung = Math.max(0, d.dapAn.findIndex(a => a.dung));
    const opts: Opt[] = d.dapAn.slice(0, 4).map((a, i) => ({ nhan: a.nhan, hinh: a.hinh, chip: ANSWER[i].n, mau: ANSWER[i].c, chuMau: ANSWER[i].t }));
    optionsReveal(c, opts, dung, 3.1, 3.3, 'Các con chọn đáp án theo MÀU nhé!');
  } else {
    // câu hỏi mở: cô hỏi miệng, "tới" một lần hiện đáp án
    c.box('dapanmo', [{ text: 'ĐÁP ÁN', options: { fontFace: FONT, fontSize: 24, color: C.red, breakLine: true } }, { text: d.dapAnMo ?? '', options: { fontFace: FONT, fontSize: autoSize(d.dapAnMo ?? '', 9.5, 2.0, 40, 18, true), color: C.dkgreen } }],
      { x: 1.6, y: 3.0, w: 10.13, h: 3.2, fill: C.white, line: C.green, lw: 6, shadow: true, font: FONT });
    c.add({ n: 'dapanmo', e: 'pop', t: 700, c: true });
  }
  c.addMusic();
}

export function aiNhanhHon(c: Ctx, d: AiNhanhHon): void {
  c.bg();
  c.ribbon('AI NHANH HƠN', { size: 38 });
  c.box('banner', d.cauHoi, { x: 0.9, y: 1.5, w: 11.53, h: 0.95, fill: C.white, line: C.brown, lw: 4, shape: 'pill', size: autoSize(d.cauHoi, 10.9, 0.85, 30, 16), color: '5D3A00', bold: true, shadow: true });
  c.add({ n: 'banner', e: 'pop', d: 1300, t: 700 });
  const lua = d.lua.slice(0, 4);
  const opts: Opt[] = lua.map((o, i) => ({ nhan: o.nhan, hinh: o.hinh, chip: String(i + 1), mau: ANSWER[i].c, chuMau: ANSWER[i].t }));
  optionsReveal(c, opts, Math.min(Math.max(0, d.dung), opts.length - 1), 3.1, 3.3);
  c.addMusic();
}

export function ghepDoi(c: Ctx, d: GhepDoi): void {
  c.bg();
  c.ribbon(d.tieuDe);
  const n = Math.max(2, Math.min(5, d.cap.length));
  const perm = permutation(n, d.thuTuPhai);
  const rh = Math.min(1.25, 5.1 / n - 0.15), gap = 0.2, y0 = 1.65;
  const cardW = 3.2, lx = 1.3, rx = W - 1.3 - cardW;
  const item = (name: string, side: { hinh?: string; nhan?: string }, x: number, y: number, col: string) => {
    c.box(`${name}-k`, '', { x, y, w: cardW, h: rh, fill: C.white, line: col, lw: 5, shadow: true });
    const hasLabel = !!side.nhan;
    c.pic(`${name}-h`, side.hinh, x + 0.1, y + 0.08, hasLabel ? cardW * 0.5 : cardW - 0.2, rh - 0.16);
    if (hasLabel) c.box(`${name}-t`, side.nhan!, { x: x + (side.hinh ? cardW * 0.52 : 0.1), y: y + 0.05, w: side.hinh ? cardW * 0.46 : cardW - 0.2, h: rh - 0.1, size: autoSize(side.nhan!, cardW * 0.44, rh - 0.15, 22, 12), bold: true });
    c.add({ n: `${name}-k`, e: 'zoom', d: 900, t: 500 }, { n: `${name}-h`, e: 'fade', d: 1000, t: 500 });
    if (hasLabel) c.add({ n: `${name}-t`, e: 'fade', d: 1000, t: 500 });
  };
  const yOf = (pos: number) => y0 + pos * (rh + gap);
  for (let i = 0; i < n; i++) {
    item(`trai${i}`, d.cap[i].trai, lx, yOf(i), PAL[i % PAL.length]);
    item(`phai${perm[i]}`, d.cap[i].phai, rx, yOf(perm[i]), PAL[i % PAL.length]);
  }
  for (let i = 0; i < n; i++) {
    const ya = yOf(i) + rh / 2, yb = yOf(perm[i]) + rh / 2;
    const col = ANSWER[i % 4].c;
    c.s.addShape(c.pres.ShapeType.line, { x: lx + cardW, y: Math.min(ya, yb), w: rx - lx - cardW, h: Math.abs(yb - ya) || 0.0001, flipV: yb < ya, line: { color: col, width: 6 }, objectName: c.uniq(`noi${i}`) });
    c.add({ n: `noi${i}`, e: 'wipe', t: 800, c: true });
  }
  c.addMusic();
}
