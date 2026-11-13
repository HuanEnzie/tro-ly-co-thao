/**
 * Kiểm bộ lọc kết quả AI (không gọi Gemini): AI bịa đoạn trích phải bị bỏ, trùng lỗi luật bị bỏ,
 * vị trí được gắn lại đúng chỗ thật, JSON bọc ``` vẫn đọc được, lời nhắn gửi đi đủ phần.
 * Chạy: npx tsx scripts/verify-ai-guard.ts
 */
import { readFileSync } from 'node:fs';
import { guardAi, parseAiJson } from '../src/ai/guard';
import { docToText, userMessage } from '../src/ai/prompt';
import { RESPONSE_SCHEMA, SYSTEM } from '../src/ai/system';
import { checkFile } from '../src/engine/checker';
import { Program } from '../src/engine/types';
import program from '../src/data/chuong-trinh.json';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`);
};

const r = await checkFile('kh-ngay-t12-chinh', readFileSync('tests/fixtures/kh-ngay-t12-chinh.docx'), program as Program);
const p = r.parsed;

// 1. lời nhắn gửi Gemini
const text = docToText(p);
ok(text.includes('### Thứ tư – chiều') && text.includes('Ghế ngồi đủ cho trẻ'), 'chữ gửi AI có nhãn vị trí và đủ nội dung (ghế ngồi ở thứ tư chiều)');
const msg = userMessage(p, r.issues);
ok(msg.includes('LỖI MÁY ĐÃ BẮT') && msg.includes('giỡ khoai'), 'lời nhắn kèm danh sách lỗi máy đã bắt để AI không lặp lại');
ok(msg.length < 120_000, `lời nhắn vừa một lượt gọi (${msg.length} ký tự)`);
ok(SYSTEM.includes('NGUYÊN VĂN') && (RESPONSE_SCHEMA.properties.issues as { items: { required: string[] } }).items.required.includes('trich'), 'lời dặn bắt AI trích nguyên văn, khuôn JSON có trường trich');

// 2. đọc JSON
ok(parseAiJson('```json\n{"issues":[{"vi_tri":"a","trich":"b","loi":"c","muc":"xem"}]}\n```').length === 1, 'đọc JSON bọc ```json');
ok(parseAiJson('Đây là kết quả: {"issues":[]} hết').length === 0 && parseAiJson('hỏng {').length === 0, 'JSON hỏng không làm sập');

// 3. lọc
const g = guardAi([
  { vi_tri: 'Thứ tư – chiều – Chuẩn bị', trich: 'Ghế ngồi đủ cho trẻ', loi: 'Trò chơi Kéo cưa lừa xẻ ngồi bệt đối diện, không cần ghế.', sua: 'Sàn sạch, trải thảm', muc: 'xem' },
  { vi_tri: 'Thứ sáu – sáng', trich: 'Cho trẻ nghe hát bài: Hạt gạo làng ta', loi: 'Cô cho nghe hát nhưng cột trẻ ghi “Trẻ hát”.', muc: 'xem' },
  { vi_tri: 'Thứ hai – sáng', trich: 'Bác nông dân cày ruộng bằng máy bay', loi: 'bịa', muc: 'nang' },
  { vi_tri: 'Thứ sáu – sáng – Hoạt động của cô', trich: 'giỡ khoai', loi: 'Sai chính tả', sua: 'dỡ khoai', muc: 'chinh-ta' },
  { vi_tri: 'Thứ ba', trich: 'Hạt gạo làng ta', loi: 'x', sua: 'Hạt gạo làng ta', muc: 'xem' },
  { vi_tri: 'Thứ tư – chiều – Chuẩn bị', trich: 'Ghế ngồi đủ cho trẻ', loi: 'lặp', muc: 'xem' },
  { trich: 'abc' },
], p, r.issues);
const reasons = g.dropped.map(d => d.reason);
ok(g.issues.some(i => i.found === 'Ghế ngồi đủ cho trẻ' && i.where === 'Thứ tư – chiều – Chuẩn bị' && i.source === 'ai'), 'giữ lỗi AI có đoạn trích thật, đúng vị trí');
ok(g.issues.some(i => i.where.startsWith('Thứ sáu – sáng – Hoạt động của cô') && i.found?.includes('Hạt gạo')), 'gắn lại vị trí đầy đủ theo chỗ thật (“Thứ sáu – sáng” → “… – Hoạt động của cô”)');
ok(reasons.includes('đoạn trích không có trong giáo án'), 'bỏ lỗi AI bịa đoạn trích');
ok(reasons.includes('trùng lỗi máy đã bắt'), 'bỏ lỗi trùng với lỗi luật (giỡ khoai)');
ok(reasons.includes('đề xuất sửa giống hệt bản gốc'), 'bỏ đề xuất sửa vô nghĩa');
ok(reasons.includes('trùng'), 'bỏ lỗi AI lặp lại');
ok(reasons.includes('thiếu đoạn trích hoặc nội dung lỗi'), 'bỏ mục thiếu trường');
ok(g.issues.length === 2, `còn đúng 2 lỗi AI hợp lệ (có ${g.issues.length})`);

console.log(failed ? `\n${failed} kiểm tra chưa đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
