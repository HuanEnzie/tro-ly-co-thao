/**
 * Chép src/ai/system.ts (nguồn sự thật duy nhất của SYSTEM + RESPONSE_SCHEMA) sang
 * supabase/functions/_shared/ai-system.ts để Edge Function (Deno) dùng được.
 * Chạy: npm run sync:ai          (ghi file)
 *       npm run sync:ai -- --check (chỉ kiểm, lỗi nếu lệch; dùng trước khi deploy)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const src = resolve('src/ai/system.ts');
const dst = resolve('supabase/functions/_shared/ai-system.ts');
const header = '// TỰ SINH từ src/ai/system.ts bằng `npm run sync:ai`. KHÔNG sửa tay file này.\n';
const next = header + readFileSync(src, 'utf8');

if (process.argv.includes('--check')) {
  const cur = existsSync(dst) ? readFileSync(dst, 'utf8') : '';
  if (cur !== next) {
    console.error('supabase/functions/_shared/ai-system.ts đã lệch src/ai/system.ts. Chạy: npm run sync:ai');
    process.exit(1);
  }
  console.log('ai-system.ts khớp src/ai/system.ts');
} else {
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, next, 'utf8');
  console.log('Đã ghi ' + dst);
}
