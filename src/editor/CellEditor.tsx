/**
 * Xem trước + sửa tay theo ô. Bấm một ô ở bản xem trước (hoặc chọn từ danh sách) → khung sửa các đoạn của ô
 * (mỗi đoạn một ô nhập, thêm/xóa đoạn) → Lưu = ghi vào XML giữ nguyên định dạng (cell-edit.ts) rồi vẽ lại.
 * Điện thoại: khung sửa là bottom sheet. Nút tải bản sửa tay / mở bằng Word (tải file về).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DocPreview, { type CellRef, type PreviewFocus, type PreviewHighlight, type PreviewInfo } from './DocPreview';
import { applyTextEdits, editsFromItems, listCells, readDocumentXml, type ApplyReport, type EditableCell } from './cell-edit';
import './editor.css';

export interface CellEditorProps {
  data: ArrayBuffer;
  fileName: string;
  /** gọi sau mỗi lần Lưu: file mới (ArrayBuffer) và tên đề nghị `<gốc> (sửa tay).docx` */
  onChange?: (data: ArrayBuffer, fileName: string, report: ApplyReport) => void;
  highlights?: PreviewHighlight[];
  focus?: PreviewFocus | null;
  /** mở khung sửa của ô này từ bên ngoài (vd bấm vào một lỗi trong danh sách); đổi `nonce` để mở lại */
  openCell?: (CellRef & { nonce?: number }) | null;
  onReady?: (info: PreviewInfo) => void;
}

interface Item { id: number; orig: number | null; text: string }

export const editedName = (name: string) => `${name.replace(/\.docx$/i, '').replace(/ \(sửa tay[^)]*\)$/, '')} (sửa tay).docx`;

