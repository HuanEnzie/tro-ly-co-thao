/**
 * Soát 1 hoặc nhiều file .docx từ dòng lệnh (không gọi AI).
 * Chạy: npx tsx scripts/check-file.ts "<file1.docx>" ["<file2.docx>" ...]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { checkFile, checkMany } from '../src/engine/checker';
import { KIND_LABEL, LEVEL_LABEL, Program } from '../src/engine/types';
import program from '../src/data/chuong-trinh.json';

const files = process.argv.slice(2);
if (!files.length) { console.log('Cách dùng: npx tsx scripts/check-file.ts <file.docx> ...'); process.exit(1); }
const reports = checkMany(await Promise.all(files.map(f => checkFile(basename(f), readFileSync(f), program as Program))));
for (const r of reports) {
  console.log(`\n=== ${r.name} — ${KIND_LABEL[r.parsed.kind]}${r.parsed.tuan ? `, tuần ${r.parsed.tuan}` : ''}`);
  console.log(`    ${Object.entries(r.counts).map(([k, v]) => `${LEVEL_LABEL[k as keyof typeof LEVEL_LABEL]}: ${v}`).join(' · ')}`);
  for (const i of r.issues)
    console.log(`[${LEVEL_LABEL[i.level]}] ${i.where}: ${i.message}${i.found ? `\n      gốc: ${i.found}` : ''}${i.fix ? `\n      sửa: ${i.fix}` : ''}   (${i.rule})`);
}
