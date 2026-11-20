/**
 * Gọi Gemini qua REST (Deno). Port từ api/_lib/gemini.ts: đổi process.env -> Deno.env.get.
 * Key chỉ đọc ở máy chủ (secret GEMINI_API_KEY), gửi trong header chứ không đặt vào URL.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface GeminiResult { text: string; model: string; tokensIn: number; tokensOut: number; finish?: string }

const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const env = (k: string) => Deno.env.get(k) ?? '';
const models = () => (env('GEMINI_MODELS') ? env('GEMINI_MODELS').split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_MODELS);
const keyOf = () => env('GEMINI_API_KEY') || env('GOOGLE_GENERATIVE_AI_API_KEY');
export const geminiReady = () => !!keyOf();

let preferred = 0;

export async function callGemini(req: {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const key = keyOf();
  if (!key) throw new ApiError(503, 'Máy chủ chưa có key Gemini (GEMINI_API_KEY).');
  const list = models();
  let lastError = 'Gemini không trả lời.';
  for (let k = 0; k < list.length; k++) {
    const i = (preferred + k) % list.length;
    const model = list[i];
    const thinking = model.startsWith('gemini-2.5') ? { thinkingBudget: 1024 } : { thinkingLevel: 'low' };
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: req.maxOutputTokens ?? 8192,
        thinkingConfig: thinking,
        responseMimeType: 'application/json',
        ...(req.schema && { responseSchema: req.schema }),
      },
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 90_000);
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      lastError = `Không gọi được Gemini (${(e as Error).name}).`;
      continue;
    } finally {
      clearTimeout(timer);
    }
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      error?: { message?: string };
    } | null;
    if (res.ok && data?.candidates?.length) {
      preferred = i;
      const c = data.candidates[0];
      const u = data.usageMetadata ?? {};
      return {
        text: (c.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join(''),
        model,
        tokensIn: u.promptTokenCount ?? 0,
        tokensOut: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        finish: c.finishReason,
      };
    }
    lastError = data?.error?.message ?? `Gemini lỗi ${res.status}.`;
    if (![400, 404, 429, 500, 502, 503, 504].includes(res.status)) break;
  }
  throw new ApiError(502, /quota|exhausted|429/i.test(lastError) ? 'Gemini đang hết hạn mức (key miễn phí), thử lại sau.' : lastError);
}