function saveBlob(data: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function CellEditor({ data, fileName, onChange, highlights, focus, openCell, onReady }: CellEditorProps) {
  const [current, setCurrent] = useState(data);
  const [cells, setCells] = useState<EditableCell[]>([]);
  const [sel, setSel] = useState<CellRef | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [yellow, setYellow] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [modified, setModified] = useState(false);
  const nextId = useRef(1);

  useEffect(() => { setCurrent(data); setSel(null); setModified(false); setMsg(''); }, [data]);
  useEffect(() => {
    let stale = false;
    readDocumentXml(current).then(xml => { if (!stale) setCells(listCells(xml)); }).catch(() => { if (!stale) setCells([]); });
    return () => { stale = true; };
  }, [current]);

  const cell = useMemo(() => sel ? cells.find(c => c.tbl === sel.tbl && c.row === sel.row && c.cell === sel.cell) ?? null : null, [cells, sel]);
  const origTexts = useMemo(() => cell?.paras.map(p => p.text) ?? [], [cell]);

  // nạp danh sách đoạn khi mở ô (hoặc sau khi lưu)
  useEffect(() => {
    setItems(cell ? cell.paras.map((p, i) => ({ id: nextId.current++, orig: i, text: p.text })) : []);
  }, [cell]);

  const open = useCallback((c: CellRef) => { setSel({ tbl: c.tbl, row: c.row, cell: c.cell }); setMsg(''); }, []);
  useEffect(() => { if (openCell) open(openCell); }, [openCell, open]);

  const edits = useMemo(() => cell ? editsFromItems(cell, origTexts, items.map(i => ({ orig: i.orig, text: i.text }))) : [], [cell, origTexts, items]);
  const dirty = edits.length > 0;

  const close = () => { if (dirty && !window.confirm('Bỏ các chỗ vừa sửa trong ô này?')) return; setSel(null); };
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel]);

  const save = async () => {
    if (!cell || !dirty) return;
    setBusy(true); setMsg('');
    try {
      const { data: out, report } = await applyTextEdits(current, edits, { highlight: yellow });
      setCurrent(out); setModified(true);
      onChange?.(out, editedName(fileName), report);
      setMsg(`Đã lưu: sửa ${report.changedParas}, thêm ${report.inserted}, xóa ${report.removed} đoạn.`);
    } catch (e) { setMsg('Chưa lưu được: ' + (e as Error).message); }
    setBusy(false);
  };

  const setText = (id: number, text: string) => setItems(a => a.map(x => (x.id === id ? { ...x, text } : x)));
  const addAfter = (id: number | null) => setItems(a => {
    const n: Item = { id: nextId.current++, orig: null, text: '' };
    if (id === null) return [n, ...a];
    const i = a.findIndex(x => x.id === id);
    return [...a.slice(0, i + 1), n, ...a.slice(i + 1)];
  });
  const del = (id: number) => setItems(a => a.filter(x => x.id !== id));

  const download = () => saveBlob(current, editedName(fileName));
  const toWord = () => { saveBlob(current, editedName(fileName)); setMsg('Đã tải file. Mở file vừa tải bằng Word để chỉnh định dạng; xong thì tải lên lại để soát.'); };

  return (
    <div className="ce-root">
      <div className="ce-bar">
        <label className="ce-pick">
          <span>Chọn ô để sửa</span>
          <select value={sel ? `${sel.tbl}/${sel.row}/${sel.cell}` : ''} onChange={e => { const [t, r, c] = e.target.value.split('/').map(Number); if (e.target.value) open({ tbl: t, row: r, cell: c }); }}>
            <option value="">— hoặc bấm thẳng vào ô trên bản xem trước —</option>
            {cells.map(c => (
              <option key={`${c.tbl}/${c.row}/${c.cell}`} value={`${c.tbl}/${c.row}/${c.cell}`}>
                {c.where} · {(c.paras.find(p => p.text.trim())?.text ?? '(trống)').slice(0, 40)}
              </option>
            ))}
          </select>
        </label>
        <label className="ce-check"><input type="checkbox" checked={yellow} onChange={e => setYellow(e.target.checked)} /> Tô vàng chỗ đã sửa</label>
        <button type="button" className="ce-btn" onClick={download} disabled={!modified} title={modified ? '' : 'Chưa có chỗ nào sửa tay'}>Tải bản sửa tay</button>
        <button type="button" className="ce-btn ce-ghost" onClick={toWord}>Mở bằng Word</button>
      </div>
      {msg && <p className="ce-msg" role="status">{msg}</p>}

      <div className={`ce-main ${cell ? 'ce-has-sheet' : ''}`}>
        <DocPreview data={current} highlights={highlights} focus={focus} selectedCell={sel} onSelectCell={open} onReady={onReady} />

        {cell && (
          <>
            <div className="ce-scrim" onClick={close} />
            <section className="ce-sheet" role="dialog" aria-label={`Sửa ô ${cell.where}`}>
              <header>
                <div>
                  <strong>{cell.where}</strong>
                  <small>Bảng {cell.tbl + 1} · hàng {cell.row + 1} · ô {cell.cell + 1} · {items.length} đoạn</small>
                </div>
                <button type="button" className="ce-x" onClick={close} aria-label="Đóng">✕</button>
              </header>
              <div className="ce-list">
                <button type="button" className="ce-add" onClick={() => addAfter(null)}>+ Thêm đoạn ở đầu</button>
                {items.map((it, i) => (
                  <div key={it.id} className={`ce-item ${it.orig === null ? 'ce-new' : it.text !== origTexts[it.orig] ? 'ce-chg' : ''}`}>
                    <span className="ce-no">{i + 1}</span>
                    <textarea
                      value={it.text}
                      rows={Math.max(1, Math.min(8, Math.ceil(it.text.length / 34) + it.text.split('\n').length - 1))}
                      placeholder="(dòng trống)"
                      onChange={e => setText(it.id, e.target.value)}
                      aria-label={`Đoạn ${i + 1}`}
                      spellCheck
                      lang="vi"
                    />
                    <div className="ce-ops">
                      <button type="button" onClick={() => addAfter(it.id)} aria-label={`Thêm đoạn sau đoạn ${i + 1}`} title="Thêm đoạn bên dưới">＋</button>
                      <button type="button" onClick={() => del(it.id)} aria-label={`Xóa đoạn ${i + 1}`} title="Xóa đoạn">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
              <footer>
                <span className="ce-count">{dirty ? 'Có chỗ chưa lưu' : 'Chưa sửa gì'}</span>
                <button type="button" className="ce-btn ce-ghost" onClick={close}>Đóng</button>
                <button type="button" className="ce-btn" onClick={save} disabled={!dirty || busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
              </footer>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
