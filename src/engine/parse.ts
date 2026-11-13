/**
 * Từ DocModel (bảng + đoạn) dựng lại cấu trúc kế hoạch: ngày -> buổi sáng/chiều -> các cột.
 * Mẫu của tổ: KH ngày 5 cột (Thời gian – Mục đích – Chuẩn bị – Hoạt động của cô – Hoạt động của trẻ);
 * KH tuần 7 cột (ô Đón trẻ / Thể dục sáng / Ngoài trời / Góc là ô GỘP cả tuần).
 */
import { DocModel, Table, cellText } from './docx';
import { DATE_RE, THU_TEN, nonEmpty, norm, thuSo } from './text';
import { DayPlan, DocKind, ParsedDoc, Program, ProgramWeek, Section, WeekDay } from './types';

const isDayStart = (s: string) => /^\s*thứ\s+(hai|ba|tư|năm|sáu|[2-6])(?![\p{L}\p{N}])/iu.test(s);
const firstLine = (lines: string[]) => nonEmpty(lines)[0] ?? '';

function mainTable(doc: DocModel): { tbl: Table; index: number } | null {
  let best: { tbl: Table; index: number } | null = null;
  doc.blocks.forEach((b, index) => {
    if (b.t !== 'tbl') return;
    const days = b.tbl.rows.filter(r => isDayStart(firstLine(r.cells[0]?.lines ?? []))).length;
    const prog = b.tbl.rows.some(r => /tuần\s*\d+/i.test(r.cells.map(c => cellText(c)).join(' ')));
    if ((days >= 1 || prog) && (!best || b.tbl.rows.length > best.tbl.rows.length)) best = { tbl: b.tbl, index };
  });
  return best;
}

export function detectKind(doc: DocModel): DocKind {
  const mt = mainTable(doc);
  if (!mt) return 'khac';
  // chỉ xét hàng tiêu đề (hàng đầu); hàng ngày của KH tuần cũng có chữ "Mục đích yêu cầu"
  const head0 = norm(mt.tbl.rows[0].cells.map(c => cellText(c)).join(' '));
  if (head0.includes('đón trẻ') || head0.includes('thể dục sáng')) return 'kh-tuan';
  const head = norm(mt.tbl.rows.slice(0, 2).map(r => r.cells.map(c => cellText(c)).join(' ')).join(' '));
  if (head.includes('hoạt động của cô') || head.includes('mục đích')) return 'kh-ngay';
  if (head.includes('buổi') && /tuần \d+/.test(head)) return 'chuong-trinh';
  return 'khac';
}

/** tách 1 cột thành phần sáng / chiều tại lần xuất hiện thứ 2 của mốc */
function splitAt(lines: string[], re: RegExp): [string[], string[]] {
  const idx = lines.map((l, i) => (re.test(l.trim()) ? i : -1)).filter(i => i >= 0);
  if (idx.length < 2) return [lines, []];
  return [lines.slice(0, idx[1]), lines.slice(idx[1])];
}

const RE_HD1 = /^1\s*\.\s*HĐ\s*1/i;
const RE_KT = /^[-+*]?\s*Kiến\s*thức/i;
const RE_DDCO = /^[*\-+]?\s*(ĐD|Đồ\s*dùng)\s*(của\s*)?cô/i;
const RE_CHIEU = /HOẠT\s*ĐỘNG\s*CHIỀU/i;
const RE_HOC = /HOẠT\s*ĐỘNG\s*HỌC/i;

function section(buoi: Section['buoi'], tenRaw: string[], md: string[], cb: string[], co: string[], tre: string[]): Section {
  const names = nonEmpty(tenRaw).filter(l => !RE_HOC.test(l) && !RE_CHIEU.test(l));
  const loai = names.find(l => /loại\s*tiết/i.test(l)) ?? '';
  const tenLines = names.filter(l => !/loại\s*tiết/i.test(l) && !/^[-+]?\s*(nêu gương|vệ sinh|trả trẻ)/i.test(l));
  return { buoi, tenLines, ten: tenLines.join(' ').replace(/\s+/g, ' ').trim(), loai, md, cb, co, tre };
}

