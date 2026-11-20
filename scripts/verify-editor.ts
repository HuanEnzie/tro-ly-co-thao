/**
 * Kiểm bộ SỬA TAY THEO Ô (src/editor/cell-edit.ts) trên file thật kh-ngay-t12-chinh.docx:
 * sửa 3 đoạn (có đoạn đậm một phần), thêm 1, xóa 1 → đọc lại bằng readDocx phải đúng chữ mong muốn,
 * mọi chỗ khác không đổi, định dạng đậm của phần không đổi còn nguyên, XML hợp lệ, số bảng/hàng/ô không đổi.
 * Chạy: npx tsx scripts/verify-editor.ts        (WORD=1: mở thêm bằng Word qua COM, cần máy có Word)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { readDocx } from '../src/engine/docx';
import {
  applyTextEdits, applyTextEditsXml, diffHunks, editParagraph, editsFromItems, getParagraphXml, listCells, listEditable,
  readDocumentXml, type TextEdit,
} from '../src/editor/cell-edit';
import { alignParas } from '../src/editor/align';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`);
};

const FILE = 'tests/fixtures/kh-ngay-t12-chinh.docx';
const src = readFileSync(FILE);
const xml0 = await readDocumentXml(src);
const cells0 = listCells(xml0);
const find = (row: number, cell: number) => cells0.find(c => c.row === row && c.cell === cell)!;

// ---- tiện ích kiểm ----
/** chữ theo từng đoạn run kèm cờ đậm: [["B","* BTPTC:"],["n"," Cả lớp…"]] gộp các run liền kề cùng kiểu */
function boldRuns(p: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const rPr = m[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    const b = /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(rPr) ? 'B' : 'n';
    const t = [...m[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x => x[1]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('');
    if (!t) continue;
    if (out.length && out[out.length - 1][0] === b) out[out.length - 1][1] += t; else out.push([b, t]);
  }
  return out;
}
/** kiểm XML đúng cấu trúc (thẻ mở/đóng khớp nhau) */
function wellFormed(xml: string): string | null {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g)) {
    if (m[2] === undefined) continue;
    if (m[4] === '/') continue;
    if (m[1]) { const top = stack.pop(); if (top !== m[2]) return `thẻ đóng </${m[2]}> không khớp <${top}>`; } else stack.push(m[2]);
  }
  return stack.length ? `còn ${stack.length} thẻ chưa đóng` : null;
}
const flatten = (xml: string) => new Map(listEditable(xml).map(p => [`${p.loc.tbl}/${p.loc.row}/${p.loc.cell}/${p.loc.para}`, p.text]));

// ---- 0. diff / chia từng chỗ ----
const h = diffHunks('Cả lớp tập theo lời bài hát', 'Cả lớp tập theo nhạc bài hát');
ok(h.length === 1 && h[0].text === 'nhạc' && 'Cả lớp tập theo lời bài hát'.slice(h[0].s, h[0].e) === 'lời', 'diff theo từ: chỉ đổi “lời” → “nhạc”');
ok(diffHunks('abc', 'abc').length === 0, 'diff: giống nhau thì không có chỗ sửa');

// ---- 1. cấu trúc liệt kê ----
const c23 = find(2, 3), c21 = find(2, 1), c22 = find(2, 2);
ok(c23.where === 'Thứ hai – Hoạt động của cô', `tên ô “${c23.where}” = “Thứ hai – Hoạt động của cô”`);
ok(find(4, 3).where === 'Thứ ba – Hoạt động của cô' && find(6, 4).where === 'Thứ tư – Hoạt động của trẻ', 'tên cột/ngày đúng cho các hàng khác');
ok(find(3, 0).where === 'Thứ hai – ĐÁNH GIÁ CUỐI NGÀY', 'ô gộp ngang “ĐÁNH GIÁ CUỐI NGÀY” có tên riêng');
const tuan = listCells(await readDocumentXml(readFileSync('tests/fixtures/kh-tuan-t12-chinh.docx')));
ok(tuan.some(c => c.where === 'Thứ ba – Hoạt động học') && !tuan.some(c => c.vMerge === 'continue'), 'KH tuần: “Thứ ba – Hoạt động học”, bỏ ô gộp dọc phần continue');

