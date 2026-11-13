/**
 * Luật đối chiếu chương trình chủ đề (Lưu ý số 1 của tổ: chương trình – KH tuần – KH ngày phải khớp nhau),
 * ngày tháng – thứ, năm học, tuần lẻ (vệ sinh) / tuần chẵn (lao động), lịch quan sát có mục đích (thứ 3, thứ 5).
 */
import { DATE_RE, THU_TEN, expectedYear, norm, thuSo, weekdayOf } from '../text';
import { Issue, ParsedDoc, Program, ProgramWeek } from '../types';

const CODES = ['kpxh', 'kpkh', 'lqvt', 'lqcc', 'hđlđ', 'hđvs', 'kns'];
const LABEL_PHRASES = ['pttc knxh', 'pttc', 'ptnn', 'pttm', 'ptnt', 'văn học', 'thể dục', 'tạo hình', 'âm nhạc', 'củng cố kiến thức',
  'loại tiết', 'cckt', 'đề tài', 'theo mẫu', 'nêu gương', 'vệ sinh trả trẻ', 'trả trẻ'];
/** chữ "mềm": thêm/bớt không đổi tên tiết (vd "Hướng dẫn trẻ xếp ghế" = "Xếp ghế") */
const SOFT = new Set(['cái', 'bài', 'hướng', 'dẫn', 'trẻ', 'dạy', 'chơi', 'trò', 'dân', 'gian', 'cho', 'các', 'ở', 'hoạt', 'động', 'hđ', 'cùng', 'về', 'ôn', 'tập']);

const codesOf = (s: string) => new Set(norm(s).split(' ').filter(t => CODES.includes(t)));
/** dòng chỉ ghi thủ tục cuối ngày / loại tiết (không phải tên hoạt động) */
export const isRoutineLine = (l: string) => {
  const t = norm(l);
  return /^loại tiết/.test(t) || /^(nêu gương )?(vệ sinh )?(trả trẻ)$/.test(t) || t === 'nêu gương vệ sinh trả trẻ';
};
function coreTokens(s: string): string[] {
  let t = ' ' + norm(s.split('\n').filter(l => !isRoutineLine(l)).join(' ')) + ' ';
  for (const p of LABEL_PHRASES) t = t.split(` ${p} `).join(' ');
  return t.split(' ').filter(w => w && !CODES.includes(w));
}

/** so tên tiết trong kế hoạch với chương trình */
export function compareName(doc: string, prog: string): { level: 'ok' | 'xem' | 'nang'; missing: string[]; extra: string[]; code?: string } {
  const pc = codesOf(prog), dc = codesOf(doc);
  for (const c of pc) if (!dc.has(c) && [...dc].some(x => x !== c)) return { level: 'nang', missing: [], extra: [], code: `chương trình ghi ${c.toUpperCase()}, kế hoạch ghi ${[...dc].map(x => x.toUpperCase()).join(', ')}` };
  const p = coreTokens(prog), d = coreTokens(doc);
  const missing = p.filter(w => !d.includes(w)), extra = d.filter(w => !p.includes(w));
  if (!missing.length && !extra.length) return { level: 'ok', missing, extra };
  const soft = [...missing, ...extra].every(w => SOFT.has(w));
  return { level: soft ? 'xem' : 'nang', missing, extra };
}

const firstLine = (s: string) => s.split('\n')[0].replace(/^[-+]\s*/, '').trim();

export function programWeek(prog: Program | null, tuan: number | null): ProgramWeek | null {
  return (prog && tuan && prog.weeks.find(w => w.tuan === tuan)) || null;
}

