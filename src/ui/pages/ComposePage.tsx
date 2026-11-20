import { useMemo, useState } from 'react';
import type { ComposeResult, LoaiKH, Thu } from '../../compose/types';
import { KIND_LABEL } from '../../engine/types';
import { go } from '../router';
import { useSession } from '../session';
import type { PageProps } from '../slots';

const THU_LIST: Thu[] = [2, 3, 4, 5, 6];
const THU_TEN: Record<Thu, string> = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6' };
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const UPLOAD = '__upload__';

interface Upload { name: string; data: ArrayBuffer }

function saveBlob(data: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type: DOCX }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Trang Soạn thảo: chọn tuần, loại, ngày, file mẫu, file tham khảo → máy soạn KH (không AI) → tải về / soát luôn */
export default function ComposePage({ program, week, items }: PageProps) {
  const { addBuffer } = useSession();
  const [tuan, setTuan] = useState<number>(week ?? program.weeks[0]?.tuan ?? 0);
  const [loai, setLoai] = useState<LoaiKH>('kh-ngay');
  const [ngay, setNgay] = useState<Set<Thu>>(new Set(THU_LIST));
  const [mauSel, setMauSel] = useState<string>('');
  const [mauUp, setMauUp] = useState<Upload | null>(null);
  const [refIds, setRefIds] = useState<Set<string>>(new Set());
  const [refUp, setRefUp] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ r: ComposeResult; name: string } | null>(null);

  const candidates = useMemo(() => items.filter(i => i.report.parsed.kind === loai), [items, loai]);
  // mẫu mặc định: file cùng loại đã nạp, ưu tiên tuần ngay trước tuần soạn
  const autoMau = useMemo(() => {
    const sorted = [...candidates].sort((a, b) => Math.abs((a.report.parsed.tuan ?? 0) - (tuan - 1)) - Math.abs((b.report.parsed.tuan ?? 0) - (tuan - 1)));
    return sorted[0]?.id ?? '';
  }, [candidates, tuan]);
  const mauId = mauSel === UPLOAD ? UPLOAD : candidates.some(i => i.id === mauSel) ? mauSel : autoMau || UPLOAD;

  const readFiles = async (fl: FileList | null): Promise<Upload[]> =>
    Promise.all([...(fl ?? [])].filter(f => /\.docx$/i.test(f.name)).map(async f => ({ name: f.name, data: await f.arrayBuffer() })));

  async function run() {
    setErr(''); setRes(null);
    const mau = mauId === UPLOAD ? mauUp : items.find(i => i.id === mauId);
    if (!mau) { setErr('Chọn file mẫu (bản kế hoạch đã duyệt của tuần trước) hoặc tải lên một file .docx.'); return; }
    if (loai === 'kh-ngay' && ngay.size === 0) { setErr('Tích ít nhất một ngày.'); return; }
    const refs: Upload[] = [...items.filter(i => refIds.has(i.id)).map(i => ({ name: i.name, data: i.data })), ...refUp];
    setBusy(true);
    try {
      const { compose } = await import('../../compose/compose');
      const r = await compose(
        { tuan, loai, ngay: loai === 'kh-ngay' ? THU_LIST.filter(t => ngay.has(t)) : undefined, mau: mau.data, thamKhao: refs.map(x => x.data) },
        program, { tenThamKhao: refs.map(x => x.name) },
      );
      setRes({ r, name: `KH ${loai === 'kh-ngay' ? 'ngay' : 'tuan'} tuan ${tuan} (máy soạn).docx` });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const toggleNgay = (t: Thu) => setNgay(s => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const toggleRef = (id: string) => setRefIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const kindOf = (i: (typeof items)[number]) => `${KIND_LABEL[i.report.parsed.kind]}${i.report.parsed.tuan ? ` · tuần ${i.report.parsed.tuan}` : ''}`;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Soạn thảo</h1>
        <p className="sub">Máy soạn khung kế hoạch theo chương trình. Hoạt động trùng đề tài với giáo án cũ thì chép nguyên văn; chỗ còn lại là khung để cô điền (tô vàng).</p>
      </header>

      <section className="card">
        <h2>1. Soạn gì</h2>
        <div className="weeks" role="tablist" aria-label="Chọn tuần">
          {program.weeks.map(w => (
            <button key={w.tuan} role="tab" aria-selected={w.tuan === tuan} className={`chip ${w.tuan === tuan ? 'on' : ''}`} onClick={() => setTuan(w.tuan)}>Tuần {w.tuan}</button>
          ))}
        </div>
        <div className="weeks" role="radiogroup" aria-label="Loại kế hoạch">
          <button role="radio" aria-checked={loai === 'kh-ngay'} className={`chip ${loai === 'kh-ngay' ? 'on' : ''}`} onClick={() => setLoai('kh-ngay')}>Kế hoạch ngày</button>
          <button role="radio" aria-checked={loai === 'kh-tuan'} className={`chip ${loai === 'kh-tuan' ? 'on' : ''}`} onClick={() => setLoai('kh-tuan')}>Kế hoạch tuần</button>
        </div>
        {loai === 'kh-ngay' && (
          <fieldset className="days-pick">
            <legend>Các ngày</legend>
            {THU_LIST.map(t => (
              <label key={t} className="check inline"><input type="checkbox" checked={ngay.has(t)} onChange={() => toggleNgay(t)} /><span>{THU_TEN[t]}</span></label>
            ))}
          </fieldset>
        )}
      </section>

      <section className="card">
        <h2>2. File mẫu</h2>
        <p className="note">Bản kế hoạch đã duyệt của tuần trước. Máy giữ nguyên định dạng và bảng của file này, chỉ thay chữ.</p>
        <label className="field">
          <span>File mẫu ({loai === 'kh-ngay' ? 'kế hoạch ngày' : 'kế hoạch tuần'})</span>
          <select value={mauId} onChange={e => setMauSel(e.target.value)}>
            {candidates.map(i => <option key={i.id} value={i.id}>{i.name} — {kindOf(i)}</option>)}
            <option value={UPLOAD}>Tải file lên…</option>
          </select>
        </label>
        {!candidates.length && <p className="note">Chưa có file cùng loại trong phiên. Tải file lên, hoặc soát file ở mục Soát &amp; sửa trước.</p>}
        {mauId === UPLOAD && (
          <label className="field">
            <span>{mauUp ? `Đã chọn: ${mauUp.name}` : 'Chọn file .docx'}</span>
            <input type="file" accept=".docx" onChange={async e => { setMauUp((await readFiles(e.target.files))[0] ?? null); e.target.value = ''; }} />
          </label>
        )}
      </section>

      <section className="card">
        <h2>3. Giáo án tham khảo (không bắt buộc)</h2>
        <p className="note">Tích các file giáo án cũ để chép lại hoạt động có cùng tên đề tài.</p>
        {items.length > 0 && (
          <ul className="gchecks">
            {items.map(i => (
              <li key={i.id}><label className="check"><input type="checkbox" checked={refIds.has(i.id)} onChange={() => toggleRef(i.id)} /><span>{i.name}</span><em>{kindOf(i)}</em></label></li>
            ))}
          </ul>
        )}
        {refUp.length > 0 && (
          <ul className="files">
            {refUp.map((u, k) => <li key={k} className="file"><span className="file-name">{u.name}</span><button className="link" onClick={() => setRefUp(l => l.filter((_, j) => j !== k))}>Bỏ</button></li>)}
          </ul>
        )}
        <label className="field">
          <span>Tải thêm file tham khảo (chọn được nhiều file)</span>
          <input type="file" accept=".docx" multiple onChange={async e => { const add = await readFiles(e.target.files); setRefUp(l => [...l, ...add]); e.target.value = ''; }} />
        </label>
      </section>

      <section className="card">
        <label className="check off"><input type="checkbox" disabled /><span>Dùng AI viết phần thiếu</span><em>cần máy chủ Gemini</em></label>
        <div className="actions">
          <button className="btn primary block" onClick={run} disabled={busy}>{busy ? 'Đang soạn…' : `Soạn ${loai === 'kh-ngay' ? 'kế hoạch ngày' : 'kế hoạch tuần'} tuần ${tuan}`}</button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
      </section>

      {res && (
        <section className="card" aria-label="Kết quả soạn">
          <h2>Đã soạn xong</h2>
          <p className="meta">
            Nguồn các buổi: <b>{res.r.nguon['tham-khao']}</b> buổi chép từ giáo án cũ · <b>{res.r.nguon.ai}</b> buổi do AI · <b>{res.r.nguon.khung}</b> buổi theo khung luật (cô điền chỗ tô vàng).
          </p>
          <div>
            <h3 className="sub-h">Cần chị quyết ({res.r.canQuyet.length})</h3>
            {res.r.canQuyet.length ? <ul className="quyet">{res.r.canQuyet.map((c, k) => <li key={k}>{c}</li>)}</ul> : <p className="clean">Không có việc nào cần quyết.</p>}
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => saveBlob(res.r.docx, res.name)}>Tải về</button>
            <button className="btn" onClick={async () => { await addBuffer(res.name, res.r.docx); go('soat'); }}>Soát bản này</button>
          </div>
          <p className="note">{res.name}. File mẫu và giáo án cũ không bị đổi.</p>
        </section>
      )}
    </div>
  );
}
