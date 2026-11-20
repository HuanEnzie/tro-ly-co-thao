import { useEffect, useState } from 'react';

/** các trang của ứng dụng; địa chỉ dạng #/soat (chạy được trên GitHub Pages, không cần máy chủ) */
export const ROUTES = [
  { id: 'tuan', path: '/tuan', label: 'Tuần này', short: 'Tuần này' },
  { id: 'soat', path: '/soat', label: 'Soát & sửa', short: 'Soát' },
  { id: 'soan', path: '/soan', label: 'Soạn thảo', short: 'Soạn' },
  { id: 'slide', path: '/slide', label: 'Slide', short: 'Slide' },
  { id: 'thu-vien', path: '/thu-vien', label: 'Thư viện', short: 'Thư viện' },
  { id: 'chuong-trinh', path: '/chuong-trinh', label: 'Chương trình', short: 'Chương trình' },
] as const;
export type RouteId = (typeof ROUTES)[number]['id'];
/** 4 trang có nút riêng ở thanh dưới điện thoại; các trang còn lại nằm trong menu “Thêm” */
export const BOTTOM: RouteId[] = ['tuan', 'soat', 'soan', 'slide'];

const read = (): RouteId => {
  const p = window.location.hash.replace(/^#/, '').split('?')[0] || '/tuan';
  return ROUTES.find(r => r.path === p)?.id ?? 'tuan';
};
export const href = (id: RouteId) => `#${ROUTES.find(r => r.id === id)!.path}`;
export const go = (id: RouteId) => { window.location.hash = href(id); };

export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
