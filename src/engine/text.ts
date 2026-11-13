/** Hàm chữ tiếng Việt dùng chung */

/** chuẩn hoá để so sánh: chữ thường, bỏ dấu câu/ngoặc, gộp khoảng trắng (giữ dấu tiếng Việt) */
export const norm = (s: string) =>
  s.normalize('NFC').toLowerCase()
    .replace(/[“”"‘’'`«»]/g, ' ')
    .replace(/[^\p{L}\p{N}\s/]/gu, ' ')
    .replace(/\s+/g, ' ').trim();

/** bỏ dấu tiếng Việt (để so khớp mềm) */
export const noAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

export const tokens = (s: string) => norm(s).split(' ').filter(Boolean);

const THU: Record<string, number> = { hai: 2, ba: 3, 'tư': 4, 'tu': 4, 'năm': 5, 'nam': 5, 'sáu': 6, 'sau': 6 };

/** "Thứ ba" / "Thứ 3" / "Ba" -> 3 */
export function thuSo(s: string): number {
  const m = s.normalize('NFC').toLowerCase().match(/(?:thứ\s*)?(hai|ba|tư|năm|sáu|[2-7])(?![\p{L}\p{N}])/u);
  if (!m) return 0;
  return /\d/.test(m[1]) ? +m[1] : THU[m[1]] ?? 0;
}

export const THU_TEN = ['', '', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const DATE_RE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/;

/** "23/11/2026" -> thứ (2..8, CN = 8) */
export function weekdayOf(d: string): number | null {
  const m = d.match(DATE_RE);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (dt.getUTCDate() !== +m[1]) return null;
  const w = dt.getUTCDay(); // 0 = CN
  return w === 0 ? 8 : w + 1;
}

/** năm học 2026–2027: tháng 8–12 thuộc 2026, tháng 1–7 thuộc 2027 */
export function expectedYear(month: number, startYear = 2026) {
  return month >= 8 ? startYear : startYear + 1;
}

/** khoảng trắng & ranh giới chữ cho regex tiếng Việt (\b không dùng được với chữ có dấu) */
export const L = '[\\p{L}\\p{N}]';
export const wordRe = (word: string, flags = 'gu') =>
  new RegExp(`(?<!${L})${word}(?!${L})`, flags);

export const nonEmpty = (lines: string[]) => lines.map(l => l.trim()).filter(Boolean);

/** cắt ngắn để hiển thị */
export const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
