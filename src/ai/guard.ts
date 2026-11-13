/**
 * Soát lại câu trả lời của AI trước khi cho cô xem (như guardReply của Trợ lý Cube):
 * - đọc JSON kể cả khi bị bọc ```json;
 * - BỎ lỗi có "trich" không tìm thấy nguyên văn trong giáo án (AI bịa);
 * - gắn lại vị trí theo chỗ thật của đoạn trích; bỏ lỗi trùng lỗi luật đã bắt; giới hạn số lượng.
 */
import { Issue, Level, ParsedDoc } from '../engine/types';

export interface AiItem { vi_tri?: string; trich?: string; loi?: string; sua?: string; muc?: string }
export interface GuardResult { issues: Issue[]; dropped: { item: AiItem; reason: string }[] }

const squash = (s: string) => s.normalize('NFC').replace(/[ \s]+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim().toLowerCase();

export function parseAiJson(text: string): AiItem[] {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let v: unknown;
  try { v = JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try { v = JSON.parse(m[0]); } catch { return []; }
  }
  const arr = Array.isArray(v) ? v : (v as { issues?: unknown })?.issues;
  return Array.isArray(arr) ? (arr.filter(x => x && typeof x === 'object') as AiItem[]) : [];
}

export function guardAi(items: AiItem[], p: ParsedDoc, ruleIssues: Issue[], max = 25): GuardResult {
  const lines = p.allLines.map(l => ({ where: l.where, text: squash(l.text) }));
  const whole = lines.map(l => l.text).join(' ');
  const issues: Issue[] = [], dropped: GuardResult['dropped'] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const trich = (it.trich ?? '').trim(), loi = (it.loi ?? '').trim();
    if (!trich || !loi) { dropped.push({ item: it, reason: 'thiếu đoạn trích hoặc nội dung lỗi' }); continue; }
    const q = squash(trich);
    if (q.length < 3 || !whole.includes(q)) { dropped.push({ item: it, reason: 'đoạn trích không có trong giáo án' }); continue; }
    // vị trí thật: dòng chứa đoạn trích, ưu tiên dòng khớp với vị trí AI ghi
    const hits = lines.filter(l => l.text.includes(q));
    const claim = squash(it.vi_tri ?? '');
    const where = (hits.find(h => claim && squash(h.where).startsWith(claim.slice(0, 12))) ?? hits[0])?.where ?? (it.vi_tri ?? 'Giáo án');
    if (ruleIssues.some(r => r.found && (squash(r.found).includes(q) || q.includes(squash(r.found))) && squash(r.where) === squash(where))) {
      dropped.push({ item: it, reason: 'trùng lỗi máy đã bắt' }); continue;
    }
    const sua = (it.sua ?? '').trim();
    if (sua && squash(sua) === q) { dropped.push({ item: it, reason: 'đề xuất sửa giống hệt bản gốc' }); continue; }
    const key = `${squash(where)}|${q}`;
    if (seen.has(key)) { dropped.push({ item: it, reason: 'trùng' }); continue; }
    seen.add(key);
    const level: Level = it.muc === 'nang' || it.muc === 'chinh-ta' ? it.muc : 'xem';
    issues.push({ rule: 'ai', level, where, found: trich, message: loi, fix: sua || undefined, source: 'ai' });
    if (issues.length >= max) break;
  }
  return { issues, dropped };
}
