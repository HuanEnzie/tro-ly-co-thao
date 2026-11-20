/**
 * Trang Slide: chọn tuần → hoạt động (hoặc loại tiết + tên đề tài) → dàn slide đề xuất → sửa chữ, chọn hình, bỏ/đổi thứ tự → tạo .pptx.
 * Trang này nạp lười; pptxgenjs chỉ nạp khi bấm “Tạo .pptx”.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { classify } from '../../engine/rules/structure';
import { weekFrame } from '../../compose/rules';
import { deXuatDan } from '../../slides/outline';
import { CHUA_CHON, type Deck, type LoaiTiet, type ResolvedAsset, type SlideSpec } from '../../slides/types';
import manifest from '../../../assets-slide/manifest.json';
import type { PageProps } from '../slots';

type Muc = { id: string; chuDe: string; tenVi: string; trangThai: string; tep?: string };
const MUCS = (manifest.mucs as Muc[]).filter(m => (m.trangThai === 'da-ve' || m.trangThai === 'da-duyet') && m.tep);
const CHU_DE = [{ slug: 'chung', ten: 'Dùng chung' }, ...(manifest.chuDe as { slug: string; ten: string }[])];
// ảnh nạp lười: chỉ lấy địa chỉ khi cần
const URLS = import.meta.glob('/assets-slide/img/**/*.{png,webp}', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;

const LOAI: [LoaiTiet, string][] = [
  ['KPKH', 'Khám phá khoa học (KPKH)'], ['KPXH', 'Khám phá xã hội (KPXH)'], ['LQVT', 'Làm quen với toán (LQVT)'], ['LQCC', 'Làm quen chữ cái (LQCC)'],
  ['THO', 'Thơ'], ['TRUYEN', 'Truyện'], ['AM-NHAC', 'Âm nhạc'], ['TAO-HINH', 'Tạo hình'], ['THE-DUC', 'Thể dục'], ['HOAT-DONG-GOC', 'Hoạt động góc'],
];
const TEMPLATE_VI: Record<string, string> = {
  'mo-dau': 'Mở đầu', 'thoa-thuan': 'Thỏa thuận chơi', 'gioi-thieu': 'Giới thiệu bài', 'quan-sat': 'Quan sát – đàm thoại', 'rung-chuong-vang': 'Rung chuông vàng',
  'ai-nhanh-hon': 'Ai nhanh hơn', 'ghep-doi': 'Ghép đôi', 'dem-noi-so-luong': 'Đếm và nối số lượng', 'tim-chu': 'Tìm chữ cái', 'tho-truyen': 'Thơ / truyện',
  'am-nhac': 'Âm nhạc', 'tao-hinh': 'Tạo hình', 'the-duc': 'Thể dục', goc: 'Hoạt động góc', 'qua-trinh-choi': 'Quá trình chơi', 'nhan-xet': 'Nhận xét – khen', 'ket-thuc': 'Kết thúc',
};
const FIELD_VI: Record<string, string> = {
  tenHoatDong: 'Tên hoạt động', loaiTiet: 'Loại tiết', chuDe: 'Chủ đề', lop: 'Lớp', giaoVien: 'Giáo viên', truong: 'Trường', donViChuQuan: 'Đơn vị chủ quản',
  tieuDe: 'Tiêu đề', phuDe: 'Phụ đề', cacDieu: 'Các điều (mỗi dòng một điều)', cauHoi: 'Câu hỏi', nhan: 'Nhãn', chu: 'Chữ', tu: 'Từ', tenBai: 'Tên bài', tacGia: 'Tác giả',
  loi: 'Lời bài hát (mỗi dòng một câu)', de: 'Đề bài', phan: 'Phần', noiDung: 'Nội dung', ten: 'Tên', hoatDong: 'Hoạt động (mỗi dòng một việc)', loiKhen: 'Lời khen (mỗi dòng một câu)',
  goc: 'Góc', cap: 'Cặp', trai: 'Bên trái', phai: 'Bên phải', nhom: 'Nhóm', cacTu: 'Từ', doan: 'Đoạn', cacBuoc: 'Bước', cacPhan: 'Phần', lua: 'Lựa chọn', dapAn: 'Đáp án',
  loiChao: 'Lời chào', loiCamOn: 'Lời cảm ơn', dapAnMo: 'Đáp án mở', ghiChu: 'Ghi chú cho cô',
};
const IMG_KEYS = new Set(['hinh', 'nen', 'nhanVat', 'trangTri', 'anhSanPham', 'tranhMau']);
const SKIP = new Set(['template', 'id', 'assets', 'music']);
const MUSIC_ID = 'nhac-co';