function parseDayRow(cells: string[][]): DayPlan {
  const [c0, c1 = [], c2 = [], c3 = [], c4 = []] = cells;
  const all0 = c0.map(l => l.trim());
  const head = nonEmpty(c0);
  const thu = (head[0] ?? '').match(/thứ\s+\S+/i)?.[0] ?? head[0] ?? '';
  const ngay = head.join(' ').match(DATE_RE)?.[0]?.replace(/\s/g, '') ?? null;
  const iHoc = all0.findIndex(l => RE_HOC.test(l));
  const iChieu = all0.findIndex(l => RE_CHIEU.test(l));
  const tenSang = iHoc >= 0 ? c0.slice(iHoc, iChieu >= 0 ? iChieu : undefined) : [];
  const tenChieu = iChieu >= 0 ? c0.slice(iChieu) : [];

  const [coS, coC] = splitAt(c3, RE_HD1);
  const [mdS, mdC] = splitAt(c1, RE_KT);
  const [cbS, cbC] = splitAt(c2, RE_DDCO);
  // cột trẻ: cắt cùng vị trí dòng với cột cô (hai cột được căn hàng với nhau)
  const cut = coC.length ? c3.length - coC.length : c4.length;
  return {
    thu, thuSo: thuSo(thu), ngay,
    sang: section('sáng', tenSang, mdS, cbS, coS, c4.slice(0, cut)),
    chieu: section('chiều', tenChieu, mdC, cbC, coC, c4.slice(cut)),
    col0: c0,
  };
}

export function parseDoc(doc: DocModel): ParsedDoc {
  const kind = detectKind(doc);
  const mt = mainTable(doc);
  const title = mt ? doc.blocks.slice(0, mt.index).filter(b => b.t === 'p').map(b => (b as { text: string }).text).filter(t => t.trim()) : doc.paras;
  const footer: string[] = [];
  if (mt) for (const b of doc.blocks.slice(mt.index + 1)) {
    if (b.t === 'p') footer.push(b.text);
    else for (const r of b.tbl.rows) for (const c of r.cells) footer.push(...c.lines);
  }
  const titleText = title.join(' ');
  const tuan = +(titleText.match(/TUẦN\s*(\d+)/i)?.[1] ?? 0) || null;
  const headers = mt ? mt.tbl.rows.slice(0, 2).flatMap(r => r.cells.map(c => cellText(c).replace(/\s+/g, ' ').trim())) : [];
  const out: ParsedDoc = { kind, title, tuan, days: [], week: null, headers, allLines: [], footer };
  const push = (where: string, lines: string[]) => lines.forEach(text => text.trim() && out.allLines.push({ where, text }));
  push('Tiêu đề', title);

  if (mt && kind === 'kh-ngay') {
    for (const r of mt.tbl.rows) {
      const c0 = r.cells[0]?.lines ?? [];
      if (!isDayStart(firstLine(c0))) continue;
      const d = parseDayRow(r.cells.map(c => c.lines));
      out.days.push(d);
      const cols: [keyof Section, string][] = [['md', 'Mục đích yêu cầu'], ['cb', 'Chuẩn bị'], ['co', 'Hoạt động của cô'], ['tre', 'Hoạt động của trẻ']];
      for (const s of [d.sang, d.chieu]) {
        push(`${d.thu} – ${s.buoi} – Tên hoạt động`, s.tenLines.concat(s.loai ? [s.loai] : []));
        for (const [k, label] of cols) push(`${d.thu} – ${s.buoi} – ${label}`, s[k] as string[]);
      }
      push(`${d.thu} – Tên hoạt động`, nonEmpty(c0).slice(0, 2));
    }
  }

  if (mt && kind === 'kh-tuan') {
    const head = mt.tbl.rows[0].cells.map(c => norm(cellText(c)));
    const col = (re: RegExp) => head.findIndex(h => re.test(h));
    const ci = { don: col(/đón trẻ/), td: col(/thể dục/), hoc: col(/hoạt động học|hoạt động\s*học/), nt: col(/ngoài trời/), goc: col(/góc/), chieu: col(/chiều/) };
    const days: WeekDay[] = [];
    let donTre: string[] = [], theDucSang: string[] = [], ngoaiTroi: string[] = [], goc: string[] = [];
    for (const r of mt.tbl.rows) {
      const c0 = r.cells[0]?.lines ?? [];
      if (!isDayStart(firstLine(c0))) continue;
      const head0 = nonEmpty(c0).join(' ');
      const at = (i: number) => (i >= 0 ? r.cells[i]?.lines ?? [] : []);
      const thu = head0.match(/thứ\s+\S+/i)?.[0] ?? '';
      days.push({ thu: THU_TEN[thuSo(thu)] || thu, thuSo: thuSo(thu), ngay: head0.match(DATE_RE)?.[0]?.replace(/\s/g, '') ?? null, hoc: nonEmpty(at(ci.hoc)), chieu: nonEmpty(at(ci.chieu)) });
      // ô gộp: nội dung nằm ở ô "restart" (hàng đầu); các hàng sau rỗng
      if (!donTre.length) donTre = at(ci.don);
      if (!theDucSang.length) theDucSang = at(ci.td);
      if (!ngoaiTroi.length) ngoaiTroi = at(ci.nt);
      if (!goc.length) goc = at(ci.goc);
    }
    out.week = { days, donTre, theDucSang, ngoaiTroi, goc };
    push('Đón trẻ – trò chuyện', donTre);
    push('Thể dục sáng', theDucSang);
    push('Hoạt động ngoài trời', ngoaiTroi);
    push('Hoạt động góc', goc);
    for (const d of days) { push(`${d.thu} – Hoạt động học`, d.hoc); push(`${d.thu} – Hoạt động chiều`, d.chieu); }
  }
  push('Phần ký tên', footer);
  return out;
}

