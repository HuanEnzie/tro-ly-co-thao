/**
 * Kiểm bộ TỰ SỬA file Word (không AI): sửa xong đọc lại phải hết lỗi chính tả/dấu đã biết,
 * giữ nguyên số đoạn, số bảng, số ô; phần chữ khác không đổi.
 * Chạy: npx tsx scripts/verify-fixer.ts   (file đã sửa ghi vào tests/out/ để mở bằng Word xem)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checkFile } from '../src/engine/checker';
import { readDocx } from '../src/engine/docx';
import { applyEdits, editsFor, fixDocx, FIX_GROUPS, planFixes, rulesOfGroups } from '../src/engine/fixer';
import { Program } from '../src/engine/types';
import program from '../src/data/chuong-trinh.json';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`);
};
const fix1 = (s: string, hd = false) => applyEdits(s, editsFor(s, { hdSpace: hd }));

// 1. sửa trên chuỗi
ok(fix1('Khi gặt lúa xong, giỡ khoai rồi đem sát thành gạo') === 'Khi gặt lúa xong, dỡ khoai rồi đem xát thành gạo', 'sửa giỡ → dỡ, sát → xát');
ok(fix1('Võ cường, ngày 16  tháng 11  năm 2026') === 'Võ Cường, ngày 16 tháng 11 năm 2026', 'Võ cường → Võ Cường, bỏ dấu cách thừa');
ok(fix1('-Trẻ lắng nghe') === '- Trẻ lắng nghe', 'thêm dấu cách sau gạch đầu dòng');
ok(fix1('PTNT:KPXH: Ngày nhà giáo') === 'PTNT: KPXH: Ngày nhà giáo', 'thêm dấu cách sau dấu hai chấm');
ok(fix1('Trẻ về 4 hàng ngang ngang và giãn hàng') === 'Trẻ về 4 hàng ngang và giãn hàng', 'bỏ chữ lặp “ngang ngang”');
ok(fix1('Thả đỉa ba ba') === 'Thả đỉa ba ba', 'giữ nguyên “Thả đỉa ba ba”');
ok(fix1('vườn rau , kéo cưa lửa xẻ ...') === 'vườn rau, kéo cưa lừa xẻ ...', 'bỏ dấu cách trước dấu phẩy, lửa → lừa, giữ dấu ba chấm');
ok(fix1('trước tiên(Cuốc đất)') === 'trước tiên (Cuốc đất)', 'thêm dấu cách trước ngoặc');
ok(fix1('“ Dung dăng dung dẻ”') === '“Dung dăng dung dẻ”', 'bỏ dấu cách sau ngoặc kép mở');
ok(fix1('trò chơi dân gian: ‘Kéo cưa lừa xẻ”') === 'trò chơi dân gian: “Kéo cưa lừa xẻ”', 'sửa ngoặc kép lệch');
ok(fix1('3.HĐ 3: Kết thúc') === '3. HĐ 3: Kết thúc', 'thêm dấu cách sau số thứ tự');
ok(fix1('1. HĐ1: Gây hứng thú', true) === '1. HĐ 1: Gây hứng thú' && fix1('* HĐ1: Đón trẻ', false) === '* HĐ1: Đón trẻ', '“HĐ1” → “HĐ 1” chỉ ở KH ngày');
ok(fix1('Võ Cường, ngày….. tháng ….. năm 2026') === 'Võ Cường, ngày….. tháng ….. năm 2026', 'không đụng dòng chấm chấm để điền tay');
ok(fix1('                          NGƯỜI THỰC HIỆN                         TỔ TRƯỞNG') === '                          NGƯỜI THỰC HIỆN                         TỔ TRƯỞNG', 'không đụng dòng canh lề chữ ký');
ok(fix1('tthực hiện') === 'thực hiện', 'sửa gõ đúp “tthực”');

// 2. sửa trên file thật
mkdirSync('tests/out', { recursive: true });
for (const [name, hd] of [['kh-ngay-t12-chinh', true], ['kh-tuan-t12-chinh', false], ['kh-ngay-t11-goc', true]] as const) {
  const src = readFileSync(`tests/fixtures/${name}.docx`);
  const t0 = Date.now();
  const { data, changes } = await fixDocx(src, { hdSpace: hd });
  writeFileSync(`tests/out/${name} (đã sửa).docx`, data);
  const [a, b] = [await readDocx(src), await readDocx(data)];
  const cells = (d: typeof a) => d.tables.reduce((n, t) => n + t.rows.reduce((m, r) => m + r.cells.length, 0), 0);
  ok(a.paras.length === b.paras.length && a.tables.length === b.tables.length && cells(a) === cells(b),
    `${name}: giữ nguyên ${a.paras.length} đoạn, ${a.tables.length} bảng, ${cells(a)} ô — ${changes.length} chỗ sửa (${Date.now() - t0} ms)`);
  const before = await checkFile(name, src, program as Program);
  const after = await checkFile(name, data, program as Program);
  const dict = (r: typeof before) => r.issues.filter(i => i.rule.startsWith('chinh-ta')).length;
  ok(dict(after) === 0, `${name}: hết lỗi chính tả (trước ${dict(before)}, sau ${dict(after)})`);
  ok(after.counts['chinh-ta'] < before.counts['chinh-ta'] / 2, `${name}: lỗi chính tả + trình bày giảm ${before.counts['chinh-ta']} → ${after.counts['chinh-ta']}`);
  ok(after.counts.nang === before.counts.nang, `${name}: không đụng lỗi nặng (vẫn ${after.counts.nang}, để cô quyết)`);
  // chữ ngoài các chỗ sửa không đổi: so từng ô sau khi áp lại cùng phép sửa
  const flat = (d: typeof a) => d.tables.flatMap(t => t.rows.flatMap(r => r.cells.flatMap(c => c.lines)));
  const expect = flat(a).map(l => fix1(l, hd));
  const got = flat(b);
  const diff = expect.findIndex((l, i) => l !== got[i]);
  ok(diff < 0, `${name}: nội dung các ô đúng như dự kiến${diff >= 0 ? ` — lệch ở: “${expect[diff]}” ≠ “${got[diff]}”` : ''}`);
}

// 3. chọn mục sửa: chạy khô, chỉ nhóm chính tả, bỏ từng chỗ
{
  const src = readFileSync('tests/fixtures/kh-ngay-t11-goc.docx');
  const all = await planFixes(src, { hdSpace: true });
  ok(all.length > 0 && all.some(f => f.rule.startsWith('trinh-bay')) && all.some(f => f.rule.startsWith('chinh-ta')), `chạy khô liệt kê ${all.length} chỗ sửa, có cả chính tả lẫn dấu câu`);
  const full = await fixDocx(src, { hdSpace: true });
  ok(full.changes.length === all.length, 'số chỗ sửa thật = số chỗ chạy khô liệt kê');
  const only = await fixDocx(src, { hdSpace: true, rules: rulesOfGroups(['chinh-ta']) });
  ok(only.changes.length > 0 && only.changes.every(c => c.rule === 'chinh-ta.tu-dien'), `chỉ bật nhóm chính tả: ${only.changes.length} chỗ, không có thay đổi dấu câu`);
  const prefix = await fixDocx(src, { hdSpace: true, rules: ['chinh-ta'] });
  ok(prefix.changes.every(c => c.rule.startsWith('chinh-ta')) && prefix.changes.length >= only.changes.length, 'tiền tố “chinh-ta” gồm cả từ điển lẫn gõ đúp, lặp chữ');
  const plan2 = await planFixes(src, { hdSpace: true, rules: rulesOfGroups(['dau-cau']) });
  ok(plan2.length > 0 && plan2.every(f => f.group === 'dau-cau'), `chạy khô nhóm dấu câu: ${plan2.length} chỗ, đều thuộc nhóm dấu câu`);
  ok(all.every(f => f.group && FIX_GROUPS.some(g => g.id === f.group)), 'mọi chỗ sửa đều thuộc một nhóm có ô tích');
  const victim = all[Math.floor(all.length / 2)];
  const part = await fixDocx(src, { hdSpace: true, skipIds: [victim.id] });
  ok(part.changes.length === all.length - 1 && !part.changes.some(c => c.id === victim.id), 'bỏ 1 chỗ: số chỗ sửa giảm đúng 1');
  const left = await planFixes(part.data, { hdSpace: true });
  ok(left.some(f => f.before === victim.before && f.after === victim.after && f.rule === victim.rule), `bỏ 1 chỗ: file ra vẫn còn nguyên chỗ đó (“${victim.before}” → “${victim.after}”)`);
  const part2 = await fixDocx(src, { hdSpace: true, skip: f => f.id === victim.id });
  ok(part2.changes.length === part.changes.length, 'tuỳ chọn skip (hàm) cho kết quả như skipIds');
}

console.log(failed ? `\n${failed} kiểm tra chưa đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
