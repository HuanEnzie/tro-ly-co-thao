/**
 * Phần AI của máy soạn: lời dặn + khuôn JSON (kiểu responseSchema của Gemini, như src/ai/system.ts)
 * để sinh LessonDraft cho MỘT hoạt động khi không có giáo án cũ.
 * Hàm gọi AI (`generate`) được truyền vào → trình duyệt/máy chủ dùng Gemini, test dùng bản giả (fake.ts).
 * Mọi kết quả AI qua cleanDraft + kiểm cấu trúc bằng chính bộ soát (checkStructure); không đạt thì thử lại 1 lần rồi dùng khung luật.
 * Không import ai/guard hay api/ để chạy được ở mọi nơi.
 */
import { checkStructure } from '../engine/rules/structure';
import type { ParsedDoc, Section } from '../engine/types';
import { HAS_CHO_DIEN, baiKhung, khungTiet, suggestTre } from './rules';
import type { GenerateFn, LessonDraft, LessonStep, SlotFrame } from './types';

export interface LessonInfo {
  tuan: number;
  thu: number;
  nhanh: string;
  frame: SlotFrame;
}

export const COMPOSE_SYSTEM = `Bạn là giáo viên mầm non lớp 5–6 tuổi, Trường Mầm non Võ Cường (Bắc Ninh), soạn phần "Cách tiến hành" cho kế hoạch ngày theo mẫu của tổ.
Cấu trúc bài soạn của tổ:
- HĐ 1 Gây hứng thú – HĐ 2 Bài mới – HĐ 3 Kết thúc.
- Thể dục: khởi động, trọng động (BTPTC, VĐCB, TCVĐ), hồi tĩnh.
- Khám phá: a. quan sát + đàm thoại, b. luyện tập (chơi các trò chơi).
- Âm nhạc: ca hát, vận động, nghe hát (hoặc trò chơi). Thơ: cô đọc, trẻ đọc, củng cố. Truyện: cô kể lần 1 – đàm thoại, lần 2 – đàm thoại, củng cố lần 3.
- Âm nhạc, thơ, truyện phải có dòng "Tóm tắt nội dung". Tạo hình: quan sát tranh/mẫu (ít nhất 3 tranh), trẻ thực hiện, trưng bày sản phẩm.

Cách viết:
- Trả về JSON đúng khuôn. "steps": danh sách các bước theo thứ tự; mỗi bước có "phan" (tiêu đề phần, vd "2. HĐ 2: Bài mới:", "a. Khởi động"), "co" (các đoạn hoạt động của cô), "tre" (các đoạn hoạt động của trẻ).
- "tre" PHẢI có đúng bằng số phần tử của "co": tre[i] là việc của trẻ ngang hàng với co[i]. Câu hỏi của cô thì trẻ "- Trẻ trả lời"; cô kể/hát/đọc/khái quát thì "- Trẻ lắng nghe"; cô làm mẫu thì "- Trẻ quan sát"; cô cho trẻ chơi/thực hiện thì "- Trẻ chơi" / "- Trẻ thực hiện". Ý nhỏ bắt đầu bằng "+" thì tre[i] = "" (đã có dòng "Trẻ trả lời" ở trên).
- Mỗi đoạn là một dòng ngắn, bắt đầu bằng "- ", "+ " hoặc "* " như mẫu; dùng ngoặc kép cong “ ”. "phan" của HĐ 3 ghi "3. HĐ 3: Kết thúc:" rồi nội dung kết thúc nằm ở "co".
- "md" gồm 3 dòng: "- Kiến thức: …", "- Kỹ năng: …", "- Thái độ: …". "cb" gồm "* ĐD của cô:", các dòng "- …", "* ĐD của trẻ:", các dòng "- …"; nếu dùng bài hát nào ở phần tiến hành thì chuẩn bị phải có "Nhạc bài hát “…”".
- Dùng ĐÚNG tên đề tài và các tiêu đề phần gợi ý trong "khung_goi_y" (có thể thêm ý, không bỏ phần nào).

Không bịa:
- KHÔNG tự viết nội dung truyện, lời thơ, lời bài hát, lời đồng dao/ca dao, tên tác giả. Những chỗ đó ghi đúng "[Cô điền: …]" để cô tự điền.
- Không dùng tên trẻ. Không viết số điện thoại hay thông tin phụ huynh.`;

