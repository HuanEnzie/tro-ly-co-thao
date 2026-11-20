/**
 * Trang Thư viện. Chưa nối máy chủ: hướng dẫn + danh sách file trong phiên. Đã nối Supabase: đăng nhập email OTP,
 * danh sách tài liệu và các phiên bản (src/backend/api.ts). Nạp lười vì kéo theo thư viện Supabase.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  backendReady, currentUser, downloadPhienBan, listPhienBan, listTaiLieu, signInOtp, signOut, verifyOtp,
  type PhienBan, type TaiLieu,
} from '../../backend/api';
import { KIND_LABEL } from '../../engine/types';
import { itemCounts, LevelCounts } from './ThisWeek';
import type { PageProps } from '../slots';
import type { Item } from '../types';

const LOAI_VI: Record<string, string> = { 'kh-tuan': 'Kế hoạch tuần', 'kh-ngay': 'Kế hoạch ngày', 'chuong-trinh': 'Chương trình', slide: 'Slide', mau: 'File mẫu', khac: 'Khác' };
const NGUON_VI: Record<string, string> = { 'tai-len': 'tải lên', 'may-sua': 'máy sửa', 'sua-tay': 'sửa tay', 'may-soan': 'máy soạn' };
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function SessionFiles({ items }: { items: Item[] }) {
  return (
    <section className="card">
      <h2>File trong phiên này</h2>
      {!items.length && <p className="note">Chưa có file nào. Nạp file ở mục Soát &amp; sửa. File chỉ nằm trong trình duyệt, tắt trang là mất.</p>}
      <ul className="files">
        {items.map(it => {
          const c = itemCounts(it), p = it.report.parsed;
          const n = c.nang + c.xem + c['chinh-ta'];
          return (
            <li key={it.id} className="file">
              <div className="file-main">
                <span className="file-name">{it.name}</span>
                <span className="meta">{KIND_LABEL[p.kind]}{p.tuan ? ` · tuần ${p.tuan}` : ''} · {n} lỗi</span>
              </div>
              {n ? <LevelCounts counts={c} /> : <span className="pill ok">Sạch lỗi</span>}
              <button className="btn sm" onClick={() => saveBlob(new Blob([it.data], { type: DOCX }), it.name)}>Tải lại bản gốc</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Cloud() {
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [docs, setDocs] = useState<TaiLieu[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [vers, setVers] = useState<Record<string, PhienBan[]>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const guard = useCallback(async (f: () => Promise<void>) => {
    setBusy(true); setMsg('');
    try { await f(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }, []);

  useEffect(() => { currentUser().then(u => setUser(u?.email ?? (u ? u.id : null))).catch(() => setUser(null)); }, []);
  useEffect(() => {
    if (!user) { setDocs(null); return; }
    void guard(async () => { setDocs(await listTaiLieu()); });
  }, [user, guard]);

  const toggle = (d: TaiLieu) => {
    setOpen(o => (o === d.id ? null : d.id));
    if (!vers[d.id]) void guard(async () => { const v = await listPhienBan(d.id); setVers(s => ({ ...s, [d.id]: v })); });
  };

  if (user === undefined) return <section className="card"><p className="note">Đang kiểm tra đăng nhập…</p></section>;

  if (!user) {
    return (
      <section className="card">
        <h2>Đăng nhập</h2>
        <p className="note">Nhập email, máy chủ gửi mã 6 số về hộp thư; nhập mã đó để vào.</p>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
        {!sent ? (
          <div className="actions"><button className="btn primary" disabled={busy || !email.includes('@')} onClick={() => guard(async () => { await signInOtp(email); setSent(true); })}>Gửi mã về email</button></div>
        ) : (
          <>
            <label className="field"><span>Mã 6 số</span><input type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" /></label>
            <div className="actions">
              <button className="btn primary" disabled={busy || code.trim().length < 6} onClick={() => guard(async () => { const u = await verifyOtp(email, code); setUser(u.email ?? u.id); setCode(''); setSent(false); })}>Vào</button>
              <button className="btn" onClick={() => { setSent(false); setCode(''); }}>Gửi lại mã</button>
            </div>
          </>
        )}
        {msg && <p className="err" role="alert">{msg}</p>}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="week-head">
        <h2>Tài liệu của tổ</h2>
        <button className="link" onClick={() => guard(async () => { await signOut(); setUser(null); })}>Đăng xuất ({user})</button>
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      {docs === null && <p className="note">Đang tải danh sách…</p>}
      {docs?.length === 0 && <p className="note">Chưa có tài liệu nào được lưu.</p>}
      <ul className="files">
        {(docs ?? []).map(d => (
          <li key={d.id} className="file" style={{ display: 'grid' }}>
            <button className="link" style={{ textAlign: 'left' }} aria-expanded={open === d.id} onClick={() => toggle(d)}>{d.ten} · {LOAI_VI[d.loai] ?? d.loai}</button>
            {open === d.id && (
              <ul className="files">
                {(vers[d.id] ?? []).map(v => (
                  <li key={v.id} className="file">
                    <span className="meta">Bản {v.so} · {NGUON_VI[v.nguon] ?? v.nguon} · {new Date(v.tao_luc).toLocaleString('vi-VN')}{v.ghi_chu ? ` · ${v.ghi_chu}` : ''}</span>
                    <button className="btn sm" onClick={() => guard(async () => { saveBlob(await downloadPhienBan(v.id), `${d.ten.replace(/\.docx$/i, '')} (bản ${v.so}).${v.duoi || 'docx'}`); })}>Tải về</button>
                  </li>
                ))}
                {!vers[d.id] && <li className="note">Đang tải các bản…</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function LibraryPage({ items }: PageProps) {
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Thư viện</h1>
        <p className="sub">Mọi file theo tuần, chủ đề và các phiên bản.</p>
      </header>
      {backendReady ? <Cloud /> : (
        <section className="card">
          <h2>Chưa nối máy chủ</h2>
          <p>Chưa nối máy chủ — xem <code>docs/supabase.md</code> để nối. Khi nối xong, mục này lưu file theo tuần và giữ lịch sử các phiên bản cho cả tổ.</p>
          <p className="note">Trong lúc đó, file chỉ nằm trong trình duyệt của phiên này.</p>
        </section>
      )}
      <SessionFiles items={items} />
    </div>
  );
}
