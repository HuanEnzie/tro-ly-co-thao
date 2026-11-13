/**
 * Chính tả (từ điển lỗi hay gặp của chính các cô + lỗi gõ chung) và trình bày (dấu cách, dấu câu, ngoặc kép).
 * Thêm lỗi mới: bổ sung vào DICT — mỗi dòng [cách viết sai, cách viết đúng, phân biệt hoa/thường?].
 */
import { L, clip } from '../text';
import { Issue, ParsedDoc } from '../types';

/** lỗi đã gặp thật trong giáo án lớp 5T1 (tuần 3, 11, 12) và lỗi phổ biến */
export const DICT: [string, string, boolean?][] = [
  ['dạy giỗ', 'dạy dỗ'], ['giành cho', 'dành cho'], ['tranh dành', 'tranh giành'], ['dành giật', 'giành giật'],
  ['sát thành gạo', 'xát thành gạo'], ['giỡ khoai', 'dỡ khoai'], ['mặc lạc', 'mạch lạc'], ['nghè', 'nghề'],
  ['lửa xẻ', 'lừa xẻ'], ['vân động', 'vận động'], ['qui định', 'quy định'], ['qui trình', 'quy trình'], ['qui tắc', 'quy tắc'],
  ['duy băng', 'ruy băng'], ['sắc xô', 'xắc xô'], ['ghi ghớ', 'ghi nhớ'], ['hưỡng dẫn', 'hướng dẫn'], ['máy tinh', 'máy tính'],
  ['đâu tóc', 'đầu tóc'], ['đông viên', 'động viên'], ['miề xuôi', 'miền xuôi'], ['thực hiệ', 'thực hiện'],
  ['Võ cường', 'Võ Cường', true], ['Việt nam', 'Việt Nam', true], ['việt Nam', 'Việt Nam', true], ['bắc ninh', 'Bắc Ninh', true],
  ['tỏ đó', 'tổ đó'], ['nhiều tỏ', 'nhiều tổ'], ['có con phải', 'các con phải'],
  ['dữ gìn', 'giữ gìn'], ['trả nời', 'trả lời'], ['lắng nge', 'lắng nghe'], ['sử lý', 'xử lý'], ['xáng tạo', 'sáng tạo'],
  ['sạch xẽ', 'sạch sẽ'], ['xạch sẽ', 'sạch sẽ'], ['dạo trơi', 'dạo chơi'], ['chăm xóc', 'chăm sóc'], ['giáo giục', 'giáo dục'],
  ['dáo dục', 'giáo dục'], ['nghành', 'ngành'], ['nghĩ ngơi', 'nghỉ ngơi'], ['suy nghỉ', 'suy nghĩ'], ['sáng xuất', 'sản xuất'],
  ['xản xuất', 'sản xuất'], ['dụng cự', 'dụng cụ'], ['chuẩn bi', 'chuẩn bị'], ['kĩ nang', 'kĩ năng'], ['kỹ nang', 'kỹ năng'],
  ['dang tay', 'dang tay'], ['dãn hàng', 'giãn hàng'], ['dàn hàng ngang', 'dàn hàng ngang'],
];

/** từ láy lặp nguyên văn hợp lệ (không báo “lặp chữ”) */
const OK_REPEAT = new Set(['ba', 'chi', 'chành', 'rềnh', 'ràng', 'cò', 'ò', 'la', 'ha', 'hi', 'tùng', 'cắc', 'tí', 'xinh', 'rung', 'linh', 'từng', 'dần', 'nu', 'na', 'ầm', 'ì', 'ú', 'oa', 'tò', 'te', 'tò te', 'bập', 'bùng', 'meo', 'gâu', 'chíp', 'ộp', 'quạc', 'cạp', 'bim', 'bíp', 'tích', 'tắc', 'xa', 'nhè', 'hả', 'hì']);

const isLeader = (t: string) => /[.…_]{4,}/.test(t) || / {5,}/.test(t) || /\t/.test(t);

