/**
 * Dùng Word thật làm chuẩn: chạy scripts/word-lines.ps1 trên file .docx rồi
 *  - so số dòng của từng đoạn (cột cô/trẻ) với bộ đo trong src/engine/align.ts,
 *  - kiểm tra mọi cặp cô ↔ trẻ có đứng ngang nhau không.
 * Chỉ chạy được trên máy có Word (Windows). Chậm (vài phút mỗi file).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlignmentMap, ParaGeo, PairRow, firstTop, layoutRows, readXml, lineTop } from '../src/engine/align';

export interface WPara { t: number; row: number; col: number; p: number; page: number; y: number; pageEnd: number; yEnd: number; l0: number; l1: number; len: number; text: string; lines: [number, number][] }

/** chạy Word, trả danh sách đoạn trong các cột cô/trẻ */
export async function wordParas(docx: string, cols: number[]): Promise<WPara[]> {
  mkdirSync('tests/out', { recursive: true });
  // bộ nhớ đệm theo nội dung file + script đo (chỉ dùng khi đặt WORD_CACHE=1, để chạy lại nhanh khi chỉnh bộ đo)
  const xmlOf = async (f: string) => (await JSZip.loadAsync(readFileSync(f))).file('word/document.xml')!.async('string');
  const key = createHash('sha1').update(await xmlOf(docx)).update(readFileSync('scripts/word-lines.ps1')).update(cols.join(',')).digest('hex');
  const cache = 'tests/out/' + docx.split(/[\/]/).pop() + '.word.json';
  if (process.env.WORD_CACHE && existsSync(cache)) { const c = JSON.parse(readFileSync(cache, 'utf8')); if (c.key === key) return c.data; }
  const out = join(tmpdir(), `word-lines-${process.pid}-${Date.now()}.json`);
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/word-lines.ps1', '-Docx', docx, '-Cols', cols.join(','), '-Out', out], { stdio: 'inherit', timeout: 20 * 60 * 1000 });
  const data = JSON.parse(readFileSync(out, 'utf8'));
  writeFileSync(cache, JSON.stringify({ key, data }));
  return data;
}

/** bỏ dòng ghi trùng (cùng trang, cách nhau < 1 điểm) */
const dedupe = (ls: [number, number][]) => ls.filter((l, i) => !i || l[0] !== ls[i - 1][0] || Math.abs(l[1] - ls[i - 1][1]) >= 1);

/** số dòng Word thấy cho đoạn (theo số dòng + trang) */
export function wordLineCount(w: WPara): number {
  if (w.lines.length) return dedupe(w.lines).length;
  return w.len === 0 ? 1 : w.l1 - w.l0 + 1;
}
/** đỉnh các dòng của đoạn theo Word: [trang, y][] */
export function wordLineTops(w: WPara): [number, number][] {
  if (w.lines.length) return dedupe(w.lines);
  const n = w.len === 0 ? 1 : w.l1 - w.l0 + 1;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([w.page, n === 1 ? w.y : w.y + (i * (w.yEnd - w.y)) / (n - 1)]);
  return out;
}

export interface Located { row: PairRow; co: { geo: ParaGeo; w: WPara }[]; tre: { geo: ParaGeo; w: WPara }[] }

/** ghép đoạn trong XML với đoạn Word theo (bảng, hàng, ô, thứ tự đoạn) */
export function locate(rows: PairRow[], word: WPara[]): { located: Located[]; unmatched: number } {
  const by = new Map<string, WPara>();
  for (const w of word) by.set(`${w.t}:${w.row}:${w.col}:${w.p}`, w);
  let unmatched = 0;
  const located: Located[] = [];
  for (const r of rows) {
    const side = (ci: number, geos: ParaGeo[]) => geos.flatMap(g => {
      const w = by.get(`${r.table + 1}:${r.row + 1}:${ci + 1}:${g.idx}`);
      if (!w) { unmatched++; return []; }
      return [{ geo: g, w }];
    });
    located.push({ row: r, co: side(r.coCi, r.co.paras), tre: side(r.treCi, r.tre.paras) });
  }
  return { located, unmatched };
}

/** độ chính xác bộ đo dòng: tỉ lệ đoạn (có chữ) đo đúng số dòng so với Word */
export function lineAccuracy(located: Located[]) {
  let n = 0, ok = 0;
  const bad: string[] = [];
  for (const l of located) for (const side of [l.co, l.tre]) for (const { geo, w } of side) {
    if (geo.blank) continue;
    n++;
    if (geo.lines === wordLineCount(w)) ok++;
    else bad.push(`${geo.lines} ≠ Word ${wordLineCount(w)}: ${geo.text.slice(0, 50)}`);
  }
  return { n, ok, bad };
}

/**
 * Bản đồ căn hàng theo CHÂN LÝ do Word đo (bản gốc): mỗi đoạn trẻ có chữ gắn với dòng cô nằm ngang nó nhất.
 * Dùng để kiểm bản đồ do bộ đo suy ra và để chấm kết quả realign không phụ thuộc lỗi của bộ đo.
 */
