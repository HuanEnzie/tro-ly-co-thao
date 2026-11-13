import { useEffect, useMemo, useRef, useState } from 'react';
import { guardAi, parseAiJson } from './ai/guard';
import { userMessage } from './ai/prompt';
import { checkFile, checkMany, countLevels, readProgram, Report, sortIssues } from './engine/checker';
import { Change, fixDocx } from './engine/fixer';
import { Issue, KIND_LABEL, Level, LEVEL_LABEL, Program } from './engine/types';
import bundled from './data/chuong-trinh.json';

interface Item {
  id: string;
  name: string;
  data: ArrayBuffer;
  hash: string;
  report: Report;
  ai?: { issues: Issue[]; dropped: number; model: string };
  aiBusy?: boolean;
  aiError?: string;
  fixed?: { url: string; name: string; changes: Change[] };
}

/** địa chỉ API soát bằng AI: cùng máy chủ khi dev / Vercel; khi chạy trên GitHub Pages thì đặt VITE_API_BASE = địa chỉ Vercel */
const API_URL = `${String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')}/api/review`;
const PROGRAM_KEY = 'tlct.program';
const AI_CACHE = 'tlct.ai.';
const PASS_KEY = 'tlct.passcode';
const load = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bộ nhớ trình duyệt bị chặn */ } };