function startDate(w: ProgramWeek, year: number): Date | null {
  const m = w.khoang.match(/từ\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
  return m ? new Date(Date.UTC(year, +m[2] - 1, +m[1])) : null;
}
const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

export function checkProgram(p: ParsedDoc, prog: Program | null): Issue[] {
  const out: Issue[] = [];
  const add = (i: Omit<Issue, 'source'>) => out.push({ ...i, source: 'luat' });
  const w = programWeek(prog, p.tuan);
  const titleText = p.title.join(' ');

  // ---- năm học trong mọi ngày tháng (tiêu đề, các ngày, phần ký tên)
  const dateLines = [...p.allLines];
  for (const { where, text } of dateLines) {
    for (const m of text.matchAll(new RegExp(DATE_RE.source, 'g'))) {
      const exp = expectedYear(+m[2]);
      if (+m[3] !== exp) add({ rule: 'ngay.nam-hoc', level: 'nang', where, found: m[0], message: `Năm sai: tháng ${+m[2]} của năm học 2026–2027 phải là năm ${exp}.`, fix: m[0].replace(m[3], String(exp)) });
    }
    for (const m of text.matchAll(/tháng\s*(\d{1,2})\s*năm\s*(\d{4})/gi)) {
      const exp = expectedYear(+m[1]);
      if (+m[2] !== exp) add({ rule: 'ngay.nam-hoc', level: 'nang', where, found: m[0], message: `Năm sai: phải là năm ${exp}.`, fix: m[0].replace(m[2], String(exp)) });
    }
  }

  // ---- tiêu đề có tên chủ đề nhánh của tuần
  if (w && w.nhanh && !norm(titleText).includes(norm(w.nhanh)))
    add({ rule: 'chuong-trinh.nhanh', level: 'xem', where: 'Tiêu đề', message: `Chương trình tuần ${w.tuan} là chủ đề nhánh “${w.nhanh}”, tiêu đề chưa ghi đúng tên này.` });
  if (!p.tuan) add({ rule: 'chuong-trinh.tuan', level: 'xem', where: 'Tiêu đề', message: 'Không tìm thấy số tuần trong tiêu đề (vd “TUẦN 12”), nên chưa đối chiếu được với chương trình.' });
  else if (prog && !w) add({ rule: 'chuong-trinh.tuan', level: 'xem', where: 'Tiêu đề', message: `Chương trình đang nạp không có tuần ${p.tuan}. Hãy nạp file chương trình của chủ đề này.` });

  // ---- từng ngày: thứ – ngày, tên tiết sáng/chiều
  const days = p.kind === 'kh-ngay'
    ? p.days.map(d => ({ thu: d.thu, thuSo: d.thuSo, ngay: d.ngay, sang: d.sang.tenLines.join('\n'), chieu: d.chieu.tenLines.join('\n') }))
    : p.week?.days.map(d => ({ thu: d.thu, thuSo: d.thuSo, ngay: d.ngay, sang: d.hoc.join('\n'), chieu: d.chieu.join('\n') })) ?? [];
  const yearOfDays = +(days.find(d => d.ngay)?.ngay?.match(DATE_RE)?.[3] ?? 2026);
  const start = w ? startDate(w, expectedYear(+(w.khoang.match(/từ\s*\d{1,2}\s*\/\s*(\d{1,2})/i)?.[1] ?? 11))) : null;

  const seen = new Set<number>();
  for (const d of days) {
    const where = THU_TEN[d.thuSo] || d.thu;
    seen.add(d.thuSo);
    if (d.ngay) {
      const wd = weekdayOf(d.ngay);
      if (wd && wd !== d.thuSo) add({ rule: 'ngay.thu', level: 'nang', where, found: `${d.thu} ${d.ngay}`, message: `Ngày ${d.ngay} là ${THU_TEN[wd] ?? 'Chủ nhật'}, không phải ${where.toLowerCase()}.` });
      if (start) {
        const exp = new Date(start.getTime() + (d.thuSo - 2) * 86400000);
        if (fmt(exp) !== d.ngay.split('/').map(x => x.padStart(2, '0')).join('/') && weekdayOf(d.ngay) === d.thuSo)
          add({ rule: 'ngay.tuan', level: 'nang', where, found: d.ngay, message: `Theo chương trình, ${where.toLowerCase()} tuần ${w!.tuan} là ngày ${fmt(exp)}.`, fix: fmt(exp) });
      }
    }
    if (!w) continue;
    const pd = w.days[d.thuSo];
    if (!pd) continue;
    for (const [buoi, docName, progName] of [['sáng', d.sang, pd.sang], ['chiều', d.chieu, pd.chieu]] as const) {
      if (!progName.trim()) continue;
      const progFirst = firstLine(progName.split('\n').filter(l => !isRoutineLine(l)).join('\n') || progName);
      if (!docName.trim()) {
        if (buoi === 'sáng') add({ rule: 'chuong-trinh.ten-tiet', level: 'nang', where: `${where} – ${buoi}`, message: `Chưa có tên hoạt động. Chương trình: “${progFirst}”.` });
        continue;
      }
      const c = compareName(docName, progName);
      if (c.level === 'ok') continue;
      const diff = [c.missing.length ? `thiếu “${c.missing.join(' ')}”` : '', c.extra.length ? `thừa “${c.extra.join(' ')}”` : ''].filter(Boolean).join(', ');
      add({
        rule: 'chuong-trinh.ten-tiet', level: c.level, where: `${where} – ${buoi}`, found: docName.replace(/\n/g, ' / '),
        message: c.code ? `Lệch lĩnh vực: ${c.code}.` : c.level === 'nang'
          ? `Tên hoạt động khác chương trình (${diff}). Lưu ý số 1: chương trình, KH tuần, KH ngày phải khớp nhau.`
          : `Tên hoạt động khác chữ so với chương trình (${diff}).`,
        fix: progFirst,
      });
    }
  }
  if (w && days.length) for (let t = 2; t <= 6; t++) if (!seen.has(t)) add({ rule: 'ngay.thieu-ngay', level: 'nang', where: THU_TEN[t], message: `Thiếu ${THU_TEN[t].toLowerCase()} trong kế hoạch.` });

  // ---- tuần lẻ: vệ sinh; tuần chẵn: lao động (Lưu ý số 5)
  if (p.tuan) {
    const want = p.tuan % 2 === 0 ? 'HĐLĐ' : 'HĐVS', wrong = p.tuan % 2 === 0 ? 'HĐVS' : 'HĐLĐ';
    for (const d of days) if (new RegExp(wrong, 'i').test(d.chieu))
      add({ rule: 'quy-dinh.tuan-le-chan', level: 'nang', where: `${THU_TEN[d.thuSo] || d.thu} – chiều`, found: d.chieu.split('\n')[0],
        message: `Tuần ${p.tuan} là tuần ${p.tuan % 2 === 0 ? 'chẵn: hoạt động lao động (HĐLĐ)' : 'lẻ: hoạt động vệ sinh (HĐVS)'}, không phải ${wrong}.`, fix: d.chieu.split('\n')[0].replace(new RegExp(wrong, 'i'), want) });
  }
  void yearOfDays;
  return out;
}

/** KH tuần: lịch quan sát có mục đích của tổ là thứ 3, thứ 5 (Lưu ý số 4) */
export function checkQuanSat(p: ParsedDoc): Issue[] {
  if (p.kind !== 'kh-tuan' || !p.week) return [];
  const out: Issue[] = [];
  const lines = p.week.ngoaiTroi;
  const qs = lines.filter(l => /quan sát/i.test(l));
  if (!qs.length) return [{ rule: 'quy-dinh.qscmd', level: 'xem', where: 'Hoạt động ngoài trời', source: 'luat', message: 'Chưa thấy “Quan sát có mục đích” (lịch của tổ: thứ 3, thứ 5).' }];
  for (const l of lines) {
    if (!/quan sát/i.test(l) || /dạo chơi/i.test(l)) continue;
    for (const m of l.matchAll(/\(\s*((?:T|thứ)\s*[2-6](?:\s*[,;]\s*(?:T|thứ)?\s*[2-6])*)\s*\)/giu)) {
      const ds = [...m[1].matchAll(/[2-6]/g)].map(x => +x[0]);
      const bad = ds.filter(x => x !== 3 && x !== 5);
      if (bad.length) out.push({ rule: 'quy-dinh.qscmd', level: 'nang', where: 'Hoạt động ngoài trời', found: l.trim(), source: 'luat',
        message: `Quan sát có mục đích đặt vào ${bad.map(x => THU_TEN[x].toLowerCase()).join(', ')}. Lưu ý số 4: lịch quan sát có mục đích của tổ là thứ 3, thứ 5.` });
    }
  }
  return out;
}

void thuSo;