type Path = (string | number)[];
interface Field { path: Path; label: string; kind: 'text' | 'lines' | 'img' }

/** liệt kê các trường sửa được của một slide: chuỗi, mảng chuỗi (mỗi dòng một phần tử), ô hình */
function fieldsOf(spec: SlideSpec): Field[] {
  const out: Field[] = [];
  const walk = (v: unknown, path: Path, label: string) => {
    const key = String(path[path.length - 1] ?? '');
    if (typeof v === 'string') {
      const isImgKey = IMG_KEYS.has(typeof path[path.length - 1] === 'number' ? String(path[path.length - 2]) : key);
      out.push({ path, label, kind: isImgKey ? 'img' : 'text' });
    } else if (Array.isArray(v)) {
      if (v.every(x => typeof x === 'string')) {
        if (IMG_KEYS.has(key)) v.forEach((_, i) => out.push({ path: [...path, i], label: `${label} ${i + 1}`, kind: 'img' }));
        else out.push({ path, label: path.length > 1 ? label : (FIELD_VI[key] ?? label), kind: 'lines' });
      } else v.forEach((x, i) => walk(x, [...path, i], `${label} ${i + 1}`));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!SKIP.has(k)) walk(x, [...path, k], label + ' – ' + (FIELD_VI[k] ?? (IMG_KEYS.has(k) ? 'Hình' : k)));
    }
  };
  for (const [k, x] of Object.entries(spec)) if (!SKIP.has(k)) walk(x, [k], FIELD_VI[k] ?? (IMG_KEYS.has(k) ? 'Hình' : k));
  return out;
}

function getIn(o: unknown, path: Path): unknown { return path.reduce<unknown>((a, k) => (a as Record<string | number, unknown>)?.[k], o); }
function setIn<T>(o: T, path: Path, val: unknown): T {
  if (!path.length) return val as T;
  const [k, ...rest] = path;
  const copy = (Array.isArray(o) ? [...o] : { ...(o as object) }) as Record<string | number, unknown>;
  copy[k] = setIn(copy[k], rest, val);
  return copy as T;
}

function titleOf(s: SlideSpec): string {
  const x = s as unknown as Record<string, unknown>;
  for (const k of ['tieuDe', 'tenBai', 'tenHoatDong', 'de', 'cauHoi', 'chu']) if (typeof x[k] === 'string' && x[k]) return String(x[k]);
  return '';
}

/** loại tiết đoán từ tên hoạt động trong chương trình */
function guessLoai(ten: string): LoaiTiet | null {
  const k = classify(ten);
  switch (k) {
    case 'the-duc': return 'THE-DUC';
    case 'truyen': return 'TRUYEN';
    case 'tho': return 'THO';
    case 'tao-hinh': return 'TAO-HINH';
    case 'am-nhac': return 'AM-NHAC';
    case 'lqvt': return 'LQVT';
    case 'lqcc': return 'LQCC';
    case 'goc': return 'HOAT-DONG-GOC';
    case 'kham-pha': return /kpxh|xã hội/i.test(ten) ? 'KPXH' : 'KPKH';
    default: return null;
  }
}

interface Activity { key: string; label: string; ten: string; deTai: string; loai: LoaiTiet | null }
const THU_TEN: Record<number, string> = { 2: 'Thứ hai', 3: 'Thứ ba', 4: 'Thứ tư', 5: 'Thứ năm', 6: 'Thứ sáu' };