// ---- 2. chọn 5 chỗ sửa ----
const iBold = c23.paras.findIndex(p => p.text.startsWith('* BTPTC:'));
const iTc = c23.paras.findIndex(p => p.text.startsWith('* TCVĐ:'));
const iMd = c21.paras.findIndex(p => p.text === '-Kiến thức');
const iDel = c22.paras.findIndex(p => p.text.startsWith('- '));
ok(iBold >= 0 && iTc >= 0 && iMd >= 0 && iDel >= 0, 'tìm được các đoạn mục tiêu');
const pBold0 = getParagraphXml(xml0, c23.paras[iBold].loc)!;
ok(boldRuns(pBold0).length === 2 && boldRuns(pBold0)[0][0] === 'B', 'đoạn mục tiêu có đậm một phần (“* BTPTC:” đậm, phần sau thường)');

const bold0 = c23.paras[iBold].text;
const bold1 = bold0.replace('theo lời bài hát', 'theo nhạc bài hát');
const tc0 = c23.paras[iTc].text, tc1 = 'x';
void tc1;
const tc1b = tc0.replace('Chuyển nông sản về kho.', 'Chuyển lúa về kho.');
const md0 = c21.paras[iMd].text, md1 = '-Kiến thức và kĩ năng';
const NEW_P = '* Cô nhắc trẻ giữ trật tự khi chuyển hàng.';
const delText = c22.paras[iDel].text;
ok(bold1 !== bold0 && tc1b !== tc0, 'chuỗi mới khác chuỗi cũ');

const edits: TextEdit[] = [
  { loc: c23.paras[iBold].loc, newText: bold1, expect: bold0 },            // 1. sửa (đậm một phần)
  { loc: c23.paras[iTc].loc, newText: tc1b, expect: tc0 },                  // 2. sửa
  { loc: c21.paras[iMd].loc, newText: md1, expect: md0 },                   // 3. sửa (chèn cuối đoạn có run đậm)
  { loc: c23.paras[iTc].loc, insertAfter: [NEW_P] },                        // 4. thêm đoạn
  { loc: c22.paras[iDel].loc, remove: true, expect: delText },              // 5. xóa đoạn
];

mkdirSync('tests/out', { recursive: true });
const t0 = Date.now();
const { data, report } = await applyTextEdits(src, edits);
console.log(`  (áp dụng ${Date.now() - t0} ms; sửa ${report.changedParas}, thêm ${report.inserted}, xóa ${report.removed})`);
writeFileSync('tests/out/kh-ngay-t12-chinh (sửa tay).docx', Buffer.from(data));
ok(report.changedParas === 3 && report.inserted === 1 && report.removed === 1, 'báo cáo: sửa 3, thêm 1, xóa 1');

// ---- 3. đọc lại ----
const xml1 = await readDocumentXml(data);
ok(wellFormed(xml1) === null, `XML hợp lệ${wellFormed(xml1) ? ': ' + wellFormed(xml1) : ''}`);
const m0 = await readDocx(src), m1 = await readDocx(data);
const shape = (m: typeof m0) => m.tables.map(t => t.rows.map(r => `${r.cells.length}:${r.cells.map(c => `${c.span}${c.vMerge ?? ''}`).join(',')}`));
ok(m1.tables.length === m0.tables.length && JSON.stringify(shape(m0)) === JSON.stringify(shape(m1)), `số bảng/hàng/ô, gộp ô không đổi (${m0.tables.length} bảng, ${m0.tables[0].rows.length} hàng)`);
ok(JSON.stringify(m1.paras) === JSON.stringify(m0.paras), 'đoạn ngoài bảng không đổi');

const cells1 = listCells(xml1);
const find1 = (row: number, cell: number) => cells1.find(c => c.row === row && c.cell === cell)!;
const exp = new Map<string, string[]>();
const arr = (c: typeof c23) => c.paras.map(p => p.text);
const e23 = arr(c23); e23[iBold] = bold1; e23[iTc] = tc1b; e23.splice(iTc + 1, 0, NEW_P);
const e21 = arr(c21); e21[iMd] = md1;
const e22 = arr(c22); e22.splice(iDel, 1);
exp.set('2/3', e23); exp.set('2/1', e21); exp.set('2/2', e22);
ok(JSON.stringify(arr(find1(2, 3))) === JSON.stringify(e23), 'ô “Hoạt động của cô” đúng như mong muốn (2 sửa + 1 thêm)');
ok(JSON.stringify(arr(find1(2, 1))) === JSON.stringify(e21), 'ô “Mục đích” đúng như mong muốn (sửa)');
ok(JSON.stringify(arr(find1(2, 2))) === JSON.stringify(e22), 'ô “Chuẩn bị” đúng như mong muốn (xóa 1 đoạn)');
ok(!arr(find1(2, 2)).includes(delText) || arr(c22).filter(t => t === delText).length > 1, `đoạn đã xóa (“${delText.slice(0, 30)}”) không còn`);

