/**
 * Ghi nội dung đã soạn vào file MẪU (.docx), giữ nguyên bảng/phông/lề của mẫu, trả ArrayBuffer mới (không đụng file mẫu).
 *
 * Quy ước căn hàng (chỉ theo SỐ ĐOẠN, chưa đo số dòng — bước căn theo dòng do bộ căn hàng khác làm):
 *  - mỗi bước = 1 đoạn tiêu đề (đậm) + max(co, tre) đoạn; bên cô và bên trẻ có CÙNG số đoạn, đoạn nào trẻ không có việc thì để đoạn rỗng;
 *  - mỗi buổi (sáng/chiều) là một khối; cả 5 cột (tên, mục đích, chuẩn bị, cô, trẻ) được đệm đoạn rỗng cho cùng số đoạn,
 *    nên buổi chiều bắt đầu cùng chỉ số đoạn ở mọi cột; giữa 2 buổi có 1 đoạn rỗng ngăn cách.
 *  - định dạng (pPr, rPr) sao chép từ đoạn mẫu cùng loại trong chính file mẫu (tiêu đề phần đậm, gạch đầu dòng…).
 *  - chỗ "[Cô điền: …]" / "[Cô đối chiếu: …]" được tô vàng.
 */
import JSZip from 'jszip';
import { thuSo, norm } from '../engine/text';
import { RE_CHO_DIEN } from './rules';
import type { DayContent, LessonDraft, SlotFrame, WeekFrame } from './types';
import { XEl, attr, clone, el1, els, esc, isEl, mk, paraText, parseXml, serialize } from './xml';

// ---------- đoạn văn
const hasT = (r: XEl) => els(r).some(k => k.tag === 'w:t');
const isBold = (p: XEl) => {
  const r = els(p, 'w:r').find(hasT);
  const rpr = r && el1(r, 'w:rPr');
  return !!rpr && els(rpr, 'w:b').some(b => attr(b, 'w:val') !== '0');
};
const text = (p: XEl) => paraText(p).trim();

const AFTER_SZ = ['w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath'];
function highlight(run: XEl) {
  let rpr = el1(run, 'w:rPr');
  if (!rpr) { rpr = mk('w:rPr'); run.kids.unshift(rpr); }
  const hl = mk('w:highlight', [['w:val', 'yellow']]);
  const at = rpr.kids.findIndex(k => isEl(k) && AFTER_SZ.includes(k.tag));
  if (at >= 0) rpr.kids.splice(at, 0, hl); else rpr.kids.push(hl);
}

const textEl = (s: string) => mk('w:t', [['xml:space', 'preserve']], [esc(s)]);

