/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** địa chỉ máy chủ API (Vercel) khi trang chạy trên GitHub Pages */
  readonly VITE_API_BASE?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
