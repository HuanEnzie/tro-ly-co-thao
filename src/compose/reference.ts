/**
 * Tìm nguồn tham khảo: trong các giáo án cũ (KH ngày) tìm hoạt động cùng tên đề tài rồi CHÉP nguyên
 * mục đích yêu cầu, chuẩn bị, các bước (quy tắc "chỉ chép, không sửa câu chữ").
 * So khớp tên mềm bằng compareName của bộ soát (cùng lĩnh vực, khác chữ mềm vẫn nhận nhưng ghi chú "gần đúng").
 */
import { readDocx } from '../engine/docx';
import { parseDoc } from '../engine/parse';
import { classify } from '../engine/rules/structure';
import { compareName } from '../engine/rules/program';
import { THU_TEN, nonEmpty, norm } from '../engine/text';
import type { Section } from '../engine/types';
import { suggestTre } from './rules';
import type { LessonDraft, LessonStep, SlotFrame } from './types';

export interface RefEntry { file: string; thuTen: string; buoi: 'sáng' | 'chiều'; section: Section }
export interface RefMatch { draft: LessonDraft; from: string; gan: boolean }

/** đọc các file giáo án cũ thành danh sách hoạt động (chỉ lấy KH ngày, buổi có phần tiến hành) */
export async function indexReferences(files: ArrayBuffer[], names: string[] = []): Promise<RefEntry[]> {
  const out: RefEntry[] = [];
  for (let i = 0; i < files.length; i++) {
    let parsed;
    try { parsed = parseDoc(await readDocx(files[i])); } catch { continue; }
    if (parsed.kind !== 'kh-ngay') continue;
    for (const d of parsed.days) for (const s of [d.sang, d.chieu])
      if (s.ten && nonEmpty(s.co).length) out.push({ file: names[i] ?? `giáo án tham khảo ${i + 1}`, thuTen: THU_TEN[d.thuSo] || d.thu, buoi: s.buoi, section: s });
  }
  return out;
}

const RE_HEAD = /^(?:\d\s*\.\s*HĐ\s*\d|[a-e]\s*\.\s+\S)/i;
const group = (s: string) => norm(s).match(/trả lời|lắng nghe|quan sát|hát|đọc|vận động|chơi|thi đua|thực hiện|xem|nhận xét/)?.[0] ?? '';

/** căn câu của trẻ (đọc từ giáo án cũ, căn theo dòng nhìn thấy) về từng câu của cô theo số đoạn */
export function alignTre(co: string[], tre: string[]): string[] {
  if (co.length === tre.length) return tre;
  const sug = co.map(suggestTre);
  const slots = sug.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  const out = co.map(() => '');
  if (slots.length === tre.length) { slots.forEach((i, k) => { out[i] = tre[k]; }); return out; }
  let p = 0;
  for (const i of slots) {
    if (p < tre.length && group(sug[i]) === group(tre[p])) out[i] = tre[p++];
    else out[i] = sug[i];
  }
  return out;
}

/** Section của bộ đọc -> LessonDraft (chép nguyên câu chữ) */
export function sectionToDraft(s: Section, thu: number): LessonDraft {
  const co = nonEmpty(s.co), tre = nonEmpty(s.tre);
  const contentIdx = co.map((l, i) => (RE_HEAD.test(l) ? -1 : i)).filter(i => i >= 0);
  const treAligned = alignTre(contentIdx.map(i => co[i]), tre);
  const steps: LessonStep[] = [];
  let cur: LessonStep | null = null, k = 0;
  for (let i = 0; i < co.length; i++) {
    if (RE_HEAD.test(co[i])) { cur = { phan: co[i], co: [], tre: [] }; steps.push(cur); continue; }
    if (!cur) { cur = { phan: '', co: [], tre: [] }; steps.push(cur); }
    cur.co.push(co[i]);
    cur.tre.push(treAligned[k++] ?? '');
  }
  return {
    thu, buoi: s.buoi, loaiTiet: s.loai.replace(/\.$/, ''), tenDeTai: s.ten,
    md: nonEmpty(s.md), cb: nonEmpty(s.cb), steps: steps.filter(x => x.phan || x.co.length), nguon: 'tham-khao',
  };
}

/** tìm trong giáo án cũ hoạt động cùng tên đề tài với khung; null nếu không có */
export function findReference(index: RefEntry[], frame: SlotFrame, thu: number): RefMatch | null {
  let best: { e: RefEntry; gan: boolean } | null = null;
  for (const e of index) {
    if (classify(e.section.ten) !== frame.kind) continue;
    const c = compareName(e.section.ten, frame.ten);
    if (c.level === 'ok') { best = { e, gan: false }; break; }
    if (c.level === 'xem' && !best) best = { e, gan: true };
  }
  if (!best) return null;
  const draft = sectionToDraft(best.e.section, thu);
  draft.buoi = frame.buoi;
  draft.tenDeTai = frame.tenDeTai;
  // HĐ 3 để trống trong giáo án cũ: thêm câu kết thúc chung để không bị báo thiếu (ghi chú cho cô)
  const last = draft.steps[draft.steps.length - 1];
  const empty3 = last && /^3\s*\.\s*(HĐ\s*3\s*:?\s*)?kết thúc\s*[:.]?\s*$/i.test(last.phan) && !last.co.length;
  if (empty3) { last.co.push('- Cô nhận xét, khen trẻ; chuyển hoạt động.'); last.tre.push('- Trẻ ra chơi'); }
  const from = `${best.e.file} – ${best.e.thuTen} ${best.e.buoi}`;
  draft.ghiChu = [`Chép từ giáo án cũ: ${from}${best.gan ? ' (tên gần giống, cô đối chiếu)' : ''}.`, ...(empty3 ? ['Giáo án cũ để trống HĐ 3, máy thêm câu kết thúc chung.'] : [])];
  return { draft, from, gan: best.gan };
}