// mọi đoạn khác không đổi
let others = 0, diffOthers = 0;
for (const c of cells0) {
  if (exp.has(`${c.row}/${c.cell}`)) continue;
  const n = cells1.find(x => x.row === c.row && x.cell === c.cell && x.tbl === c.tbl)!;
  if (JSON.stringify(arr(n)) !== JSON.stringify(arr(c))) diffOthers++;
  others += c.paras.length;
}
ok(diffOthers === 0, `${others} đoạn ở các ô khác không đổi chữ`);
// so nguyên XML ngoài 5 chỗ: cắt 3 ô đã sửa ra, phần còn lại phải giống hệt
// các đoạn chưa sửa giữ nguyên từng byte
let sameBytes = 0, totalBytes = 0;
for (const c of cells0) for (const p of c.paras) {
  const idx = c.paras.indexOf(p);
  const isEdited = (c.row === 2 && [1, 2, 3].includes(c.cell)) && (idx === iBold || idx === iTc || idx === iMd || idx === iDel);
  if (isEdited) continue;
  const a = getParagraphXml(xml0, p.loc)!;
  if (exp.has(`${c.row}/${c.cell}`)) continue; // đoạn nằm trong ô đã đổi vị trí chỉ số (thêm/xóa)
  totalBytes++;
  if (getParagraphXml(xml1, p.loc) === a) sameBytes++;
}
ok(sameBytes === totalBytes, `${totalBytes} đoạn ở ô không đụng tới giữ nguyên từng byte XML`);
// trong ô đã sửa: các đoạn không nằm trong 5 chỗ cũng giữ nguyên byte
{
  const b0 = c23.paras.filter((_, i) => i !== iBold && i !== iTc).map(p => getParagraphXml(xml0, p.loc));
  const b1 = find1(2, 3).paras.filter((_, i) => i !== iBold && i !== iTc && i !== iTc + 1).map(p => getParagraphXml(xml1, p.loc));
  ok(JSON.stringify(b0) === JSON.stringify(b1), `${b0.length} đoạn còn lại trong ô “Hoạt động của cô” giữ nguyên byte XML`);
}

// ---- 4. định dạng đậm ----
const pBold1 = getParagraphXml(xml1, find1(2, 3).paras[iBold].loc)!;
const br1 = boldRuns(pBold1);
ok(br1.length === 2 && br1[0][0] === 'B' && br1[0][1] === '* BTPTC:' && br1[1][0] === 'n' && br1[1][1] === bold1.slice('* BTPTC:'.length),
  `đậm một phần còn nguyên: ${JSON.stringify(br1.map(r => [r[0], r[1].slice(0, 12)]))}`);
// phần chữ không đổi vẫn trong run có cùng rPr gốc
const rpr = (p: string) => [...p.matchAll(/<w:rPr>[\s\S]*?<\/w:rPr>/g)].map(m => m[0]).filter(r => !r.includes('<w:lang'));
ok(JSON.stringify([...new Set(rpr(pBold0))]) === JSON.stringify([...new Set(rpr(pBold1))]), 'bộ rPr (phông, cỡ, đậm) của đoạn không đổi');
// pPr giữ nguyên
const pPr = (p: string) => p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0];
ok(pPr(pBold0) === pPr(pBold1), 'pPr (giãn dòng, canh lề) của đoạn sửa giữ nguyên');
// đoạn mới có pPr + định dạng chữ giống đoạn bên cạnh
const pNew = getParagraphXml(xml1, find1(2, 3).paras[iTc + 1].loc)!;
ok(pPr(pNew) === pPr(getParagraphXml(xml1, find1(2, 3).paras[iTc].loc)!) && rpr(pNew).join() === [rpr(getParagraphXml(xml1, find1(2, 3).paras[iTc].loc)!).pop()].join(), 'đoạn thêm mới sao chép pPr và định dạng chữ của đoạn bên cạnh');
// chèn cuối đoạn có chữ đậm: lấy định dạng ký tự đứng trước
const pMd = boldRuns(getParagraphXml(xml1, find1(2, 1).paras[iMd].loc)!);
const pMd0 = boldRuns(getParagraphXml(xml0, c21.paras[iMd].loc)!);
ok(JSON.stringify(pMd.map(r => r[0])) === JSON.stringify(pMd0.map(r => r[0])) && pMd.map(r => r[1]).join('') === md1, `chèn cuối đoạn lấy định dạng chữ đứng trước ${JSON.stringify(pMd0)} → ${JSON.stringify(pMd)}`);

