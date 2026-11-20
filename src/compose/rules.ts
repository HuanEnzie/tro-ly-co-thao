/**
 * Phần LUẬT của máy soạn (không AI): từ chương trình + số tuần sinh ra khung chắc chắn —
 * thứ/ngày, tên đề tài, nhánh, HĐLĐ (tuần chẵn) / HĐVS (tuần lẻ), cuối ngày, khung HĐ 1/2/3 theo loại tiết.
 * Khung HĐ theo đúng src/engine/rules/structure.ts yêu cầu. Chỗ cần nội dung riêng ghi "[Cô điền: …]"
 * (tô vàng khi ghi ra file) — không bịa nội dung truyện, thơ, bài hát.
 */
import { classify } from '../engine/rules/structure';
import { isRoutineLine, programWeek } from '../engine/rules/program';
import { THU_TEN, expectedYear, norm } from '../engine/text';
import type { Program } from '../engine/types';
import type { Buoi, DayFrame, LessonStep, NameLine, SlotFrame, Thu, WeekFrame } from './types';

export type Kind = ReturnType<typeof classify>;
export const THU_LIST: Thu[] = [2, 3, 4, 5, 6];

/** chỗ cô phải tự điền */
export const cd = (s: string) => `[Cô điền: ${s}]`;
export const RE_CHO_DIEN = /\[Cô (?:điền|đối chiếu)[^\]]*\]/g;
export const HAS_CHO_DIEN = /\[Cô (?:điền|đối chiếu)[^\]]*\]/;

