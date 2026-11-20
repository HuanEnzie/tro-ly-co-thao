/** Trang thử riêng cho phần xem trước + sửa tay (chỉ dùng khi dev): http://localhost:3010/editor-demo.html?f=tests/fixtures/kh-ngay-t12-chinh.docx */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CellEditor from './CellEditor';
import type { PreviewInfo } from './DocPreview';

function Demo() {
  const [file, setFile] = useState<{ name: string; data: ArrayBuffer } | null>(null);
  const [info, setInfo] = useState<PreviewInfo | null>(null);
  const [find, setFind] = useState('');
  const [focus, setFocus] = useState<{ found: string; nonce: number } | null>(null);
  useEffect(() => {
    const f = new URLSearchParams(location.search).get('f');
    if (f) fetch('/' + f).then(r => r.arrayBuffer()).then(data => setFile({ name: f.split('/').pop()!, data }));
  }, []);
  return (
    <div style={{ padding: 12, height: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept=".docx" onChange={async e => { const f = e.target.files?.[0]; if (f) setFile({ name: f.name, data: await f.arrayBuffer() }); }} />
        <input placeholder="Dán đoạn trích để cuộn tới" value={find} onChange={e => setFind(e.target.value)} />
        <button type="button" onClick={() => setFocus({ found: find, nonce: Date.now() })}>Cuộn tới</button>
        {info && <code id="info" style={{ overflowWrap: "anywhere", fontSize: 11 }}>{JSON.stringify(info)}</code>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {file && <CellEditor data={file.data} fileName={file.name} focus={focus} onReady={setInfo} />}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Demo />);
