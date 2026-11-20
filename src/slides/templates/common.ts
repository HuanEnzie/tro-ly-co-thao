/** Phần dùng chung cho các mẫu slide: màu, phông, hộp chữ, ảnh (giữ tỉ lệ), tiêu đề, nhạc. */
import PptxGenJS from 'pptxgenjs';
import { CHUA_CHON, type MusicRef, type ResolvedAsset, type SlideBase } from '../types';
import type { Fx } from '../anim';
import { musicIconPng, toBase64 } from '../png';

export const FONT = 'Segoe UI Black';
export const FONT_B = 'Segoe UI';
export const W = 13.333;
export const H = 7.5;

export const C = {
  gold: 'F29E02', brown: '8D5300', ink: '4E342E', cream: 'FFF8E1', white: 'FFFFFF',
  green: '43A047', dkgreen: '1B5E20', orange: 'FF7043', pink: 'EC407A', teal: '00897B',
  red: 'E53935', purple: '8E24AA', yellow: 'FBC02D', soft: 'FFE0B2', mint: 'C8E6C9',
};

/** Màu đáp án theo luật của cô: Đỏ / Tím / Xanh lá / Vàng — không có xanh dương. */
export const ANSWER = [
  { n: 'ĐỎ', c: C.red, t: 'FFFFFF' },
  { n: 'TÍM', c: C.purple, t: 'FFFFFF' },
  { n: 'XANH LÁ', c: C.green, t: 'FFFFFF' },
  { n: 'VÀNG', c: C.yellow, t: '5D3A00' },
] as const;
/** màu nhấn xoay vòng (không xanh dương) */
export const PAL = [C.red, C.orange, C.green, C.purple, C.pink, C.teal];

export interface Img { id: string; data: string; w: number; h: number }
export type ImgMap = Map<string, Img | null>;

