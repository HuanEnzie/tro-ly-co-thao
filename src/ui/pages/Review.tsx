import { useEffect, useMemo, useState } from 'react';
import { countLevels, sortIssues } from '../../engine/checker';
import { Issue, KIND_LABEL, Level, LEVEL_LABEL } from '../../engine/types';
import FixPanel from '../review/FixPanel';
import IssueGroups from '../review/IssueGroups';
import ParsedPreview from '../review/ParsedPreview';
import { useSession } from '../session';
import { slots } from '../slots';
import { Item } from '../types';

function useWide() {
  const q = '(min-width: 768px)';
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q), on = () => setW(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return w;
}

export default function Review() {
  const { items, activeId, setActiveId, busy, addFiles, pickFiles, quota, passcode, setPasscode, runAi, removeItem } = useSession();
  const [drag, setDrag] = useState(false);
  const it = items.find(x => x.id === activeId) ?? items[0] ?? null;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Soát &amp; sửa</h1>
        <p className="sub">Kéo thả file Word để soát; chọn mục cần sửa rồi tạo bản sửa. File gốc không bao giờ bị ghi đè.</p>
      </header>

      <section
        className={`drop ${drag ? 'over' : ''} ${it ? 'slim' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
        onClick={pickFiles}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles(); } }}
        role="button" tabIndex={0}
      >
        <strong>{busy ? 'Đang soát…' : it ? 'Thêm file Word' : 'Kéo thả file Word vào đây'}</strong>
        <span>hoặc bấm để chọn · kế hoạch ngày, kế hoạch tuần (.docx) · chọn nhiều file để soát chéo tuần ↔ ngày</span>
      </section>

      {quota && (
        <p className="quota">
          Soát sâu bằng AI: {quota.ready ? `đã dùng ${quota.used}/${quota.limit} lượt hôm nay` : 'máy chủ chưa cài key Gemini — vẫn soát bằng luật bình thường'}
          {quota.passcode && <input className="pass" placeholder="Mã truy cập" value={passcode} onChange={e => setPasscode(e.target.value)} />}
        </p>
      )}

      {items.length > 1 && (
        <div className="filetabs" role="tablist" aria-label="Các file đang soát">
          {items.map(x => (
            <button key={x.id} role="tab" aria-selected={x.id === it?.id} className={`chip ${x.id === it?.id ? 'on' : ''}`} onClick={() => setActiveId(x.id)}>{x.name}</button>
          ))}
        </div>
      )}

      {it ? <Doc key={it.id} it={it} aiReady={!!quota?.ready} onAi={() => runAi(it)} onRemove={() => removeItem(it.id)} /> : <Help />}
    </div>
  );
}

function Doc({ it, aiReady, onAi, onRemove }: { it: Item; aiReady: boolean; onAi: () => void; onRemove: () => void }) {
  const wide = useWide();
  const [filter, setFilter] = useState<Level | 'all'>('all');
  const [active, setActive] = useState<Issue | null>(null);
  const all = useMemo(() => sortIssues([...it.report.issues, ...(it.ai?.issues ?? [])]), [it]);
  const counts = countLevels(all);
  const shown = filter === 'all' ? all : all.filter(i => i.level === filter);
  const p = it.report.parsed;
  const Preview = slots.preview ?? ParsedPreview;
  const preview = <Preview item={it} activeIssue={active} onPickIssue={setActive} />;

  return (
    <div className="review">
      <div className="col-prev">
        <div className="docline">
          <div>
            <h2 className="docname">{it.name}</h2>
            <p className="meta">{KIND_LABEL[p.kind]}{p.tuan ? ` · tuần ${p.tuan}` : ''}{p.kind === 'kh-ngay' ? ` · ${p.days.length} ngày` : ''}</p>
          </div>
          <button className="link" onClick={onRemove} aria-label="Bỏ file này khỏi phiên">Bỏ</button>
        </div>
        {wide ? <div className="preview-box" data-slot="preview">{preview}</div> : (
          <details className="preview-m" data-slot="preview">
            <summary>Xem văn bản</summary>
            {preview}
          </details>
        )}
      </div>

      <div className="col-issues">
        <div className="sticky-bar">
          <p className="summary" role="status">
            {all.length === 0 ? 'Không thấy lỗi nào.' : (
              <>
                <b className="nang">{counts.nang}</b> lỗi nặng · <b className="xem">{counts.xem}</b> nên xem · <b className="chinh-ta">{counts['chinh-ta']}</b> chính tả, trình bày
              </>
            )}
          </p>
          <div className="chips">
            <button className={`chip all ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Tất cả {all.length}</button>
            {(['nang', 'xem', 'chinh-ta'] as Level[]).map(l => (
              <button key={l} className={`chip ${l} ${filter === l ? 'on' : ''}`} onClick={() => setFilter(l)}>{LEVEL_LABEL[l]} {counts[l]}</button>
            ))}
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={onAi} disabled={!aiReady || it.aiBusy || !!it.ai}>
            {it.aiBusy ? 'AI đang đọc…' : it.ai ? `Đã soát bằng AI (${it.ai.model})` : 'Soát sâu bằng AI · 1 lượt'}
          </button>
        </div>
        {it.aiError && <p className="err">{it.aiError}</p>}
        {it.ai && it.ai.dropped > 0 && <p className="note">Đã bỏ {it.ai.dropped} ý của AI vì trích sai giáo án hoặc trùng lỗi máy đã bắt.</p>}

        <IssueGroups issues={shown} active={active} onPick={setActive} />
        {!all.length && <p className="clean">Không thấy lỗi nào.</p>}

        <FixPanel item={it} />
      </div>
    </div>
  );
}

function Help() {
  return (
    <section className="card help">
      <h2>Trợ lý làm gì</h2>
      <ul>
        <li><b>Không cần AI, chạy ngay trên máy:</b> đối chiếu tên tiết với chương trình, đúng ngày – đúng thứ, năm học, tuần lẻ vệ sinh / tuần chẵn lao động, quan sát có mục đích thứ 3 – thứ 5, cấu trúc bài soạn, chuẩn bị thiếu nhạc/video, chính tả và dấu câu.</li>
        <li><b>Tải file đã sửa:</b> tự sửa chính tả, dấu cách, dấu câu ngay trong file Word, chỗ sửa tô vàng. Cô tích chọn nhóm nào, chỗ nào được sửa. Lỗi nội dung để cô quyết.</li>
        <li><b>Soát sâu bằng AI (1 lượt):</b> Gemini đọc nội dung — mục đích yêu cầu có khớp tiến hành, chuẩn bị có hợp lý. Lỗi AI nêu luôn kèm đoạn trích có thật trong giáo án.</li>
      </ul>
    </section>
  );
}
