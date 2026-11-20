/**
 * Edge Function POST /functions/v1/review — soát nội dung giáo án bằng Gemini.
 * Port từ api/review.ts (Vercel). Khác: bỏ passcode; bắt buộc đăng nhập (JWT Supabase);
 * đếm lượt/ngày trong bảng luot_ai (hàm tang_luot_ai); CORS giới hạn.
 * Body: { user: string }  ->  { text, model, tokensIn, tokensOut, used, limit, usedMine, limitMine }
 * Secret cần có: GEMINI_API_KEY. Tuỳ chọn: GEMINI_MODELS, AI_DAILY_LIMIT (chung, mặc định 60),
 * AI_USER_DAILY_LIMIT (mỗi người, mặc định 30), ALLOWED_ORIGINS (cách nhau bằng dấu phẩy).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ApiError, callGemini, geminiReady } from '../_shared/gemini.ts';
import { RESPONSE_SCHEMA, SYSTEM } from '../_shared/ai-system.ts';

const DEFAULT_ORIGINS = ['https://huanenzie.github.io', 'http://localhost:3010'];
const allowedOrigins = () => {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return extra.length ? extra : DEFAULT_ORIGINS;
};
const num = (k: string, d: number) => { const n = Number(Deno.env.get(k)); return Number.isFinite(n) && n > 0 ? n : d; };

function cors(origin: string): Record<string, string> {
  if (!allowedOrigins().includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin',
  };
}
const json = (origin: string, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) } });

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin') ?? '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== 'GET' && request.method !== 'POST') return json(origin, 405, { error: 'Chỉ nhận GET hoặc POST.' });

  try {
    // 1) Xác thực: JWT người dùng trong header Authorization
    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json(origin, 401, { error: 'Cần đăng nhập để dùng AI.' });
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !u.user) return json(origin, 401, { error: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại.' });

    const limit = num('AI_DAILY_LIMIT', 60);
    const limitMine = num('AI_USER_DAILY_LIMIT', 30);

    if (request.method === 'GET') {
      const { data } = await supabase.rpc('luot_ai_hom_nay');
      const r = (data as { chung: number; cua_toi: number }[] | null)?.[0];
      return json(origin, 200, { ready: geminiReady(), used: r?.chung ?? 0, limit, usedMine: r?.cua_toi ?? 0, limitMine });
    }

    // 2) Kiểm đầu vào
    const body = (await request.json().catch(() => null)) as { user?: string } | null;
    if (!body?.user || typeof body.user !== 'string') return json(origin, 400, { error: 'Thiếu nội dung giáo án.' });
    if (body.user.length > 200_000) return json(origin, 413, { error: 'Giáo án quá dài để gửi một lần.' });
    if (!geminiReady()) return json(origin, 503, { error: 'Máy chủ chưa cài key Gemini.' });

    // 3) Đếm lượt trong cơ sở dữ liệu (không mất khi hàm khởi động lại)
    const { data: q, error: qerr } = await supabase.rpc('tang_luot_ai', { p_gioi_han_chung: limit, p_gioi_han_user: limitMine });
    if (qerr) return json(origin, 500, { error: 'Không ghi được lượt dùng AI: ' + qerr.message });
    const row = (q as { ok: boolean; chung: number; cua_toi: number }[] | null)?.[0];
    if (!row?.ok) {
      const mine = (row?.cua_toi ?? 0) >= limitMine;
      return json(origin, 429, { error: mine
        ? `Hôm nay cô đã dùng hết ${limitMine} lượt soát bằng AI. Phần soát bằng luật vẫn dùng bình thường.`
        : `Hôm nay cả tổ đã dùng hết ${limit} lượt soát bằng AI. Phần soát bằng luật vẫn dùng bình thường.` });
    }

    // 4) Gọi Gemini
    const r = await callGemini({ system: SYSTEM, user: body.user, schema: RESPONSE_SCHEMA });
    return json(origin, 200, { ...r, used: row.chung, limit, usedMine: row.cua_toi, limitMine });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return json(origin, status, { error: (e as Error).message || 'Lỗi máy chủ.' });
  }
});
