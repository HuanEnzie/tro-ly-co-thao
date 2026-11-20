import { useEffect, useMemo, useState } from 'react';
import { FIX_GROUPS, FixGroupId, PlannedFix, planFixes, rulesOfGroups } from '../../engine/fixer';
import type { Slot } from '../../engine/suggest-tre';
import { listFillSlots } from '../fixchain';
import { useSession } from '../session';
import { Item } from '../types';

const vis = (s: string) => s.replace(/ /g, '␣');
const PAGE = 60;

/** chọn mục sửa: nhóm có ô tích + từng chỗ có ô tích riêng, xem trước (cũ gạch đỏ, mới xanh lá), rồi “Tạo bản sửa” */
export default function FixPanel({ item }: { item: Item }) {
  const { makeFixed } = useSession();
  const hd = item.report.parsed.kind === 'kh-ngay';
  const [plan, setPlan] = useState<PlannedFix[] | null>(null);
  const [groups, setGroups] = useState<Set<FixGroupId>>(new Set(FIX_GROUPS.map(g => g.id)));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  // căn hàng cô–trẻ: mặc định BẬT với KH ngày; điền hoạt động của trẻ: mặc định TẮT
  const [align, setAlign] = useState(hd);
  const [fillOn, setFillOn] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [noFill, setNoFill] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setPlan(null); setSkipped(new Set()); setShown(PAGE); setSlots(null); setNoFill(new Set());
    planFixes(item.data, { hdSpace: hd }).then(p => { if (live) setPlan(p); }).catch(() => { if (live) setPlan([]); });
    if (hd) listFillSlots(item.data).then(s => { if (live) setSlots(s); }).catch(() => { if (live) setSlots([]); });
    else setSlots([]);
    return () => { live = false; };
  }, [item.id, item.data, hd]);

  const count = (g: FixGroupId) => plan?.filter(f => f.group === g).length ?? 0;
  const inGroups = useMemo(() => (plan ?? []).filter(f => f.group && groups.has(f.group)), [plan, groups]);
  const selected = inGroups.filter(f => !skipped.has(f.id));
  const toggleGroup = (g: FixGroupId) => setGroups(s => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const toggleFix = (id: string) => setSkipped(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const preset = (ids: FixGroupId[]) => { setGroups(new Set(ids)); setSkipped(new Set()); };

  const fillChosen = useMemo(() => (fillOn ? (slots ?? []).filter(s => !noFill.has(s.id)) : []), [fillOn, slots, noFill]);
  const toggleFill = (id: string) => setNoFill(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const anything = selected.length > 0 || (hd && align) || fillChosen.length > 0;

  async function create() {
    setBusy(true);
    try {
      await makeFixed(item, { rules: rulesOfGroups(groups), skipIds: [...skipped], align: hd && align, fill: fillChosen.map(s => ({ id: s.id })) });
    } finally { setBusy(false); }
  }

  const ready = plan !== null;
  return (
    <section className="card fix" aria-label="Chọn mục sửa">
      <h2>Sửa tự động</h2>
      <p className="note">Chỉ sửa chỗ chắc chắn (chính tả, dấu câu). Nội dung, tên tiết, ngày tháng để cô quyết. Chỗ sửa được tô vàng trong file.</p>
      <div className="quick">
        <button className="btn sm" onClick={() => preset(['chinh-ta', 'go-dup'])}>Chỉ chính tả</button>
        <button className="btn sm" onClick={() => preset(['dau-cau'])}>Chỉ dấu câu</button>
        <button className="btn sm" onClick={() => preset(FIX_GROUPS.map(g => g.id))}>Tất cả chỗ chắc chắn</button>
      </div>
      <ul className="gchecks">
        {FIX_GROUPS.filter(g => g.id !== 'hd-so' || hd).map(g => (
          <li key={g.id}>
            <label className="check"><input type="checkbox" checked={groups.has(g.id)} onChange={() => toggleGroup(g.id)} disabled={!ready} /><span>{g.label}</span><em>{ready ? count(g.id) : '…'}</em></label>
          </li>
        ))}
        {hd && (
          <>
            <li>
              <label className="check"><input type="checkbox" checked={align} onChange={e => setAlign(e.target.checked)} /><span>Căn hàng cô–trẻ</span><em>{align ? 'bật' : 'tắt'}</em></label>
              <span className="ctx">Sau khi sửa, thêm/bớt dòng trống bên cột trẻ để câu của trẻ vẫn ngang câu của cô như bản gốc.</span>
            </li>
            <li>
              <label className="check"><input type="checkbox" checked={fillOn} onChange={e => setFillOn(e.target.checked)} disabled={slots === null} /><span>Điền hoạt động của trẻ</span><em>{slots === null ? '…' : slots.length}</em></label>
              <span className="ctx">Chỉ điền vào chỗ trẻ còn trống, không sửa chữ cô đã viết.</span>
            </li>
          </>
        )}
      </ul>

      {hd && fillOn && (slots ?? []).length > 0 && (
        <details className="plan" open>
          <summary>Điền cho trẻ {fillChosen.length}/{(slots ?? []).length} chỗ</summary>
          <ul className="fixlist">
            {(slots ?? []).map(s => (
              <li key={s.id} className={noFill.has(s.id) ? 'skip' : ''}>
                <label className="check"><input type="checkbox" checked={!noFill.has(s.id)} onChange={() => toggleFill(s.id)} aria-label={'Điền “' + s.suggestion + '”'} />
                  <span className="diff"><b>Cô:</b> {s.coText} <b aria-hidden="true">→</b> <ins>{s.suggestion}</ins></span>
                </label>
                <span className="ctx">{s.label || 'hàng ' + s.row}{s.target ? '' : ' · chưa có chỗ trống ngang hàng, sẽ bị bỏ qua'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {hd && fillOn && slots !== null && slots.length === 0 && <p className="clean">Không còn chỗ nào của trẻ cần điền.</p>}

      {ready && inGroups.length === 0 && <p className="clean">Không có chỗ nào cần sửa trong các nhóm đã chọn.</p>}
      {inGroups.length > 0 && (
        <details className="plan" open>
          <summary>Xem trước {selected.length}/{inGroups.length} chỗ sẽ sửa</summary>
          <ul className="fixlist">
            {inGroups.slice(0, shown).map(f => (
              <li key={f.id} className={skipped.has(f.id) ? 'skip' : ''}>
                <label className="check"><input type="checkbox" checked={!skipped.has(f.id)} onChange={() => toggleFix(f.id)} aria-label={`Sửa “${f.before}”`} />
                  <span className="diff"><del>{vis(f.before)}</del> <b aria-hidden="true">→</b> <ins>{vis(f.after)}</ins></span>
                </label>
                <span className="ctx">{f.context}</span>
              </li>
            ))}
          </ul>
          {inGroups.length > shown && <button className="link" onClick={() => setShown(n => n + PAGE)}>Hiện thêm {Math.min(PAGE, inGroups.length - shown)} chỗ</button>}
        </details>
      )}

      <div className="actions">
        <button className="btn primary block" onClick={create} disabled={!ready || busy || !anything}>
          {busy ? 'Đang tạo…' : `Tạo bản sửa (${selected.length} chỗ${hd && align ? ', căn hàng' : ''}${fillChosen.length ? `, điền ${fillChosen.length} câu trẻ` : ''})`}
        </button>
      </div>
      {item.fixed && (
        <p className="note">Đã tạo <a href={item.fixed.url} download={item.fixed.name}>{item.fixed.name}</a> với {item.fixed.changes.length} chỗ sửa. File gốc không bị đổi.</p>
      )}
      {item.fixed?.align && (
        <p className="note">
          Căn hàng: đã căn {item.fixed.align.changed} chỗ (thêm/bớt dòng trống), {item.fixed.align.unresolved.length} hàng chưa căn được{item.fixed.align.unresolved.length ? ' — ' + item.fixed.align.unresolved.join('; ') : ''}.
        </p>
      )}
      {item.fixed?.fill && (
        <p className="note">
          Điền hoạt động của trẻ: đã điền {item.fixed.fill.applied.length} câu{item.fixed.fill.skipped.length ? `, bỏ qua ${item.fixed.fill.skipped.length} (${item.fixed.fill.skipped.map(x => x.reason).join('; ')})` : ''}.
        </p>
      )}
    </section>
  );
}