export const COMPOSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    md: { type: 'ARRAY', items: { type: 'STRING' }, description: 'mục đích yêu cầu: 3 dòng Kiến thức / Kỹ năng / Thái độ' },
    cb: { type: 'ARRAY', items: { type: 'STRING' }, description: 'chuẩn bị: * ĐD của cô: … * ĐD của trẻ: …' },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          phan: { type: 'STRING', description: 'tiêu đề phần, vd "a. Khởi động"' },
          co: { type: 'ARRAY', items: { type: 'STRING' } },
          tre: { type: 'ARRAY', items: { type: 'STRING' }, description: 'đúng bằng số phần tử của co; "" nếu trẻ không có việc riêng' },
        },
        required: ['phan', 'co', 'tre'],
      },
    },
  },
  required: ['md', 'cb', 'steps'],
};

export const INPUT_MARK = 'ĐẦU VÀO:';

/** nội dung gửi cho AI (không có tên trẻ/giáo viên) */
export function buildPrompt(info: LessonInfo, loi: string[] = []): { system: string; user: string; schema: Record<string, unknown> } {
  const f = info.frame;
  const khung = khungTiet(f.kind, f.tenDeTai).steps.map(s => s.phan);
  const input = {
    tuan: info.tuan, thu: info.thu, buoi: f.buoi, chu_de_nhanh: info.nhanh,
    ten_tiet_theo_chuong_trinh: f.ten, ten_de_tai: f.tenDeTai, loai_tiet: f.loaiTiet, kieu_tiet: f.kind, khung_goi_y: khung,
  };
  const sua = loi.length ? `\n\nLần trước còn lỗi, hãy sửa:\n- ${loi.join('\n- ')}` : '';
  return { system: COMPOSE_SYSTEM, user: `${INPUT_MARK} ${JSON.stringify(input)}${sua}`, schema: COMPOSE_SCHEMA };
}

// ---------- đọc và lọc kết quả
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => (x as string).replace(/\s+/g, ' ').trim()).filter(Boolean) : []);
const curly = (s: string) => s.replace(/"([^"]+)"/g, '“$1”');

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

const NEED_CHECK = /tóm tắt nội dung|lời (?:bài hát|thơ|đồng dao|ca dao)|“[^”]*\/[^”]*”/i;

/** lọc: ép cô–trẻ cùng số đoạn, bỏ đoạn rỗng, gắn "[Cô đối chiếu]" vào chỗ AI có thể bịa nội dung văn học */
export function cleanDraft(raw: unknown, frame: SlotFrame, thu: number): { draft: LessonDraft | null; problems: string[] } {
  const problems: string[] = [];
  const o = (raw && typeof raw === 'object' ? raw : {}) as { md?: unknown; cb?: unknown; steps?: unknown };
  const md = arr(o.md).map(curly), cb = arr(o.cb).map(curly);
  const steps: LessonStep[] = [];
  const literary = ['truyen', 'tho', 'am-nhac', 'tcdg', 'dong-dao'].includes(frame.kind);
  for (const s of Array.isArray(o.steps) ? o.steps : []) {
    if (!s || typeof s !== 'object') continue;
    const x = s as { phan?: unknown; co?: unknown; tre?: unknown };
    const phan = typeof x.phan === 'string' ? curly(x.phan.replace(/\s+/g, ' ').trim()) : '';
    const coRaw = Array.isArray(x.co) ? x.co : [], treRaw = Array.isArray(x.tre) ? x.tre : [];
    const co: string[] = [], tre: string[] = [];
    coRaw.forEach((c, i) => {
      if (typeof c !== 'string' || !c.trim()) return;       // bỏ cả đoạn cô rỗng và câu trẻ đi kèm
      let line = curly(c.replace(/\s+/g, ' ').trim());
      if (literary && NEED_CHECK.test(line) && !HAS_CHO_DIEN.test(line)) line += ' [Cô đối chiếu: nội dung do máy soạn, đối chiếu nguyên tác]';
      co.push(line);
      const t = typeof treRaw[i] === 'string' ? curly((treRaw[i] as string).replace(/\s+/g, ' ').trim()) : '';
      tre.push(t || suggestTre(line));
    });
    if (treRaw.length > coRaw.length) problems.push(`Bước “${phan}”: cột trẻ nhiều hơn cột cô, đã bỏ phần thừa.`);
    if (phan || co.length) steps.push({ phan, co, tre });
  }
  if (!md.length) problems.push('Thiếu mục đích yêu cầu.');
  if (!cb.length) problems.push('Thiếu chuẩn bị.');
  if (steps.length < 3) problems.push('Quá ít bước (cần ít nhất HĐ 1, HĐ 2, HĐ 3).');
  if (problems.some(p => /^(Thiếu|Quá)/.test(p))) return { draft: null, problems };
  return { draft: { thu, buoi: frame.buoi, loaiTiet: frame.loaiTiet, tenDeTai: frame.tenDeTai, md, cb, steps, nguon: 'ai' }, problems };
}

