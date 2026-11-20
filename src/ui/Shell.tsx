import { ReactNode, useEffect, useState } from 'react';
import { Icon } from './Icons';
import { BOTTOM, href, ROUTES, RouteId } from './router';

/** khung ứng dụng: thanh bên trái (≥768px) / thanh dưới 4 nút + menu “Thêm” (điện thoại) */
export default function Shell({ route, children, badge }: { route: RouteId; children: ReactNode; badge?: Partial<Record<RouteId, number>> }) {
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [route]);
  const extra = ROUTES.filter(r => !BOTTOM.includes(r.id));
  const inMore = extra.some(r => r.id === route);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <strong>Trợ lý giáo án</strong>
          <span>Lớp 5T1 · MN Võ Cường</span>
        </div>
        <nav aria-label="Các mục chính">
          {ROUTES.map(r => (
            <a key={r.id} href={href(r.id)} className={`nav ${route === r.id ? 'on' : ''}`} aria-current={route === r.id ? 'page' : undefined}>
              <Icon id={r.id} /><span>{r.label}</span>
              {!!badge?.[r.id] && <em className="badge">{badge[r.id]}</em>}
            </a>
          ))}
        </nav>
      </aside>

      <main className="main" id="main">{children}</main>

      <nav className="bottom" aria-label="Các mục chính">
        {BOTTOM.map(id => {
          const r = ROUTES.find(x => x.id === id)!;
          return (
            <a key={id} href={href(id)} className={`tab ${route === id ? 'on' : ''}`} aria-current={route === id ? 'page' : undefined}>
              <Icon id={id} /><span>{r.short}</span>
              {!!badge?.[id] && <em className="badge">{badge[id]}</em>}
            </a>
          );
        })}
        <button className={`tab ${more || inMore ? 'on' : ''}`} onClick={() => setMore(m => !m)} aria-expanded={more} aria-haspopup="menu">
          <Icon id="more" /><span>Thêm</span>
        </button>
      </nav>
      {more && (
        <>
          <button className="scrim" aria-label="Đóng menu" onClick={() => setMore(false)} />
          <div className="sheet" role="menu">
            {extra.map(r => (
              <a key={r.id} role="menuitem" href={href(r.id)} className={`sheet-item ${route === r.id ? 'on' : ''}`}><Icon id={r.id} /><span>{r.label}</span></a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
