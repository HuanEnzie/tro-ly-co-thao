import { useEffect, useMemo, useRef } from 'react';
import { PreviewProps } from '../slots';

/** Xem trước TẠM: văn bản đã phân tích, theo vị trí (ngày – buổi – cột). Agent editor thay bằng slots.preview */
export default function ParsedPreview({ item, activeIssue, onPickIssue }: PreviewProps) {
  const all = useMemo(() => [...item.report.issues, ...(item.ai?.issues ?? [])], [item]);
  const lines = item.report.parsed.allLines;
  const hit = (text: string) => all.find(i => i.found && text.includes(i.found));
  const activeRef = useRef<HTMLLIElement>(null);
  const activeIdx = activeIssue?.found ? lines.findIndex(l => l.text.includes(activeIssue.found!)) : -1;
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [activeIssue]);

  let last = '';
  return (
    <div className="preview" aria-label="Văn bản đã phân tích">
      <p className="note">Bản xem văn bản tạm thời (bản xem trước giống file Word đang được làm).</p>
      <ul className="plines">
        {lines.map((l, k) => {
          const head = l.where !== last ? l.where : null;
          last = l.where;
          const h = hit(l.text);
          return (
            <li key={k} ref={k === activeIdx ? activeRef : undefined} className={`pl ${h ? `has ${h.level}` : ''} ${k === activeIdx ? 'active' : ''}`}>
              {head && <div className="where">{head}</div>}
              {h ? <button className="pl-text" onClick={() => onPickIssue(h)}>{l.text}</button> : <span className="pl-text">{l.text}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
