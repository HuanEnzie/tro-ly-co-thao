import { useMemo } from 'react';
import { Issue, LEVEL_LABEL } from '../../engine/types';

const dayPart = (where: string) => where.split(' – ')[0];
const actPart = (where: string) => where.split(' – ').slice(1).join(' – ') || 'Chung';

/** lỗi gom theo ngày → hoạt động; mặc định thu gọn, nhóm có lỗi nặng mở sẵn */
export default function IssueGroups({ issues, active, onPick }: { issues: Issue[]; active: Issue | null; onPick: (i: Issue) => void }) {
  const days = useMemo(() => {
    const m = new Map<string, Map<string, Issue[]>>();
    for (const i of issues) {
      const d = dayPart(i.where), a = actPart(i.where);
      const dm = m.get(d) ?? new Map<string, Issue[]>();
      dm.set(a, [...(dm.get(a) ?? []), i]);
      m.set(d, dm);
    }
    return [...m.entries()].map(([d, acts]) => ({
      d, acts: [...acts.entries()],
      n: [...acts.values()].reduce((x, l) => x + l.length, 0),
      heavy: [...acts.values()].flat().some(i => i.level === 'nang'),
    }));
  }, [issues]);

  return (
    <div className="igroups">
      {days.map(({ d, acts, n, heavy }) => (
        <details key={d} className="dgroup" open={heavy}>
          <summary><span className="gname">{d}</span><span className={`count ${heavy ? 'nang' : ''}`}>{n}</span></summary>
          {acts.map(([a, list]) => (
            <details key={a} className="agroup" open={list.some(i => i.level === 'nang')}>
              <summary><span className="aname">{a}</span><span className="count">{list.length}</span></summary>
              <ul>
                {list.map((i, k) => (
                  <li key={k}>
                    <div className={`issue ${i.level} ${active === i ? 'sel' : ''}`}>
                      <button className="issue-hit" onClick={() => onPick(i)} aria-pressed={active === i}>
                        <span className="tags"><span className={`tag ${i.level}`}>{LEVEL_LABEL[i.level]}</span>{i.source === 'ai' && <span className="tag ai">AI</span>}</span>
                        <span className="msg">{i.message}</span>
                        {i.found && <span className="found"><span>Gốc:</span> {i.found}</span>}
                        {i.fix && <span className="fix"><span>Sửa:</span> {i.fix}</span>}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}
