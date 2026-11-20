export const PROGRAM_KEY = 'tlct.program';
export const AI_CACHE = 'tlct.ai.';
export const PASS_KEY = 'tlct.passcode';

export const load = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
export const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bộ nhớ trình duyệt bị chặn */ } };

export async function sha(data: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
