/**
 * POST /api/review — gửi giáo án (đã chuyển thành chữ ở trình duyệt) cho Gemini soát nội dung.
 * Body: { system?: never, user: string, passcode?: string }  ->  { text, model, tokensIn, tokensOut, used, limit }
 * Mỗi lần gọi tốn 1 lượt của key miễn phí; máy chủ đếm lượt/ngày (best effort, trong bộ nhớ).
 * Lọc kết quả (guard) chạy ở trình duyệt vì trình duyệt có bản phân tích đầy đủ của file.
 */
import { ApiError, callGemini, geminiReady } from './_lib/gemini.js';
import { RESPONSE_SCHEMA, SYSTEM } from '../src/ai/system.js';

const day = () => new Date().toISOString().slice(0, 10);
const counter = { day: day(), used: 0 };
const limit = () => +(process.env.AI_DAILY_LIMIT ?? 60);
/** trang chạy trên GitHub Pages (khác tên miền) gọi sang Vercel: cho phép các nguồn trong ALLOWED_ORIGINS (bỏ trống = mọi nguồn) */
let origin = '';
function cors(): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length ? '*' : allowed.includes(origin) ? origin : '';
  return ok ? { 'Access-Control-Allow-Origin': ok, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors() } });

export async function OPTIONS(request: Request): Promise<Response> {
  origin = request.headers.get('origin') ?? '';
  return new Response(null, { status: 204, headers: cors() });
}

export async function POST(request: Request): Promise<Response> {
  origin = request.headers.get('origin') ?? '';
  try {
    const body = (await request.json().catch(() => null)) as { user?: string; passcode?: string } | null;
    if (!body?.user || typeof body.user !== 'string') return json(400, { error: 'Thiếu nội dung giáo án.' });
    if (body.user.length > 200_000) return json(413, { error: 'Giáo án quá dài để gửi một lần.' });
    if (process.env.APP_PASSCODE && body.passcode !== process.env.APP_PASSCODE) return json(401, { error: 'Sai mã truy cập.' });
    if (!geminiReady()) return json(503, { error: 'Máy chủ chưa cài key Gemini.' });
    if (counter.day !== day()) { counter.day = day(); counter.used = 0; }
    if (counter.used >= limit()) return json(429, { error: `Hôm nay đã dùng hết ${limit()} lượt soát bằng AI. Phần soát bằng luật vẫn dùng bình thường.` });
    counter.used++;
    const r = await callGemini({ system: SYSTEM, user: body.user, schema: RESPONSE_SCHEMA });
    return json(200, { ...r, used: counter.used, limit: limit() });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return json(status, { error: (e as Error).message || 'Lỗi máy chủ.' });
  }
}

export async function GET(request: Request): Promise<Response> {
  origin = request.headers.get('origin') ?? '';
  if (counter.day !== day()) { counter.day = day(); counter.used = 0; }
  return json(200, { ready: geminiReady(), used: counter.used, limit: limit(), passcode: !!process.env.APP_PASSCODE });
}