// ---------- ngày tháng
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/** "(từ  23/11 đến 27/11/ 2026)" -> ngày đầu tuần (thứ hai); năm theo năm học 2026–2027 */
export function startOfWeek(khoang: string): Date | null {
  const m = khoang.match(/từ\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
  if (!m) return null;
  return new Date(Date.UTC(expectedYear(+m[2]), +m[2] - 1, +m[1]));
}
export const dateOf = (start: Date, thu: number) => fmt(new Date(start.getTime() + (thu - 2) * 86400000));

// ---------- tách tên hoạt động từ ô chương trình
/** bỏ gạch đầu dòng, gộp khoảng trắng, sửa khoảng trắng quanh dấu hai chấm (chỉ trình bày, không đổi chữ) */
const clean = (l: string) => l.replace(/^[\s\-+*•]+/, '').replace(/\s+/g, ' ').replace(/\s+:/g, ':').replace(/:(?=[\p{L}“‘])/gu, ': ').trim();

/** "PTNN: Văn học: Thơ: Vè nghề nghiệp" -> [“PTNN: Văn học:” đậm, “Thơ: Vè nghề nghiệp”] */
export function splitName(text: string): NameLine[] {
  const m = text.match(/^(PT[A-Z]{2,3}\s*:\s*[^:]+:)\s*(.+)$/);
  return m ? [{ text: m[1].replace(/\s*:\s*/g, ': ').replace(/: $/, ':'), bold: true }, { text: m[2], bold: false }] : [{ text, bold: false }];
}

const PREFIX = /^(?:(?:PT[A-Z]{2,3}|Thể dục|Văn học|Tạo hình|Âm nhạc|KPXH|KPKH|LQVT|LQCC|Củng cố kiến thức|HĐLĐ|HĐVS)\s*:\s*)+/i;
export function deTaiOf(ten: string): string {
  const s = ten.replace(PREFIX, '').trim();
  return s || ten;
}

/** tên cốt lõi dùng trong câu của cô: bỏ “Dạy hát”, “Dạy trẻ đọc ca dao”… và dấu ngoặc kép lệch */
export function coreOf(deTai: string): string {
  return deTai
    .replace(/^(dạy hát|dạy vận động|ôn hát|ôn vận động|dạy trẻ (?:đọc|chơi)(?: trò chơi dân gian| ca dao| đồng dao)?|trò chơi dân gian|ca dao|đồng dao)\s*:?\s*/i, '')
    .replace(/[“”"‘’]/g, '').replace(/[.\s]+$/, '').trim() || deTai;
}

export function slotFrame(buoi: Buoi, raw: string): SlotFrame {
  const lines = raw.split('\n').map(clean).filter(Boolean);
  const loai = lines.find(l => /^loại\s*tiết/i.test(l)) ?? '';
  const names = lines.filter(l => !/^loại\s*tiết/i.test(l) && !isRoutineLine(l) && !/^nêu gương\s*[-–]\s*vệ sinh/i.test(l));
  const tenLines: NameLine[] = names.flatMap((l, i) => (i === 0 && buoi === 'sáng' ? splitName(l) : [{ text: l.replace(/\s*\+\s*/g, ' + '), bold: false }]));
  const ten = tenLines.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim();
  const kind = classify(ten);
  return { buoi, raw, tenLines, ten, tenDeTai: deTaiOf(ten), loaiTiet: loai.replace(/\.$/, ''), kind, coBaiSoan: !!ten && kind !== 'goc' };
}

/** loại hoạt động chiều mà tuần chẵn/lẻ phải có (Lưu ý số 5) */
export const hdTuan = (tuan: number) => (tuan % 2 === 0 ? 'HĐLĐ' : 'HĐVS');

/** khung cả tuần từ chương trình; ném lỗi nếu chương trình không có tuần đó */
export function weekFrame(prog: Program, tuan: number, thuChon?: Thu[]): WeekFrame {
  const w = programWeek(prog, tuan);
  if (!w) throw new Error(`Chương trình không có tuần ${tuan}.`);
  const start = startOfWeek(w.khoang);
  if (!start) throw new Error(`Chương trình tuần ${tuan} không ghi ngày (“từ … đến …”).`);
  const canQuyet: string[] = [];
  const days: DayFrame[] = [];
  const want = hdTuan(tuan), wrong = want === 'HĐLĐ' ? 'HĐVS' : 'HĐLĐ';
  for (const thu of THU_LIST) {
    if (thuChon && !thuChon.includes(thu)) continue;
    const p = w.days[thu];
    if (!p) { canQuyet.push(`Chương trình tuần ${tuan} thiếu ${THU_TEN[thu].toLowerCase()}.`); continue; }
    const sang = slotFrame('sáng', p.sang), chieu = slotFrame('chiều', p.chieu);
    for (const s of [sang, chieu]) {
      const open = (s.raw.match(/[“‘]/g) ?? []).length, close = (s.raw.match(/[”’]/g) ?? []).length;
      if (open !== close) canQuyet.push(`${THU_TEN[thu]} ${s.buoi}: dấu ngoặc kép trong chương trình lệch (“${s.ten}”). Giữ nguyên như chương trình.`);
    }
    if (!sang.ten) canQuyet.push(`${THU_TEN[thu]} sáng: chương trình chưa ghi tên hoạt động.`);
    if (new RegExp(wrong, 'i').test(chieu.ten)) canQuyet.push(`${THU_TEN[thu]} chiều: chương trình ghi ${wrong} nhưng tuần ${tuan} là tuần ${tuan % 2 ? 'lẻ (HĐVS)' : 'chẵn (HĐLĐ)'}.`);
    const cuoiNgay = [...(/nêu gương/i.test(chieu.ten) ? [] : [thu === 6 ? '- Nêu gương cuối tuần' : '- Nêu gương']), '- Vệ sinh - Trả trẻ'];
    days.push({ thu, thuTen: THU_TEN[thu], ngay: dateOf(start, thu), sang, chieu, cuoiNgay });
  }
  const t3 = days.find(d => d.thu === 3);
  if (t3 && !new RegExp(want, 'i').test(t3.chieu.ten)) canQuyet.push(`Tuần ${tuan} là tuần ${tuan % 2 ? 'lẻ' : 'chẵn'}: thứ ba chiều nên có ${want}, chương trình ghi “${t3.chieu.ten}”.`);
  return { tuan, nhanh: w.nhanh.trim(), tuNgay: fmt(start), denNgay: fmt(new Date(start.getTime() + 4 * 86400000)), tuanChan: tuan % 2 === 0, days, canQuyet };
}

// ---------- gợi ý câu cho trẻ ngang hàng câu của cô (kế hoạch mục 4)
export function suggestTre(coLine: string): string {
  const t = coLine.trim();
  if (/^\+/.test(t)) return '';               // ý nhỏ trong mục đàm thoại, đã có dòng "Trẻ trả lời" ở trên
  const s = norm(t.replace(/^[-+*\s]+/, ''));
  if (!s) return '';
  if (/\?\s*$/.test(t) || /^(cô hỏi|hỏi trẻ|con thấy|đàm thoại|trò chuyện)/.test(s)) return '- Trẻ trả lời';
  if (/^(cô )?(làm mẫu|cho trẻ quan sát|cho trẻ xem|trẻ quan sát|xem )/.test(s)) return '- Trẻ quan sát';
  if (/^cô (cho trẻ )?(hát|kể|đọc|khái quát|nhận xét|tóm|giới thiệu|nói cách|giải thích|phân tích)|cho trẻ nghe|^cô nói|^tóm tắt|^giáo dục/.test(s)) return '- Trẻ lắng nghe';
  if (/(cho trẻ|mời trẻ) (hát|cùng hát)|trẻ hát/.test(s)) return '- Trẻ hát';
  if (/(cho trẻ|mời trẻ|dạy trẻ) đọc|trẻ đọc/.test(s)) return '- Trẻ đọc';
  if (/(cho trẻ|mời trẻ) (vận động|tập|đi|chạy|bật|múa)|trẻ (tập|đi|chạy|bật)/.test(s)) return '- Trẻ vận động';
  if (/thi đua/.test(s)) return '- Trẻ thi đua';
  if (/(cho trẻ|mời trẻ|tổ chức|cô cho).*(chơi|trò chơi)/.test(s)) return '- Trẻ chơi';
  if (/(cho trẻ|mời trẻ|tổ chức).*(thực hiện|trưng bày|nhận xét)/.test(s)) return '- Trẻ thực hiện';
  if (/^(củng cố|cô và trẻ|cô cùng trẻ)/.test(s)) return '- Trẻ thực hiện';
  return '';
}

// ---------- khung HĐ 1/2/3 theo loại tiết
export interface Khung { md: string[]; cb: string[]; steps: LessonStep[] }

const st = (phan: string, co: string[] = [], tre: string[] = co.map(suggestTre)): LessonStep => ({ phan, co, tre });
const MD = (extra = '') => [
  `- Kiến thức: ${cd('Trẻ biết … ' + extra)}`,
  `- Kỹ năng: ${cd('Rèn kỹ năng …')}`,
  `- Thái độ: ${cd('Trẻ hứng thú, …')}`,
];
const CB = (co: string[] = [], tre: string[] = []) => ['* ĐD của cô:', ...(co.length ? co : [`- ${cd('đồ dùng, bài giảng điện tử…')}`]), '* ĐD của trẻ:', ...(tre.length ? tre : ['- Chỗ ngồi hợp lý.', '- Trang phục gọn gàng.'])];
const HD1 = (c = `- ${cd('hát/trò chuyện dẫn dắt vào bài')}`) => st('1. HĐ 1: Gây hứng thú:', [c], ['- Trẻ hát, trò chuyện']);
const HD2 = () => st('2. HĐ 2: Bài mới:');
const HD3 = (c = 'Cô nhận xét, khen trẻ; chuyển hoạt động.', t = '- Trẻ ra chơi') => st('3. HĐ 3: Kết thúc:', [/^[-+*]/.test(c) ? c : `- ${c}`], [t]);

/** "Dạy hát Bác đưa thư vui tính" -> "Bác đưa thư vui tính" */
export function songName(deTai: string): string {
  return coreOf(deTai.replace(/^(nghe hát|hát|vận động)\s*:?\s*/i, ''));
}

export function khungTiet(kind: Kind, deTai: string): Khung {
  const core = coreOf(deTai);
  const q = `“${core}”`;
  switch (kind) {
    case 'the-duc':
      return {
        md: MD(`thực hiện vận động ${q}`),
        cb: CB(['- Sân tập sạch sẽ, bằng phẳng.', `- ${cd('nhạc bài hát, dụng cụ tập')}`], ['- Trang phục gọn gàng.']),
        steps: [
          st('1. HĐ 1: Gây hứng thú:', ['- Kiểm tra sức khỏe của trẻ, trò chuyện dẫn dắt vào bài tập.'], ['- Trẻ trả lời']),
          HD2(),
          st('a. Khởi động', ['Cho trẻ đi vòng tròn kết hợp các kiểu đi, chạy theo hiệu lệnh, về 3 hàng ngang.'], ['- Trẻ đi các kiểu đi']),
          st('b. Trọng động', [
            `* BTPTC: Cả lớp tập các động tác tay, chân, bụng, bật ${cd('theo nhạc bài hát nào')}.`,
            '* VĐCB:',
            `- Cô giới thiệu tên vận động ${q}.`,
            '- Cô làm mẫu lần 1 không phân tích.',
            `- Cô làm mẫu lần 2 + phân tích: ${cd('TTCB, cách thực hiện, kết thúc')}`,
            '- Cô mời 1 – 2 trẻ khá lên thực hiện mẫu.',
            '- Trẻ thực hiện:',
            '+ Cho trẻ lần lượt lên thực hiện, cô bao quát, sửa sai cho trẻ.',
            '- Củng cố: Cho 1, 2 trẻ thực hiện và nói lại tên bài tập.',
            `* TCVĐ: ${cd('tên trò chơi, cách chơi, luật chơi')}`,
          ], ['- Trẻ tập bài tập', '', '- Trẻ lắng nghe', '- Trẻ quan sát', '- Trẻ quan sát, lắng nghe', '- Trẻ thực hiện mẫu', '', '- Trẻ thực hiện', '- Trẻ nói tên bài tập', '- Trẻ chơi trò chơi']),
          st('c. Hồi tĩnh:', ['- Đi lại nhẹ nhàng.'], ['- Trẻ đi nhẹ nhàng']),
          HD3('Cô nhận xét, khen trẻ.', '- Trẻ ra chơi'),
        ],
      };
    case 'truyen':
      return {
        md: MD(`nhớ tên truyện ${q}, tên các nhân vật, hiểu nội dung truyện`),
        cb: CB(['- Bài giảng điện tử.', '- Tranh minh họa truyện.', `- Video truyện ${q}.`]),
        steps: [
          HD1(),
          HD2(),
          st('a. Cô kể lần 1 – Đàm thoại:', ['- Cô kể diễn cảm kết hợp cử chỉ, điệu bộ.', `- Hỏi trẻ: ${cd('câu hỏi về tên truyện, nhân vật')}`], ['- Trẻ lắng nghe', '- Trẻ trả lời']),
          st('b. Cô kể lần 2 – Đàm thoại:', [
            '- Cô kể kết hợp tranh minh họa trên bài giảng điện tử.',
            `- Tóm tắt nội dung: ${cd('tóm tắt đúng nội dung truyện ' + q + ' – cô đối chiếu với sách')}`,
            '- Đàm thoại:',
            `+ ${cd('câu hỏi đàm thoại theo nội dung truyện')}`,
            `* Giáo dục trẻ ${cd('ý nghĩa của truyện')}`,
          ], ['- Trẻ quan sát, lắng nghe', '- Trẻ lắng nghe', '- Trẻ trả lời', '', '']),
          st('c. Củng cố (lần 3):', [`- Cho trẻ xem video truyện ${q}.`], ['- Trẻ xem video']),
          HD3('Ra chơi.'),
        ],
      };
    case 'tho':
      return {
        md: MD(`thuộc và đọc diễn cảm bài thơ ${q}`),
        cb: CB(['- Bài giảng điện tử.', `- Tranh minh họa bài thơ ${q}.`]),
        steps: [
          HD1(),
          HD2(),
          st('a. Cô đọc thơ lần 1:', [`- Cô giới thiệu tên bài thơ ${q}, tác giả ${cd('tên tác giả')}; cô đọc diễn cảm.`], ['- Trẻ lắng nghe']),
          st('b. Cô đọc lần 2 – Tóm tắt nội dung – Đàm thoại:', [
            `- Cô đọc kết hợp tranh minh họa; tóm tắt nội dung: ${cd('nội dung bài thơ – cô đối chiếu với bản gốc')}`,
            '- Đàm thoại:',
            `+ ${cd('câu hỏi đàm thoại theo nội dung bài thơ')}`,
          ], ['- Trẻ quan sát, lắng nghe', '- Trẻ trả lời', '']),
          st('c. Trẻ đọc thơ:', ['- Cô cho cả lớp, tổ, nhóm, cá nhân trẻ đọc thơ cùng cô.', '- Cô chú ý sửa sai, khuyến khích trẻ đọc diễn cảm.'], ['- Trẻ đọc thơ', '- Trẻ đọc thơ']),
          st('d. Củng cố:', ['- Cho trẻ đọc lại bài thơ theo hình thức khác (đọc theo tranh, đọc nối câu).'], ['- Trẻ đọc thơ']),
          HD3('Cô nhận xét, khen trẻ.'),
        ],
      };
    case 'tao-hinh':
      return {
        md: MD(`thực hiện ${q}`),
        cb: CB(['- Ít nhất 3 tranh mẫu.', `- ${cd('đồ dùng cô làm mẫu')}`], ['- Giấy, bút màu, bàn ghế.', '- Trang phục gọn gàng.']),
        steps: [
          HD1(),
          HD2(),
          st('a. Quan sát tranh mẫu:', ['- Cho trẻ quan sát 3 tranh mẫu của cô.', '- Đàm thoại:', `+ ${cd('câu hỏi về nội dung, bố cục, màu sắc của tranh')}`, '- Cho trẻ nói ý tưởng:', `+ ${cd('câu hỏi gợi ý tưởng thực hiện')}`], ['- Trẻ quan sát', '- Trẻ trả lời', '', '- Trẻ nói ý tưởng', '']),
          st('b. Trẻ thực hiện:', [`- Trẻ thực hiện ${q}.`, '- Cô bao quát, giúp đỡ trẻ (nếu cần).', '- Cô nhắc nhở, khen, động viên trẻ trong quá trình thực hiện.'], ['- Trẻ thực hiện', '', '']),
          st('c. Trưng bày sản phẩm:', ['- Cho trẻ trưng bày sản phẩm, trẻ nhận xét bài của bạn, của mình; cô nhận xét, khen động viên trẻ.'], ['- Trẻ nhận xét']),
          HD3(),
        ],
      };
    case 'am-nhac': {
      const song = songName(deTai);
      return {
        md: MD(`hát/vận động bài ${q}`),
        cb: CB([`- Nhạc bài hát “${song}”.`, '- Xắc xô, đàn.'], ['- Chỗ ngồi hợp lý.', '- Trang phục gọn gàng.']),
        steps: [
          HD1(),
          HD2(),
          st('a. Ca hát:', [
            `- Cô giới thiệu tên bài hát “${song}”, nói nội dung bài hát: ${cd('tên tác giả, nội dung bài hát – cô đối chiếu')}`,
            '- Cô hát mẫu, cho trẻ nghe lại giai điệu.',
            '- Cô dạy trẻ hát (cả lớp, tổ, nhóm, cá nhân).',
          ], ['- Trẻ lắng nghe', '- Trẻ lắng nghe', '- Trẻ hát']),
          st('b. Vận động:', ['- Cô gợi ý cho trẻ vận động minh họa theo nhịp bài hát.', '- Cho trẻ vận động theo nhạc.'], ['- Trẻ vận động', '- Trẻ vận động']),
          st('c. Nghe hát / trò chơi âm nhạc:', [`- ${cd('bài hát nghe hoặc trò chơi âm nhạc')}`], ['- Trẻ lắng nghe']),
          HD3('Cô nhận xét, khen trẻ.', '- Trẻ hát, ra chơi'),
        ],
      };
    }
    case 'kham-pha':
      return {
        md: MD(`về ${q}`),
        cb: CB(['- Bài giảng điện tử, tranh ảnh, video.', `- ${cd('đồ dùng riêng của đề tài')}`]),
        steps: [
          HD1(),
          HD2(),
          st('a. Quan sát + đàm thoại:', [`- Cho trẻ quan sát ${cd('tranh/video/vật thật về đề tài')}.`, '- Đàm thoại:', `+ ${cd('câu hỏi đàm thoại')}`, `* Giáo dục trẻ ${cd('nội dung giáo dục')}`], ['- Trẻ quan sát', '- Trẻ trả lời', '', '']),
          st('b. Luyện tập (chơi các trò chơi):', [`- TC1: ${cd('tên trò chơi, cách chơi, luật chơi')}`, `- TC2: ${cd('tên trò chơi, cách chơi, luật chơi')}`], ['- Trẻ chơi trò chơi', '- Trẻ chơi trò chơi']),
          HD3('Cô nhận xét, khen trẻ.'),
        ],
      };
    case 'lqvt':
      return {
        md: MD(`về ${q}`),
        cb: CB(['- Bài giảng điện tử.', `- ${cd('đồ dùng học toán')}`], ['- Rổ đồ dùng học toán của trẻ.', '- Trang phục gọn gàng.']),
        steps: [
          st('1. HĐ 1: Gây hứng thú:', [`- Ôn bài cũ: ${cd('ôn kiến thức đã học')}`], ['- Trẻ trả lời']),
          HD2(),
          st('a. Dạy bài mới:', [`- Cô giới thiệu ${q}.`, `- ${cd('cách dạy trẻ: làm mẫu, hướng dẫn trẻ thực hiện')}`], ['- Trẻ lắng nghe', '- Trẻ thực hiện']),
          st('b. Luyện tập củng cố:', [`- ${cd('trò chơi / bài tập luyện tập')}`], ['- Trẻ chơi']),
          HD3('Cô nhận xét, khen trẻ.'),
        ],
      };
    case 'lqcc':
      return {
        md: MD(`về ${q}`),
        cb: CB(['- Bài giảng điện tử.', '- Thẻ chữ, tranh có từ.'], ['- Thẻ chữ cái, bút, vở.', '- Trang phục gọn gàng.']),
        steps: [
          HD1(),
          HD2(),
          st('a. Làm quen chữ / tập đồ chữ:', [`- ${cd('các bước: xem tranh – từ, phát âm, cấu tạo chữ, giới thiệu chữ in hoa, in thường, viết thường')}`], ['- Trẻ quan sát, phát âm']),
          st('b. Trò chơi:', [`- TC1: ${cd('trò chơi với chữ cái')}`, `- TC2: ${cd('trò chơi với chữ cái')}`], ['- Trẻ chơi trò chơi', '- Trẻ chơi trò chơi']),
          HD3('Cô nhận xét, khen trẻ.'),
        ],
      };
    case 'lao-dong':
    case 've-sinh':
      return {
        md: MD(`thực hiện ${q}`),
        cb: CB(['- GAĐT', `- ${cd('đồ dùng lao động / vệ sinh')}`], ['- Trang phục gọn gàng.']),
        steps: [
          HD1(`- Cho trẻ hát bài ${cd('bài hát phù hợp')}, trò chuyện…`),
          st(`2. HĐ 2: Bài mới: Hướng dẫn trẻ ${core.replace(/^hướng dẫn trẻ\s*/i, '').toLowerCase()}`, [
            `- Cô giới thiệu tên hoạt động ${q}.`,
            '- Cô làm mẫu lần 1.',
            `- Cô làm mẫu lần 2 và phân tích: ${cd('các bước thực hiện')}`,
            '- Cô cho trẻ lần lượt thực hiện theo tổ, cô bao quát và giúp đỡ trẻ (nếu cần).',
            '- Giáo dục trẻ có ý thức giữ gìn, gọn gàng, ngăn nắp.',
          ], ['- Trẻ lắng nghe', '- Trẻ quan sát', '- Trẻ quan sát, lắng nghe', '- Trẻ thực hiện', '- Trẻ lắng nghe']),
          HD3('Cô nhận xét, khen trẻ.', '- Trẻ hát'),
        ],
      };
    case 'tcdg':
    case 'dong-dao':
      return {
        md: MD(`chơi/đọc ${q}`),
        cb: CB([`- ${cd('đồ dùng cho trò chơi / lời đồng dao')}`]),
        steps: [
          HD1(),
          HD2(),
          st('a. Giới thiệu và dạy trẻ:', [`- Cô giới thiệu ${q}: ${cd('lời đồng dao / ca dao nguyên văn')}`, '- Cô dạy trẻ đọc (lớp, tổ, nhóm, cá nhân).'], ['- Trẻ lắng nghe', '- Trẻ đọc']),
          st('b. Tổ chức chơi:', [`- Cách chơi, luật chơi: ${cd('cách chơi, luật chơi')}`, '- Cô cùng 1 trẻ chơi mẫu.', '- Tổ chức cho trẻ chơi nhiều lần, cô bao quát, động viên trẻ.'], ['- Trẻ lắng nghe', '- Trẻ quan sát', '- Trẻ chơi']),
          HD3(),
        ],
      };
    case 'cung-co':
      return {
        md: MD(`ôn lại ${q}`),
        cb: CB([`- ${cd('đồ dùng ôn tập (nhạc, thẻ chữ…)')}`]),
        steps: [HD1(), st('2. HĐ 2: Hướng dẫn ôn tập:', [`- Tổ chức ôn ${q}: ${cd('các trò chơi/hình thức ôn')}`], ['- Trẻ thực hiện']), HD3()],
      };
    case 'van-nghe':
      return {
        md: MD('văn nghệ cuối tuần'),
        cb: CB(['- Nhạc các bài hát trẻ đã học.', '- Cờ, phiếu bé ngoan.']),
        steps: [
          st('1. HĐ 1: Gây hứng thú', ['- Trò chuyện với trẻ về các hoạt động trong tuần.'], ['- Trẻ trả lời']),
          st('2. HĐ 2: Bài mới:', [
            '* Văn nghệ cuối tuần:',
            `- Trẻ hát múa, vận động các bài hát, đọc thơ, đồng dao đã học: ${cd('tên các bài trong tuần')}`,
            '* Nêu gương:',
            '- Đọc 3 tiêu chuẩn bé ngoan/ngày.',
            '- Cho trẻ nhận xét, nêu gương bạn và mình trong ngày.',
            '- Cô nhận xét, tặng cờ cho trẻ ngoan, nhắc nhở, động viên trẻ chưa ngoan.',
            '- Nêu gương cuối tuần: trẻ bình cờ bé ngoan trong tuần; cô nhận xét, tặng bé ngoan cho trẻ đủ tiêu chuẩn.',
          ], ['', '- Trẻ hát, múa, đọc thơ', '', '- Trẻ lắng nghe', '- Trẻ nêu gương', '- Trẻ lắng nghe', '- Trẻ bình cờ']),
          HD3('Cô khen, động viên trẻ.', '- Trẻ ra chơi'),
        ],
      };
    default:
      return {
        md: MD(`về ${q}`),
        cb: CB(),
        steps: [HD1(), st('2. HĐ 2: Bài mới:', [`- ${cd('các bước tiến hành')}`], ['- Trẻ thực hiện']), HD3()],
      };
  }
}

/** bài khung (chỉ luật, chưa có nội dung riêng) cho một buổi */
export function baiKhung(frame: SlotFrame, thu: number): import('./types').LessonDraft {
  const k = khungTiet(frame.kind, frame.tenDeTai);
  return { thu, buoi: frame.buoi, loaiTiet: frame.loaiTiet, tenDeTai: frame.tenDeTai, md: k.md, cb: k.cb, steps: k.steps, nguon: 'khung' };
}
