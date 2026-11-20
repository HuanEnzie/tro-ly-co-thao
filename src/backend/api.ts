/**
 * Các hàm gọi backend Supabase (đăng nhập, tuần, tài liệu, phiên bản, lần soát, AI).
 * Quy tắc không ghi đè: phiên bản chỉ được thêm; không có hàm sửa/xóa phiên bản.
 */
import type { User } from '@supabase/supabase-js';
import { backendReady, requireClient, supabaseAnonKey, supabaseUrl } from './supabase';

export { backendReady };

// ---------- Kiểu dữ liệu ----------
export type LoaiTaiLieu = 'kh-tuan' | 'kh-ngay' | 'chuong-trinh' | 'slide' | 'mau' | 'khac';
export type NguonPhienBan = 'tai-len' | 'may-sua' | 'sua-tay' | 'may-soan';
export type MucLoi = 'nang' | 'xem' | 'chinh-ta';

export interface Tuan {
  id: string;
  to_id: string;
  chu_de_id: string | null;
  nhanh_id: string | null;
  so_tuan: number;
  tu_ngay: string | null;
  den_ngay: string | null;
  co_a: string | null;
  co_b: string | null;
}
export interface HoatDong {
  id: string;
  tuan_id: string;
  thu: number;
  buoi: 'sang' | 'chieu';
  loai_tiet: string | null;
  ten_de_tai: string;
  thu_tu: number;
}
export interface TaiLieu {
  id: string;
  to_id: string;
  loai: LoaiTaiLieu;
  tuan_id: string | null;
  ten: string;
  nguoi_tao: string;
  tao_luc: string;
}
export interface PhienBan {
  id: string;
  to_id: string;
  tai_lieu_id: string;
  so: number;
  duoi: string;
  storage_path: string;
  nguon: NguonPhienBan;
  ghi_chu: string | null;
  tom_tat_soat: Record<string, unknown> | null;
  nguoi_tao: string;
  tao_luc: string;
}
export interface LoiSoat {
  vi_tri: string;
  trich: string;
  loi: string;
  sua?: string;
  muc: MucLoi;
  [k: string]: unknown;
}
export interface LanSoat {
  id: string;
  phien_ban_id: string;
  issues: LoiSoat[];
  so_nang: number;
  so_xem: number;
  so_chinh_ta: number;
  model_ai: string | null;
  tao_luc: string;
}
export interface NhapLanSoat {
  issues: LoiSoat[];
  soNang: number;
  soXem: number;
  soChinhTa: number;
  modelAi?: string | null;
}
/** tạo tài liệu mới cùng lúc với phiên bản đầu */
export interface TaiLieuMoi {
  ten: string;
  loai: LoaiTaiLieu;
  tuanId?: string | null;
}
export interface KetQuaAi {
  /** JSON thô theo RESPONSE_SCHEMA ({ issues: [...] }); qua guard ở trình duyệt trước khi hiện */
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** lượt đã dùng hôm nay của cả tổ / giới hạn chung / của riêng mình / giới hạn mỗi người */
  used: number;
  limit: number;
  usedMine: number;
  limitMine: number;
}

const fail = (what: string, e: { message: string } | null): never => {
  throw new Error(`${what}: ${e?.message ?? 'lỗi không rõ'}`);
};

// ---------- Đăng nhập (email + mã OTP) ----------
/** Gửi mã 6 số về email */
export async function signInOtp(email: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) fail('Không gửi được mã đăng nhập', error);
}
/** Nhập mã 6 số nhận qua email */
export async function verifyOtp(email: string, token: string): Promise<User> {
  const { data, error } = await requireClient().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error || !data.user) return fail('Mã không đúng hoặc đã hết hạn', error);
  return data.user as User;
}
export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) fail('Không đăng xuất được', error);
}
/** null nếu chưa đăng nhập hoặc chưa cấu hình backend */
export async function currentUser(): Promise<User | null> {
  if (!backendReady) return null;
  const { data } = await requireClient().auth.getSession();
  return data.session?.user ?? null;
}

/** id tổ của người đang đăng nhập (tổ đầu tiên). null nếu chưa được thêm vào tổ nào. */
export async function myToId(): Promise<string | null> {
  const { data, error } = await requireClient().from('thanh_vien').select('to_id').limit(1);
  if (error) fail('Không đọc được thông tin tổ', error);
  return (data as { to_id: string }[])[0]?.to_id ?? null;
}

// ---------- Tuần / hoạt động ----------
export async function listTuan(): Promise<Tuan[]> {
  const { data, error } = await requireClient().from('tuan').select('*').order('tu_ngay', { ascending: true });
  if (error) fail('Không đọc được danh sách tuần', error);
  return data as Tuan[];
}
export async function listHoatDong(tuanId: string): Promise<HoatDong[]> {
  const { data, error } = await requireClient().from('hoat_dong').select('*').eq('tuan_id', tuanId)
    .order('thu').order('buoi', { ascending: true }).order('thu_tu');
  if (error) fail('Không đọc được hoạt động của tuần', error);
  return data as HoatDong[];
}

// ---------- Tài liệu ----------
export async function listTaiLieu(opts: { tuanId?: string; loai?: LoaiTaiLieu } = {}): Promise<TaiLieu[]> {
  let q = requireClient().from('tai_lieu').select('*').order('tao_luc', { ascending: false });
  if (opts.tuanId) q = q.eq('tuan_id', opts.tuanId);
  if (opts.loai) q = q.eq('loai', opts.loai);
  const { data, error } = await q;
  if (error) fail('Không đọc được danh sách tài liệu', error);
  return data as TaiLieu[];
}

