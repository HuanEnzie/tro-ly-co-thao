/**
 * Xem trước file .docx bằng docx-preview, có:
 *  - co giãn vừa bề rộng khung (điện thoại 375px thu nhỏ trang, không cuộn ngang trang web; nút +/− để phóng to trong khung)
 *  - ánh xạ <p>/<td> do docx-preview vẽ ↔ đoạn trong document.xml (align.ts + cell-edit.ts)
 *  - tô nổi đoạn theo mức lỗi, cuộn tới + tô sáng một chỗ theo đoạn trích `found` của Issue
 *  - bấm một ô bảng → onSelectCell
 *
 * paraIndex trong `highlights`/`focus` là thứ tự <w:p> trong document.xml (= `docPara` của cell-edit.ts).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import type { Level } from '../engine/types';
import { alignParas, alignStats } from './align';
import { listAllParagraphTexts, listCells, readDocumentXml, type EditableCell } from './cell-edit';
import './editor.css';

export interface PreviewHighlight { paraIndex?: number; text?: string; level: Level }
export interface PreviewFocus { paraIndex?: number; found?: string; text?: string; nonce?: number }
export interface CellRef { tbl: number; row: number; cell: number }
export interface PreviewInfo { model: number; dom: number; mapped: number; exact: number; identity: boolean; cells: number; cellsMapped: number }
export interface DocPreviewProps {
  data: ArrayBuffer;
  highlights?: PreviewHighlight[];
  focus?: PreviewFocus | null;
  /** bấm một ô bảng ở bản xem trước */
  onSelectCell?: (cell: EditableCell) => void;
  selectedCell?: CellRef | null;
  onReady?: (info: PreviewInfo) => void;
  className?: string;
}

const norm = (s: string) => s.normalize('NFC').replace(/[\s ​]+/g, '').toLowerCase();
const cellKey = (c: CellRef) => `${c.tbl}/${c.row}/${c.cell}`;

/** bọc đoạn chữ `found` trong <mark> (có thể trải qua nhiều nút chữ); trả true nếu thấy */
function markText(p: Element, found: string): boolean {
  const nodes: Text[] = [];
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  const full = nodes.map(n => n.data).join('');
  const key = found.normalize('NFC');
  let i = full.indexOf(key);
  if (i < 0) i = full.toLowerCase().indexOf(key.toLowerCase());
  if (i < 0) return false;
  const end = i + key.length;
  let pos = 0;
  for (const n of nodes) {
    const a = pos, b = pos + n.data.length;
    pos = b;
    const s = Math.max(i, a), e = Math.min(end, b);
    if (s >= e) continue;
    const mid = n.splitText(s - a);
    mid.splitText(e - s);
    const mk = document.createElement('mark');
    mk.className = 'dp-mark';
    mid.parentNode!.replaceChild(mk, mid);
    mk.appendChild(mid);
  }
  return true;
}

