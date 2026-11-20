import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { guardAi, parseAiJson } from '../ai/guard';
import { userMessage } from '../ai/prompt';
import { checkFile, checkMany, countLevels, dedupe, readProgram, sortIssues } from '../engine/checker';
import { alignIssues, ChainOptions, runFixChain } from './fixchain';
import { Program } from '../engine/types';
import bundled from '../data/chuong-trinh.json';
import { Item, Quota } from './types';
import { AI_CACHE, load, PASS_KEY, PROGRAM_KEY, save, sha } from './storage';

/** địa chỉ API soát bằng AI: cùng máy chủ khi dev / Vercel; khi chạy trên GitHub Pages thì đặt VITE_API_BASE = địa chỉ Vercel */
const API_URL = `${String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')}/api/review`;

export interface Session {
  program: Program;
  items: Item[];
  busy: boolean;
  quota: Quota | null;
  passcode: string;
  setPasscode: (v: string) => void;
  /** file đang xem ở trang Soát & sửa */
  /** tuần đang chọn (số tuần theo chương trình); dùng chung cho mọi trang */
  week: number | null;
  setWeek: (w: number) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeItem: (id: string) => void;
  loadProgram: (f: File) => Promise<void>;
  runAi: (it: Item) => Promise<void>;
  /** tạo file (đã sửa).docx theo các mục chọn và tải về; không ghi đè file gốc */
  makeFixed: (it: Item, opt?: ChainOptions) => Promise<void>;
  /** thêm một file Word đã có trong bộ nhớ (bản sửa tay, bản máy soạn…) vào phiên và soát ngay */
  addBuffer: (name: string, data: ArrayBuffer | Uint8Array) => Promise<void>;
  /** mở hộp chọn file Word (dùng ở nút “Soát file mới”) */
  pickFiles: () => void;
  pickProgram: () => void;
}

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession phải nằm trong <SessionProvider>');
  return s;
};

/** tuần chứa ngày hôm nay (đọc “từ 16/11 đến 20/11/ 2026”); không có thì tuần đầu tiên */
export function currentWeek(program: Program, now = new Date()): number | null {
  for (const w of program.weeks) {
    const m = w.khoang.match(/(\d{1,2})\/(\d{1,2})\D+(\d{1,2})\/(\d{1,2})\D+(\d{4})/);
    if (!m) continue;
    const y = +m[5];
    const a = new Date(y, +m[2] - 1, +m[1]), b = new Date(y, +m[4] - 1, +m[3] + 2);
    if (now >= a && now < b) return w.tuan;
  }
  return program.weeks[0]?.tuan ?? null;
}

/** soát file; với KH ngày thêm các lỗi căn hàng/khớp cô–trẻ (mức "xem") */
async function checkItem(name: string, data: ArrayBuffer, program: Program) {
  const report = await checkFile(name, data, program);
  if (report.parsed.kind !== 'kh-ngay') return report;
  try {
    const extra = await alignIssues(data);
    if (!extra.length) return report;
    const issues = sortIssues(dedupe([...report.issues, ...extra]));
    return { ...report, issues, counts: countLevels(issues) };
  } catch { return report; }
}

/** soát chéo KH tuần ↔ KH ngày khi có cả hai */
function relink(list: Item[]): Item[] {
  const base = list.map(i => ({ ...i.report, issues: i.report.issues.filter(x => x.rule !== 'khop.tuan-ngay') }));
  const linked = checkMany(base);
  return list.map((i, k) => ({ ...i, report: linked[k] }));
}

