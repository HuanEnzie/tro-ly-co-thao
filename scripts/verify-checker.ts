/**
 * Kiểm bộ soát lỗi trên file THẬT đã soát tay (đáp án lấy từ các lần soát 04/11 và 13/11/2026).
 * Mỗi lỗi đã biết là 1 dòng ✔/✘; có cả dòng "không báo nhầm" và file đối chứng phải sạch lỗi nặng.
 * Chạy: npx tsx scripts/verify-checker.ts
 */
import { readFileSync } from 'node:fs';
import { checkFile, checkMany, Report } from '../src/engine/checker';
import { compareName } from '../src/engine/rules/program';
import { weekdayOf, thuSo } from '../src/engine/text';
import { Issue, Program } from '../src/engine/types';
import program from '../src/data/chuong-trinh.json';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`);
};
const has = (r: Report, rule: string, f: (i: Issue) => boolean = () => true) => r.issues.some(i => i.rule.startsWith(rule) && f(i));
const found = (s: string) => (i: Issue) => (i.found ?? '').includes(s) || i.message.includes(s);
const at = (w: string) => (i: Issue) => i.where.startsWith(w);
const load = async (f: string) => {
  const t0 = Date.now();
  const r = await checkFile(f, readFileSync(`tests/fixtures/${f}.docx`), program as Program);
  return { r, ms: Date.now() - t0 };
};

// 0. hàm nền
ok(weekdayOf('23/11/2026') === 2 && weekdayOf('27/11/2026') === 6, '23/11/2026 là thứ hai, 27/11/2026 là thứ sáu');
ok(thuSo('Thứ tư') === 4 && thuSo('Thứ năm') === 5 && thuSo('Thứ 4') === 4 && thuSo('Sáu') === 6, 'đọc tên thứ có dấu và bằng số');
ok(compareName('HĐLĐ: Hướng dẫn trẻ xếp ghế.', '- HĐLĐ: Xếp ghế').level === 'xem', '“Hướng dẫn trẻ xếp ghế” chỉ khác chữ mềm so với “Xếp ghế”');
ok(compareName('HĐVS: xếp ghế', '- HĐLĐ: Xếp ghế').level === 'nang', 'HĐVS ≠ HĐLĐ là lỗi nặng');
ok(compareName('PTTM: Tạo hình: Vẽ đồ dùng, dụng cụ nghề nông', 'PTTM: Tạo hình: Vẽ dụng cụ nghề nông').level === 'nang', 'thừa “đồ dùng” trong tên tiết là lỗi nặng');
ok(compareName('-Văn nghệ cuối tuần\n- Nêu gương cuối tuần.\n-Vệ sinh, trả trẻ', '-Văn nghệ +Nêu gương cuối tuần\n-Vệ sinh -Trả trẻ').level === 'ok', 'văn nghệ – nêu gương cuối tuần khớp chương trình');

// 1. KH tuần 12 của cô Chinh
const { r: tuan, ms: msTuan } = await load('kh-tuan-t12-chinh');
ok(tuan.parsed.kind === 'kh-tuan' && tuan.parsed.tuan === 12, `KH tuần: nhận đúng loại và tuần 12 (${msTuan} ms)`);
ok(has(tuan, 'ngay.nam-hoc', found('23/11/2025')), 'KH tuần: bắt năm 2025 ở tiêu đề');
ok(has(tuan, 'quy-dinh.tuan-le-chan', at('Thứ ba')), 'KH tuần: tuần chẵn phải HĐLĐ, không phải HĐVS');
ok(has(tuan, 'chuong-trinh.ten-tiet', i => at('Thứ tư – sáng')(i) && i.level === 'nang'), 'KH tuần: “Vẽ đồ dùng, dụng cụ nghề nông” lệch chương trình');
ok(tuan.issues.filter(i => i.rule === 'quy-dinh.qscmd' && i.level === 'nang').length === 2, 'KH tuần: quan sát có mục đích T4, T6 sai lịch thứ 3, thứ 5');
ok(has(tuan, 'mau.kho-giay', found('Letter')), 'KH tuần: khổ Letter khác mẫu A4');
for (const w of ['lửa xẻ', 'mặc lạc', 'nghè', 'tranh dành']) ok(has(tuan, 'chinh-ta.tu-dien', found(w)), `KH tuần: chính tả “${w}”`);
ok(has(tuan, 'chinh-ta.lap-chu', found('ngang ngang')), 'KH tuần: lặp chữ “ngang ngang”');
ok(has(tuan, 'trinh-bay.ngoac-lech', found('Kéo cưa')), 'KH tuần: ngoặc kép lệch ‘Kéo cưa lừa xẻ”');
ok(!has(tuan, 'chinh-ta.go-dup', found('CCKT')), 'KH tuần: không báo nhầm “CCKT”');
ok(!has(tuan, 'chinh-ta.lap-chu', found('ba ba')), 'KH tuần: không báo nhầm “Thả đỉa ba ba”');
ok(!has(tuan, 'chuong-trinh.ten-tiet', at('Thứ sáu')), 'KH tuần: văn nghệ – nêu gương cuối tuần không bị báo lệch');
ok(!has(tuan, 'trinh-bay.hd-so'), 'KH tuần: không bắt “HĐ1” (mẫu tuần viết liền)');

// 2. KH ngày tuần 12 của cô Chinh
const { r: ngay, ms: msNgay } = await load('kh-ngay-t12-chinh');
ok(ngay.parsed.kind === 'kh-ngay' && ngay.parsed.days.length === 5, `KH ngày: đọc đủ 5 ngày (${msNgay} ms)`);
ok(ngay.counts.nang === 0, `KH ngày: không có lỗi nặng (đúng tiết, đúng ngày) — có ${ngay.counts.nang}`);
for (const w of ['giỡ khoai', 'sát thành gạo', 'tỏ đó', 'nhiều tỏ', 'có con phải', 'vân động', 'Võ cường', 'thực hiệ'])
  ok(has(ngay, 'chinh-ta.tu-dien', found(w)), `KH ngày: chính tả “${w}”`);
ok(has(ngay, 'cau-truc.hd3-trong', at('Thứ ba – sáng')), 'KH ngày: HĐ 3 trống ở tiết truyện');
ok(has(ngay, 'cau-truc.hd3-trong', at('Thứ sáu – chiều')), 'KH ngày: HĐ 3 trống ở văn nghệ cuối tuần');
ok(has(ngay, 'cau-truc.muc', found('Luyện tập')), 'KH ngày: KPXH ghi “Củng cố” thay vì “Luyện tập”');
for (const s of ['Vũ điệu nghề nông', 'Hạt gạo làng ta', 'Dung dăng dung dẻ']) ok(has(ngay, 'chuan-bi.nhac', found(s)), `KH ngày: chuẩn bị thiếu nhạc “${s}”`);
ok(has(ngay, 'chuan-bi.video', at('Thứ năm – sáng')) && has(ngay, 'chuan-bi.video', at('Thứ tư – chiều')), 'KH ngày: chuẩn bị thiếu video (thứ năm sáng, thứ tư chiều)');
ok(has(ngay, 'mau.tieu-de-cot'), 'KH ngày: tiêu đề cột “Tổ chức thực hiện” khác mẫu');
ok(has(ngay, 'trinh-bay.truoc-ngoac', at('Thứ sáu – sáng')), 'KH ngày: thiếu dấu cách trước ngoặc “trước tiên(Cuốc”');
ok(has(ngay, 'chuong-trinh.ten-tiet', i => at('Thứ tư – chiều')(i) && found('dân gian')(i)), 'KH ngày: tên tiết chiều thứ tư thiếu “dân gian”');
ok(!has(ngay, 'chuan-bi.nhac', found('Bật liên tục')), 'KH ngày: không coi tên tiết thể dục là bài hát');

// 3. KH tuần + KH ngày cùng tuần
const both = checkMany([tuan, ngay]);
ok(has(both[0], 'khop.tuan-ngay', at('Thứ tư – sáng')), 'Khớp tuần–ngày: thứ tư sáng KH tuần khác KH ngày');
ok(has(both[0], 'khop.tuan-ngay', at('Thứ ba – chiều')), 'Khớp tuần–ngày: thứ ba chiều HĐVS ≠ HĐLĐ');
ok(!has(both[0], 'khop.tuan-ngay', at('Thứ hai – sáng')) && !has(both[0], 'khop.tuan-ngay', at('Thứ năm – sáng')), 'Khớp tuần–ngày: không báo nhầm ngày cùng tên tiết (thứ hai, thứ năm sáng)');
ok(compareName('PTTC: Thể dục: Bật liên tục vào vòng', 'PTTC: Thể dục: Bật liên tục vào vòng Loại tiết: CCKT').level === 'ok', 'tên tiết ghép chung dòng với “Loại tiết” vẫn khớp');

// 4. KH ngày tuần 11 bản gốc của cô Thảo (trước khi sửa 04/11)
const { r: t11 } = await load('kh-ngay-t11-goc');
for (const w of ['dạy giỗ', 'giành cho', 'Đông viên', 'việt Nam', 'Máy tinh', 'đâu tóc', 'qui trình', 'ghi ghớ', 'hưỡng dẫn', 'miề xuôi', 'duy băng', 'vân động', 'Võ cường'])
  ok(has(t11, 'chinh-ta.tu-dien', found(w)), `KH ngày tuần 11: chính tả “${w}”`);
ok(has(t11, 'chinh-ta.go-dup', found('tthực')), 'KH ngày tuần 11: gõ thừa “tthực hiện”');
ok(has(t11, 'trinh-bay.sau-hai-cham', found('PTNT:KPXH')), 'KH ngày tuần 11: “PTNT:KPXH” thiếu dấu cách');
ok(has(t11, 'trinh-bay.ten-thu', found('Thứ 4')), 'KH ngày tuần 11: “Thứ 4”, “Thứ 5” lẫn với “Thứ hai”');

// 5. Đối chứng: bản Claude soạn 10/11 phải sạch lỗi nặng
const { r: c1 } = await load('kh-ngay-t12-claude');
const { r: c2 } = await load('kh-tuan-t12-claude');
ok(c1.counts.nang === 0, `Đối chứng KH ngày: 0 lỗi nặng (có ${c1.counts.nang}: ${c1.issues.filter(i => i.level === 'nang').map(i => i.message).join(' | ')})`);
ok(c2.counts.nang === 0, `Đối chứng KH tuần: 0 lỗi nặng (có ${c2.counts.nang}: ${c2.issues.filter(i => i.level === 'nang').map(i => i.message).join(' | ')})`);
ok(c1.counts['chinh-ta'] <= 3, `Đối chứng KH ngày: ít báo chính tả (có ${c1.counts['chinh-ta']})`);

console.log(failed ? `\n${failed} kiểm tra chưa đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
