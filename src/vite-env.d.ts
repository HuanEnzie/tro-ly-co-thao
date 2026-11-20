/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** địa chỉ máy chủ API (Vercel) khi trang chạy trên GitHub Pages */
  readonly VITE_API_BASE?: string;
  /** địa chỉ dự án Supabase, vd https://abcd.supabase.co (bỏ trống = chế độ không backend) */
  readonly VITE_SUPABASE_URL?: string;
  /** khóa anon (công khai, an toàn để đưa vào trình duyệt vì đã có RLS) */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