export function wordMap(located: Located[]): AlignmentMap {
  const map: AlignmentMap = { pairs: [], rows: [] };
  for (const l of located) {
    const tops = l.co.map(c => ({ idx: c.geo.idx, tops: wordLineTops(c.w), text: c.geo.text }));
    let ord = 0;
    for (const t of l.tre) {
      if (t.geo.blank) continue;
      const [tp, ty] = wordLineTops(t.w)[0];
      let best: { c: (typeof tops)[number]; i: number; d: number } | null = null;
      for (const c of tops) c.tops.forEach(([p, y], i) => { if (p === tp && (!best || Math.abs(y - ty) < best.d)) best = { c, i, d: Math.abs(y - ty) }; });
      if (best) {
        const b = best as { c: (typeof tops)[number]; i: number; d: number };
        const lh = b.c.tops.length > 1 ? b.c.tops[1][1] - b.c.tops[0][1] : 19.3;
        const beyond = b.d > 0.6 * lh && b.c === tops[tops.length - 1] && b.i === b.c.tops.length - 1 && ty > b.c.tops[b.i][1];
        const line = beyond ? b.c.tops.length + Math.round((ty - b.c.tops[b.i][1]) / lh) - 1 : b.i;
        map.pairs.push({ table: l.row.table, row: l.row.row, treOrd: ord, coPara: b.c.idx, coLine: line, beyond, coLines: b.c.tops.length, dy: 0, treText: t.geo.text, coText: b.c.text });
      }
      ord++;
    }
    map.rows.push({ table: l.row.table, row: l.row.row, coParas: l.co.length, treText: ord });
  }
  return map;
}

/** các cặp theo bản đồ: lệch bao nhiêu điểm theo Word (cùng trang → hiệu y; khác trang → null) */
export function pairOffsets(map: AlignmentMap, located: Located[]) {
  const out: { table: number; row: number; treText: string; coText: string; dy: number | null }[] = [];
  for (const l of located) {
    const firstPage = Math.min(...[...l.co, ...l.tre].filter(x => x.w.len > 0).map(x => x.w.page));
    const pairs = map.pairs.filter(p => p.table === l.row.table && p.row === l.row.row);
    const tre = l.tre.filter(x => !x.geo.blank);
    for (const p of pairs) {
      const t = tre[p.treOrd];
      const c = l.co.find(x => x.geo.idx === p.coPara);
      if (!t || !c) continue;
      const cTops = wordLineTops(c.w);
      // dòng cô cần so: theo số dòng THẬT trong Word (đoạn cô đã đổi độ dài)
      const nl = p.beyond ? cTops.length + (p.coLine - p.coLines) : Math.min(p.coLine, cTops.length - 1);
      let ct: [number, number];
      if (nl >= 0 && nl < cTops.length) ct = cTops[nl];
      else { const lh = cTops.length > 1 ? cTops[1][1] - cTops[0][1] : 19.3; ct = [cTops[cTops.length - 1][0], cTops[cTops.length - 1][1] + (nl - (cTops.length - 1)) * lh]; }
      const tt = wordLineTops(t.w)[0];
      // hàng dài hơn 1 trang (Word tách trang, kiểm soát dòng mồ côi/góa phụ ở mỗi cột một khác): chỉ so các cặp nằm ở trang đầu của hàng
      out.push({ table: p.table, row: p.row, treText: p.treText.trim(), coText: p.coText.trim(), dy: tt[0] === ct[0] && tt[0] === firstPage ? tt[1] - ct[1] : null });
    }
  }
  return out;
}

if (process.argv[1]?.endsWith('word-compare.ts')) {
  const files = process.argv.slice(2);
  let N = 0, OK = 0;
  for (const f of files) {
    const { document, styles } = await readXml(readFileSync(f));
    const rows = layoutRows(document, { styles });
    if (!rows.length) { console.log(`${f}: không có cặp cô/trẻ`); continue; }
    const t0 = Date.now();
    const w = await wordParas(f, [...new Set(rows.flatMap(r => [r.coCi + 1, r.treCi + 1]))]);
    const { located, unmatched } = locate(rows, w);
    const acc = lineAccuracy(located);
    N += acc.n; OK += acc.ok;
    console.log(`${f}: ${acc.ok}/${acc.n} đoạn có chữ đo đúng số dòng (${((100 * acc.ok) / acc.n).toFixed(1)}%), không ghép được ${unmatched}, ${(Date.now() - t0) / 1000 | 0}s`);
    for (const b of acc.bad.slice(0, 15)) console.log('   ', b);
    writeFileSync('tests/out/' + f.split(/[\/]/).pop() + '.word.json', JSON.stringify(w));
  }
  console.log(`TỔNG: ${OK}/${N} = ${((100 * OK) / N).toFixed(1)}%`);
}
