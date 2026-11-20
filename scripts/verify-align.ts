/**
 * Kiểm bộ CĂN HÀNG cô ↔ trẻ (src/engine/align.ts, suggest-tre.ts, tre-rules.ts).
 *  - Phần thuần JS (luôn chạy): luật gợi ý câu cho trẻ, bản đồ căn hàng, realign sau khi bộ sửa chạy, không đụng chữ.
 *  - Phần Word thật (chỉ khi có biến môi trường WORD=1, chậm ~1 phút mỗi file): mở file bằng Word (COM, ẩn, chỉ đọc),
 *    đọc vị trí dòng và xác nhận mọi cặp đã gắn lệch 0 dòng; ca đối chứng: không realign thì có cặp lệch.
 * Chạy: npx tsx scripts/verify-align.ts        (WORD=1 npx tsx scripts/verify-align.ts để có cả phần Word)
 * File ghi vào tests/out/ để mở bằng Word xem.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { AlignmentMap, alignGaps, alignmentMap, checkAlign, layoutRows, readXml, realign, realignDocx } from '../src/engine/align';
import { fixDocx } from '../src/engine/fixer';
import { applySuggestions, suggestTre } from '../src/engine/suggest-tre';
import { classifyCo, classifyTre, mismatchReason, suggestFor } from '../src/engine/tre-rules';
import { readDocx } from '../src/engine/docx';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`);
};
const sug = (s: string) => suggestFor(s)?.text ?? null;

// 1. luật gợi ý câu cho trẻ
ok(sug('- Các con thấy tranh vẽ gì?') === '- Trẻ trả lời', 'câu hỏi (có “?”) → Trẻ trả lời');
ok(sug('- Cô hỏi: Bác nông dân cần có những gì') === '- Trẻ trả lời', '“Cô hỏi…” → Trẻ trả lời');
ok(sug('- Con thấy bạn làm gì') === '- Trẻ trả lời', '“Con thấy…” → Trẻ trả lời');
ok(sug('- Con có biết đây là gì không') === '- Trẻ trả lời', '“Con có biết…” → Trẻ trả lời');
ok(sug('- Cô hát cho trẻ nghe bài “Hạt gạo làng ta”') === '- Trẻ lắng nghe', '“Cô hát…” → Trẻ lắng nghe');
ok(sug('- Cô kể chuyện “Cây rau của thỏ út”') === '- Trẻ lắng nghe', '“Cô kể…” → Trẻ lắng nghe');
ok(sug('- Cô đọc bài thơ') === '- Trẻ lắng nghe', '“Cô đọc…” → Trẻ lắng nghe');
ok(sug('- Cô khái quát lại') === '- Trẻ lắng nghe', '“Cô khái quát…” → Trẻ lắng nghe');
ok(sug('- Cô nhận xét, khen ngợi trẻ') === '- Trẻ lắng nghe', '“Cô nhận xét…” → Trẻ lắng nghe');
ok(sug('- Cho trẻ nghe hát bài: Hạt gạo làng ta') === '- Trẻ lắng nghe', '“Cho trẻ nghe…” → Trẻ lắng nghe');
ok(sug('- Cô làm mẫu lần 1 không phân tích.') === '- Trẻ quan sát', '“Cô làm mẫu…” → Trẻ quan sát');
ok(sug('- Cho trẻ quan sát tranh') === '- Trẻ quan sát', '“Cho trẻ quan sát…” → Trẻ quan sát');
ok(sug('- Cô cho trẻ hát bài “Lớn lên cháu lái máy cày”') === '- Trẻ hát', '“Cô cho trẻ hát…” → Trẻ hát');
ok(sug('- Cô cho trẻ đọc thơ') === '- Trẻ đọc', '“Cô cho trẻ đọc…” → Trẻ đọc');
ok(sug('- Cho trẻ vận động theo nhạc') === '- Trẻ vận động', '“Cho trẻ vận động…” → Trẻ vận động');
ok(sug('- Cô cho trẻ chơi') === '- Trẻ chơi', '“Cô cho trẻ chơi” → Trẻ chơi');
ok(sug('- Tổ chức cho trẻ chơi 1-2 lần.') === '- Trẻ chơi', '“Tổ chức cho trẻ chơi” → Trẻ chơi');
ok(sug('- Mời 2 trẻ lên thực hiện') === '- Trẻ thực hiện', '“Mời trẻ… thực hiện” → Trẻ thực hiện');
ok(sug('- Cho trẻ thực hiện') === '- Trẻ thực hiện', '“Cho trẻ thực hiện” → Trẻ thực hiện');
ok(sug('- Đàm thoại:') === null && sug('* BTPTC: Cả lớp tập các động tác tay') === null && sug('a. Khởi động') === null, 'không chắc (đàm thoại, tiêu đề) → null để AI xử lý');
ok(sug('- Cô cho trẻ nghe bài hát “Ai ơi?”') === '- Trẻ lắng nghe', '“?” nằm trong ngoặc kép (tên bài hát) không bị tính là câu hỏi');
ok(sug('- Cho trẻ hát “Lớn lên cháu lái máy cày”, trò chuyện: Bác nông dân làm gì?') === null, 'vừa cho hát vừa hỏi → null (để AI), không đoán');
ok(classifyCo('') === null && classifyTre('').size === 0, 'chuỗi rỗng không phân loại');

// 2. cảnh báo không khớp
ok(mismatchReason('- Cho trẻ nghe hát bài: Hạt gạo làng ta', '- Trẻ hát') !== null, 'cô cho nghe hát mà trẻ ghi “Trẻ hát” → cảnh báo');
ok(mismatchReason('- Cô cho trẻ hát bài “Cô giáo em”', '- Trẻ lắng nghe') !== null, 'cô cho trẻ hát mà trẻ ghi “lắng nghe” → cảnh báo');
ok(mismatchReason('- Cho trẻ nghe hát bài: Hạt gạo làng ta', '- Trẻ lắng nghe') === null, 'không báo nhầm: nghe ↔ lắng nghe');
ok(mismatchReason('- Cô cho trẻ hát bài “Cô giáo em”', '- Trẻ hát') === null, 'không báo nhầm: hát ↔ hát');
ok(mismatchReason('- Cô hỏi: con thấy gì?', '- Trẻ trả lời') === null, 'không báo nhầm: hỏi ↔ trả lời');
ok(mismatchReason('- Cho trẻ nghe hát bài: Hạt gạo làng ta', '- Trẻ lắng nghe và hát theo') === null, 'không báo nhầm khi trẻ ghi nhiều việc');
ok(mismatchReason('- Cho trẻ nghe hát', '') === null, 'ô trẻ trống không là “không khớp”');

// 3. trên giáo án thật
mkdirSync('tests/out', { recursive: true });
const FIXTURES = ['kh-ngay-t12-chinh', 'kh-ngay-t11-goc', 'kh-ngay-t12-claude'];
const load = async (name: string) => { const src = readFileSync(`tests/fixtures/${name}.docx`); return { src, ...(await readXml(src)) }; };
const trePlain = (xml: string, styles?: string) => layoutRows(xml, { styles }).map(r => r.tre.paras.filter(p => !p.blank).map(p => p.text).join('\n'));
const coXml = (xml: string, styles?: string) => layoutRows(xml, { styles }).map(r => r.co.paras.map(p => xml.slice(p.s, p.e)).join(''));

const maps: Record<string, AlignmentMap> = {};
for (const name of FIXTURES) {
  const o = await load(name);
  const rows = layoutRows(o.document, { styles: o.styles });
  ok(rows.length === 5, `${name}: tìm được ${rows.length} hàng ngày có cặp ô cô/trẻ`);
  const map = maps[name] = alignmentMap(o.document, { styles: o.styles });
  ok(map.pairs.length > 50, `${name}: ${map.pairs.length} cặp cô ↔ trẻ gắn được`);
  ok(alignGaps(o.document, map, { styles: o.styles }).length === 0, `${name}: không báo nhầm lệch trên chính bản gốc`);
  ok(checkAlign(o.document, map, { styles: o.styles }).length === 0, `${name}: checkAlign với bản đồ gốc: 0 cặp lệch`);
  const r0 = realign(o.document, o.document, { styles: o.styles });
  ok(r0.xml === o.document && r0.changes.length === 0, `${name}: realign khi không sửa gì → không đổi một byte`);
}

// 3a. bộ sửa thật làm lệch (t11-goc), realign đưa về thẳng hàng, không đổi chữ
for (const [name, hd] of [['kh-ngay-t11-goc', true], ['kh-ngay-t12-chinh', true]] as const) {
  const o = await load(name);
  const { data } = await fixDocx(o.src, { hdSpace: hd });
  const f = await readXml(data);
  const before = alignGaps(f.document, maps[name], { styles: f.styles });
  const r = realign(o.document, f.document, { styles: f.styles });
  const after = alignGaps(r.xml, maps[name], { styles: f.styles });
  console.log(`  ${name}: sau bộ sửa lệch ${before.length} cặp → sau realign lệch ${after.length} cặp (${r.changes.length} chỗ chỉnh dòng trống${r.unresolved.length ? ', chưa xử lý: ' + r.unresolved.join('; ') : ''})`);
  ok(after.length === 0, `${name}: sau realign mọi cặp lệch 0 dòng (theo bộ đo)`);
  ok(JSON.stringify(trePlain(r.xml, f.styles)) === JSON.stringify(trePlain(f.document, f.styles)), `${name}: realign không đổi chữ cột trẻ`);
  ok(JSON.stringify(coXml(r.xml, f.styles)) === JSON.stringify(coXml(f.document, f.styles)), `${name}: realign không đụng cột cô`);
  writeFileSync(`tests/out/${name} (chỉ sửa, chưa căn).docx`, data);
  const out = await realignDocx(o.src, data);
  writeFileSync(`tests/out/${name} (đã sửa, căn hàng).docx`, out.data);
  const [a, b] = [await readDocx(o.src), await readDocx(out.data)];
  ok(a.tables.length === b.tables.length && a.paras.length === b.paras.length, `${name}: file .docx sau căn hàng đọc lại được, giữ ${a.tables.length} bảng`);
  ok(out.changes.every(c => c.action === 'them' || c.action === 'bo'), `${name}: chỉ thêm/bỏ đoạn rỗng`);
}

// 3b. ca thử tự tạo: kéo dài / rút ngắn câu cô trên t12-chinh
export function stretch(xml: string, styles: string | undefined, dir: 'dai' | 'ngan') {
  const rows = layoutRows(xml, { styles });
  const map = alignmentMap(xml, { styles });
  const edits: { s: number; e: number; text: string }[] = [];
  const done = new Set<number>();
  for (const r of rows) {
    const pairs = map.pairs.filter(p => p.table === r.table && p.row === r.row);
    // chọn đoạn cô có trẻ gắn ở các đoạn SAU nó
    const cand = r.co.paras.find(p => !p.blank && p.lines >= (dir === 'ngan' ? 2 : 1) && pairs.some(q => q.coPara > p.idx));
    if (!cand || done.has(r.row)) continue;
    done.add(r.row);
    const px = xml.slice(cand.s, cand.e);
    const ts = [...px.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)];
    const last = ts[ts.length - 1];
    const abs = cand.s + last.index!;
    if (dir === 'dai') {
      const add = ' và cô nhắc nhở trẻ chú ý lắng nghe, quan sát thật kỹ để trả lời đúng các câu hỏi của cô';
      edits.push({ s: abs + last[0].indexOf(last[1]) + last[1].length - 0, e: abs + last[0].indexOf(last[1]) + last[1].length, text: add });
      // chèn trước thẻ đóng </w:t>; thẻ mở có thể thiếu xml:space nên thêm dấu cách an toàn
    } else {
      const keep = last[1].split(' ').slice(0, 2).join(' ');
      edits.push({ s: abs + last[0].indexOf(last[1]), e: abs + last[0].indexOf(last[1]) + last[1].length, text: keep });
      const others = ts.slice(0, -1);
      for (const o of others) edits.push({ s: cand.s + o.index! + o[0].indexOf(o[1]), e: cand.s + o.index! + o[0].indexOf(o[1]) + o[1].length, text: '' });
    }
  }
  let out = xml;
  for (const e of edits.sort((a, b) => b.s - a.s)) out = out.slice(0, e.s) + e.text + out.slice(e.e);
  return { xml: out, rows: done.size };
}
for (const dir of ['dai', 'ngan'] as const) {
  const o = await load('kh-ngay-t12-chinh');
  const t = stretch(o.document, o.styles, dir);
  const before = alignGaps(t.xml, maps['kh-ngay-t12-chinh'], { styles: o.styles });
  const r = realign(o.document, t.xml, { styles: o.styles });
  const after = alignGaps(r.xml, maps['kh-ngay-t12-chinh'], { styles: o.styles });
  console.log(`  ca thử ${dir === 'dai' ? 'kéo dài' : 'rút ngắn'} câu cô ở ${t.rows} hàng: lệch ${before.length} cặp → sau realign ${after.length}; ${r.changes.length} chỗ chỉnh`);
  ok(before.length > 0, `ca thử ${dir}: không realign thì có cặp lệch (đối chứng)`);
  ok(after.length === 0, `ca thử ${dir}: sau realign mọi cặp lệch 0 dòng (theo bộ đo)`);
  ok(JSON.stringify(trePlain(r.xml, o.styles)) === JSON.stringify(trePlain(t.xml, o.styles)), `ca thử ${dir}: không đổi chữ cột trẻ`);
  const z = await JSZip.loadAsync(o.src);
  z.file('word/document.xml', t.xml);
  writeFileSync(`tests/out/ca-thu-${dir}-khong-can.docx`, await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  z.file('word/document.xml', r.xml);
  writeFileSync(`tests/out/ca-thu-${dir}-da-can.docx`, await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

// 3c. đề xuất câu cho trẻ: chỉ điền vào đoạn rỗng, không ghi đè
for (const name of FIXTURES) {
  const o = await load(name);
  const s = suggestTre(o.document, { styles: o.styles });
  const withSug = s.slots.filter(x => x.suggestion && x.target);
  const res = applySuggestions(o.document, withSug.map(x => ({ id: x.id })), { styles: o.styles });
  const trBefore = trePlain(o.document, o.styles), trAfter = trePlain(res.xml, o.styles);
  // mọi câu cũ của trẻ còn nguyên, đúng thứ tự (câu mới chen vào giữa)
  const oldAll = layoutRows(o.document, { styles: o.styles }).flatMap(r => r.tre.paras.filter(p => !p.blank).map(p => p.text));
  const newAll = layoutRows(res.xml, { styles: o.styles }).flatMap(r => r.tre.paras.filter(p => !p.blank).map(p => p.text));
  let k = 0; for (const t of newAll) if (k < oldAll.length && t === oldAll[k]) k++;
  ok(k === oldAll.length, `${name}: điền ${res.applied.length}/${withSug.length} gợi ý, mọi câu trẻ có sẵn giữ nguyên (không ghi đè)`);
  ok(newAll.length === oldAll.length + res.applied.length, `${name}: số câu trẻ tăng đúng bằng số gợi ý đã điền`);
  ok(coXml(res.xml, o.styles).join() === coXml(o.document, o.styles).join(), `${name}: không đụng cột cô khi điền gợi ý`);
  const again = suggestTre(res.xml, { styles: o.styles });
  ok(again.slots.every(x => !res.applied.includes(x.id)), `${name}: điền xong chỗ đó không còn là chỗ trống (điền lại không trùng)`);
  void trBefore; void trAfter;
  const z = await JSZip.loadAsync(o.src);
  z.file('word/document.xml', res.xml);
  writeFileSync(`tests/out/${name} (điền gợi ý trẻ).docx`, await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  ok(alignGaps(res.xml, maps[name], { styles: o.styles }).length === 0, `${name}: điền gợi ý không làm lệch cặp có sẵn`);
}
{
  const o = await load('kh-ngay-t12-chinh');
  const s = suggestTre(o.document, { styles: o.styles });
  const tn = s.slots.find(x => x.target)!;
  const mine = applySuggestions(o.document, [{ id: tn.id, text: '- Trẻ nhắc lại' }], { styles: o.styles });
  ok(mine.applied.length === 1 && mine.xml.includes('Trẻ nhắc lại'), 'applySuggestions nhận câu cô tự gõ thay cho câu đề xuất');
  const nothing = applySuggestions(o.document, [{ id: '9:9:9' }], { styles: o.styles });
  ok(nothing.xml === o.document && nothing.skipped.length === 1, 'id không có → bỏ qua, không đổi file');
  const m = suggestTre(o.document, { styles: o.styles }).mismatches;
  ok(m.some(i => /Hạt gạo làng ta/.test(i.found ?? '')), 'phát hiện trên giáo án thật: cô cho nghe hát “Hạt gạo làng ta” mà trẻ ghi “Trẻ hát”');
}

// 4. Word thật
if (process.env.WORD === '1') {
  const { wordParas, locate, lineAccuracy, pairOffsets, wordMap } = await import('./word-compare');
  const cols = (rows: ReturnType<typeof layoutRows>) => [...new Set(rows.flatMap(r => [r.coCi + 1, r.treCi + 1]))];
  const loadWord = async (file: string) => {
    const { document, styles } = await readXml(readFileSync(file));
    const rows = layoutRows(document, { styles });
    const { located } = locate(rows, await wordParas(file, cols(rows)));
    return { rows, located };
  };
  const accAll = { n: 0, ok: 0 };
  // chân lý: bản đồ cặp cô ↔ trẻ do CHÍNH Word đo trên bản gốc; so với bản đồ do bộ đo suy ra
  const truth: Record<string, AlignmentMap> = {};
  for (const name of ['kh-ngay-t11-goc', 'kh-ngay-t12-chinh']) {
    const g = await loadWord(`tests/fixtures/${name}.docx`);
    const acc = lineAccuracy(g.located); accAll.n += acc.n; accAll.ok += acc.ok;
    const wm = truth[name] = wordMap(g.located);
    let same = 0;
    for (const p of wm.pairs) { const q = maps[name].pairs.find(x => x.table === p.table && x.row === p.row && x.treOrd === p.treOrd); if (q && q.coPara === p.coPara && q.coLine === p.coLine) same++; }
    console.log(`  [Word] ${name} (bản gốc): đo dòng đúng ${acc.ok}/${acc.n} đoạn; bản đồ cặp của bộ đo trùng Word ${same}/${wm.pairs.length}`);
    ok(same / wm.pairs.length > 0.9, `Word: ${name}: bản đồ cặp của bộ đo trùng Word trên 90% (${same}/${wm.pairs.length})`);
  }
  const wordCheck = async (label: string, file: string, name: string, expect: 'thang' | 'lech') => {
    const g = await loadWord(file);
    const acc = lineAccuracy(g.located); accAll.n += acc.n; accAll.ok += acc.ok;
    const offs = pairOffsets(truth[name], g.located);
    const comparable = offs.filter(x => x.dy !== null);
    const bad = comparable.filter(x => Math.abs(x.dy!) > 10);   // > nửa dòng (1 dòng ≈ 19,2 điểm)
    const maxDy = Math.max(0, ...comparable.map(x => Math.abs(x.dy!)));
    console.log(`  [Word] ${label}: ${comparable.length}/${offs.length} cặp so được; lệch ≥ nửa dòng: ${bad.length}; lệch lớn nhất ${maxDy.toFixed(1)} điểm`);
    if (expect === 'thang') ok(bad.length === 0, `Word: ${label}: mọi cặp lệch 0 dòng`);
    else ok(bad.length > 0, `Word: ${label}: (đối chứng) không realign thì có cặp lệch (${bad.length})`);
  };
  await wordCheck('t11-goc, chỉ bộ sửa (không căn hàng)', 'tests/out/kh-ngay-t11-goc (chỉ sửa, chưa căn).docx', 'kh-ngay-t11-goc', 'lech');
  await wordCheck('t11-goc, bộ sửa + căn hàng', 'tests/out/kh-ngay-t11-goc (đã sửa, căn hàng).docx', 'kh-ngay-t11-goc', 'thang');
  await wordCheck('t12-chinh, kéo dài câu cô, không căn', 'tests/out/ca-thu-dai-khong-can.docx', 'kh-ngay-t12-chinh', 'lech');
  await wordCheck('t12-chinh, kéo dài câu cô + căn hàng', 'tests/out/ca-thu-dai-da-can.docx', 'kh-ngay-t12-chinh', 'thang');
  await wordCheck('t12-chinh, rút ngắn câu cô, không căn', 'tests/out/ca-thu-ngan-khong-can.docx', 'kh-ngay-t12-chinh', 'lech');
  await wordCheck('t12-chinh, rút ngắn câu cô + căn hàng', 'tests/out/ca-thu-ngan-da-can.docx', 'kh-ngay-t12-chinh', 'thang');
  console.log(`  [Word] bộ đo dòng đúng ${accAll.ok}/${accAll.n} đoạn (${((100 * accAll.ok) / accAll.n).toFixed(1)}%) trên các file vừa kiểm`);
} else {
  console.log('  (bỏ qua phần Word thật: chạy WORD=1 npx tsx scripts/verify-align.ts để kiểm bằng Word)');
}

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
