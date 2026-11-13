/**
 * Đọc file "CHƯƠNG TRÌNH HỌC CĐ …" (docx) -> src/data/chuong-trinh.json (kho đối chiếu tiết học theo tuần).
 * Chạy: npx tsx scripts/import-chuong-trinh.ts "<đường dẫn docx>"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDocx } from '../src/engine/docx';
import { parseProgram } from '../src/engine/parse';

const file = process.argv[2] ?? 'tests/fixtures/chuong-trinh-nghe-nghiep.docx';
const prog = parseProgram(await readDocx(readFileSync(resolve(file))));
if (!prog) throw new Error('Không đọc được bảng chương trình');
const out = resolve('src/data/chuong-trinh.json');
writeFileSync(out, JSON.stringify(prog, null, 2) + '\n', 'utf8');
console.log(`Đã ghi ${out}: ${prog.weeks.map(w => `tuần ${w.tuan} (${w.nhanh})`).join(', ')}`);