// ---------- Phiên bản ----------
const MIME_EXT: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
function duoiCua(file: Blob, tuy?: string): string {
  const ten = tuy ?? (file as File).name ?? '';
  const m = ten.match(/\.([A-Za-z0-9]{1,8})$/);
  return (m?.[1] ?? MIME_EXT[file.type] ?? 'bin').toLowerCase();
}

/**
 * Thêm một phiên bản mới (không bao giờ thay bản cũ).
 * `target` là id tài liệu có sẵn, hoặc thông tin để tạo tài liệu mới.
 * Thứ tự: (1) tạo tài liệu nếu mới, (2) thêm dòng phien_ban (máy chủ tự gán số + đường dẫn),
 * (3) tải file lên Storage. Nếu bước 3 lỗi, dòng phiên bản đã có nhưng thiếu file:
 * gọi lại `retryUpload(phienBan, file)` để tải lên lại cùng đường dẫn.
 */
export async function uploadPhienBan(
  target: string | TaiLieuMoi,
  file: Blob,
  nguon: NguonPhienBan,
  ghiChu = '',
  opts: { tenFile?: string; tomTatSoat?: Record<string, unknown> } = {},
): Promise<PhienBan> {
  const sb = requireClient();
  let taiLieuId: string;
  if (typeof target === 'string') {
    taiLieuId = target;
  } else {
    const toId = await myToId();
    if (!toId) throw new Error('Tài khoản chưa được thêm vào tổ chuyên môn nào.');
    const { data, error } = await sb.from('tai_lieu')
      .insert({ to_id: toId, loai: target.loai, ten: target.ten, tuan_id: target.tuanId ?? null })
      .select('id').single();
    if (error || !data) return fail('Không tạo được tài liệu', error);
    taiLieuId = (data as { id: string }).id;
  }
  const { data: pb, error: e2 } = await sb.from('phien_ban')
    .insert({
      tai_lieu_id: taiLieuId,
      duoi: duoiCua(file, opts.tenFile),
      nguon,
      ghi_chu: ghiChu || null,
      tom_tat_soat: opts.tomTatSoat ?? null,
    })
    .select('*').single();
  if (e2 || !pb) return fail('Không tạo được phiên bản', e2);
  const phienBan = pb as PhienBan;
  await retryUpload(phienBan, file);
  return phienBan;
}

/** Tải file của một phiên bản lên Storage (dùng lại khi lần tải đầu bị lỗi mạng). Không ghi đè file đã có. */
export async function retryUpload(phienBan: Pick<PhienBan, 'storage_path'>, file: Blob): Promise<void> {
  const { error } = await requireClient().storage.from('tai-lieu')
    .upload(phienBan.storage_path, file, { upsert: false, contentType: file.type || undefined });
  if (error) fail(`Đã tạo phiên bản nhưng chưa tải được file (${phienBan.storage_path}), hãy thử lại`, error);
}

/** Mới nhất trước */
export async function listPhienBan(taiLieuId: string): Promise<PhienBan[]> {
  const { data, error } = await requireClient().from('phien_ban').select('*')
    .eq('tai_lieu_id', taiLieuId).order('so', { ascending: false });
  if (error) fail('Không đọc được các phiên bản', error);
  return data as PhienBan[];
}

/** Tải nội dung file của một phiên bản */
export async function downloadPhienBan(phienBanId: string): Promise<Blob> {
  const sb = requireClient();
  const { data: pb, error } = await sb.from('phien_ban').select('storage_path').eq('id', phienBanId).single();
  if (error || !pb) return fail('Không tìm thấy phiên bản', error);
  const { data, error: e2 } = await sb.storage.from('tai-lieu').download((pb as { storage_path: string }).storage_path);
  if (e2 || !data) return fail('Không tải được file', e2);
  return data;
}

// ---------- Lần soát ----------
export async function saveLanSoat(phienBanId: string, r: NhapLanSoat): Promise<LanSoat> {
  const { data, error } = await requireClient().from('lan_soat')
    .insert({
      phien_ban_id: phienBanId,
      issues: r.issues,
      so_nang: r.soNang,
      so_xem: r.soXem,
      so_chinh_ta: r.soChinhTa,
      model_ai: r.modelAi ?? null,
    })
    .select('*').single();
  if (error || !data) return fail('Không lưu được lần soát', error);
  return data as LanSoat;
}
export async function listLanSoat(phienBanId: string): Promise<LanSoat[]> {
  const { data, error } = await requireClient().from('lan_soat').select('*')
    .eq('phien_ban_id', phienBanId).order('tao_luc', { ascending: false });
  if (error) fail('Không đọc được các lần soát', error);
  return data as LanSoat[];
}

// ---------- AI (Edge Function review) ----------
/** Gửi chữ giáo án cho Edge Function `review`; cần đã đăng nhập. Kết quả vẫn phải qua src/ai/guard.ts. */
export async function reviewAi(userText: string): Promise<KetQuaAi> {
  const sb = requireClient();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Cần đăng nhập để dùng AI.');
  const res = await fetch(`${supabaseUrl}/functions/v1/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    body: JSON.stringify({ user: userText }),
  });
  const body = (await res.json().catch(() => null)) as (Partial<KetQuaAi> & { error?: string }) | null;
  if (!res.ok || !body || typeof body.text !== 'string') throw new Error(body?.error ?? `Máy chủ AI lỗi ${res.status}.`);
  return body as KetQuaAi;
}