/** Đoán MIME ảnh/nhạc theo byte đầu. */
export function sniffMime(u8: Uint8Array): string {
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg';
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'image/gif';
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return 'audio/mpeg';
  if (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return 'image/png';
}
export function toDataUrl(a: ResolvedAsset): string {
  if (typeof a.data === 'string') return a.data;
  const u8 = a.data instanceof Uint8Array ? a.data : new Uint8Array(a.data);
  return `data:${a.mime ?? sniffMime(u8)};base64,${toBase64(u8)}`;
}

const stripTone = (ch: string) => ch.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
/** Chữ cái nền (bỏ dấu thanh, giữ â ă ê ô ơ ư đ) viết thường. */
export const baseLetter = (ch: string) => stripTone(ch).toLowerCase();

/** Chọn cỡ chữ lớn nhất (pt) vừa khung w×h (inch) — ước lượng cho Segoe UI. */
export function autoSize(text: string, w: number, h: number, max: number, min = 10, black = false): number {
  const k = black ? 0.62 : 0.55;
  for (let s = max; s > min; s--) {
    const perLine = Math.max(1, Math.floor((w * 72) / (s * k)));
    const words = text.split(/\s+/);
    let lines = 1, cur = 0;
    for (const wd of words) {
      const l = wd.length;
      if (cur === 0) cur = l;
      else if (cur + 1 + l <= perLine) cur += 1 + l;
      else { lines++; cur = l; }
      while (cur > perLine) { lines++; cur -= perLine; }
    }
    if (lines * s * 1.22 <= h * 72) return s;
  }
  return min;
}

export interface BoxOpt {
  x: number; y: number; w: number; h: number;
  fill?: string; line?: string; lw?: number; dash?: boolean;
  color?: string; size?: number; font?: string; bold?: boolean; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom';
  shape?: 'round' | 'rect' | 'oval' | 'pill' | 'star';
  shadow?: boolean; outline?: string; margin?: number; transparency?: number;
}

const shadow = (): PptxGenJS.ShadowProps => ({ type: 'outer', color: '000000', blur: 6, offset: 3, angle: 60, opacity: 0.25 });

export class Ctx {
  fx: Fx[] = [];
  music?: MusicRef;
  private names = new Set<string>();
  /** ảnh không khai id (tuỳ chọn) → bỏ qua, và bỏ luôn hiệu ứng trỏ vào nó */
  private skipped = new Set<string>();
  constructor(public pres: PptxGenJS, public s: PptxGenJS.Slide, public spec: SlideBase, private imgs: ImgMap, private musicData?: string) {}

  /** tên shape duy nhất trong slide */
  uniq(n: string): string {
    if (this.names.has(n)) throw new Error(`trùng tên shape "${n}"`);
    this.names.add(n);
    return n;
  }
  img(id?: string): Img | null | undefined { return id && id !== CHUA_CHON ? this.imgs.get(id) : undefined; }

  bg(): void {
    const nen = this.img(this.spec.assets?.nen);
    if (nen) {
      this.s.addImage({ data: nen.data, x: 0, y: 0, w: W, h: H, objectName: this.uniq('nen'), altText: 'Nền' });
      return;
    }
    this.s.background = { color: C.cream };
    this.s.addShape(this.pres.ShapeType.ellipse, { x: -1.2, y: 5.6, w: 5, h: 3.6, fill: { color: C.mint }, line: { color: C.mint, width: 0 }, objectName: this.uniq('nen-doi1') });
    this.s.addShape(this.pres.ShapeType.ellipse, { x: 9.2, y: 5.9, w: 5.4, h: 3.4, fill: { color: C.soft }, line: { color: C.soft, width: 0 }, objectName: this.uniq('nen-doi2') });
  }

  /** hộp chữ/hình có nền. text rỗng = chỉ hình */
  box(name: string, text: string | PptxGenJS.TextProps[], o: BoxOpt): string {
    const shape = o.shape ?? (o.fill || o.line ? 'round' : 'rect');
    const sh = this.pres.ShapeType;
    const prst = shape === 'oval' ? sh.ellipse : shape === 'star' ? sh.star5 : shape === 'rect' ? sh.rect : sh.roundRect;
    const radius = shape === 'pill' ? o.h / 2 : Math.min(0.3, o.h / 4);
    const font = o.font ?? FONT_B;
    const base: PptxGenJS.TextPropsOptions = {
      shape: prst, x: o.x, y: o.y, w: o.w, h: o.h,
      fontFace: font, fontSize: o.size ?? 20, color: o.color ?? C.ink, bold: o.bold ?? font === FONT_B,
      align: o.align ?? 'center', valign: o.valign ?? 'middle', margin: o.margin ?? 0.05,
      objectName: this.uniq(name),
    };
    if (prst === sh.roundRect) base.rectRadius = radius;
    if (o.fill) base.fill = { color: o.fill, ...(o.transparency ? { transparency: o.transparency } : {}) };
    if (o.line) base.line = { color: o.line, width: o.lw ?? 3, ...(o.dash ? { dashType: 'dash' as const } : {}) };
    if (o.shadow) base.shadow = shadow();
    if (o.outline) base.outline = { size: 1.5, color: o.outline };
    this.s.addText(text, base);
    return name;
  }

  /** chữ trần (không nền) */
  text(name: string, text: string | PptxGenJS.TextProps[], o: Omit<BoxOpt, 'fill' | 'line' | 'shape'>): string {
    return this.box(name, text, { ...o, shape: 'rect' });
  }

  /** ảnh vừa khung (giữ tỉ lệ). Thiếu ảnh → khung giữ chỗ ghi tên id. Trả khung thật của ảnh. */
  pic(name: string, id: string | undefined, x: number, y: number, w: number, h: number, valign: 'middle' | 'bottom' = 'middle'): { x: number; y: number; w: number; h: number } {
    if (id === undefined) { this.skipped.add(name); return { x, y, w, h }; }
    const im = this.img(id);
    if (!im) {
      this.box(name, id && id !== CHUA_CHON ? `[hình: ${id}]` : '[chưa chọn hình]', { x, y, w, h, fill: 'FFFFFF', line: 'BDBDBD', lw: 2, dash: true, color: '8D8D8D', size: 14, transparency: 30 });
      return { x, y, w, h };
    }
    let pw = w, ph = (w * im.h) / im.w;
    if (ph > h) { ph = h; pw = (h * im.w) / im.h; }
    const px = x + (w - pw) / 2;
    const py = valign === 'bottom' ? y + h - ph : y + (h - ph) / 2;
    this.s.addImage({ data: im.data, x: px, y: py, w: pw, h: ph, objectName: this.uniq(name), altText: id ?? name });
    return { x: px, y: py, w: pw, h: ph };
  }

  /** dải tiêu đề vàng + linh vật (assets.nhanVat) — tự bay vào */
  ribbon(title: string, o: { size?: number; badge?: string } = {}): void {
    const hasMascot = !!this.spec.assets?.nhanVat;
    const rx = 3.0, rw = 7.33;
    const size = o.size ?? autoSize(title, rw - 0.6, 0.85, 36, 18, true);
    this.box('ribbon', [{ text: title, options: { fontFace: FONT, fontSize: size, color: C.white } }], {
      x: rx, y: 0.25, w: rw, h: 1.1, fill: C.gold, line: C.white, lw: 4, shape: 'pill', font: FONT, shadow: true, outline: C.brown,
    });
    this.fx.push({ n: 'ribbon', e: 'flyT', d: 0, t: 1000 });
    if (hasMascot) {
      this.pic('mascot', this.spec.assets?.nhanVat, 1.55, 0.02, 1.5, 1.5);
      this.fx.push({ n: 'mascot', e: 'spin', d: 600, t: 800, l: 'wiggle', lo: { amp: 300000, t: 450 } });
    }
    if (o.badge) {
      this.box('badge', [{ text: o.badge, options: { fontFace: FONT, fontSize: 22, color: C.white } }], {
        x: 10.75, y: 0.38, w: 2.2, h: 0.8, fill: C.red, line: C.white, lw: 3, shape: 'pill', font: FONT, shadow: true,
      });
      this.fx.push({ n: 'badge', e: 'pop', d: 900, t: 600 });
    }
  }

  /** Nhạc: shape `bgmusic` + "tới" = phát, "tới" = dừng (luôn đặt SAU hình). Gọi cuối hàm layout. */
  addMusic(): void {
    if (!this.music || !this.musicData) return;
    const cover = 'data:image/png;base64,' + toBase64(musicIconPng());
    this.s.addMedia({ type: 'audio', data: this.musicData, extn: 'mp3', x: 12.4, y: 6.75, w: 0.6, h: 0.6, cover, objectName: 'bgmusic' });
    this.names.add('bgmusic');
    this.fx.push({ cmd: 'playMusic', c: true }, { cmd: 'stopMusic', c: true });
  }

  /** đẩy hiệu ứng vào cho nhiều shape cùng lúc */
  add(...f: Fx[]): void { this.fx.push(...f.filter(e => !(e.n && this.skipped.has(e.n)))); }
}

/** chia đều n ô theo chiều ngang trong [x0, x1] */
export function columns(n: number, x0: number, x1: number, gap: number): { x: number; w: number }[] {
  const w = (x1 - x0 - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w }));
}

/** xoay vòng 1 bước nếu không có thứ tự riêng (đảm bảo không trùng vị trí gốc) */
export function permutation(n: number, given?: number[]): number[] {
  if (given && given.length === n && new Set(given).size === n && given.every(v => v >= 0 && v < n)) return given;
  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

export type LayoutFn<T> = (ctx: Ctx, spec: T) => void;
