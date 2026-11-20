/**
 * Soạn KH ngày (hoặc KH tuần) một tuần từ file mẫu + chương trình (không gọi Gemini thật: dùng AI giả).
 * Chạy: npx tsx scripts/compose-week.ts [tuần=13] [kh-ngay|kh-tuan] [mẫu.docx] [ra.docx]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import program from '../src/data/chuong-trinh.json';
import type { Program } from '../src/engine/types';
import { compose } from '../src/compose/compose';
import { fakeGenerate } from '../src/compose/fake';
import type { LoaiKH } from '../src/compose/types';

const ab = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

const tuan = +(process.argv[2] ?? 13);
const loai = (process.argv[3] ?? 'kh-ngay') as LoaiKH;
const mau = process.argv[4] ?? (loai === 'kh-ngay' ? 'tests/fixtures/kh-ngay-t12-claude.docx' : 'tests/fixtures/kh-tuan-t12-claude.docx');
const ra = process.argv[5] ?? `tests/out/${loai}-t${tuan}-may-soan.docx`;
const tham = ['tests/fixtures/kh-ngay-t12-claude.docx', 'tests/fixtures/kh-ngay-t12-chinh.docx', 'tests/fixtures/kh-ngay-t11-goc.docx'];

const r = await compose({ tuan, loai, mau: ab(mau), thamKhao: tham.map(ab) }, program as Program, { generate: fakeGenerate, tenThamKhao: tham.map(t => t.split('/').pop()!) });
mkdirSync(dirname(ra), { recursive: true });
writeFileSync(ra, Buffer.from(r.docx));
console.log(`Đã soạn ${loai} tuần ${tuan} (${r.frame.nhanh}, ${r.frame.tuNgay}–${r.frame.denNgay}) → ${ra}`);
console.log(`Nguồn từng buổi: chép giáo án cũ ${r.nguon['tham-khao']}, AI ${r.nguon.ai}, khung ${r.nguon.khung}`);
if (r.canQuyet.length) console.log('Cần cô quyết / đối chiếu:\n' + r.canQuyet.map(c => ' - ' + c).join('\n'));