function clearMarks(root: HTMLElement) {
  root.querySelectorAll('mark.dp-mark').forEach(m => {
    const parent = m.parentNode!;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

export default function DocPreview({ data, highlights, focus, onSelectCell, selectedCell, onReady, className }: DocPreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const style = useRef<HTMLDivElement>(null);
  const paraEls = useRef<Element[]>([]);            // theo docPara
  const cells = useRef<EditableCell[]>([]);
  const natural = useRef(0);                        // bề rộng tự nhiên của trang (px)
  const [ready, setReady] = useState(0);            // tăng sau mỗi lần vẽ xong
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [boost, setBoost] = useState(1);            // phóng thêm so với "vừa khung"
  const cb = useRef({ onSelectCell, onReady });
  cb.current = { onSelectCell, onReady };

  // ---- vẽ ----
  useEffect(() => {
    let stale = false;
    const b = body.current!, st = style.current!;
    setBusy(true); setError('');
    (async () => {
      try {
        const xml = await readDocumentXml(data);
        await renderAsync(data, b, st, {
          className: 'docx', inWrapper: true, ignoreWidth: false, breakPages: true, useBase64URL: true,
          renderHeaders: true, renderFooters: true, renderFootnotes: false, renderEndnotes: false, ignoreLastRenderedPageBreak: true,
        });
        if (stale) return;
        const texts = listAllParagraphTexts(xml);
        const domPs = Array.from(b.querySelectorAll('article p'));
        const map = alignParas(domPs.map(p => p.textContent ?? ''), texts);
        const els: Element[] = [];
        map.forEach((d, i) => { if (d >= 0) { els[i] = domPs[d]; domPs[d].setAttribute('data-dp', String(i)); } });
        paraEls.current = els;
        const cs = listCells(xml);
        cells.current = cs;
        let cm = 0;
        for (const c of cs) {
          const el = c.paras.map(p => els[p.docPara]).find(Boolean);
          const td = el?.closest('td');
          if (td) { td.setAttribute('data-cell', cellKey(c)); td.classList.add('dp-editable'); cm++; }
        }
        natural.current = Math.max(0, ...Array.from(b.querySelectorAll<HTMLElement>('section.docx')).map(s => s.offsetWidth));
        const stat = alignStats(Array.from(b.querySelectorAll('article p')).map(p => p.textContent ?? ''), texts);
        setReady(n => n + 1);
        setBusy(false);
        cb.current.onReady?.({ ...stat, cells: cs.length, cellsMapped: cm });
      } catch (e) {
        if (!stale) { setError((e as Error).message || 'Không xem trước được file này'); setBusy(false); }
      }
    })();
    return () => { stale = true; b.innerHTML = ''; st.innerHTML = ''; };
  }, [data]);

  // ---- co giãn vừa khung ----
  const fit = useCallback(() => {
    const h = host.current, b = body.current;
    if (!h || !b || !natural.current || h.clientWidth < 80) return;   // khung chưa có kích thước thì chưa co giãn
    const avail = h.clientWidth - 4;
    const base = Math.min(1, avail / natural.current);
    b.style.setProperty('zoom', String(Math.max(0.1, base * boost)));
  }, [boost]);
  useLayoutEffect(fit, [fit, ready]);
  useEffect(() => {
    const h = host.current;
    if (!h || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(h);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [fit]);

  // ---- tô nổi theo mức lỗi ----
  useEffect(() => {
    const b = body.current!;
    b.querySelectorAll('.dp-hl').forEach(e => e.classList.remove('dp-hl', 'dp-hl-nang', 'dp-hl-xem', 'dp-hl-chinh-ta'));
    const paint = (el: Element | undefined, level: Level) => { if (el) el.classList.add('dp-hl', `dp-hl-${level}`); };
    const rank: Record<Level, number> = { 'chinh-ta': 0, xem: 1, nang: 2 };
    const byText = (highlights ?? []).filter(h => h.paraIndex === undefined && h.text).map(h => ({ k: norm(h.text!), level: h.level }));
    for (const h of highlights ?? []) if (h.paraIndex !== undefined) paint(paraEls.current[h.paraIndex], h.level);
    if (byText.length) {
      const levelOf = new Map<Element, Level>();
      paraEls.current.forEach(el => {
        if (!el) return;
        const t = norm(el.textContent ?? '');
        for (const x of byText) if (x.k && t.includes(x.k)) { const old = levelOf.get(el); if (!old || rank[x.level] > rank[old]) levelOf.set(el, x.level); }
      });
      levelOf.forEach((lv, el) => paint(el, lv));
    }
  }, [highlights, ready]);

  // ---- cuộn tới và tô sáng một chỗ ----
  useEffect(() => {
    const b = body.current!, h = host.current!;
    b.querySelectorAll('.dp-focus').forEach(e => e.classList.remove('dp-focus'));
    clearMarks(b);
    if (!focus || busy) return;
    let el: Element | undefined;
    const found = focus.found ?? focus.text;
    if (focus.paraIndex !== undefined) el = paraEls.current[focus.paraIndex];
    else if (found) {
      const k = norm(found);
      if (k) el = paraEls.current.find(p => p && norm(p.textContent ?? '').includes(k));
    }
    if (!el) return;
    el.classList.add('dp-focus');
    if (found) markText(el, found);
    const r = el.getBoundingClientRect(), hr = h.getBoundingClientRect();
    h.scrollTo({ top: h.scrollTop + (r.top - hr.top) - hr.height / 3, behavior: 'smooth' });
  }, [focus, ready, busy]);

  // ---- ô đang chọn ----
  useEffect(() => {
    const b = body.current!;
    b.querySelectorAll('.dp-selected').forEach(e => e.classList.remove('dp-selected'));
    if (selectedCell) b.querySelector(`td[data-cell="${cellKey(selectedCell)}"]`)?.classList.add('dp-selected');
  }, [selectedCell, ready]);

  const onClick = (e: React.MouseEvent) => {
    const td = (e.target as Element).closest?.('td[data-cell]');
    if (!td || !cb.current.onSelectCell) return;
    if (window.getSelection()?.toString()) return;      // đang bôi chữ để chép, không mở khung sửa
    const key = td.getAttribute('data-cell')!;
    const c = cells.current.find(x => cellKey(x) === key);
    if (c) cb.current.onSelectCell(c);
  };

  return (
    <div className={`dp-root ${className ?? ''}`}>
      <div className="dp-tools" role="group" aria-label="Phóng to thu nhỏ">
        <button type="button" onClick={() => setBoost(v => Math.max(1, +(v - 0.5).toFixed(1)))} disabled={boost <= 1} aria-label="Thu nhỏ">−</button>
        <button type="button" onClick={() => setBoost(1)} aria-label="Vừa khung">Vừa khung</button>
        <button type="button" onClick={() => setBoost(v => Math.min(4, +(v + 0.5).toFixed(1)))} disabled={boost >= 4} aria-label="Phóng to">+</button>
      </div>
      <div className="dp-host" ref={host} onClick={onClick}>
        {busy && !error && <div className="dp-status" role="status">Đang vẽ bản xem trước…</div>}
        {error && <div className="dp-status dp-error" role="alert">{error}</div>}
        <div className="dp-style" ref={style} />
        <div className="dp-body" ref={body} />
      </div>
    </div>
  );
}