// ---- 5. tô vàng ----
const hl = await applyTextEdits(src, edits, { highlight: true });
const xmlHl = await readDocumentXml(hl.data);
ok(wellFormed(xmlHl) === null, 'XML hợp lệ khi tô vàng');
ok((xmlHl.match(/<w:highlight w:val="yellow"\/>/g) ?? []).length === 4, `tô vàng đúng 4 chỗ (3 sửa + 1 thêm): ${(xmlHl.match(/<w:highlight/g) ?? []).length}`);
ok(JSON.stringify(arr(listCells(xmlHl).find(c => c.row === 2 && c.cell === 3)!)) === JSON.stringify(e23), 'chữ khi tô vàng vẫn đúng');
ok(!xmlHl.includes('') && !xmlHl.includes(''), 'không sót dấu mốc nội bộ');
writeFileSync('tests/out/kh-ngay-t12-chinh (sửa tay, tô vàng).docx', Buffer.from(hl.data));

// ---- 6. editsFromItems (khung sửa theo ô) ----
{
  const cell = { tbl: 0, row: 2, cell: 2 };
  const orig = ['a', 'b', 'c', 'd'];
  const ed = editsFromItems(cell, orig, [{ orig: 0, text: 'a' }, { orig: null, text: 'mới' }, { orig: 2, text: 'C!' }, { orig: 3, text: 'd' }]);
  ok(ed.length === 3, 'editsFromItems: 3 chỗ đổi (thêm sau a, xóa b, sửa c)');
  const byPara = new Map(ed.map(e => [e.loc.para, e]));
  ok(byPara.get(0)?.insertAfter?.[0] === 'mới' && byPara.get(1)?.remove === true && byPara.get(2)?.newText === 'C!' && !byPara.has(3),
    'editsFromItems: thêm “mới” sau a, xóa b, sửa c, giữ d');
  const e2 = editsFromItems(cell, ['x', 'y'], [{ orig: null, text: 'p' }, { orig: 1, text: 'y' }]);
  ok(e2.find(e => e.loc.para === 1)?.insertBefore?.[0] === 'p' && e2.find(e => e.loc.para === 0)?.remove === true, 'editsFromItems: thêm lên đầu, xóa x');
}

