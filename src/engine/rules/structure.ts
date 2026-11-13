/**
 * Luật cấu trúc bài soạn (file "CM MNVC-CẤU TRÚC BÀI SOẠN") + đủ HĐ 1/2/3, HĐ 3 không trống,
 * cột trẻ có nội dung, cuối ngày đủ Nêu gương – Vệ sinh – Trả trẻ (Lưu ý số 6).
 */
import { THU_TEN, norm } from '../text';
import { Issue, ParsedDoc, Section } from '../types';

type Kind = 'the-duc' | 'truyen' | 'tho' | 'tao-hinh' | 'am-nhac' | 'kham-pha' | 'lqvt' | 'lqcc' | 'lao-dong' | 've-sinh' | 'van-nghe' | 'cung-co' | 'tcdg' | 'dong-dao' | 'goc' | 'khac';

export function classify(ten: string): Kind {
  const t = norm(ten);
  if (/góc/.test(t)) return 'goc';
  if (/văn nghệ/.test(t)) return 'van-nghe';
  if (/củng cố|^ôn |ôn bài|ôn chữ|ôn hát/.test(t)) return 'cung-co';
  if (/hđlđ|lao động/.test(t)) return 'lao-dong';
  if (/hđvs/.test(t)) return 've-sinh';
  if (/trò chơi dân gian|dạy trẻ chơi/.test(t)) return 'tcdg';
  if (/đồng dao|ca dao/.test(t)) return 'dong-dao';
  if (/thể dục|pttc/.test(t)) return 'the-duc';
  if (/truyện/.test(t)) return 'truyen';
  if (/thơ|vè /.test(t)) return 'tho';
  if (/tạo hình/.test(t)) return 'tao-hinh';
  if (/âm nhạc|dạy hát|dạy vận động/.test(t)) return 'am-nhac';
  if (/kpxh|kpkh|khám phá/.test(t)) return 'kham-pha';
  if (/lqvt|làm quen với toán/.test(t)) return 'lqvt';
  if (/lqcc|chữ cái|làm quen chữ|tập đồ/.test(t)) return 'lqcc';
  return 'khac';
}

/** các phần bắt buộc theo cấu trúc bài soạn (mỗi phần: một trong các cách viết) */
const REQUIRED: Partial<Record<Kind, [string, string[]][]>> = {
  'the-duc': [['Khởi động', ['khởi động']], ['Trọng động', ['trọng động']], ['BTPTC', ['btptc', 'bài tập phát triển chung']],
    ['VĐCB', ['vđcb', 'vận động cơ bản']], ['TCVĐ', ['tcvđ', 'trò chơi vận động']], ['Hồi tĩnh', ['hồi tĩnh']]],
  truyen: [['Cô kể lần 1', ['kể lần 1', 'kể lần một', 'kể chuyện lần 1']], ['Cô kể lần 2', ['kể lần 2', 'kể lần hai']], ['Củng cố (lần 3)', ['củng cố', 'lần 3']]],
  tho: [['Cô đọc thơ', ['cô đọc', 'đọc thơ', 'đọc lần 1']], ['Trẻ đọc thơ', ['trẻ đọc']], ['Củng cố', ['củng cố']]],
  'tao-hinh': [['Quan sát tranh/mẫu', ['quan sát']], ['Trẻ thực hiện', ['trẻ thực hiện']], ['Trưng bày sản phẩm', ['trưng bày']]],
  'am-nhac': [['Ca hát', ['ca hát', 'dạy hát', 'hát']], ['Vận động', ['vận động']], ['Nghe hát (hoặc trò chơi)', ['nghe hát', 'nghe cô hát', 'trò chơi']]],
  'kham-pha': [['a. Quan sát + đàm thoại', ['quan sát']], ['b. Luyện tập (chơi các trò chơi)', ['luyện tập']]],
  lqvt: [['Ôn bài cũ', ['ôn']], ['Luyện tập củng cố', ['luyện tập', 'củng cố']]],
};
const NEED_SUMMARY: Kind[] = ['truyen', 'tho', 'am-nhac'];

const RE_HD3_EMPTY = /^3\s*\.\s*(hđ\s*3\s*:?\s*)?kết thúc\s*[:.]?\s*$/i;