/** đọc file chương trình chủ đề: bảng Thứ | Buổi | Tuần a | Tuần b ... */
export function parseProgram(doc: DocModel): Program | null {
  const mt = mainTable(doc);
  if (!mt) return null;
  const rows = mt.tbl.rows.map(r => r.cells.map(c => c.lines));
  const hi = rows.findIndex(r => r.some(c => /tuần\s*\d+/i.test(c.join(' '))));
  if (hi < 0) return null;
  const weekCols: { col: number; w: ProgramWeek }[] = [];
  rows[hi].forEach((c, col) => {
    const t = nonEmpty(c);
    const m = t.join(' ').match(/tuần\s*(\d+)/i);
    if (!m) return;
    // tên nhánh và "(từ … đến …)" có thể nằm chung một dòng
    const rest = t.filter(l => !/^\s*tuần\s*\d+\s*$/i.test(l)).join(' ').replace(/tuần\s*\d+/i, '');
    const k = rest.search(/\(\s*từ/i);
    const khoang = k >= 0 ? rest.slice(k).trim() : '';
    const nhanh = (k >= 0 ? rest.slice(0, k) : rest).trim();
    weekCols.push({ col, w: { tuan: +m[1], nhanh, khoang, days: {} } });
  });
  let lastThu = 0, lastLabel = '';
  for (const r of rows.slice(hi + 1)) {
    // ô "Thứ" / "Phân công GV" của hàng dưới thường là ô gộp dọc (rỗng) -> dùng nhãn của hàng trên
    const label = norm(r[0]?.join(' ') ?? '') || lastLabel;
    lastLabel = label;
    const thu = label.includes('phân công') ? 0 : thuSo(label) || lastThu;
    if (thu) lastThu = thu;
    const buoi = norm(r[1]?.join(' ') ?? '');
    if (label.includes('phân công')) {
      for (const { col, w } of weekCols) {
        const name = nonEmpty(r[col] ?? []).join(' ');
        if (buoi.includes('a')) w.coA = name; else w.coB = name;
      }
      continue;
    }
    if (!thu || (!buoi.includes('sáng') && !buoi.includes('chiều'))) continue;
    for (const { col, w } of weekCols) {
      const text = nonEmpty(r[col] ?? []).join('\n');
      w.days[thu] = w.days[thu] ?? { sang: '', chieu: '' };
      if (buoi.includes('sáng')) w.days[thu].sang = text; else w.days[thu].chieu = text;
    }
  }
  const chuDe = nonEmpty(doc.paras).find(p => /chủ đề/i.test(p)) ?? '';
  return { chuDe: chuDe.trim(), weeks: weekCols.map(x => x.w) };
}