/** đoạn mới: sao chép định dạng từ đoạn mẫu `proto`, chữ = s (rỗng → đoạn trống) */
function para(proto: XEl, s: string): XEl {
  const p = clone(proto);
  p.attrs = p.attrs.filter(([k]) => k !== 'w14:paraId' && k !== 'w14:textId');
  const runs = els(p, 'w:r');
  const base = runs.find(hasT) ?? runs[0];
  const ppr = el1(p, 'w:pPr');
  const rprProto = base ? el1(base, 'w:rPr') : ppr && el1(ppr, 'w:rPr') ? clone(el1(ppr, 'w:rPr')!) : undefined;
  p.kids = p.kids.filter(k => isEl(k) && k.tag === 'w:pPr');
  if (!s) return p;
  const parts: { t: string; hl: boolean }[] = [];
  let last = 0;
  for (const m of s.matchAll(RE_CHO_DIEN)) {
    if (m.index! > last) parts.push({ t: s.slice(last, m.index), hl: false });
    parts.push({ t: m[0], hl: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) parts.push({ t: s.slice(last), hl: false });
  for (const part of parts) {
    const run = mk('w:r', [], rprProto ? [clone(rprProto), textEl(part.t)] : [textEl(part.t)]);
    if (part.hl) highlight(run);
    p.kids.push(run);
  }
  return p;
}

/** đặt lại chữ cho đoạn đang có (giữ định dạng của run đầu) */
function setText(p: XEl, s: string) {
  const runs = els(p, 'w:r').filter(hasT);
  if (!runs.length) { p.kids.push(mk('w:r', [], [textEl(s)])); return; }
  const first = runs[0];
  first.kids = first.kids.filter(k => !(isEl(k) && (k.tag === 'w:t' || k.tag === 'w:tab' || k.tag === 'w:br')));
  first.kids.push(textEl(s));
  for (const r of runs.slice(1)) p.kids.splice(p.kids.indexOf(r), 1);
}

/** đoạn mẫu tự dựng khi mẫu thiếu loại đoạn cần */
function synth(bold: boolean, center = false, sz = 26): XEl {
  const rpr = mk('w:rPr', [], [...(bold ? [mk('w:b')] : []), mk('w:sz', [['w:val', String(sz)]]), mk('w:szCs', [['w:val', String(sz)]])]);
  const ppr = mk('w:pPr', [], [mk('w:spacing', [['w:line', '276'], ['w:lineRule', 'auto']]), ...(center ? [mk('w:jc', [['w:val', 'center']])] : [])]);
  return mk('w:p', [], [ppr, mk('w:r', [], [rpr, textEl('')])]);
}

const cellsOf = (tr: XEl) => els(tr, 'w:tc');
const parasOf = (tc: XEl) => els(tc, 'w:p');
const firstText = (tr: XEl) => text(parasOf(cellsOf(tr)[0])[0] ?? mk('w:p'));

function setCell(tc: XEl, paras: XEl[]) {
  const keep = tc.kids.filter(k => isEl(k) && k.tag !== 'w:p');
  tc.kids = [...keep, ...(paras.length ? paras : [mk('w:p')])];
}

// ---------- đọc file mẫu
async function openDoc(mau: ArrayBuffer) {
  const zip = await JSZip.loadAsync(mau);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('File mẫu không phải .docx');
  const { head, root } = parseXml(await f.async('string'));
  const body = el1(root, 'w:body');
  if (!body) throw new Error('File mẫu không có phần thân (w:body)');
  return { zip, head, root, body };
}
async function saveDoc(d: Awaited<ReturnType<typeof openDoc>>): Promise<ArrayBuffer> {
  d.zip.file('word/document.xml', d.head + serialize(d.root));
  return d.zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

const isDayRow = (tr: XEl) => /^Thứ\s*(hai|ba|tư|năm|sáu|[2-6])(?![\p{L}\p{N}])/iu.test(firstText(tr));
function mainTable(body: XEl): XEl {
  const t = els(body, 'w:tbl').find(tb => els(tb, 'w:tr').some(isDayRow));
  if (!t) throw new Error('Không tìm thấy bảng có các hàng “Thứ …” trong file mẫu.');
  return t;
}

// ---------- KH ngày
interface Protos {
  c0: { thu: XEl; ngay: XEl; head: XEl; nameB: XEl; nameP: XEl; loai: XEl; headC: XEl; nameC: XEl; ng: XEl; blank: XEl };
  md: { p: XEl; blank: XEl };
  cb: { head: XEl; p: XEl; blank: XEl };
  co: { head: XEl; p: XEl; blank: XEl };
  tre: { p: XEl; blank: XEl };
}
function protosOf(row: XEl): Protos {
  const [c0, c1, c2, c3, c4] = cellsOf(row);
  const P = (tc: XEl) => parasOf(tc);
  const ne = (tc: XEl) => P(tc).filter(p => text(p));
  const blankOf = (tc: XEl) => P(tc).find(p => !text(p)) ?? synth(false);
  const find = (tc: XEl, re: RegExp) => P(tc).find(p => re.test(text(p)));
  const head0 = find(c0, /HOẠT\s*ĐỘNG\s*HỌC/i) ?? synth(true, true, 20);
  const iHead = P(c0).indexOf(head0);
  const afterHead = P(c0).slice(iHead + 1).filter(p => text(p));
  const headC = find(c0, /HOẠT\s*ĐỘNG\s*CHIỀU/i) ?? head0;
  const afterC = P(c0).slice(P(c0).indexOf(headC) + 1).filter(p => text(p));
  const plain = (tc: XEl) => ne(tc).find(p => !isBold(p)) ?? synth(false);
  return {
    c0: {
      thu: ne(c0)[0] ?? synth(true, true), ngay: ne(c0)[1] ?? synth(true, true), head: head0,
      nameB: afterHead.find(isBold) ?? synth(true, true), nameP: afterHead.find(p => !isBold(p)) ?? synth(false, true),
      loai: find(c0, /^Loại tiết/i) ?? synth(false, true), headC, nameC: afterC[0] ?? synth(false, true),
      ng: find(c0, /^-?\s*Nêu gương/i) ?? synth(false, true), blank: blankOf(c0),
    },
    md: { p: plain(c1), blank: blankOf(c1) },
    cb: { head: ne(c2).find(isBold) ?? synth(true), p: plain(c2), blank: blankOf(c2) },
    co: { head: ne(c3).find(isBold) ?? synth(true), p: plain(c3), blank: blankOf(c3) },
    tre: { p: plain(c4), blank: blankOf(c4) },
  };
}

interface Cols { c0: XEl[]; md: XEl[]; cb: XEl[]; co: XEl[]; tre: XEl[] }
const pad = (a: XEl[], n: number, blank: XEl) => { while (a.length < n) a.push(para(blank, '')); };

/** một buổi → các cột (chưa đệm) */
function slotCols(pr: Protos, frame: SlotFrame, bai: LessonDraft | null, dayHead: boolean): { cols: Cols; tail: XEl[] } {
  const c0: XEl[] = [];
  if (frame.buoi === 'sáng') {
    c0.push(para(pr.c0.head, '1. HOẠT ĐỘNG HỌC'));
    for (const l of frame.tenLines) c0.push(para(l.bold ? pr.c0.nameB : pr.c0.nameP, l.text));
    if (frame.loaiTiet) c0.push(para(pr.c0.loai, frame.loaiTiet));
  } else {
    c0.push(para(pr.c0.headC, '2. HOẠT ĐỘNG CHIỀU'));
    for (const l of frame.tenLines) c0.push(para(pr.c0.nameC, l.text));
    if (frame.loaiTiet) c0.push(para(pr.c0.loai, frame.loaiTiet));
  }
  void dayHead;
  const md = (bai?.md ?? []).map(l => para(pr.md.p, l));
  const cb = (bai?.cb ?? []).map(l => para(/^\*/.test(l) ? pr.cb.head : pr.cb.p, l));
  const co: XEl[] = [], tre: XEl[] = [];
  for (const s of bai?.steps ?? []) {
    if (s.phan) { co.push(para(pr.co.head, s.phan)); tre.push(para(pr.tre.blank, '')); }
    const n = Math.max(s.co.length, s.tre.length);
    for (let i = 0; i < n; i++) {
      co.push(s.co[i] ? para(pr.co.p, s.co[i]) : para(pr.co.blank, ''));
      tre.push(s.tre[i] ? para(pr.tre.p, s.tre[i]) : para(pr.tre.blank, ''));
    }
  }
  return { cols: { c0, md, cb, co, tre }, tail: [] };
}

function fillDayRow(row: XEl, pr: Protos, day: DayContent, frame: WeekFrame): void {
  void frame;
  const f = day.frame;
  const S = slotCols(pr, day.sang.frame, day.sang.bai, true);
  const C = slotCols(pr, day.chieu.frame, day.chieu.bai, false);
  const head0 = [para(pr.c0.thu, f.thuTen), para(pr.c0.ngay, `Ngày ${f.ngay}`)];
  S.cols.c0.unshift(...head0);
  const tail = f.cuoiNgay.map(l => para(pr.c0.ng, l));
  const colsOf = (c: Cols) => [c.c0, c.md, c.cb, c.co, c.tre];
  const blanks = [pr.c0.blank, pr.md.blank, pr.cb.blank, pr.co.blank, pr.tre.blank];
  // khối sáng: mọi cột cùng số đoạn
  const nS = Math.max(...colsOf(S.cols).map(a => a.length));
  colsOf(S.cols).forEach((a, i) => pad(a, nS, blanks[i]));
  // khối chiều: cột 0 = tên + khoảng trống + dòng cuối ngày
  const hasLesson = !!day.chieu.bai && C.cols.co.length > 0;
  const nCbody = Math.max(C.cols.md.length, C.cols.cb.length, C.cols.co.length, hasLesson ? C.cols.c0.length + tail.length : 0);
  pad(C.cols.c0, hasLesson ? nCbody - tail.length : C.cols.c0.length, pr.c0.blank);
  C.cols.c0.push(...tail);
  if (hasLesson) colsOf(C.cols).forEach((a, i) => pad(a, nCbody, blanks[i]));
  const out: XEl[][] = colsOf(S.cols).map((a, i) => {
    const sep = [para(blanks[i], '')];
    const chieu = colsOf(C.cols)[i];
    return [...a, ...(chieu.length ? sep : []), ...chieu];
  });
  const tcs = cellsOf(row);
  out.forEach((paras, i) => setCell(tcs[i], paras));
}

export interface FillResult { docx: ArrayBuffer; warnings: string[] }

export async function fillKhNgay(mau: ArrayBuffer, frame: WeekFrame, days: DayContent[]): Promise<FillResult> {
  const doc = await openDoc(mau);
  const warnings: string[] = [];
  const tbl = mainTable(doc.body);
  const rows = els(tbl, 'w:tr');
  const dayRows = rows.filter(isDayRow);
  const pr = protosOf(dayRows[0]);
  // tiêu đề
  for (const p of els(doc.body, 'w:p')) {
    const t = text(p);
    if (/^KẾ HOẠCH HOẠT ĐỘNG HỌC NGÀY/i.test(t)) setText(p, t.replace(/TUẦN\s*\d+/i, `TUẦN ${frame.tuan}`));
    else if (/^Chủ đề nhánh/i.test(t)) setText(p, `Chủ đề nhánh: ${frame.nhanh}: Từ ${frame.tuNgay}-${frame.denNgay}`);
  }
  for (const tr of dayRows) {
    const idx = rows.indexOf(tr);
    const d = days.find(x => x.frame.thu === thuSo(firstText(tr)));
    if (!d) {
      // ngày không soạn: bỏ hàng ngày và hàng "Đánh giá cuối ngày" đi kèm
      const next = rows[idx + 1];
      tbl.kids = tbl.kids.filter(k => k !== tr && !(next && k === next && !isDayRow(next)));
      continue;
    }
    fillDayRow(tr, pr, d, frame);
  }
  if (days.length < dayRows.length) warnings.push(`File chỉ gồm ${days.length} ngày đã chọn; các ngày còn lại đã bỏ khỏi bảng.`);
  return { docx: await saveDoc(doc), warnings };
}

// ---------- KH tuần
export interface WeekBlocks { donTre?: string[]; theDucSang?: string[]; ngoaiTroi?: string[]; goc?: string[] }

const BLOCK_KHUNG = (extra: string[] = [], tienHanh: string[] = []): string[] => [
  '1. Nội dung', ...(extra.length ? extra : [`- ${'[Cô điền: nội dung của tuần]'}`]),
  '2. Mục đích yêu cầu', '- [Cô điền: mục đích yêu cầu]',
  '3. Chuẩn bị', '- [Cô điền: chuẩn bị]',
  '4. Cách tiến hành', ...(tienHanh.length ? tienHanh : ['- [Cô điền: cách tiến hành]']),
];
export const WEEK_BLOCKS_KHUNG: Required<WeekBlocks> = {
  donTre: BLOCK_KHUNG(),
  theDucSang: BLOCK_KHUNG([], ['a. Khởi động: [Cô điền]', 'b. Trọng động: [Cô điền]', 'c. Hồi tĩnh: [Cô điền]']),
  ngoaiTroi: BLOCK_KHUNG(['- Quan sát có mục đích (thứ 3, thứ 5):', '+ Thứ 3: [Cô điền: nội dung quan sát]', '+ Thứ 5: [Cô điền: nội dung quan sát]', '- Dạo chơi sân trường (thứ 2, thứ 4, thứ 6): [Cô điền]', '- TCVĐ: [Cô điền]', '- Chơi tự do'],
    ['a. HĐ1: Gây hứng thú', '- [Cô điền]', 'b. HĐ2: Bài mới', '- Quan sát có mục đích: [Cô điền]', 'c. HĐ3: Kết thúc', '- Cô kiểm tra sĩ số trẻ, nhận xét buổi chơi.']),
  goc: BLOCK_KHUNG(['- Góc phân vai: [Cô điền]', '- Góc xây dựng: [Cô điền]', '- Góc nghệ thuật: [Cô điền]', '- Góc học tập: [Cô điền]', '- Góc thư viện: [Cô điền]'],
    ['1. Ổn định, thỏa thuận chơi', '- [Cô điền]', '2. Tiến hành chơi', '- Cô nhập vai chơi cùng trẻ, bao quát, giúp đỡ trẻ (nếu cần).', '3. Kết thúc: [Cô điền]']),
};

export async function fillKhTuan(mau: ArrayBuffer, frame: WeekFrame, days: DayContent[], blocks?: WeekBlocks): Promise<FillResult> {
  const doc = await openDoc(mau);
  const warnings: string[] = [];
  const tbl = mainTable(doc.body);
  const rows = els(tbl, 'w:tr');
  const head = cellsOf(rows[0]).map(tc => norm(parasOf(tc).map(text).join(' ')));
  const col = (re: RegExp) => head.findIndex(h => re.test(h));
  const ci = { don: col(/đón trẻ/), td: col(/thể dục/), hoc: col(/hoạt động học/), nt: col(/ngoài trời/), goc: col(/góc/), chieu: col(/chiều/) };
  const [y, m, d1] = [frame.tuNgay.slice(6), frame.tuNgay.slice(3, 5), frame.tuNgay.slice(0, 2)];
  const [, m2, d2] = [frame.denNgay.slice(6), frame.denNgay.slice(3, 5), frame.denNgay.slice(0, 2)];
  for (const p of els(doc.body, 'w:p')) {
    const t = text(p);
    if (/^KẾ HOẠCH TUẦN/i.test(t)) setText(p, `KẾ HOẠCH TUẦN ${frame.tuan}: Chủ đề nhánh “${frame.nhanh.toUpperCase()}”`);
    else if (/^\(Từ ngày/i.test(t)) setText(p, `(Từ ngày ${+d1} tháng ${+m} năm ${y} đến ngày ${+d2} tháng ${+m2} năm ${frame.denNgay.slice(6)})`);
  }
  const dayRows = rows.filter(isDayRow);
  let first = true;
  for (const tr of dayRows) {
    const d = days.find(x => x.frame.thu === thuSo(firstText(tr)));
    const tcs = cellsOf(tr);
    if (!d) { tbl.kids = tbl.kids.filter(k => k !== tr); continue; }
    const p0 = parasOf(tcs[0]);
    const digit = /Thứ\s*\d/i.test(text(p0[0]));
    setText(p0[0], digit ? `Thứ ${d.frame.thu}` : d.frame.thuTen);
    if (p0[1]) setText(p0[1], d.frame.ngay);
    // hoạt động học
    const hp = parasOf(tcs[ci.hoc]);
    const hocLines = [para(hp[0], d.sang.frame.ten), ...(d.sang.frame.loaiTiet ? [para(hp[1] ?? hp[0], d.sang.frame.loaiTiet)] : [])];
    setCell(tcs[ci.hoc], hocLines);
    // hoạt động chiều
    const cp = parasOf(tcs[ci.chieu]).filter(p => p);
    const plainC = cp.find(p => !isBold(p)) ?? cp[0];
    const fc = d.chieu.frame;
    const dash = fc.kind === 'goc' || fc.kind === 'van-nghe';
    const lines = [
      ...fc.tenLines.map((l, i) => para(i === 0 && !dash ? cp[0] : plainC, dash && !/^-/.test(l.text) ? `- ${l.text}` : l.text)),
      ...(fc.loaiTiet ? [para(plainC, fc.loaiTiet)] : []),
      para(plainC, d.frame.thu === 6 ? '- Vệ sinh - Trả trẻ' : '- Nêu gương - Vệ sinh - Trả trẻ'),
    ];
    setCell(tcs[ci.chieu], lines);
    // khối cả tuần (ô gộp ở hàng đầu)
    if (first) {
      first = false;
      const B = { ...WEEK_BLOCKS_KHUNG, ...blocks };
      const set = (i: number, lines: string[]) => {
        if (i < 0) return;
        const ps = parasOf(tcs[i]);
        const bold = ps.find(p => isBold(p)) ?? ps[0], plain = ps.find(p => text(p) && !isBold(p)) ?? ps[0];
        setCell(tcs[i], lines.map(l => para(/^\d\.\s/.test(l) ? bold : plain, l)));
      };
      set(ci.don, B.donTre); set(ci.td, B.theDucSang); set(ci.nt, B.ngoaiTroi); set(ci.goc, B.goc);
      if (!blocks) warnings.push('KH tuần: 4 khối cả tuần (Đón trẻ, Thể dục sáng, Ngoài trời, Góc) mới có khung 4 mục, cô điền các chỗ tô vàng.');
    }
  }
  return { docx: await saveDoc(doc), warnings };
}