async function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => rej(new Error('không đọc được hình'));
      im.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/[ .]+$/, '').trim() || 'slide';

export default function SlidesPage({ program, week }: PageProps) {
  const [tuan, setTuan] = useState<number>(week ?? program.weeks[0]?.tuan ?? 0);
  const [act, setAct] = useState('');
  const [loai, setLoai] = useState<LoaiTiet>('KPKH');
  const [deTai, setDeTai] = useState('');
  const [chuDe, setChuDe] = useState(() => program.chuDe.replace(/^.*?CHỦ ĐỀ\s*/i, '').trim());
  const [b1, setB1] = useState(''); const [b2, setB2] = useState(''); const [b3, setB3] = useState('');
  const [deck, setDeck] = useState<Deck | null>(null);
  const [lib, setLib] = useState('all');
  const [music, setMusic] = useState<{ name: string; data: ArrayBuffer; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState<{ url: string; name: string; thieuHinh: string[]; thieuNhac: string[]; soSlide: number; toi: number } | null>(null);
  const seq = useRef(0);

  const acts = useMemo<Activity[]>(() => {
    try {
      return weekFrame(program, tuan).days.flatMap(d => [d.sang, d.chieu].map(s => ({
        key: `${d.thu}-${s.buoi}`, label: `${d.thuTen} ${s.buoi}: ${s.ten}`, ten: s.ten, deTai: s.tenDeTai || s.ten, loai: guessLoai(s.ten),
      }))).filter(a => a.ten);
    } catch { return []; }
  }, [program, tuan]);

  // chọn hoạt động → điền loại tiết và tên đề tài (cô vẫn sửa được)
  useEffect(() => { setAct(''); setDeck(null); setOut(null); }, [tuan]);
  const pickAct = (key: string) => {
    setAct(key);
    const a = acts.find(x => x.key === key);
    if (!a) return;
    setDeTai(a.deTai);
    if (a.loai) setLoai(a.loai);
  };

  const mucs = useMemo(() => MUCS.filter(m => lib === 'all' || m.chuDe === lib), [lib]);
  const nameOf = (id: string) => MUCS.find(m => m.id === id)?.tenVi ?? id;

  const dan = () => {
    setErr(''); setOut(null);
    if (!deTai.trim()) { setErr('Gõ tên đề tài (hoặc chọn một hoạt động của tuần).'); return; }
    const d = deXuatDan({ loaiTiet: loai, tenDeTai: deTai.trim(), chuDe: chuDe.trim(), buoc1: b1, buoc2: b2, buoc3: b3 });
    d.slides = d.slides.map(s => ({ ...s, id: `s${++seq.current}` }));
    setDeck(d);
  };

  const edit = (i: number, f: (s: SlideSpec) => SlideSpec) => setDeck(d => d && { ...d, slides: d.slides.map((s, k) => (k === i ? f(s) : s)) });
  const move = (i: number, dir: -1 | 1) => setDeck(d => {
    if (!d || i + dir < 0 || i + dir >= d.slides.length) return d;
    const a = [...d.slides]; [a[i], a[i + dir]] = [a[i + dir], a[i]];
    return { ...d, slides: a };
  });
  const remove = (i: number) => setDeck(d => d && { ...d, slides: d.slides.filter((_, k) => k !== i) });

  const useMusic = (i: number, on: boolean) => edit(i, s => ({ ...s, music: on && music ? { id: MUSIC_ID, title: music.name } : undefined }));

  async function loadMusic(f: File | undefined) {
    if (!f) return;
    const m = { name: f.name, data: await f.arrayBuffer(), mime: f.type || 'audio/mpeg' };
    setMusic(m);
    // nhạc mới tải lên: gắn cho slide âm nhạc / quá trình chơi chưa có nhạc
    setDeck(d => d && { ...d, slides: d.slides.map(s => (!s.music && (s.template === 'am-nhac' || s.template === 'qua-trinh-choi') ? { ...s, music: { id: MUSIC_ID, title: m.name } } : s)) });
  }

  async function build() {
    if (!deck) return;
    setBusy(true); setErr(''); setOut(null);
    try {
      const { buildDeckWithReport } = await import('../../slides/build');
      const resolver = async (id: string): Promise<ResolvedAsset | null> => {
        if (id === MUSIC_ID) return music ? { data: music.data, w: 0, h: 0, mime: music.mime } : null;
        const m = MUCS.find(x => x.id === id);
        const load = m?.tep ? URLS['/assets-slide/' + m.tep] : undefined;
        if (!load) return null;
        const res = await fetch(await load());
        if (!res.ok) return null;
        const blob = await res.blob();
        const { w, h } = await imageSize(blob);
        return { data: await blob.arrayBuffer(), w, h, mime: blob.type || 'image/png' };
      };
      const r = await buildDeckWithReport(deck, resolver);
      const name = `${safeName(deTai || deck.title)}.pptx`;
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setOut({ url, name, thieuHinh: r.thieuHinh, thieuNhac: r.thieuNhac, soSlide: r.soSlide, toi: r.slides.reduce((n, s) => n + s.toi, 0) });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const chuaChon = deck ? deck.slides.reduce((n, s) => n + JSON.stringify(s).split(CHUA_CHON).length - 1, 0) : 0;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Slide</h1>
        <p className="sub">Chọn hoạt động của tuần, máy đề xuất dàn slide từ chương trình; cô sửa chữ, chọn hình rồi tạo file PowerPoint (bấm “tới” để hiện từng phần).</p>
      </header>

      <section className="card">
        <h2>1. Hoạt động</h2>
        <div className="weeks" role="tablist" aria-label="Chọn tuần">
          {program.weeks.map(w => (
            <button key={w.tuan} role="tab" aria-selected={w.tuan === tuan} className={`chip ${w.tuan === tuan ? 'on' : ''}`} onClick={() => setTuan(w.tuan)}>Tuần {w.tuan}</button>
          ))}
        </div>
        <label className="field">
          <span>Hoạt động trong tuần {tuan}</span>
          <select value={act} onChange={e => pickAct(e.target.value)}>
            <option value="">— chọn, hoặc gõ tay ở dưới —</option>
            {acts.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Loại tiết</span>
          <select value={loai} onChange={e => setLoai(e.target.value as LoaiTiet)}>
            {LOAI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span>Tên đề tài</span><input type="text" value={deTai} onChange={e => setDeTai(e.target.value)} placeholder="vd: Nghề nông" /></label>
        <label className="field"><span>Chủ đề</span><input type="text" value={chuDe} onChange={e => setChuDe(e.target.value)} /></label>
        <details>
          <summary className="link">Dán các bước HĐ 1, 2, 3 từ giáo án (không bắt buộc, để câu hỏi và trò chơi lấy đúng chữ của cô)</summary>
          <label className="field"><span>HĐ 1</span><textarea value={b1} onChange={e => setB1(e.target.value)} /></label>
          <label className="field"><span>HĐ 2</span><textarea value={b2} onChange={e => setB2(e.target.value)} /></label>
          <label className="field"><span>HĐ 3</span><textarea value={b3} onChange={e => setB3(e.target.value)} /></label>
        </details>
        <div className="actions"><button className="btn primary" onClick={dan}>{deck ? 'Đề xuất lại dàn slide' : 'Đề xuất dàn slide'}</button></div>
        {err && !deck && <p className="err" role="alert">{err}</p>}
      </section>

      {deck && (
        <>
          <section className="card">
            <h2>2. Dàn slide ({deck.slides.length})</h2>
            <label className="field">
              <span>Lọc thư viện hình theo chủ đề ({MUCS.length} hình đã vẽ)</span>
              <select value={lib} onChange={e => setLib(e.target.value)}>
                <option value="all">Tất cả chủ đề</option>
                {CHU_DE.map(c => <option key={c.slug} value={c.slug}>{c.ten} ({MUCS.filter(m => m.chuDe === c.slug).length})</option>)}
              </select>
            </label>
            <label className="field">
              <span>{music ? `Nhạc của cô: ${music.name}` : 'Nhạc của cô (mp3, giữ trong trình duyệt, không tải đi đâu)'}</span>
              <input type="file" accept="audio/*" onChange={e => { void loadMusic(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <ol className="deck">
              {deck.slides.map((s, i) => {
                const fields = fieldsOf(s);
                return (
                  <li key={s.id ?? i} className="slide-item">
                    <details>
                      <summary>
                        <span className="no">{i + 1}</span>
                        <span className="tname"><b>{TEMPLATE_VI[s.template] ?? s.template}</b>{titleOf(s) && <small> · {titleOf(s)}</small>}</span>
                      </summary>
                      <div className="slide-form">
                        {fields.map(f => {
                          const v = getIn(s, f.path);
                          const id = `${s.id}-${f.path.join('.')}`;
                          if (f.kind === 'img') {
                            const cur = String(v);
                            return (
                              <label key={id} className="field"><span>{f.label}</span>
                                <select value={cur} onChange={e => edit(i, x => setIn(x, f.path, e.target.value))}>
                                  <option value={CHUA_CHON}>(chưa chọn hình)</option>
                                  {cur !== CHUA_CHON && !mucs.some(m => m.id === cur) && <option value={cur}>{nameOf(cur)}</option>}
                                  {mucs.map(m => <option key={m.id} value={m.id}>{m.tenVi} — {m.id}</option>)}
                                </select>
                              </label>
                            );
                          }
                          if (f.kind === 'lines') {
                            return (
                              <label key={id} className="field"><span>{f.label}</span>
                                <textarea value={(v as string[]).join('\n')} onChange={e => edit(i, x => setIn(x, f.path, e.target.value.split('\n')))} />
                              </label>
                            );
                          }
                          return (
                            <label key={id} className="field"><span>{f.label}</span>
                              <input type="text" value={String(v)} onChange={e => edit(i, x => setIn(x, f.path, e.target.value))} />
                            </label>
                          );
                        })}
                        <label className="check inline"><input type="checkbox" checked={!!s.music} disabled={!music} onChange={e => useMusic(i, e.target.checked)} /><span>Phát nhạc của cô ở slide này{music ? '' : ' (tải nhạc lên trước)'}</span></label>
                      </div>
                    </details>
                    <div className="slide-ops">
                      <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Đưa slide ${i + 1} lên`}>Lên</button>
                      <button className="btn sm" onClick={() => move(i, 1)} disabled={i === deck.slides.length - 1} aria-label={`Đưa slide ${i + 1} xuống`}>Xuống</button>
                      <button className="btn sm" onClick={() => remove(i)} aria-label={`Xóa slide ${i + 1}`}>Xóa</button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {chuaChon > 0 && <p className="note">Còn {chuaChon} ô hình chưa chọn: slide sẽ vẽ khung giữ chỗ “[chưa chọn hình]”, cô chèn hình sau trong PowerPoint.</p>}
          </section>

          <section className="card">
            <h2>3. Tạo file</h2>
            <div className="actions">
              <button className="btn primary block" onClick={build} disabled={busy || !deck.slides.length}>{busy ? 'Đang dựng…' : 'Tạo .pptx'}</button>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            {out && (
              <>
                <p className="clean">Đã tạo <a href={out.url} download={out.name}>{out.name}</a>: {out.soSlide} slide, {out.toi} lần bấm “tới”.</p>
                {out.thieuHinh.length > 0 && <p className="note">Không lấy được hình: {out.thieuHinh.join(', ')} (đã vẽ khung giữ chỗ).</p>}
                {out.thieuNhac.length > 0 && <p className="note">Không lấy được nhạc: {out.thieuNhac.join(', ')} (slide đó không có nhạc).</p>}
                {!out.thieuHinh.length && !out.thieuNhac.length && <p className="note">Đủ hình và nhạc đã chọn.</p>}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
