import { useState } from 'react';
import { KIND_LABEL } from '../../engine/types';
import { href } from '../router';
import { useSession } from '../session';
import { itemCounts } from './ThisWeek';

const THU_TEN: Record<number, string> = { 2: 'Thứ hai', 3: 'Thứ ba', 4: 'Thứ tư', 5: 'Thứ năm', 6: 'Thứ sáu' };
const first = (s: string) => s.split('\n').map(x => x.replace(/^\s*-\s*/, '').trim()).filter(Boolean)[0] ?? '—';

/** trang đầu: một việc chính (thả file vào để soát) + hai việc phụ; thông tin tuần để gọn bên dưới */
export default function Home() {
  const { program, week, setWeek, items, busy, addFiles, pickFiles, setActiveId } = useSession();
  const [drag, setDrag] = useState(false);
  const w = program.weeks.find(x => x.tuan === week) ?? program.weeks[0];

  return (
    <div className="home">
      <header className="hello">
        <h1>Cô muốn làm gì?</h1>
        <p className="sub">Trợ lý soạn và soát giáo án lớp 5T1. File chỉ xử lý trong trình duyệt của cô.</p>
      </header>

      <section
        className={`bigdrop ${drag ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
        onClick={pickFiles}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles(); } }}
        role="button" tabIndex={0} aria-label="Chọn file giáo án để soát"
      >
        <span className="bigdrop-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 17v-6" /><path d="m9 14 3-3 3 3" /></svg>
        </span>
        <strong>{busy ? 'Đang soát…' : 'Soát giáo án'}</strong>
        <span>Kéo file Word vào đây, hoặc <u>bấm để chọn file</u></span>
        <ol className="steps" aria-label="Các bước">
          <li><b>1</b> Chọn file kế hoạch ngày / tuần</li>
          <li><b>2</b> Xem lỗi máy tìm được</li>
          <li><b>3</b> Tải bản đã sửa</li>
        </ol>
      </section>

      <div className="tiles">
        <a className="tile" href={href('soan')}>
          <strong>Soạn kế hoạch mới</strong>
          <span>Máy dựng khung KH ngày / KH tuần theo chương trình, chép lại giáo án cũ cùng đề tài.</span>
        </a>
        <a className="tile" href={href('slide')}>
          <strong>Làm slide bài giảng</strong>
          <span>Chọn hoạt động, máy gợi ý dàn slide, cô sửa chữ và chọn hình rồi tải về.</span>
        </a>
      </div>

      {items.length > 0 && (
        <section className="block">
          <h2>File đang mở</h2>
          <ul className="files">
            {items.map(it => {
              const c = itemCounts(it);
              return (
                <li key={it.id}>
                  <a className="file" href={href('soat')} onClick={() => setActiveId(it.id)}>
                    <span className="file-main"><span className="file-name">{it.name}</span><span className="meta">{KIND_LABEL[it.report.parsed.kind]}</span></span>
                    <span className="file-n">{c.nang ? <b className="t-nang">{c.nang} lỗi nặng</b> : c.xem ? <b className="t-xem">{c.xem} cần xem</b> : <b className="t-ok">Ổn</b>}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {w && (
        <details className="block weekbox">
          <summary>
            <span><b>Tuần {w.tuan}</b> · {w.nhanh}</span>
            <span className="meta">Xem hoạt động cả tuần</span>
          </summary>
          <div className="weekpick" role="tablist" aria-label="Chọn tuần">
            {program.weeks.map(x => (
              <button key={x.tuan} role="tab" aria-selected={x.tuan === w.tuan} className={`seg ${x.tuan === w.tuan ? 'on' : ''}`} onClick={() => setWeek(x.tuan)}>Tuần {x.tuan}</button>
            ))}
          </div>
          <p className="meta">{w.khoang.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()} · Cô A: {w.coA ?? '—'} · Cô B: {w.coB ?? '—'}</p>
          <table className="wtable">
            <thead><tr><th>Ngày</th><th>Sáng</th><th>Chiều</th></tr></thead>
            <tbody>
              {[2, 3, 4, 5, 6].map(d => (
                <tr key={d}><th>{THU_TEN[d]}</th><td>{w.days[d] ? first(w.days[d].sang) : '—'}</td><td>{w.days[d] ? first(w.days[d].chieu) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