// ---- 7. ca biên ----
{
  // xóa hết đoạn của ô → ô vẫn còn 1 đoạn trống
  const c = find(6, 0);
  const all = c.paras.map(p => ({ loc: p.loc, remove: true as const }));
  const r = applyTextEditsXml(xml0, all);
  const n = listCells(r.xml).find(x => x.row === 6 && x.cell === 0)!;
  ok(wellFormed(r.xml) === null && n.paras.length === 1 && n.paras[0].text === '', 'xóa hết đoạn trong ô → còn 1 đoạn trống, XML hợp lệ');
  // sửa đoạn trống thành có chữ
  const blankIdx = find(2, 0).paras.findIndex(p => p.text === '');
  const r2 = applyTextEditsXml(xml0, [{ loc: find(2, 0).paras[blankIdx].loc, newText: 'Chữ mới ở dòng trống' }]);
  ok(listCells(r2.xml).find(x => x.row === 2 && x.cell === 0)!.paras[blankIdx].text === 'Chữ mới ở dòng trống' && wellFormed(r2.xml) === null, 'sửa đoạn trống thành có chữ (dùng định dạng dấu đoạn)');
  // ký tự đặc biệt & < >
  const r3 = applyTextEditsXml(xml0, [{ loc: c23.paras[iTc].loc, newText: 'Tom & Jerry <vui> "ok"' }]);
  ok(wellFormed(r3.xml) === null && listCells(r3.xml).find(x => x.row === 2 && x.cell === 3)!.paras[iTc].text === 'Tom & Jerry <vui> "ok"', 'ký tự & < > được mã hóa đúng');
  // xuống dòng/tab trong đoạn
  const r4 = applyTextEditsXml(xml0, [{ loc: c23.paras[iTc].loc, newText: 'dòng 1\nđòng 2\tsau tab' }]);
  ok(wellFormed(r4.xml) === null && listCells(r4.xml).find(x => x.row === 2 && x.cell === 3)!.paras[iTc].text === 'dòng 1\nđòng 2\tsau tab' && /<w:br\/>/.test(r4.xml) && /<w:tab\/>/.test(r4.xml), 'xuống dòng và tab trong đoạn thành <w:br/>, <w:tab/>');
  // expect lệch → lỗi
  let threw = false;
  try { applyTextEditsXml(xml0, [{ loc: c23.paras[iTc].loc, newText: 'x', expect: 'sai' }]); } catch { threw = true; }
  ok(threw, 'expect lệch thì báo lỗi, không sửa nhầm');
  // sửa trong một run duy nhất, run trước/sau không đổi
  const one = editParagraph(pBold0, bold0, {});
  ok(one === pBold0, 'chữ không đổi → XML đoạn giữ nguyên từng byte');
  // zip gốc không bị đụng
  const z = await JSZip.loadAsync(src);
  const before = await z.file('word/document.xml')!.async('string');
  await applyTextEdits(z, edits);
  ok((await z.file('word/document.xml')!.async('string')) === before, 'đối tượng JSZip truyền vào không bị sửa');
  // các file khác trong zip giữ nguyên
  const z1 = await JSZip.loadAsync(data);
  const fl = (zz: JSZip) => Object.values(zz.files).filter(f => !f.dir).map(f => f.name).sort();
  const names0 = fl(z).join('|'), names1 = fl(z1).join('|');
  ok(names0 === names1, `các phần khác của file .docx giữ nguyên (${fl(z).length} mục)`);
}

// ---- 8. khớp đoạn bản xem trước (thuật toán) ----
{
  const model = ['A', '', 'B', 'C', '', 'D'];
  ok(alignParas(model, model).every((v, i) => v === i), 'align: danh sách giống nhau → ánh xạ 1-1');
  const dom = ['A', 'B', 'C', 'D'];                      // thiếu 2 đoạn trống
  const mp = alignParas(dom, model);
  ok(mp[0] === 0 && mp[2] === 1 && mp[3] === 2 && mp[5] === 3, 'align: DOM thiếu đoạn trống vẫn khớp theo chữ');
  const dom2 = ['A', '', 'X', 'B', 'C', '', 'D'];        // thừa 1 đoạn
  const mp2 = alignParas(dom2, model);
  ok(mp2[2] === 3 && mp2[3] === 4 && mp2[5] === 6, 'align: DOM thừa đoạn vẫn khớp theo chữ');
}

// ---- 9. Word COM (tùy chọn) ----
if (process.env.WORD === '1') {
  const out = resolve('tests/out/kh-ngay-t12-chinh (sửa tay).docx');
  const txt = resolve('tests/out/word-readback.txt');
  const ps = `
$ErrorActionPreference='Stop'
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
try {
  $d = $w.Documents.Open('${out.replace(/'/g, "''")}', $false, $true, $false)
  $t = $d.Content.Text
  $info = "TABLES=" + $d.Tables.Count + "; ROWS=" + $d.Tables.Item(1).Rows.Count + "; READONLY=" + $d.ReadOnly + "\`n"
  [System.IO.File]::WriteAllText('${txt.replace(/'/g, "''")}', $info + $t, [System.Text.UTF8Encoding]::new($false))
  $d.Close($false)
} finally { $w.Quit() }
`;
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0) { ok(false, `Word mở file: ${r.stderr || r.stdout}`); } else {
    const t = readFileSync(txt, 'utf8');
    ok(/TABLES=1; ROWS=12; READONLY=True/.test(t), `Word mở được (chỉ đọc, ẩn): ${t.split('\n')[0]}`);
    ok(t.includes(bold1.replace(/^\* /, '')) && t.includes('Chuyển lúa về kho.') && t.includes('Kiến thức và kĩ năng') && t.includes(NEW_P), 'Word đọc lại đúng 3 đoạn đã sửa và đoạn thêm');
    ok(!t.includes(delText.trim().slice(0, 40)) || arr(c22).filter(x => x === delText).length > 1, 'Word: đoạn đã xóa không còn');
  }
} else console.log('• Bỏ qua kiểm bằng Word (đặt WORD=1 để mở file bằng Word COM)');

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
