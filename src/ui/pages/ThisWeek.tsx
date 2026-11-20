import { useMemo } from 'react';
import { countLevels } from '../../engine/checker';
import { KIND_LABEL, LEVEL_LABEL, Level } from '../../engine/types';
import { go, href } from '../router';
import { useSession } from '../session';
import { Item } from '../types';

const THU = [2, 3, 4, 5, 6];
const lines = (s: string) => s.split('\n').map(x => x.replace(/^\s*-\s*/, '').trim()).filter(Boolean);

export function itemCounts(it: Item) {
  return countLevels([...it.report.issues, ...(it.ai?.issues ?? [])]);
}

export function LevelCounts({ counts }: { counts: Record<Level, number> }) {
  return (
    <span className="lv">
      {(['nang', 'xem', 'chinh-ta'] as Level[]).map(l => (
        <span key={l} className={`pill ${l}`} title={LEVEL_LABEL[l]}>{counts[l]} <small>{LEVEL_LABEL[l]}</small></span>
      ))}
    </span>
  );
}

export default function ThisWeek() {
  const { program, week, setWeek, items, pickFiles, setActiveId } = useSession();
  const w = program.weeks.find(x => x.tuan === week) ?? program.weeks[0];
  const mine = useMemo(() => items.filter(i => i.report.parsed.tuan === w?.tuan), [items, w]);
  const others = useMemo(() => items.filter(i => i.report.parsed.tuan !== w?.tuan), [items, w]);

  const row = (it: Item) => {
    const c = itemCounts(it), p = it.report.parsed;
    return (
      <li key={it.id} className="file">
        <div className="file-main">
          <a href={href('soat')} onClick={() => setActiveId(it.id)} className="file-name">{it.name}</a>
          <span className="meta">{KIND_LABEL[p.kind]}{p.tuan ? ` · tuần ${p.tuan}` : ''}{it.ai ? ' · đã soát AI' : ''}</span>
        </div>
        {c.nang + c.xem + c['chinh-ta'] === 0 ? <span className="pill ok">Sạch lỗi</span> : <LevelCounts counts={c} />}
      </li>
    );
  };

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Tuần này</h1>
        <p className="sub">{program.chuDe || 'Chương trình chủ đề'}</p>
      </header>

      {w ? (
        <>
          <div className="weeks" role="tablist" aria-label="Chọn tuần">
            {program.weeks.map(x => (
              <button key={x.tuan} role="tab" aria-selected={x.tuan === w.tuan} className={`chip ${x.tuan === w.tuan ? 'on' : ''}`} onClick={() => setWeek(x.tuan)}>Tuần {x.tuan}</button>
            ))}
          </div>

          <section className="card">
            <div className="week-head">
              <div>
                <h2>Tuần {w.tuan} · {w.nhanh}</h2>
                <p className="meta">{w.khoang.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()}</p>
              </div>
              <div className="duo">
                <span><small>Cô A</small>{w.coA ?? '—'}</span>
                <span><small>Cô B</small>{w.coB ?? '—'}</span>
              </div>
            </div>
            <div className="days">
              {THU.map(d => {
                const day = w.days[d];
                return (
                  <article key={d} className="day">
                    <h3>Thứ {d === 2 ? 'hai' : d === 3 ? 'ba' : d === 4 ? 'tư' : d === 5 ? 'năm' : 'sáu'}</h3>
                    <div><small>Sáng</small>{(day ? lines(day.sang) : ['—']).map((t, k) => <p key={k}>{t}</p>)}</div>
                    <div><small>Chiều</small>{(day ? lines(day.chieu) : ['—']).map((t, k) => <p key={k}>{t}</p>)}</div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : <p className="note">Chưa có chương trình. Vào mục Chương trình để nạp file.</p>}

      <section className="card">
        <h2>Nút nhanh</h2>
        <div className="actions">
          <button className="btn primary" onClick={() => { pickFiles(); }}>Soát file mới</button>
          <button className="btn" onClick={() => go('soan')}>Soạn kế hoạch</button>
          <button className="btn" onClick={() => go('slide')}>Làm slide</button>
        </div>
      </section>

      <section className="card">
        <h2>File đã soát trong phiên này</h2>
        {!items.length && <p className="note">Chưa có file nào. Bấm “Soát file mới” hoặc kéo thả file Word ở mục Soát &amp; sửa. File chỉ nằm trong trình duyệt, tắt trang là mất.</p>}
        {mine.length > 0 && <><h3 className="sub-h">Của tuần {w?.tuan}</h3><ul className="files">{mine.map(row)}</ul></>}
        {others.length > 0 && <><h3 className="sub-h">{mine.length ? 'Tuần khác / chưa rõ tuần' : 'Các file'}</h3><ul className="files">{others.map(row)}</ul></>}
      </section>
    </div>
  );
}
