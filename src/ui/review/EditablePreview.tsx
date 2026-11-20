import { useMemo } from 'react';
import CellEditor from '../../editor/CellEditor';
import type { PreviewFocus, PreviewHighlight } from '../../editor/DocPreview';
import { useSession } from '../session';
import type { PreviewProps } from '../slots';

/**
 * Xem trước file Word thật + sửa tay theo ô (slots.preview).
 * Lỗi → tô nền theo mức; bấm một lỗi → cuộn tới chỗ đó; Lưu một ô → thêm “<gốc> (sửa tay).docx” vào phiên và soát lại.
 */
export default function EditablePreview({ item, activeIssue, pickNonce = 0 }: PreviewProps) {
  const { addBuffer } = useSession();
  const issues = useMemo(() => [...item.report.issues, ...(item.ai?.issues ?? [])], [item]);
  const highlights = useMemo<PreviewHighlight[]>(
    () => issues.filter(i => i.found && i.found.length > 1).map(i => ({ text: i.found!, level: i.level })),
    [issues],
  );
  const focus = useMemo<PreviewFocus | null>(
    () => (activeIssue?.found ? { found: activeIssue.found, nonce: pickNonce } : null),
    [activeIssue, pickNonce],
  );

  return (
    <div className="edit-frame">
      <CellEditor
        data={item.data}
        fileName={item.name}
        highlights={highlights}
        focus={focus}
        onChange={(data, name) => { void addBuffer(name, data); }}
      />
    </div>
  );
}
