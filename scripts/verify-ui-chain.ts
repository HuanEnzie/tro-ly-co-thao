/**
 * Kiểm chuỗi “Tạo bản sửa” của giao diện (src/ui/fixchain.ts): sửa → căn lại → điền câu trẻ, trên file giáo án thật.
 * Chạy: npx tsx scripts/verify-ui-chain.ts   (file ra ghi vào tests/out/)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { alignGaps, alignmentMap, readXml } from '../src/engine/align';
import { readDocx } from '../src/engine/docx';
import { alignIssues, listFillSlots, runFixChain } from '../src/ui/fixchain';

let failed = 0;
const ok = (cond: unknown, msg: string) => { if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`); };
mkdirSync('tests/out', { recursive: true });

for (const name of ['kh-ngay-t12-chinh', 'kh-ngay-t11-goc']) {
  const src = readFileSync(`tests/fixtures/${name}.docx`);
  const buf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
  const slots = await listFillSlots(buf);
  ok(Array.isArray(slots), `${name}: liệt kê ${slots.length} chỗ trẻ có câu đề xuất`);
  const base = await runFixChain(buf, { hdSpace: true });
  const chain = await runFixChain(buf, { hdSpace: true, align: true, fill: slots.map(s => ({ id: s.id })) });
  ok(!!chain.align && chain.changes.length === base.changes.length, `${name}: căn hàng chạy sau sửa, số chỗ sửa vẫn ${chain.changes.length}; đã căn ${chain.align?.changed} chỗ, chưa giải quyết ${chain.align?.unresolved.length}`);
  ok(!!chain.fill && chain.fill.applied.length + chain.fill.skipped.length === slots.length, `${name}: điền trẻ áp ${chain.fill?.applied.length}, bỏ ${chain.fill?.skipped.length}/${slots.length}`);
  const back = await readDocx(chain.data);
  ok(back.tables.length > 0, `${name}: file ra mở lại được bằng readDocx`);
  writeFileSync(`tests/out/${name}-chuoi-ui.docx`, chain.data);
  // sau chuỗi không có cặp nào lệch so với bản gốc
  const o = await readXml(buf), f = await readXml(chain.data);
  const gaps = alignGaps(f.document, alignmentMap(o.document, { styles: o.styles }), { styles: f.styles });
  ok(gaps.length === 0, `${name}: sau chuỗi không còn cặp lệch so với bản gốc (${gaps.length})`);
  // chỉ căn, không điền: cũng không lệch
  const only = await runFixChain(buf, { hdSpace: true, align: true });
  const f2 = await readXml(only.data);
  ok(alignGaps(f2.document, alignmentMap(o.document, { styles: o.styles }), { styles: f2.styles }).length === 0, `${name}: chỉ sửa + căn → không lệch`);
  const iss = await alignIssues(buf);
  ok(iss.every(i => i.level === 'xem'), `${name}: ${iss.length} lỗi căn hàng/khớp (mức xem)`);
}
console.log(failed ? `\n${failed} kiểm tra chưa đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
