/**
 * Lời dặn cho Gemini + chuyển kế hoạch thành chữ có nhãn vị trí. Dùng chung cho trình duyệt (dựng yêu cầu)
 * và máy chủ. Gemini chỉ làm phần LUẬT KHÔNG LÀM ĐƯỢC: nội dung hợp lý, khớp nhau giữa các phần.
 */
import { Issue, ParsedDoc } from '../engine/types';
import { THU_TEN } from '../engine/text';

export { SYSTEM, RESPONSE_SCHEMA } from './system';

/** chuyển giáo án đã phân tích thành chữ có nhãn (gửi cho AI) */
export function docToText(p: ParsedDoc): string {
  const out: string[] = [`LOẠI: ${p.kind === 'kh-ngay' ? 'Kế hoạch ngày' : p.kind === 'kh-tuan' ? 'Kế hoạch tuần' : 'Văn bản'}`, ...p.title];
  const block = (label: string, lines: string[]) => {
    const t = lines.map(l => l.trimEnd()).filter(l => l.trim());
    if (t.length) out.push(`\n[${label}]`, ...t);
  };
  // cột 1 cuối ngày (Nêu gương – Vệ sinh – Trả trẻ) phải gửi kèm, nếu không AI tưởng giáo án thiếu
  if (p.kind === 'kh-ngay') for (const d of p.days) block(`${THU_TEN[d.thuSo] || d.thu} – cuối ngày (cột 1)`, d.col0.filter(l => /nêu gương|vệ sinh|trả trẻ/i.test(l)));
  if (p.kind === 'kh-ngay') for (const d of p.days) for (const s of [d.sang, d.chieu]) {
    if (!s.ten && !s.co.some(l => l.trim())) continue;
    const w = `${THU_TEN[d.thuSo] || d.thu} – ${s.buoi}`;
    out.push(`\n### ${w}: ${s.ten} ${s.loai}`);
    block(`${w} – Mục đích yêu cầu`, s.md);
    block(`${w} – Chuẩn bị`, s.cb);
    block(`${w} – Hoạt động của cô`, s.co);
    block(`${w} – Hoạt động của trẻ`, s.tre);
  }
  if (p.kind === 'kh-tuan' && p.week) {
    block('Đón trẻ – trò chuyện', p.week.donTre);
    block('Thể dục sáng', p.week.theDucSang);
    block('Hoạt động ngoài trời', p.week.ngoaiTroi);
    block('Hoạt động góc', p.week.goc);
    for (const d of p.week.days) { block(`${d.thu} – Hoạt động học`, d.hoc); block(`${d.thu} – Hoạt động chiều`, d.chieu); }
  }
  return out.join('\n');
}

export function userMessage(p: ParsedDoc, ruleIssues: Issue[]): string {
  const known = ruleIssues.slice(0, 120).map(i => `- ${i.where}: ${i.message}${i.found ? ` («${i.found.slice(0, 60)}»)` : ''}`).join('\n');
  return `LỖI MÁY ĐÃ BẮT (không lặp lại):\n${known || '(chưa có)'}\n\nGIÁO ÁN CẦN SOÁT:\n${docToText(p)}`;
}