function checkSection(thu: string, s: Section, out: Issue[]) {
  const where = `${thu} – ${s.buoi}`;
  const add = (i: Omit<Issue, 'source' | 'where'> & { where?: string }) => out.push({ where, ...i, source: 'luat' });
  const co = s.co.map(l => l.trim());
  const coText = norm(co.join(' '));
  const kind = classify(s.ten);
  if (!coText) return; // buổi chỉ có tên (vd "Chơi ở các góc") – không soạn tiến hành

  for (const [n, re] of [[1, /hđ\s*1/], [2, /hđ\s*2/], [3, /hđ\s*3|kết thúc/]] as const)
    if (!re.test(coText)) add({ rule: 'cau-truc.hd', level: s.buoi === 'sáng' ? 'nang' : 'xem', where: `${where} – Hoạt động của cô`, message: `Thiếu “${n}. HĐ ${n}”.` });

  // HĐ 3 để trống
  const nonEmptyIdx = co.map((l, i) => (l ? i : -1)).filter(i => i >= 0);
  const lastIdx = nonEmptyIdx[nonEmptyIdx.length - 1];
  const hd3 = co.findIndex(l => RE_HD3_EMPTY.test(l));
  if (hd3 >= 0 && hd3 === lastIdx)
    add({ rule: 'cau-truc.hd3-trong', level: 'xem', where: `${where} – Hoạt động của cô`, found: co[hd3], message: 'HĐ 3: Kết thúc đang để trống, chưa có nội dung (vd “Trẻ ra chơi”, “Chuyển hoạt động”).' });
  const k3 = co.find(l => /^3\s*\.\s*kết thúc/i.test(l));
  if (k3) add({ rule: 'cau-truc.hd3-ten', level: 'chinh-ta', where: `${where} – Hoạt động của cô`, found: k3, message: 'Mẫu ghi “3. HĐ 3: Kết thúc”.', fix: k3.replace(/^3\s*\.\s*/, '3. HĐ 3: ') });

  for (const [label, alts] of REQUIRED[kind] ?? []) {
    if (alts.some(a => coText.includes(a))) continue;
    if (kind === 'kham-pha' && label.startsWith('b.') && coText.includes('củng cố')) {
      add({ rule: 'cau-truc.muc', level: 'xem', where: `${where} – Hoạt động của cô`, found: co.find(l => /củng cố/i.test(l)), message: 'Cấu trúc bài soạn (Khám phá) ghi “b. Luyện tập (chơi các TC)”, file đang ghi “Củng cố”.', fix: 'b. Luyện tập:' });
      continue;
    }
    add({ rule: 'cau-truc.muc', level: s.buoi === 'sáng' ? 'nang' : 'xem', where: `${where} – Hoạt động của cô`, message: `Theo cấu trúc bài soạn (${s.ten}), còn thiếu phần “${label}”.` });
  }
  if (NEED_SUMMARY.includes(kind) && !/tóm tắt|nói nd|nội dung/.test(coText))
    add({ rule: 'cau-truc.tom-tat', level: 'xem', where: `${where} – Hoạt động của cô`, message: 'Tiết âm nhạc, thơ, truyện cần tóm tắt nội dung (lưu ý trong cấu trúc bài soạn).' });

  if (!s.tre.some(l => l.trim()))
    add({ rule: 'cau-truc.cot-tre', level: 'xem', where: `${where} – Hoạt động của trẻ`, message: 'Cột “Hoạt động của trẻ” đang trống.' });
  if (!s.md.some(l => l.trim()))
    add({ rule: 'cau-truc.md', level: 'xem', where: `${where} – Mục đích yêu cầu`, message: 'Chưa có mục đích yêu cầu.' });
  else for (const part of ['kiến thức', 'kỹ năng|kĩ năng', 'thái độ'])
    if (!new RegExp(part).test(norm(s.md.join(' '))))
      add({ rule: 'cau-truc.md', level: 'xem', where: `${where} – Mục đích yêu cầu`, message: `Mục đích yêu cầu thiếu phần “${part.split('|')[0]}”.` });
  if (!s.cb.some(l => l.trim()))
    add({ rule: 'cau-truc.cb', level: 'xem', where: `${where} – Chuẩn bị`, message: 'Chưa có phần chuẩn bị.' });
}

export function checkStructure(p: ParsedDoc): Issue[] {
  const out: Issue[] = [];
  if (p.kind === 'kh-ngay') {
    const digit = p.days.filter(d => /thứ\s*\d/i.test(d.thu)), word = p.days.filter(d => !/thứ\s*\d/i.test(d.thu));
    if (digit.length && word.length)
      out.push({ rule: 'trinh-bay.ten-thu', level: 'chinh-ta', where: 'Tên các ngày', source: 'luat', found: digit.map(d => d.thu).join(', '),
        message: 'Tên thứ ghi chưa thống nhất: chỗ ghi chữ (Thứ hai, Thứ ba), chỗ ghi số.', fix: digit.map(d => THU_TEN[d.thuSo]).join(', ') });
    for (const d of p.days) {
      const thu = THU_TEN[d.thuSo] || d.thu;
      checkSection(thu, d.sang, out);
      checkSection(thu, d.chieu, out);
      const c0 = norm(d.col0.join(' '));
      for (const [need, label] of [['vệ sinh', 'Vệ sinh'], ['trả trẻ', 'Trả trẻ']] as const)
        if (!c0.includes(need)) out.push({ rule: 'quy-dinh.cuoi-ngay', level: 'xem', where: `${thu} – chiều`, source: 'luat', message: `Cuối ngày chưa ghi “${label}” (Lưu ý số 6: ghi đủ Nêu gương – Vệ sinh – Trả trẻ).` });
      if (d.thuSo !== 6 && !c0.includes('nêu gương'))
        out.push({ rule: 'quy-dinh.cuoi-ngay', level: 'xem', where: `${thu} – chiều`, source: 'luat', message: 'Cuối ngày chưa ghi “Nêu gương”.' });
    }
  }
  if (p.kind === 'kh-tuan' && p.week) {
    for (const [label, lines] of [['Đón trẻ – trò chuyện', p.week.donTre], ['Thể dục sáng', p.week.theDucSang], ['Hoạt động ngoài trời', p.week.ngoaiTroi], ['Hoạt động góc', p.week.goc]] as const) {
      const t = norm(lines.join(' '));
      if (!t) { out.push({ rule: 'cau-truc.tuan', level: 'nang', where: label, source: 'luat', message: 'Ô này đang trống.' }); continue; }
      for (const [need, name] of [['nội dung', '1. Nội dung'], ['mục đích', '2. Mục đích yêu cầu'], ['chuẩn bị', '3. Chuẩn bị'], ['tiến hành', '4. Cách tiến hành']] as const)
        if (!t.includes(need)) out.push({ rule: 'cau-truc.tuan', level: 'xem', where: label, source: 'luat', message: `Thiếu mục “${name}”.` });
    }
  }
  return out;
}