async function sha(data: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
const dayPart = (where: string) => where.split(' – ')[0];

export default function App() {
  const [program, setProgram] = useState<Program>(() => load<Program>(PROGRAM_KEY) ?? (bundled as Program));
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [quota, setQuota] = useState<{ ready: boolean; used: number; limit: number; passcode: boolean } | null>(null);
  const [passcode, setPasscode] = useState(() => load<string>(PASS_KEY) ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const progRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch(API_URL).then(r => r.json()).then(setQuota).catch(() => setQuota(null)); }, []);

  async function addFiles(files: FileList | File[]) {
    setBusy(true);
    try {
      const fresh: Item[] = [];
      for (const f of [...files].filter(f => /\.docx$/i.test(f.name))) {
        const data = await f.arrayBuffer();
        const report = await checkFile(f.name, data, program);
        const hash = await sha(data);
        const cached = load<Item['ai']>(AI_CACHE + hash);
        fresh.push({ id: `${hash}-${Date.now()}-${Math.random()}`, name: f.name, data, hash, report, ai: cached ?? undefined });
      }
      setItems(prev => relink([...prev, ...fresh]));
    } finally { setBusy(false); }
  }

  /** soát chéo KH tuần ↔ KH ngày khi có cả hai */
  function relink(list: Item[]): Item[] {
    const base = list.map(i => ({ ...i.report, issues: i.report.issues.filter(x => x.rule !== 'khop.tuan-ngay') }));
    const linked = checkMany(base);
    return list.map((i, k) => ({ ...i, report: linked[k] }));
  }

  async function loadProgram(f: File) {
    const p = await readProgram(await f.arrayBuffer());
    if (!p || !p.weeks.length) { alert('Không đọc được bảng chương trình trong file này.'); return; }
    save(PROGRAM_KEY, p);
    setProgram(p);
    // soát lại các file đang mở theo chương trình mới
    const again = await Promise.all(items.map(async i => ({ ...i, report: await checkFile(i.name, i.data, p) })));
    setItems(relink(again));
  }

  async function runAi(it: Item) {
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
  }

  async function makeFixed(it: Item) {
    const { data, changes } = await fixDocx(it.data, { hdSpace: it.report.parsed.kind === 'kh-ngay' });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const name = it.name.replace(/\.docx$/i, ' (đã sửa).docx');
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, fixed: { url, name, changes } } : x)));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Soát giáo án</h1>
          <p className="sub">Lớp 5–6 tuổi số 1 · Trường Mầm non Võ Cường</p>
        </div>
        <div className="prog">
          <span className="label">Đang đối chiếu với</span>
          <strong>{program.chuDe || 'Chương trình chủ đề'}</strong>
          <span className="weeks">{program.weeks.map(w => `T${w.tuan}`).join(' · ')}</span>
          <button className="link" onClick={() => progRef.current?.click()}>Nạp chương trình khác</button>
          <input ref={progRef} type="file" accept=".docx" hidden onChange={e => e.target.files?.[0] && loadProgram(e.target.files[0])} />
        </div>
      </header>

      <section
        className={`drop ${drag ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        role="button" tabIndex={0}
      >
        <input ref={fileRef} type="file" accept=".docx" multiple hidden onChange={e => e.target.files && addFiles(e.target.files)} />
        <strong>{busy ? 'Đang soát…' : 'Kéo thả file Word vào đây'}</strong>
        <span>hoặc bấm để chọn · Kế hoạch ngày, kế hoạch tuần (.docx) · có thể chọn nhiều file để soát chéo tuần ↔ ngày</span>
      </section>

      {quota && (
        <p className="quota">
          Soát sâu bằng AI: {quota.ready ? `đã dùng ${quota.used}/${quota.limit} lượt hôm nay` : 'máy chủ chưa cài key Gemini — vẫn soát bằng luật bình thường'}
          {quota.passcode && (
            <input className="pass" placeholder="Mã truy cập" value={passcode} onChange={e => { setPasscode(e.target.value); save(PASS_KEY, e.target.value); }} />
          )}
        </p>
      )}

      {items.map(it => <DocCard key={it.id} it={it} onAi={() => runAi(it)} onFix={() => makeFixed(it)} aiReady={!!quota?.ready}
        onRemove={() => setItems(prev => relink(prev.filter(x => x.id !== it.id)))} />)}

      {!items.length && (
        <section className="help">
          <h2>Trợ lý làm gì</h2>
          <ul>
            <li><b>Không cần AI, chạy ngay trên máy:</b> đối chiếu tên tiết với chương trình, đúng ngày – đúng thứ, năm học, tuần lẻ vệ sinh / tuần chẵn lao động, quan sát có mục đích thứ 3 – thứ 5, cấu trúc bài soạn, chuẩn bị thiếu nhạc/video, chính tả và dấu câu.</li>
            <li><b>Tải file đã sửa:</b> tự sửa chính tả, dấu cách, dấu câu ngay trong file Word, chỗ sửa tô vàng. Lỗi nội dung để cô quyết.</li>
            <li><b>Soát sâu bằng AI (1 lượt):</b> Gemini đọc nội dung — mục đích yêu cầu có khớp tiến hành, chuẩn bị có hợp lý. Lỗi AI nêu luôn kèm đoạn trích có thật trong giáo án.</li>
          </ul>
        </section>
      )}
    </div>
  );
}

function DocCard({ it, onAi, onFix, onRemove, aiReady }: { it: Item; onAi: () => void; onFix: () => void; onRemove: () => void; aiReady: boolean }) {
  const [filter, setFilter] = useState<Level | 'all'>('all');
  const all = useMemo(() => sortIssues([...it.report.issues, ...(it.ai?.issues ?? [])]), [it]);
  const counts = countLevels(all);
  const shown = filter === 'all' ? all : all.filter(i => i.level === filter);
  const groups = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of shown) m.set(dayPart(i.where), [...(m.get(dayPart(i.where)) ?? []), i]);
    return [...m.entries()];
  }, [shown]);
  const p = it.report.parsed;
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>{it.name}</h2>
          <p className="meta">{KIND_LABEL[p.kind]}{p.tuan ? ` · tuần ${p.tuan}` : ''}{p.kind === 'kh-ngay' ? ` · ${p.days.length} ngày` : ''}</p>
        </div>
        <button className="link" onClick={onRemove} aria-label="Bỏ file này">Bỏ</button>
      </div>
      <div className="chips">
        <button className={`chip all ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Tất cả {all.length}</button>
        {(['nang', 'xem', 'chinh-ta'] as Level[]).map(l => (
          <button key={l} className={`chip ${l} ${filter === l ? 'on' : ''}`} onClick={() => setFilter(l)}>{LEVEL_LABEL[l]} {counts[l]}</button>
        ))}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onFix}>Tải file đã sửa chính tả, dấu câu</button>
        <button className="btn" onClick={onAi} disabled={!aiReady || it.aiBusy || !!it.ai}>
          {it.aiBusy ? 'AI đang đọc…' : it.ai ? `Đã soát bằng AI (${it.ai.model})` : 'Soát sâu bằng AI · 1 lượt'}
        </button>
      </div>
      {it.aiError && <p className="err">{it.aiError}</p>}
      {it.ai && it.ai.dropped > 0 && <p className="note">Đã bỏ {it.ai.dropped} ý của AI vì trích sai giáo án hoặc trùng lỗi máy đã bắt.</p>}
      {it.fixed && (
        <details className="changes">
          <summary>Đã sửa {it.fixed.changes.length} chỗ trong file <a href={it.fixed.url} download={it.fixed.name}>{it.fixed.name}</a> (tô vàng trong file)</summary>
          <table>
            <thead><tr><th>Gốc</th><th>Sửa thành</th><th>Ngữ cảnh</th></tr></thead>
            <tbody>{it.fixed.changes.slice(0, 300).map((c, k) => (
              <tr key={k}><td><code>{c.before.replace(/ /g, '␣')}</code></td><td><code>{c.after.replace(/ /g, '␣')}</code></td><td>{c.context}</td></tr>
            ))}</tbody>
          </table>
        </details>
      )}
      {groups.map(([g, list]) => (
        <section key={g} className="group">
          <h3>{g}</h3>
          <ul>
            {list.map((i, k) => (
              <li key={k} className={`issue ${i.level}`}>
                <span className={`tag ${i.level}`}>{LEVEL_LABEL[i.level]}</span>
                {i.source === 'ai' && <span className="tag ai">AI</span>}
                <div className="body">
                  <div className="where">{i.where}</div>
                  <div className="msg">{i.message}</div>
                  {i.found && <div className="found"><span>Gốc:</span> {i.found}</div>}
                  {i.fix && <div className="fix"><span>Sửa:</span> {i.fix}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!all.length && <p className="clean">Không thấy lỗi nào.</p>}
    </article>
  );
}
