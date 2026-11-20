/**
 * CHỖ CẮM cho các phần do agent khác làm. Mỗi mục là một component React; để trống thì trang hiện khung “Đang làm”.
 * Cách gắn (ví dụ agent soạn thảo): trong file này `import { ComposePanel } from '../compose/ComposePanel';`
 * rồi viết `slots.compose = ComposePanel;` — không cần sửa chỗ nào khác.
 */
import { lazy, type ComponentType } from 'react';
import type { Issue, Program } from '../engine/types';
import type { Item } from './types';

/** props chung cho các trang còn trống */
export interface PageProps {
  program: Program;
  /** số tuần đang chọn ở trang Tuần này (null nếu chưa có chương trình) */
  week: number | null;
  /** các file đã nạp và soát trong phiên */
  items: Item[];
}

/** khu xem trước ở trang Soát & sửa (bên trái trên máy tính). Agent editor thay cho bản xem văn bản tạm */
export interface PreviewProps {
  item: Item;
  /** lỗi đang được chọn (bấm ở danh sách bên phải) — xem trước nên cuộn tới và tô sáng chỗ đó */
  activeIssue: Issue | null;
  /** tăng mỗi lần bấm một lỗi (kể cả bấm lại lỗi đang chọn): dùng làm nonce để cuộn lại */
  pickNonce?: number;
  /** gọi khi người dùng bấm vào chỗ có lỗi trong xem trước, để danh sách lỗi nhảy theo */
  onPickIssue: (issue: Issue) => void;
}

export interface SlotMap {
  preview: ComponentType<PreviewProps>;
  compose: ComponentType<PageProps>;
  slides: ComponentType<PageProps>;
  library: ComponentType<PageProps>;
  /** khu bổ sung dưới phần “nạp chương trình” ở trang Chương trình (cây chủ đề → nhánh → tuần → ngày) */
  program: ComponentType<PageProps>;
}

/** các trang nặng nạp lười (chỉ tải khi mở), để gói chính nhẹ */
export const slots: Partial<SlotMap> = {
  preview: lazy(() => import('./review/EditablePreview')),
  compose: lazy(() => import('./pages/ComposePage')),
  slides: lazy(() => import('./pages/SlidesPage')),
  library: lazy(() => import('./pages/LibraryPage')),
};
