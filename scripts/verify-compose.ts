/**
 * Kiểm máy soạn KH tuần / KH ngày (src/compose) — không gọi Gemini thật (AI giả).
 * Chạy: npx tsx scripts/verify-compose.ts      (WORD=1 để mở file bằng Word qua COM, chỉ đọc)
 * Cần tests/fixtures/*.docx (giáo án thật của lớp, không đưa lên GitHub).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import program from '../src/data/chuong-trinh.json';
import { checkFile, checkMany, Report } from '../src/engine/checker';
import type { Program } from '../src/engine/types';
import { buildPrompt, cleanDraft, draftLesson, missingParts } from '../src/compose/ai';
import { compose } from '../src/compose/compose';
import { fakeGenerate } from '../src/compose/fake';
import { alignTre, findReference, indexReferences } from '../src/compose/reference';
import { baiKhung, hdTuan, splitName, suggestTre, weekFrame } from '../src/compose/rules';
import type { GenerateFn } from '../src/compose/types';
import { parseXml, serialize } from '../src/compose/xml';

const prog = program as Program;
let failed = 0;
const ok = (cond: unknown, msg: string) => { if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`); };
const ab = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const fx = (n: string) => `tests/fixtures/${n}.docx`;
if (!existsSync(fx('kh-ngay-t12-claude'))) { console.log('Thiếu tests/fixtures/*.docx — bỏ qua verify-compose.'); process.exit(0); }
mkdirSync('tests/out', { recursive: true });

const mauNgay = ab(fx('kh-ngay-t12-claude')), mauTuan = ab(fx('kh-tuan-t12-claude'));
const tham = [fx('kh-ngay-t12-claude'), fx('kh-ngay-t12-chinh'), fx('kh-ngay-t11-goc')].map(ab);
const check = (name: string, docx: ArrayBuffer) => checkFile(name, docx, prog);
const nang = (r: Report) => r.issues.filter(i => i.level === 'nang');
const cnt = (r: Report) => `nặng ${r.counts.nang} · xem ${r.counts.xem} · chính tả ${r.counts['chinh-ta']}`;
const ne = (a: string[]) => a.map(x => x.trim()).filter(Boolean);

// ---- 0. hàm nền
{
  const z = await JSZip.loadAsync(readFileSync(fx('kh-ngay-t12-claude')));
  const x = await z.file('word/document.xml')!.async('string');
  const { head, root } = parseXml(x);
  ok(head + serialize(root) === x, 'XML đọc rồi ghi lại giống hệt (không làm mất định dạng của mẫu)');
}
ok(splitName('PTNN: Văn học: Thơ: Vè nghề nghiệp').map(l => l.text).join('|') === 'PTNN: Văn học:|Thơ: Vè nghề nghiệp', 'tách “PTNN: Văn học:” (đậm) và tên đề tài');
ok(hdTuan(12) === 'HĐLĐ' && hdTuan(13) === 'HĐVS', 'tuần chẵn HĐLĐ, tuần lẻ HĐVS');
ok(suggestTre('- Hỏi trẻ: Cô vừa kể câu truyện gì?') === '- Trẻ trả lời' && suggestTre('- Cô kể diễn cảm kết hợp cử chỉ') === '- Trẻ lắng nghe' && suggestTre('- Cô làm mẫu lần 1') === '- Trẻ quan sát' && suggestTre('+ Người anh là người như thế nào?') === '', 'gợi ý câu trẻ: hỏi→trả lời, kể→lắng nghe, mẫu→quan sát, ý nhỏ “+” để trống');
ok(JSON.stringify(alignTre(['- Cô kể', '- Hỏi trẻ: gì?'], ['- Trẻ lắng nghe', '- Trẻ trả lời'])) === '["- Trẻ lắng nghe","- Trẻ trả lời"]', 'căn câu trẻ khi số đoạn bằng nhau');

// ---- 1. khung từ chương trình
const f13 = weekFrame(prog, 13), f12 = weekFrame(prog, 12);
ok(f13.tuNgay === '30/11/2026' && f13.denNgay === '04/12/2026' && f13.days.length === 5, 'tuần 13: 30/11 – 04/12/2026, đủ 5 ngày');
ok(f12.days.map(d => d.ngay).join() === '23/11/2026,24/11/2026,25/11/2026,26/11/2026,27/11/2026', 'tuần 12: ngày từng thứ đúng');
ok(f13.nhanh === 'Nghề dịch vụ' && /HĐVS/.test(f13.days[1].chieu.ten) && f13.canQuyet.every(c => !/HĐLĐ|HĐVS/.test(c)), 'tuần 13 (lẻ): thứ ba chiều là HĐVS, không có cảnh báo HĐLĐ/HĐVS');
ok(f12.days[1].chieu.kind === 'lao-dong' && f12.days[0].chieu.coBaiSoan === false && f12.days[0].sang.kind === 'the-duc', 'tuần 12: HĐLĐ thứ ba chiều, thứ hai chiều chỉ có tên (góc), thứ hai sáng là thể dục');
ok(weekFrame(prog, 12, [3, 5]).days.length === 2, 'chọn ngày: chỉ lấy thứ 3 và thứ 5');
ok(f12.days[4].cuoiNgay.length === 1 && f12.days[0].cuoiNgay[0] === '- Nêu gương', 'cuối ngày: Nêu gương – Vệ sinh – Trả trẻ (thứ sáu gộp “Nêu gương cuối tuần”)');
{
  let loi = '';
  try { weekFrame(prog, 40); } catch (e) { loi = (e as Error).message; }
  ok(/không có tuần 40/.test(loi), 'tuần không có trong chương trình → báo lỗi rõ');
}
// khung theo loại tiết đạt bộ kiểm cấu trúc của tổ (không thiếu phần nào)
for (const w of [11, 12, 13, 14]) for (const d of weekFrame(prog, w).days) for (const s of [d.sang, d.chieu]) if (s.coBaiSoan) {
  const thieu = missingParts(baiKhung(s, d.thu), s);
  ok(!thieu.length, `khung tuần ${w} ${d.thuTen} ${s.buoi} (${s.kind}) đủ phần theo cấu trúc bài soạn${thieu.length ? ': ' + thieu.join('; ') : ''}`);
}

// ---- 2. soạn KH ngày tuần 13 từ mẫu tuần 12 (AI giả + giáo án cũ)
const r13 = await compose({ tuan: 13, loai: 'kh-ngay', mau: mauNgay, thamKhao: tham }, prog, { generate: fakeGenerate, tenThamKhao: ['t12-claude', 't12-chinh', 't11-goc'] });
writeFileSync('tests/out/kh-ngay-t13-may-soan.docx', Buffer.from(r13.docx));
const rep13 = await check('kh-ngay-t13-may-soan', r13.docx);
console.log(`  (file máy soạn KH ngày tuần 13: ${cnt(rep13)})`);
ok(rep13.parsed.kind === 'kh-ngay' && rep13.parsed.tuan === 13 && rep13.parsed.days.length === 5, 'file soạn nhận ra là KH ngày tuần 13, đủ 5 ngày');
ok(nang(rep13).length === 0, `file soạn: không có lỗi nặng (${nang(rep13).map(i => i.where + ' ' + i.message).join(' | ')})`);
ok(rep13.counts.xem === 0, `file soạn: không có lỗi “cần xem” (${rep13.issues.filter(i => i.level === 'xem').map(i => i.where + ': ' + i.message).join(' | ')})`);
ok(!rep13.issues.some(i => /^(chuong-trinh|ngay|quy-dinh|cau-truc)/.test(i.rule) && i.level !== 'chinh-ta'), 'file soạn: không lỗi chương trình / ngày / quy định / cấu trúc');
ok(rep13.parsed.days.every((d, i) => d.thuSo === f13.days[i].thu && d.ngay === f13.days[i].ngay), 'thứ và ngày tháng từng ngày khớp chương trình');
ok(r13.nguon['tham-khao'] + r13.nguon.ai + r13.nguon.khung === 9, `9 buổi có tiến hành (tham khảo ${r13.nguon['tham-khao']}, AI ${r13.nguon.ai}, khung ${r13.nguon.khung})`);
for (const d of rep13.parsed.days) for (const s of [d.sang, d.chieu]) if (s.co.some(l => l.trim()))
  ok(s.co.length === s.tre.length, `${d.thu} ${s.buoi}: ${s.co.length} đoạn cô = ${s.tre.length} đoạn trẻ`);
ok(rep13.parsed.days.every(d => /vệ sinh/i.test(d.col0.join(' ')) && /trả trẻ/i.test(d.col0.join(' '))), 'cuối ngày có Vệ sinh – Trả trẻ');
{
  const z = await JSZip.loadAsync(r13.docx);
  const x = await z.file('word/document.xml')!.async('string');
  ok(/<w:highlight w:val="yellow"\/>/.test(x), 'chỗ “[Cô điền: …]” được tô vàng');
  ok(r13.docx.byteLength !== mauNgay.byteLength || Buffer.compare(Buffer.from(r13.docx), Buffer.from(mauNgay)) !== 0, 'trả về file mới, không phải file mẫu');
}

// ---- 3. chép từ giáo án cũ: nguyên văn
{
  const idx = await indexReferences([mauNgay], ['t12']);
  const m = findReference(idx, f12.days[1].sang, 3); // truyện Hai anh em
  ok(!!m && !m.gan && m.draft.nguon === 'tham-khao', 'tìm được “Truyện Hai anh em” trong giáo án cũ (khớp tên mềm)');
  const r12 = await compose({ tuan: 12, loai: 'kh-ngay', mau: mauNgay, thamKhao: [mauNgay] }, prog, { tenThamKhao: ['t12'] });
  writeFileSync('tests/out/kh-ngay-t12-may-soan-tham-khao.docx', Buffer.from(r12.docx));
  const rep12 = await check('t12-lai', r12.docx), orig = await check('t12-goc', mauNgay);
  const same = rep12.parsed.days.every((d, i) => JSON.stringify(ne(d.sang.co)) === JSON.stringify(ne(orig.parsed.days[i].sang.co)) && JSON.stringify(ne(d.sang.md)) === JSON.stringify(ne(orig.parsed.days[i].sang.md)));
  ok(same, 'chép lại tuần 12 từ chính giáo án tuần 12: câu cô và mục đích yêu cầu buổi sáng giống từng chữ');
  ok(nang(rep12).length === 0, `chép lại tuần 12: không lỗi nặng (${cnt(rep12)}; bản gốc ${cnt(orig)})`);
  ok(r12.nguon.khung === 0 && r12.nguon.ai === 0, 'tuần 12 có đủ giáo án cũ nên không phải dùng AI hay khung');
}

// ---- 4. chọn ngày
{
  const r = await compose({ tuan: 13, loai: 'kh-ngay', ngay: [3, 5], mau: mauNgay, thamKhao: tham }, prog, { generate: fakeGenerate });
  const rep = await check('chon-ngay', r.docx);
  ok(rep.parsed.days.map(d => d.thuSo).join() === '3,5', 'chọn thứ 3 và thứ 5: file chỉ có 2 ngày');
  ok(nang(rep).every(i => i.rule === 'ngay.thieu-ngay'), 'chọn ngày: lỗi nặng duy nhất là “thiếu ngày” (đúng, vì không soạn các ngày kia)');
}

// ---- 5. không có AI, không có giáo án cũ: khung luật
{
  const r = await compose({ tuan: 14, loai: 'kh-ngay', mau: mauNgay }, prog, {});
  const rep = await check('chi-khung', r.docx);
  ok(r.nguon.khung === 9 && r.nguon.ai === 0, 'không AI, không giáo án cũ: mọi buổi dùng khung');
  ok(nang(rep).length === 0, `chỉ khung luật: không lỗi nặng (${cnt(rep)})`);
  ok(!rep.issues.some(i => /^cau-truc/.test(i.rule)), 'chỉ khung luật: đủ HĐ 1/2/3 và các phần theo loại tiết');
  ok(rep.parsed.days.every(d => d.thuSo !== 3 || /HĐLĐ/.test(d.chieu.ten)), 'tuần 14 (chẵn): thứ ba chiều là HĐLĐ');
}

// ---- 6. AI: lọc đầu ra, thử lại, rơi về khung
{
  const f = f12.days[1].sang; // truyện
  const info = { tuan: 12, thu: 3, nhanh: 'Nghề sản xuất', frame: f };
  const p = buildPrompt(info);
  ok(/ĐẦU VÀO:/.test(p.user) && !/Thảo|Chinh/.test(p.system + p.user), 'lời dặn AI có đầu vào và không chứa tên giáo viên');
  ok((p.schema as { required: string[] }).required.join() === 'md,cb,steps', 'khuôn JSON có md, cb, steps (phan, co, tre)');
  const kk = await draftLesson(info, fakeGenerate);
  ok(kk.fromAi && kk.draft.nguon === 'ai' && !missingParts(kk.draft, f).length, 'AI giả trả đủ phần: nhận (nguon = ai)');
  ok(kk.draft.steps.every(s => s.co.length === s.tre.length), 'mỗi bước cô–trẻ cùng số đoạn');
  let n = 0;
  const hong: GenerateFn = async () => { n++; return 'không phải JSON'; };
  const r1 = await draftLesson(info, hong);
  ok(!r1.fromAi && r1.draft.nguon === 'khung' && n === 2 && !!r1.draft.ghiChu?.length, 'AI trả rác: thử lại 1 lần rồi dùng khung, có ghi chú');
  const loi: GenerateFn = async () => { throw new Error('hết hạn mức'); };
  ok(!(await draftLesson(info, loi)).fromAi, 'AI báo lỗi: dùng khung, không làm hỏng việc');
  const thieu: GenerateFn = async () => JSON.stringify({
    md: ['- Kiến thức: a', '- Kỹ năng: b', '- Thái độ: c'], cb: ['* ĐD của cô:', '- a'],
    steps: [
      { phan: '1. HĐ 1: Gây hứng thú:', co: ['- Hát'], tre: ['- Trẻ hát'] },
      { phan: '2. HĐ 2: Bài mới:', co: ['- Cô kể'], tre: ['- Trẻ nghe'] },
      { phan: '3. HĐ 3: Kết thúc:', co: ['- Ra chơi'], tre: ['- Trẻ ra chơi'] },
    ],
  });
  ok(!(await draftLesson(info, thieu)).fromAi, 'AI thiếu “kể lần 1/2, củng cố” của truyện: bị loại, dùng khung');
  const c = cleanDraft({
    md: ['- Kiến thức: x'], cb: ['* ĐD của cô:'],
    steps: [
      { phan: '1. HĐ 1', co: ['- A', '', '- B'], tre: ['- Trẻ trả lời'] },
      { phan: '2. HĐ 2', co: ['- Tóm tắt nội dung: Truyện kể về hai anh em…'], tre: ['- Trẻ lắng nghe', '- Dư'] },
      { phan: '3. HĐ 3', co: ['- Ra chơi'], tre: [] },
    ],
  }, f, 3);
  ok(!!c.draft && c.draft.steps[0].co.length === 2 && c.draft.steps[0].tre.length === 2, 'lọc: bỏ đoạn cô rỗng, cột trẻ bù cho đủ số đoạn');
  ok(c.draft!.steps[1].tre.length === 1 && c.problems.some(x => /nhiều hơn/.test(x)), 'lọc: cột trẻ thừa bị cắt, có báo');
  ok(/\[Cô đối chiếu/.test(c.draft!.steps[1].co[0]), 'lọc: dòng “Tóm tắt nội dung” của AI được gắn “[Cô đối chiếu]” (không bịa truyện)');
  ok(!cleanDraft({ md: [], cb: [], steps: [] }, f, 3).draft, 'lọc: JSON rỗng bị loại');
}

// ---- 7. KH tuần
{
  const r = await compose({ tuan: 13, loai: 'kh-tuan', mau: mauTuan }, prog, {});
  writeFileSync('tests/out/kh-tuan-t13-may-soan.docx', Buffer.from(r.docx));
  const rep = await check('kh-tuan-t13', r.docx);
  console.log(`  (KH tuần máy soạn tuần 13: ${cnt(rep)})`);
  ok(rep.parsed.kind === 'kh-tuan' && rep.parsed.tuan === 13 && rep.parsed.week?.days.length === 5, 'KH tuần: nhận đúng loại, tuần 13, đủ 5 ngày');
  ok(nang(rep).length === 0, `KH tuần: không lỗi nặng (${nang(rep).map(i => i.where + ' ' + i.message).join(' | ')})`);
  ok(rep.parsed.week!.days.map(d => d.ngay).join() === f13.days.map(d => d.ngay).join(), 'KH tuần: ngày từng thứ khớp chương trình');
  ok(rep.parsed.title.join(' ').includes('NGHỀ DỊCH VỤ'), 'KH tuần: tiêu đề có chủ đề nhánh của tuần 13');
  ok(r.canQuyet.some(c => /KH tuần: 4 khối/.test(c)), 'KH tuần: báo cô 4 khối cả tuần mới có khung');
  const cross = checkMany([rep, rep13]);
  ok(cross.every(x => !x.issues.some(i => i.rule === 'khop.tuan-ngay')), 'KH tuần và KH ngày máy soạn khớp tên hoạt động');
}

// ---- 8. mở bằng Word (COM, chỉ đọc)
if (process.env.WORD === '1') {
  for (const f of ['kh-ngay-t13-may-soan', 'kh-tuan-t13-may-soan']) {
    const path = `${process.cwd()}\\tests\\out\\${f}.docx`;
    const ps = '$ErrorActionPreference="Stop"; $w=New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0; try { $d=$w.Documents.Open($env:DOCX_PATH,$false,$true); $t=$d.Tables.Count; $p=$d.ComputeStatistics(2); $d.Close($false); "$t|$p" } finally { $w.Quit() }';
    const out = spawnSync('powershell', ['-NoProfile', '-Command', ps], { env: { ...process.env, DOCX_PATH: path }, encoding: 'utf8', timeout: 120000 });
    const m = (out.stdout ?? '').trim().match(/(\d+)\|(\d+)\s*$/);
    ok(!!m, `Word mở được ${f}.docx (chỉ đọc)${m ? `: ${m[1]} bảng, ${m[2]} trang` : ` — ${(out.stderr || out.stdout || '').slice(0, 200)}`}`);
  }
} else console.log('(chưa mở bằng Word: chạy lại với WORD=1)');

console.log(failed ? `\n${failed} kiểm tra chưa đạt.` : '\nTất cả kiểm tra đều đạt.');
process.exit(failed ? 1 : 0);
