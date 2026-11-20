import { Suspense, useEffect, useMemo, useState } from 'react';
import { countLevels, sortIssues } from '../../engine/checker';
import { Issue, KIND_LABEL } from '../../engine/types';
import FixPanel from '../review/FixPanel';
import IssueGroups from '../review/IssueGroups';
import ParsedPreview from '../review/ParsedPreview';
import { href } from '../router';
import { useSession } from '../session';
import { slots } from '../slots';
import { Item } from '../types';

function useWide() {
  const q = '(min-width: 1000px)'; // cùng mốc với @media của .work trong styles.css
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q), on = () => setW(m.matches);
    on();
    m.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => { m.removeEventListener('change', on); window.removeEventListener('resize', on); };
  }, []);
  return w;
}

type Tab = 'can' | 'chinh-ta';

export default function Review() {
  const { items, activeId, setActiveId, addFiles, pickFiles, quota, passcode, setPasscode, runAi, removeItem } = useSession();
  const [drag, setDrag] = useState(false);
  const it = items.find(x => x.id === activeId) ?? items[0] ?? null;

  if (!it) return (
    <div className="empty-page"
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}>
      <section className={`bigdrop ${drag ? 'over' : ''}`} onClick={pickFiles} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles(); } }}>
        <strong>Chưa có file nào</strong>
        <span>Kéo file Word vào đây, hoặc <u>bấm để chọn file</u></span>
      </section>
      <p className="note center"><a href={href('tuan')}>Về trang đầu</a></p>
    </div>
  );

  return (
    <div className="stack"
      onDragOver={e => { e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}>
      {items.length > 1 && (
        <div className="filetabs" role="tablist" aria-label="Các file đang mở">
          {items.map(x => (
            <button key={x.id} role="tab" aria-selected={x.id === it.id} className={`seg ${x.id === it.id ? 'on' : ''}`} onClick={() => setActiveId(x.id)}>{x.name}</button>
          ))}
        </div>
      )}
      <Doc key={it.id} it={it} onMore={pickFiles} onRemove={() => removeItem(it.id)}
        ai={quota ? { ready: quota.ready, used: quota.used, limit: quota.limit, needPass: quota.passcode, passcode, setPasscode, run: () => runAi(it) } : null} />
    </div>
  );
}

interface AiCtl { ready: boolean; used: number; limit: number; needPass: boolean; passcode: string; setPasscode: (v: string) => void; run: () => void }

function Doc({ it, ai, onMore, onRemove }: { it: Item; ai: AiCtl | null; onMore: () => void; onRemove: () => void }) {
  const wide = useWide();
  const [active, setActive] = useState<Issue | null>(null);
  const [pickN, setPickN] = useState(0);
  const pick = (i: Issue) => { setActive(i); setPickN(n => n + 1); };
  const all = useMemo(() => sortIssues([...it.report.issues, ...(it.ai?.issues ?? [])]), [it]);
  const c = countLevels(all);
  const can = all.filter(i => i.level !== 'chinh-ta');
  const ct = all.filter(i => i.level === 'chinh-ta');
  const [tab, setTab] = useState<Tab>(can.length ? 'can' : 'chinh-ta');
  const p = it.report.parsed;
  const Preview = slots.preview ?? ParsedPreview;
  const preview = <Suspense fallback={<p className="note">Đang mở file…</p>}><Preview item={it} activeIssue={active} pickNonce={pickN} onPickIssue={pick} /></Suspense>;

  return (
    <>
      <header className="rhead">
        <div className="rname">
          <h1>{it.name}</h1>
          <p className="meta">{KIND_LABEL[p.kind]}{p.tuan ? ` · tuần ${p.tuan}` : ''}{p.kind === 'kh-ngay' ? ` · ${p.days.length} ngày` : ''}</p>
        </div>
        <div className="rbtns">
          <button className="btn ghost sm" onClick={onMore}>Soát file khác</button>
          <button className="btn ghost sm" onClick={onRemove}>Đóng file</button>
        </div>
      </header>

      <div className="verdict" role="status">
        <div className={`stat ${c.nang ? 'nang' : 'ok'}`}><b>{c.nang}</b><span>lỗi nặng</span></div>
        <div className={`stat ${c.xem ? 'xem' : 'ok'}`}><b>{c.xem}</b><span>cần cô xem</span></div>
        <div className="stat ct"><b>{c['chinh-ta']}</b><span>chính tả, trình bày</span></div>
      </div>

      <FixPanel item={it} />

      <div className="work">
        <section className="col-issues" aria-label="Danh sách lỗi">
          <div className="segbar" role="tablist">
            <button role="tab" aria-selected={tab === 'can'} className={`seg ${tab === 'can' ? 'on' : ''}`} onClick={() => setTab('can')}>Cần cô xem <em>{can.length}</em></button>
            <button role="tab" aria-selected={tab === 'chinh-ta'} className={`seg ${tab === 'chinh-ta' ? 'on' : ''}`} onClick={() => setTab('chinh-ta')}>Chính tả, trình bày <em>{ct.length}</em></button>
          </div>
          {tab === 'can' && (can.length ? <IssueGroups issues={can} active={active} onPick={pick} /> : <p className="okline">Không có lỗi nội dung nào cần xem.</p>)}
          {tab === 'chinh-ta' && (ct.length ? <>
            <p className="note">Phần lớn các lỗi này máy đã sửa sẵn trong “Tải bản đã sửa”.</p>
            <IssueGroups issues={ct} active={active} onPick={pick} />
          </> : <p className="okline">Không có lỗi chính tả.</p>)}

          {ai && (
            <div className="aibox">
              <div>
                <b>Soát nội dung bằng AI</b>
                <p className="note">{ai.ready ? `Đọc mục đích, chuẩn bị, cách tiến hành. Hôm nay đã dùng ${ai.used}/${ai.limit} lượt.` : 'Chưa bật (máy chủ chưa có key Gemini).'}</p>
                {it.aiError && <p className="err">{it.aiError}</p>}
              </div>
              {ai.needPass && ai.ready && !it.ai && <input className="pass" placeholder="Mã truy cập" value={ai.passcode} onChange={e => ai.setPasscode(e.target.value)} />}
              <button className="btn sm" onClick={ai.run} disabled={!ai.ready || it.aiBusy || !!it.ai}>
                {it.aiBusy ? 'Đang đọc…' : it.ai ? 'Đã soát' : 'Soát bằng AI'}
              </button>
            </div>
          )}
        </section>

        {wide ? <aside className="col-prev" data-slot="preview"><div className={`preview-box ${slots.preview ? 'has-editor' : ''}`}>{preview}</div></aside> : (
          <details className="preview-m" data-slot="preview">
            <summary>Mở file để xem và sửa tay</summary>
            {preview}
          </details>
        )}
      </div>
    </>
  );
}
