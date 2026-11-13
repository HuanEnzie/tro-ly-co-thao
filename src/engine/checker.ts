/**
 * Bộ soát lỗi: chạy toàn bộ luật cứng trên 1 file (hoặc nhiều file cùng tuần).
 * Không gọi AI, không mạng — chạy ngay trong trình duyệt và trong scripts/verify-*.
 */
import { DocModel, readDocx } from './docx';
import { parseDoc, parseProgram } from './parse';
import { checkCross, checkLayout, checkPrep } from './rules/prep';
import { checkProgram, checkQuanSat } from './rules/program';
import { checkSpelling } from './rules/spelling';
import { checkStructure } from './rules/structure';
import { Issue, Level, ParsedDoc, Program } from './types';

export interface Report {
  name: string;
  parsed: ParsedDoc;
  issues: Issue[];
  counts: Record<Level, number>;
}

const ORDER: Record<Level, number> = { nang: 0, xem: 1, 'chinh-ta': 2 };

export function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter(i => {
    const k = `${i.rule}|${i.where}|${i.found ?? ''}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function sortIssues(list: Issue[]) {
  return [...list].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export function countLevels(list: Issue[]): Record<Level, number> {
  const c: Record<Level, number> = { nang: 0, xem: 0, 'chinh-ta': 0 };
  for (const i of list) c[i.level]++;
  return c;
}

export function checkDoc(name: string, doc: DocModel, program: Program | null): Report {
  const parsed = parseDoc(doc);
  const issues = parsed.kind === 'khac' || parsed.kind === 'chuong-trinh'
    ? checkSpelling(parsed)
    : [
        ...checkProgram(parsed, program),
        ...checkQuanSat(parsed),
        ...checkStructure(parsed),
        ...checkPrep(parsed),
        ...checkLayout(parsed, doc.page),
        ...checkSpelling(parsed),
      ];
  const list = sortIssues(dedupe(issues));
  return { name, parsed, issues: list, counts: countLevels(list) };
}

/** soát nhiều file một lượt: thêm luật khớp KH tuần ↔ KH ngày cùng tuần */
export function checkMany(reports: Report[]): Report[] {
  return reports.map(r => {
    const extra = reports.filter(o => o !== r).flatMap(o => checkCross(r.parsed, o.parsed));
    if (!extra.length) return r;
    const issues = sortIssues(dedupe([...r.issues, ...extra]));
    return { ...r, issues, counts: countLevels(issues) };
  });
}

export async function checkFile(name: string, data: ArrayBuffer | Uint8Array, program: Program | null) {
  return checkDoc(name, await readDocx(data), program);
}

export async function readProgram(data: ArrayBuffer | Uint8Array) {
  return parseProgram(await readDocx(data));
}
