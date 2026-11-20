import { useMemo, useState } from 'react';
import { Issue } from '../../engine/types';

const SHOW = 8;

/** gom lỗi cùng một luật thành một dòng ("Thiếu Nêu gương — 4 chỗ"); bấm mở mới thấy từng chỗ */
export default function IssueGroups({ issues, active, onPick }: { issues: Issue[]; active: Issue | null; onPick: (i: Issue) => void }) {
  const [more, setMore] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) {
      const k = `${i.level}|${i.source}|${i.rule}`;
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.values()];
  }, [issues]);
  const list = more ? groups : groups.slice(0, SHOW);

  return (
    <div className="ilist">
      {list.map(g => <Group key={`${g[0].level}|${g[0].source}|${g[0].rule}`} g={g} active={active} onPick={onPick} />)}
      {groups.length > SHOW && (
        <button className="more" onClick={() => setMore(m => !m)}>{more ? 'Thu gọn' : `Xem thêm ${groups.length - SHOW} loại lỗi khác`}</button>
      )}
    </div>
  );
}

function Group({ g, active, onPick }: { g: Issue[]; active: Issue | null; onPick: (i: Issue) => void }) {
  const lv = g[0].level;
  if (g.length === 1) return <div className={`irow ${lv}`}><Hit i={g[0]} active={active} onPick={onPick} showMsg /></div>;

  const same = g.every(i => i.message === g[0].message);
  const title = same ? g[0].message : g[0].message.replace(/[“"][^”"]*[”"]/g, '…');
  const days = [...new Set(g.map(i => i.where.split(' – ')[0]))];
  return (
    <details className={`irow ${lv}`} open={lv === 'nang'}>
      <summary>
        <span className="ihead">{g[0].source === 'ai' && <span className="ai">AI</span>}<span className="ititle">{title}</span></span>
        <span className="iwhere">{g.length} chỗ · {days.slice(0, 3).join(', ')}{days.length > 3 ? '…' : ''}</span>
      </summary>
      <ul>{g.map((i, k) => <li key={k}><Hit i={i} active={active} onPick={onPick} showMsg={!same} /></li>)}</ul>
    </details>
  );
}

function Hit({ i, active, onPick, showMsg }: { i: Issue; active: Issue | null; onPick: (i: Issue) => void; showMsg?: boolean }) {
  return (
    <button className={`ihit ${active === i ? 'sel' : ''}`} onClick={() => onPick(i)} aria-pressed={active === i}>
      {showMsg && <span className="ihead">{i.source === 'ai' && <span className="ai">AI</span>}<span className="ititle">{i.message}</span></span>}
      <span className="iwhere">{i.where}</span>
      {(i.found || i.fix) && (
        <span className="idiff">
          {i.fix ? <>{i.found && <del>{i.found}</del>} <span aria-hidden="true">→</span> <ins>{i.fix}</ins></> : <q>{i.found}</q>}
        </span>
      )}
    </button>
  );
}
