/**
 * Luật thuần chữ (không đụng XML) cho cặp "Hoạt động của cô" ↔ "Hoạt động của trẻ":
 * phân loại câu của cô, phân loại câu của trẻ, câu đề xuất cho trẻ, và kiểm tra hai bên có khớp nhau không.
 * Chỗ không chắc trả null — để AI xử lý sau (mức "xem"), không tự quyết.
 */

export type TreKind = 'tra-loi' | 'lang-nghe' | 'quan-sat' | 'hat' | 'doc' | 'van-dong' | 'choi' | 'thuc-hien';

export const TRE_SUGGEST: Record<TreKind, string> = {
  'tra-loi': '- Trẻ trả lời',
  'lang-nghe': '- Trẻ lắng nghe',
  'quan-sat': '- Trẻ quan sát',
  hat: '- Trẻ hát',
  doc: '- Trẻ đọc',
  'van-dong': '- Trẻ vận động',
  choi: '- Trẻ chơi',
  'thuc-hien': '- Trẻ thực hiện',
};

const nfc = (s: string) => s.normalize('NFC').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** bỏ chữ trong ngoặc kép (tên bài hát, trò chơi…) để dấu ? hay động từ trong đó không đánh lừa luật */
const stripQuoted = (s: string) => s.replace(/“[^”]*”/g, ' ').replace(/"[^"]*"/g, ' ').replace(/‘[^’]*’/g, ' ');
/** bỏ gạch/cộng/sao đầu dòng và số thứ tự */
const stripBullet = (s: string) => s.replace(/^[\s\-–+*•.]+/, '').replace(/^\d+\s*[.)]\s*/, '').trim();

/** "cho trẻ", "mời cả lớp", "cho 1 – 2 trẻ", "tổ chức cho trẻ"... */
const GIVE = String.raw`(?:cho|mời|yêu cầu|tổ chức cho|hướng dẫn|để)\s+(?:cả lớp|tất cả trẻ|trẻ|các con|các bạn|\d+(?:\s*[-–,]\s*\d+)?\s*trẻ|\d+(?:\s*[-–,]\s*\d+)?\s*bạn|từng trẻ|lần lượt (?:từng )?trẻ|(?:các )?tổ|(?:các )?nhóm|đội)`;

/** loại việc của CÔ (null = không chắc) */
export function classifyCo(raw: string): TreKind | null {
  const full = nfc(raw);
  if (!full) return null;
  const t = stripBullet(stripQuoted(full)).toLowerCase();
  if (!t) return null;
  // 1. câu hỏi: có dấu ? ngoài ngoặc kép, hoặc mở đầu bằng cách hỏi
  const startsWithGive = new RegExp(`^(cô\\s+)?${GIVE}\\s`).test(t);
  if (/\?/.test(t) && startsWithGive && /(hát|đọc|chơi|vận động|nghe|quan sát|xem)/.test(t)) return null; // vừa cho làm vừa hỏi: để AI
  if (/\?/.test(t) || /^(cô\s+)?(hỏi|đặt câu hỏi)\b/.test(t) || /^cô\s+(hỏi|đặt câu hỏi)/.test(t) || /^(các\s+)?con\s+(thấy|có biết|có nhận ra|nhìn thấy|nào|đã|biết|hãy kể|có thể)/.test(t)) return 'tra-loi';
  // 2. cô cho trẻ làm gì đó
  const give = new RegExp(`${GIVE}\\s+(?:cùng\\s+)?(.{0,25}?)(?=$|[,.:;+]|\\s(?:và|rồi|để|trong|ở|bằng|theo)\\s)`).exec(t);
  const verbs = give ? give[1] : '';
  if (give) {
    if (/^(lắng\s+)?nghe/.test(verbs)) return 'lang-nghe';
    if (/^(quan sát|xem|nhìn)/.test(verbs)) return 'quan-sat';
    if (/^(hát|biểu diễn|ca)/.test(verbs)) return 'hat';
    if (/^(đọc|ngâm|kể)/.test(verbs)) return 'doc';
    if (/^(vận động|múa|nhảy|đi|chạy|bò|bật|tập)/.test(verbs)) return /^tập/.test(verbs) ? 'thuc-hien' : 'van-dong';
    if (/^(chơi)/.test(verbs)) return 'choi';
    if (/^(thực hiện|lên thực hiện|luyện tập|làm|xếp|vẽ|tô|nặn|cắt|dán|ghép|thi đua|lần lượt)/.test(verbs)) return 'thuc-hien';
  }
  if (/^(cô\s+)?(và\s+trẻ\s+|cùng\s+trẻ\s+)?(cùng\s+)?(hát|đọc|vận động|múa)\b/.test(t) && /(cô\s+và\s+trẻ|cô\s+cùng\s+trẻ|cả lớp|cùng\s+hát|cùng\s+đọc)/.test(t)) {
    return /hát/.test(t) ? 'hat' : /đọc/.test(t) ? 'doc' : 'van-dong';
  }
  if (/^cô\s+(và\s+trẻ|cùng\s+trẻ)\s+(cùng\s+)?hát/.test(t)) return 'hat';
  if (/^cô\s+(và\s+trẻ|cùng\s+trẻ)\s+(cùng\s+)?đọc/.test(t)) return 'doc';
  if (/^cô\s+(và\s+trẻ|cùng\s+trẻ)\s+(cùng\s+)?(vận động|múa)/.test(t)) return 'van-dong';
  // 3. cô làm mẫu / cho trẻ quan sát
  if (/^cô\s+(làm mẫu|thao tác mẫu|thực hiện mẫu|vẽ mẫu|tô mẫu|nặn mẫu|vận động mẫu|biểu diễn mẫu|hát mẫu)/.test(t)) return 'quan-sat';
  if (/^cô\s+(cho trẻ\s+)?(quan sát|chỉ|đưa|giơ|treo|mở)\b/.test(t) && /(cho trẻ|trẻ)\s+(quan sát|xem|nhìn)/.test(t)) return 'quan-sat';
  // 4. cô nói / hát / kể / đọc / khái quát / nhận xét => trẻ lắng nghe
  if (/^cô\s+(hát|kể|đọc|ngâm|khái quát|nhận xét|nói|giải thích|giới thiệu|tuyên dương|nhắc|kết luận|tóm tắt|động viên|cho biết|dặn)/.test(t)) return 'lang-nghe';
  if (/^(khái quát|nhận xét|tuyên dương|kết luận|tóm tắt)\b/.test(t)) return 'lang-nghe';
  return null;
}

