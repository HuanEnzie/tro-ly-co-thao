/**
 * Máy soạn: chương trình + file mẫu (+ giáo án cũ + AI) → file .docx mới.
 * Thứ tự nguồn cho từng buổi: giáo án cũ cùng đề tài (chép nguyên) → AI (qua cleanDraft + bộ kiểm cấu trúc) → khung luật (cô điền chỗ tô vàng).
 */
import type { Program } from '../engine/types';
import { draftLesson } from './ai';
import { WeekBlocks, fillKhNgay, fillKhTuan } from './fill';
import { findReference, indexReferences } from './reference';
import { baiKhung, weekFrame } from './rules';
import type { ComposeRequest, ComposeResult, DayContent, GenerateFn, LessonDraft, NguonBai, SlotContent, SlotFrame } from './types';

export interface ComposeOptions {
  /** hàm gọi AI; không truyền = không dùng AI (buổi không có giáo án cũ sẽ dùng khung luật) */
  generate?: GenerateFn;
  /** tên các file trong req.thamKhao (để ghi nguồn chép) */
  tenThamKhao?: string[];
  /** 4 khối cả tuần của KH tuần (nếu đã có) */
  khoiTuan?: WeekBlocks;
}

export async function compose(req: ComposeRequest, prog: Program, opts: ComposeOptions = {}): Promise<ComposeResult> {
  const frame = weekFrame(prog, req.tuan, req.loai === 'kh-ngay' ? req.ngay : undefined);
  const refs = await indexReferences(req.thamKhao ?? [], opts.tenThamKhao);
  const nguon: Record<NguonBai, number> = { 'tham-khao': 0, ai: 0, khung: 0 };
  const canQuyet = [...frame.canQuyet];
  const days: DayContent[] = [];

  const lam = async (sf: SlotFrame, thu: number, label: string): Promise<SlotContent> => {
    if (!sf.coBaiSoan || req.loai === 'kh-tuan') return { frame: sf, bai: null };
    let bai: LessonDraft;
    const ref = findReference(refs, sf, thu);
    if (ref) {
      bai = ref.draft;
      if (ref.gan) canQuyet.push(`${label}: chép từ giáo án cũ có tên gần giống (${ref.from}), cô đối chiếu.`);
    } else if (opts.generate) {
      const r = await draftLesson({ tuan: req.tuan, thu, nhanh: frame.nhanh, frame: sf }, opts.generate);
      bai = r.draft;
      if (!r.fromAi) canQuyet.push(`${label}: AI chưa soạn được, đã dùng khung của tổ (${r.problems.join('; ') || 'không rõ lý do'}).`);
    } else bai = baiKhung(sf, thu);
    nguon[bai.nguon ?? 'khung']++;
    if (bai.nguon === 'khung') canQuyet.push(`${label} (${sf.ten}): mới có khung, cô điền các chỗ tô vàng.`);
    if (bai.nguon === 'ai') canQuyet.push(`${label} (${sf.ten}): do AI soạn, cô đọc lại; chỗ nội dung truyện/thơ/bài hát phải đối chiếu nguyên tác.`);
    return { frame: sf, bai };
  };

  for (const d of frame.days) {
    const sang = await lam(d.sang, d.thu, `${d.thuTen} sáng`);
    const chieu = await lam(d.chieu, d.thu, `${d.thuTen} chiều`);
    days.push({ frame: d, sang, chieu });
  }
  const filled = req.loai === 'kh-ngay'
    ? await fillKhNgay(req.mau, frame, days)
    : await fillKhTuan(req.mau, frame, days, opts.khoiTuan);
  return { docx: filled.docx, frame, days, canQuyet: [...canQuyet, ...filled.warnings], nguon };
}