export function checkSpelling(p: ParsedDoc): Issue[] {
  const out: Issue[] = [];
  const add = (i: Omit<Issue, 'source' | 'level'> & { level?: Issue['level'] }) => out.push({ level: 'chinh-ta', ...i, source: 'luat' });
  const dict = DICT.filter(([a, b]) => a !== b).map(([wrong, right, cs]) => ({
    re: new RegExp(`(?<!${L})${wrong.replace(/ /g, '\\s+')}(?!${L})`, cs ? 'gu' : 'giu'), wrong, right,
  }));

  for (const { where, text } of p.allLines) {
    // ---- từ điển
    for (const d of dict) for (const m of text.matchAll(d.re)) {
      const keepCase = m[0][0] === m[0][0].toUpperCase() && d.right[0] !== d.right[0].toUpperCase();
      const fix = keepCase ? d.right[0].toUpperCase() + d.right.slice(1) : d.right;
      add({ rule: 'chinh-ta.tu-dien', where, found: m[0], message: `Sai chính tả: “${m[0]}”.`, fix });
    }
    // ---- gõ đúp phụ âm đầu từ (“tthực”), tiếng Việt không có từ nào như vậy
    // chỉ chữ thường: chữ viết tắt in hoa như “CCKT” là đúng
    for (const m of text.matchAll(new RegExp(`(?<!${L})([bcdđghklmnpqrstvx])\\1(\\p{Ll}+)`, 'gu')))
      add({ rule: 'chinh-ta.go-dup', where, found: m[0], message: `Gõ thừa chữ: “${m[0]}”.`, fix: m[0].slice(1) });
    // ---- lặp chữ liền nhau
    for (const m of text.matchAll(new RegExp(`(?<!${L})(\\p{L}+)\\s+\\1(?!${L})`, 'giu')))
      if (!OK_REPEAT.has(m[1].toLowerCase())) add({ rule: 'chinh-ta.lap-chu', where, found: m[0], message: `Lặp chữ: “${m[0]}”.`, fix: m[1] });

    if (isLeader(text)) continue; // dòng chấm chấm / dòng canh lề chữ ký: bỏ qua phần trình bày
    const t = text.replace(/\s+$/, '');
    const fmt = (rule: string, re: RegExp, message: string, fix?: (s: string) => string) => {
      for (const m of t.matchAll(re)) add({ rule, where, found: clip(context(t, m.index ?? 0, m[0].length)), message, fix: fix?.(m[0]) });
    };
    fmt('trinh-bay.cach-thua', /(?<=\S) {2,}(?=\S)/g, 'Thừa dấu cách.');
    fmt('trinh-bay.cach-truoc-dau', /(?<=[\p{L}\p{N}”)])\s+[,;:!?](?![.,])|(?<=[\p{L}\p{N}])\s+\.(?!\.)/gu, 'Thừa dấu cách trước dấu câu.');
    fmt('trinh-bay.sau-hai-cham', /(?<=\p{L}):(?=\p{L})/gu, 'Thiếu dấu cách sau dấu hai chấm.');
    fmt('trinh-bay.danh-so', /(?<![\d/.,])(\d)\.(?=\p{Lu})/gu, 'Thiếu dấu cách sau số thứ tự (vd “1. HĐ 1”, “2. HOẠT ĐỘNG CHIỀU”).');
    fmt('trinh-bay.gach-dau-dong', /^\s*[-+](?=\p{L})/gu, 'Thiếu dấu cách sau gạch đầu dòng (“- Trẻ…”).');
    fmt('trinh-bay.ngoac', /\(\s+|\s+\)/g, 'Thừa dấu cách trong ngoặc đơn.');
    fmt('trinh-bay.truoc-ngoac', /(?<=[\p{L}?!.,:])\((?=\p{L})/gu, 'Thiếu dấu cách trước dấu mở ngoặc.');
    fmt('trinh-bay.ngoac-kep', /“\s+|\s+”/g, 'Thừa dấu cách trong ngoặc kép.');
    fmt('trinh-bay.hai-cham-cuoi', /(?<![.…])\.\.(?![.…])/g, 'Thừa dấu chấm.', () => '.');
    // mẫu KH ngày viết “HĐ 1”; mẫu KH tuần của tổ viết liền “HĐ1” nên không báo
    if (p.kind === 'kh-ngay') fmt('trinh-bay.hd-so', /HĐ(?=\d)/g, 'Mẫu viết “HĐ 1”, “HĐ 2”, “HĐ 3” (có dấu cách).');
    // ngoặc kép lệch: ‘…” hoặc “…’, mở mà không đóng
    for (const m of t.matchAll(/‘[^’”]*”|“[^”’]*’/g))
      add({ rule: 'trinh-bay.ngoac-lech', where, found: clip(m[0]), message: 'Dấu ngoặc kép mở và đóng không cùng kiểu.' });
    const open = (t.match(/“/g) ?? []).length, close = (t.match(/”/g) ?? []).length;
    if (open !== close && !/‘/.test(t)) add({ rule: 'trinh-bay.ngoac-thieu', where, found: clip(t), message: open > close ? 'Mở ngoặc kép mà chưa đóng.' : 'Đóng ngoặc kép mà chưa mở.' });
    if (/"/.test(t) && /[“”]/.test(p.allLines.map(x => x.text).join(''))) add({ rule: 'trinh-bay.ngoac-thang', where, found: clip(t), message: 'Dùng ngoặc kép thẳng ("…"), các chỗ khác dùng ngoặc cong (“…”).' });
  }
  return mergeFormat(out);
}

function context(s: string, i: number, n: number) {
  const a = Math.max(0, i - 18), b = Math.min(s.length, i + n + 18);
  return (a > 0 ? '…' : '') + s.slice(a, b).replace(/ /g, '␣').replace(/␣(?=\S)/g, ' ').replace(/(?<=\S)␣(?=\S)/g, ' ') + (b < s.length ? '…' : '');
}

/** gộp các lỗi trình bày giống nhau trong cùng một ô để báo cáo gọn */
function mergeFormat(list: Issue[]): Issue[] {
  const out: Issue[] = [];
  const groups = new Map<string, Issue[]>();
  for (const i of list) {
    if (!i.rule.startsWith('trinh-bay.')) { out.push(i); continue; }
    const k = `${i.rule}|${i.where}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  for (const g of groups.values()) {
    const first = g[0];
    out.push(g.length === 1 ? first : { ...first, message: `${first.message} (${g.length} chỗ)`, found: g.slice(0, 3).map(x => x.found).join('  ·  ') });
  }
  return out;
}