/** các loại việc ghi ở ô TRẺ (rỗng nếu không nhận ra) */
export function classifyTre(raw: string): Set<TreKind> {
  const t = stripBullet(nfc(raw)).toLowerCase();
  const out = new Set<TreKind>();
  if (!t) return out;
  if (/trả lời|đáp|nói|kể|nêu/.test(t)) out.add('tra-loi');
  if (/lắng nghe|nghe/.test(t)) out.add('lang-nghe');
  if (/quan sát|xem|nhìn/.test(t)) out.add('quan-sat');
  if (/\bhát\b|biểu diễn/.test(t)) out.add('hat');
  if (/\bđọc\b|ngâm/.test(t)) out.add('doc');
  if (/vận động|múa|nhảy/.test(t)) out.add('van-dong');
  if (/chơi/.test(t)) out.add('choi');
  if (/thực hiện|tập|thi đua|làm|xếp|vẽ|tô|nặn|cắt|dán|ghép|chạy|bật|bò/.test(t)) out.add('thuc-hien');
  return out;
}

/** câu đề xuất cho trẻ, hoặc null nếu luật không chắc */
export function suggestFor(coText: string): { kind: TreKind; text: string } | null {
  const k = classifyCo(coText);
  return k ? { kind: k, text: TRE_SUGGEST[k] } : null;
}

/** loại việc của cô khi câu nói RÕ và chỉ có một việc (dùng cho cảnh báo không khớp; mơ hồ thì null) */
function explicitCo(raw: string): TreKind | null {
  const t = stripBullet(stripQuoted(nfc(raw))).toLowerCase();
  if (!t || /[;?]|trò chuyện|\sđồng thời\s/.test(t)) return null;
  if (new RegExp(`${GIVE}\\s+(lắng\\s+)?nghe`).test(t)) return 'lang-nghe';
  if (/^cô\s+(hát|kể|đọc|ngâm)\s/.test(t) && !/cùng|và trẻ|cho trẻ/.test(t)) return 'lang-nghe';
  const m = new RegExp(`${GIVE}\\s+(?:cùng\\s+)?(hát|đọc|ngâm|vận động|múa|chơi)(?![\\p{L}])`, 'u').exec(t);
  if (m) return m[1] === 'hát' ? 'hat' : m[1] === 'đọc' || m[1] === 'ngâm' ? 'doc' : m[1] === 'chơi' ? 'choi' : 'van-dong';
  return null;
}

/** cô và trẻ có khớp nhau không. Trả lý do (tiếng Việt) nếu chắc chắn không khớp, ngược lại null. */
export function mismatchReason(coText: string, treText: string): string | null {
  const ck = explicitCo(coText);
  const tk = classifyTre(treText);
  if (!ck || tk.size !== 1 || /[,;]| và /.test(nfc(treText))) return null;
  const t = [...tk][0];
  const tail = `nhưng cột trẻ ghi “${nfc(treText)}”`;
  if (ck === 'lang-nghe' && ['hat', 'doc', 'van-dong', 'choi'].includes(t)) return `Cô chỉ cho trẻ nghe ${tail}`;
  if (['hat', 'doc', 'van-dong', 'choi'].includes(ck) && (t === 'lang-nghe' || t === 'quan-sat')) return `Cô cho trẻ ${TRE_SUGGEST[ck].replace('- Trẻ ', '')} ${tail}`;
  if (['hat', 'doc', 'van-dong'].includes(ck) && t !== ck && ['hat', 'doc', 'van-dong'].includes(t)) return `Cô cho trẻ ${TRE_SUGGEST[ck].replace('- Trẻ ', '')} ${tail}`;
  return null;
}
