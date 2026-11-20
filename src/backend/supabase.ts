/**
 * Client Supabase. Nếu thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY thì backendReady = false
 * và app vẫn chạy ở chế độ không backend (chỉ soát/sửa file trong trình duyệt).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const backendReady: boolean = !!url && !!anon;
export const supabaseUrl = url;
export const supabaseAnonKey = anon;

/** null khi chưa cấu hình backend; luôn kiểm backendReady trước khi dùng */
export const supabase: SupabaseClient | null = backendReady
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Chưa cấu hình backend (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
}