/** chạy bộ kiểm cấu trúc của tổ trên một buổi: trả danh sách phần còn thiếu (rỗng = đạt) */
export function missingParts(d: LessonDraft, frame: SlotFrame): string[] {
  const co: string[] = [], tre: string[] = [];
  for (const s of d.steps) {
    co.push(s.phan, ...s.co);
    tre.push('', ...s.tre);
  }
  const sec: Section = { buoi: frame.buoi, tenLines: [frame.ten], ten: frame.ten, loai: d.loaiTiet, md: d.md, cb: d.cb, co, tre };
  const empty: Section = { buoi: 'chiều', tenLines: [], ten: '', loai: '', md: [], cb: [], co: [], tre: [] };
  const p: ParsedDoc = {
    kind: 'kh-ngay', title: [], tuan: null, week: null, headers: [], allLines: [], footer: [],
    days: [{ thu: 'Thứ hai', thuSo: 2, ngay: null, sang: frame.buoi === 'sáng' ? sec : empty, chieu: frame.buoi === 'chiều' ? sec : { ...empty }, col0: ['nêu gương', 'vệ sinh', 'trả trẻ'] }],
  };
  return checkStructure(p).filter(i => /^cau-truc\.(hd|muc|tom-tat|md|cb|cot-tre)/.test(i.rule)).map(i => i.message);
}

export interface DraftResult { draft: LessonDraft; problems: string[]; fromAi: boolean }

/**
 * Soạn 1 hoạt động bằng AI. Thử tối đa 2 lần (lần 2 kèm danh sách lỗi); không đạt hoặc AI lỗi → dùng khung luật
 * (nguon = 'khung', chỗ cần nội dung ghi "[Cô điền: …]").
 */
export async function draftLesson(info: LessonInfo, generate: GenerateFn): Promise<DraftResult> {
  const f = info.frame;
  let loi: string[] = [];
  for (let lan = 0; lan < 2; lan++) {
    let text: string;
    try { text = await generate(buildPrompt(info, loi)); } catch (e) { loi = [`AI không trả lời (${(e as Error).message}).`]; break; }
    const { draft, problems } = cleanDraft(parseJson(text), f, info.thu);
    if (!draft) { loi = problems; continue; }
    const thieu = missingParts(draft, f);
    if (thieu.length) { loi = thieu; continue; }
    return { draft, problems, fromAi: true };
  }
  const khung = baiKhung(f, info.thu);
  khung.ghiChu = [`AI chưa soạn được (${loi.join('; ') || 'không rõ lý do'}); dùng khung của tổ, cô điền các chỗ tô vàng.`];
  return { draft: khung, problems: loi, fromAi: false };
}