export function SessionProvider({ children, onFilesAdded }: { children: ReactNode; onFilesAdded?: () => void }) {
  const [program, setProgram] = useState<Program>(() => load<Program>(PROGRAM_KEY) ?? (bundled as Program));
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [passcode, setPass] = useState(() => load<string>(PASS_KEY) ?? '');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [weekSel, setWeek] = useState<number | null>(null);
  const week = weekSel ?? currentWeek(program);
  const fileRef = useRef<HTMLInputElement>(null);
  const progRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch(API_URL).then(r => r.json()).then(setQuota).catch(() => setQuota(null)); }, []);

  const addNamed = useCallback(async (list: { name: string; data: ArrayBuffer }[]) => {
    setBusy(true);
    try {
      const fresh: Item[] = [];
      for (const f of list) {
        const report = await checkItem(f.name, f.data, program);
        const hash = await sha(f.data);
        const cached = load<Item['ai']>(AI_CACHE + hash);
        fresh.push({ id: `${hash}-${Date.now()}-${Math.random()}`, name: f.name, data: f.data, hash, report, ai: cached ?? undefined });
      }
      if (fresh.length) { setItems(prev => relink([...prev, ...fresh])); setActiveId(fresh[0].id); onFilesAdded?.(); }
    } finally { setBusy(false); }
  }, [program, onFilesAdded]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list: { name: string; data: ArrayBuffer }[] = [];
    for (const f of [...files].filter(f => /\.docx$/i.test(f.name))) list.push({ name: f.name, data: await f.arrayBuffer() });
    await addNamed(list);
  }, [addNamed]);

  const addBuffer = useCallback(async (name: string, data: ArrayBuffer | Uint8Array) => {
    const ab = data instanceof ArrayBuffer ? data : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    await addNamed([{ name, data: ab }]);
  }, [addNamed]);

  const loadProgram = useCallback(async (f: File) => {
    const p = await readProgram(await f.arrayBuffer());
    if (!p || !p.weeks.length) { alert('Không đọc được bảng chương trình trong file này.'); return; }
    save(PROGRAM_KEY, p);
    setProgram(p);
    // soát lại các file đang mở theo chương trình mới
    const again = await Promise.all(items.map(async i => ({ ...i, report: await checkItem(i.name, i.data, p) })));
    setItems(relink(again));
  }, [items]);

  const runAi = useCallback(async (it: Item) => {
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, aiBusy: true, aiError: undefined } : x)));
    try {
      const rule = it.report.issues.filter(i => i.source === 'luat');
      const res = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userMessage(it.report.parsed, rule), passcode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Lỗi ${res.status}`);
      const g = guardAi(parseAiJson(body.text), it.report.parsed, rule);
      const ai = { issues: g.issues, dropped: g.dropped.length, model: body.model };
      save(AI_CACHE + it.hash, ai);
      setQuota(q => (q ? { ...q, used: body.used, limit: body.limit } : q));
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, ai, aiBusy: false } : x)));
    } catch (e) {
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, aiBusy: false, aiError: (e as Error).message } : x)));
    }
  }, [passcode]);

  const makeFixed = useCallback(async (it: Item, opt: ChainOptions = {}) => {
    const { data, changes, align, fill } = await runFixChain(it.data, { hdSpace: it.report.parsed.kind === 'kh-ngay', ...opt });
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const name = it.name.replace(/\.docx$/i, ' (đã sửa).docx');
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, fixed: { url, name, changes, align, fill } } : x)));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }, []);

  const removeItem = useCallback((id: string) => setItems(prev => relink(prev.filter(x => x.id !== id))), []);
  const setPasscode = useCallback((v: string) => { setPass(v); save(PASS_KEY, v); }, []);

  const value = useMemo<Session>(() => ({
    program, items, busy, quota, passcode, setPasscode, week, setWeek, activeId, setActiveId, addFiles, removeItem, loadProgram, runAi, makeFixed, addBuffer,
    pickFiles: () => fileRef.current?.click(), pickProgram: () => progRef.current?.click(),
  }), [program, items, busy, quota, passcode, setPasscode, week, activeId, addFiles, removeItem, loadProgram, runAi, makeFixed, addBuffer]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <input ref={fileRef} type="file" accept=".docx" multiple hidden onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={progRef} type="file" accept=".docx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void loadProgram(f); e.target.value = ''; }} />
    </Ctx.Provider>
  );
}
