/**
 * Dựng .pptx từ kịch bản Deck: pptxgenjs (bố cục) → JSZip (id không trùng + hiệu ứng "tới" + nhạc).
 * Chạy được trên trình duyệt và Node.
 */
import PptxGenJS from 'pptxgenjs';
import { addMotion, type SlideMotion } from './anim';
import type { AssetResolver, Deck, ResolvedAsset, SlideSpec } from './types';
import { Ctx, FONT, FONT_B, toDataUrl, type Img, type ImgMap } from './templates/common';
import { assetIds, LAYOUTS } from './templates';

export interface BuildReport {
  data: ArrayBuffer;
  /** id hình không lấy được (đã vẽ khung giữ chỗ) */
  thieuHinh: string[];
  /** id nhạc không lấy được (slide đó không có nhạc) */
  thieuNhac: string[];
  soSlide: number;
  /** mỗi slide: số hiệu ứng (kể cả lệnh nhạc) và số lần "tới" cần bấm để hiện hết */
  slides: { hieuUng: number; toi: number }[];
}

async function resolve(resolver: AssetResolver, id: string): Promise<ResolvedAsset | null> {
  try { return (await resolver(id)) ?? null; } catch { return null; }
}

/** Kiểm dữ liệu từng slide trước khi dựng; trả danh sách lỗi (rỗng = ổn). */
export function kiemTraDeck(deck: Deck): string[] {
  const loi: string[] = [];
  deck.slides.forEach((s, i) => {
    const w = `Slide ${i + 1} (${s.template})`;
    if (s.template === 'rung-chuong-vang') {
      if (s.dapAn.length === 0 && !s.dapAnMo) loi.push(`${w}: cần 3–4 đáp án hoặc dapAnMo`);
      if (s.dapAn.length > 0 && (s.dapAn.length < 3 || s.dapAn.length > 4)) loi.push(`${w}: cần 3–4 đáp án`);
      if (s.dapAn.length > 0 && s.dapAn.filter(a => a.dung).length !== 1) loi.push(`${w}: phải có đúng 1 đáp án dung:true`);
    }
    if (s.template === 'ai-nhanh-hon' && (s.lua.length < 2 || s.dung < 0 || s.dung >= s.lua.length)) loi.push(`${w}: cần 2–4 lựa chọn và vị trí đúng hợp lệ`);
    if (s.template === 'tao-hinh' && s.tranhMau.length < 3) loi.push(`${w}: cần ít nhất 3 tranh mẫu`);
    if (s.template === 'goc' && s.goc.length !== 5) loi.push(`${w}: cần đúng 5 góc`);
    if (s.template === 'ghep-doi' && (s.cap.length < 2 || s.cap.length > 5)) loi.push(`${w}: cần 2–5 cặp`);
    if (s.template === 'dem-noi-so-luong' && (s.nhom.length < 2 || s.nhom.length > 4)) loi.push(`${w}: cần 2–4 nhóm`);
    if (s.template === 'tho-truyen' && s.doan.length === 0) loi.push(`${w}: cần ít nhất 1 đoạn`);
    if (s.template === 'nhan-xet' && s.anhSanPham.length === 0) loi.push(`${w}: cần ít nhất 1 ảnh sản phẩm`);
  });
  return loi;
}

export async function buildDeckWithReport(deck: Deck, resolver: AssetResolver): Promise<BuildReport> {
  const loi = kiemTraDeck(deck);
  if (loi.length) throw new Error('Kịch bản chưa đúng:\n' + loi.join('\n'));

  // 1. lấy hình/nhạc một lần
  const imgs: ImgMap = new Map();
  const thieuHinh: string[] = [];
  for (const id of new Set(deck.slides.flatMap((s: SlideSpec) => assetIds(s)))) {
    const a = await resolve(resolver, id);
    if (!a) { imgs.set(id, null); thieuHinh.push(id); continue; }
    const im: Img = { id, data: toDataUrl(a), w: a.w || 1, h: a.h || 1 };
    imgs.set(id, im);
  }
  const musicCache = new Map<string, string | null>();
  const thieuNhac: string[] = [];
  for (const s of deck.slides) {
    const id = s.music?.id;
    if (!id || musicCache.has(id)) continue;
    const a = await resolve(resolver, id);
    if (!a) { musicCache.set(id, null); thieuNhac.push(id); continue; }
    let url = toDataUrl({ ...a, mime: a.mime ?? 'audio/mpeg' });
    if (!url.startsWith('data:audio')) url = url.replace(/^data:[^;]*/, 'data:audio/mpeg');
    musicCache.set(id, url);
  }

  // 2. bố cục
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13,333 × 7,5 inch
  pres.title = deck.title;
  pres.subject = deck.chuDe;
  if (deck.tacGia) pres.author = deck.tacGia;
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT_B };
  const motions: SlideMotion[] = [];
  deck.slides.forEach((spec, i) => {
    const s = pres.addSlide();
    const musicData = spec.music ? musicCache.get(spec.music.id) ?? undefined : undefined;
    const ctx = new Ctx(pres, s, spec, imgs, musicData);
    if (musicData) ctx.music = spec.music;
    const layout = LAYOUTS[spec.template];
    if (!layout) throw new Error(`Slide ${i + 1}: mẫu "${(spec as { template: string }).template}" không có`);
    layout(ctx, spec);
    const ghiChu = [spec.ghiChu, spec.music?.title ? `Nhạc: ${spec.music.title}` : '', 'Bấm "tới" để hiện từng phần; nhạc phát ở lần "tới" sau khi hình đã hiện.'].filter(Boolean).join('\n');
    s.addNotes(ghiChu);
    motions.push({ fx: ctx.fx, trans: 'fade', music: musicData ? { vol: spec.music?.vol ?? 0.5, once: spec.music?.once } : undefined });
  });

  // 3. xuất rồi gắn hiệu ứng
  const raw = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  const data = await addMotion(raw, motions);
  return { data, thieuHinh, thieuNhac, soSlide: deck.slides.length, slides: motions.map(m => ({ hieuUng: m.fx.length, toi: m.fx.filter(f => f.c).length })) };
}

/** buildDeck(deck, resolver) → nội dung file .pptx */
export async function buildDeck(deck: Deck, resolver: AssetResolver): Promise<ArrayBuffer> {
  return (await buildDeckWithReport(deck, resolver)).data;
}

/** Dùng trên trình duyệt để tải về */
export async function buildDeckBlob(deck: Deck, resolver: AssetResolver): Promise<Blob> {
  const data = await buildDeck(deck, resolver);
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
