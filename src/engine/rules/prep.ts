/**
 * Chuẩn bị có đủ đồ dùng mà phần tiến hành dùng tới: nhạc bài hát được nhắc tên, video/clip.
 * Mẫu trình bày: tiêu đề cột “Cách tiến hành”, khổ A4 ngang.
 * Khớp KH tuần ↔ KH ngày cùng tuần.
 */
import { THU_TEN, clip, norm } from '../text';
import { Issue, ParsedDoc } from '../types';
import { compareName } from './program';

function songsIn(lines: string[]): string[] {
  const text = lines.join('\n');
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:hát|bài hát|nhạc|nghe|vận động|múa)[^“"\n]{0,25}[“"]\s*([^”"\n]{3,60}?)\s*[”"]/giu)) found.add(m[1].trim());
  for (const m of text.matchAll(/[“"]([^”"\n]*vũ điệu[^”"\n]*)[”"]/giu)) found.add(m[1].trim());
  for (const m of text.matchAll(/(?:nghe hát|hát)\s+bài\s*:\s*([^\n.,;“"]{3,40})/giu)) found.add(m[1].trim());
  return [...found];
}

export function checkPrep(p: ParsedDoc): Issue[] {
  const out: Issue[] = [];
  if (p.kind !== 'kh-ngay') return out;
  for (const d of p.days) for (const s of [d.sang, d.chieu]) {
    const co = s.co.filter(l => l.trim());
    if (!co.length) continue;
    const where = `${THU_TEN[d.thuSo] || d.thu} – ${s.buoi} – Chuẩn bị`;
    const cb = norm(s.cb.join(' '));
    const cbHasNamed = /[“"]/.test(s.cb.join(' '));
    for (const song of songsIn(co)) {
      if (norm(s.ten).includes(norm(song))) continue; // tên chính tiết học (vd “Bật liên tục vào vòng”), không phải bài hát
      if (cb.includes(norm(song))) continue;
      if (!cbHasNamed && /nhạc/.test(cb)) continue; // chuẩn bị ghi chung “Nhạc bài hát”
      out.push({ rule: 'chuan-bi.nhac', level: 'xem', where, found: song, source: 'luat', message: `Phần tiến hành dùng bài “${song}” nhưng chuẩn bị chưa có nhạc bài này.`, fix: `Nhạc bài hát “${song}”` });
    }
    const vid = co.find(l => /video|clip/i.test(l));
    if (vid && !/video|clip/.test(cb))
      out.push({ rule: 'chuan-bi.video', level: 'xem', where, found: clip(vid.trim()), source: 'luat', message: 'Phần tiến hành có xem video nhưng chuẩn bị chưa có video.' });
  }
  return out;
}

const A4L = { w: 16838, h: 11906 };
export function checkLayout(p: ParsedDoc, page: { w: number; h: number } | null): Issue[] {
  const out: Issue[] = [];
  if (p.kind === 'kh-ngay' && p.headers.some(h => /tổ chức thực hiện/i.test(h)))
    out.push({ rule: 'mau.tieu-de-cot', level: 'chinh-ta', where: 'Hàng tiêu đề bảng', found: 'Tổ chức thực hiện', fix: 'Cách tiến hành', source: 'luat', message: 'Mẫu chuẩn của tổ ghi tiêu đề cột là “Cách tiến hành”.' });
  if (page && (p.kind === 'kh-ngay' || p.kind === 'kh-tuan')) {
    const land = page.w > page.h;
    const near = (a: number, b: number) => Math.abs(a - b) < 80;
    if (!land) out.push({ rule: 'mau.kho-giay', level: 'xem', where: 'Khổ giấy', source: 'luat', message: 'Trang đang để dọc; mẫu của tổ là A4 ngang.' });
    else if (!(near(page.w, A4L.w) && near(page.h, A4L.h))) {
      const name = near(page.w, 15840) && near(page.h, 12240) ? 'Letter' : `${(page.w / 567).toFixed(1)} × ${(page.h / 567).toFixed(1)} cm`;
      out.push({ rule: 'mau.kho-giay', level: 'xem', where: 'Khổ giấy', found: name, fix: 'A4 ngang (29,7 × 21 cm)', source: 'luat', message: `Khổ giấy đang là ${name}; mẫu của tổ là A4 ngang, in ra sẽ lệch lề.` });
    }
  }
  return out;
}

/** KH tuần và KH ngày cùng tuần phải cùng tên tiết từng ngày */
export function checkCross(a: ParsedDoc, b: ParsedDoc): Issue[] {
  const ngay = a.kind === 'kh-ngay' ? a : b.kind === 'kh-ngay' ? b : null;
  const tuan = a.kind === 'kh-tuan' ? a : b.kind === 'kh-tuan' ? b : null;
  if (!ngay || !tuan?.week || ngay.tuan !== tuan.tuan) return [];
  const out: Issue[] = [];
  for (const d of ngay.days) {
    const w = tuan.week.days.find(x => x.thuSo === d.thuSo);
    if (!w) continue;
    for (const [buoi, n, t] of [['sáng', d.sang.tenLines.join(' '), w.hoc.join(' ')], ['chiều', d.chieu.tenLines.join(' '), w.chieu.join(' ')]] as const) {
      if (!n.trim() || !t.trim()) continue;
      const c = compareName(n, t);
      if (c.level === 'nang') out.push({ rule: 'khop.tuan-ngay', level: 'nang', where: `${THU_TEN[d.thuSo]} – ${buoi}`, source: 'luat',
        found: `KH tuần: ${clip(t, 60)}  ·  KH ngày: ${clip(n, 60)}`, message: 'KH tuần và KH ngày ghi tên hoạt động khác nhau (Lưu ý số 1).' });
    }
  }
  return out;
}
