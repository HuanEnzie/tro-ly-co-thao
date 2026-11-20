/**
 * Sinh supabase/seed.sql từ src/data/chuong-trinh.json: tổ 5–6 tuổi, chủ đề "Nghề nghiệp", các nhánh,
 * tuần 11–14 và hoạt động từng ngày. Chỉ chép chữ trong chương trình, không sửa câu chữ.
 * Chạy: npm run seed:chuong-trinh   (chạy lại thì ghi đè seed.sql; seed.sql tự bỏ qua nếu chủ đề đã có)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Week {
  tuan: number; nhanh: string; khoang: string; coA: string; coB: string;
  days: Record<string, { sang: string; chieu: string }>;
}
const prog = JSON.parse(readFileSync(resolve('src/data/chuong-trinh.json'), 'utf8')) as { chuDe: string; weeks: Week[] };

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "(từ 16/11 đến 20/11/ 2026)" -> ['2026-11-16', '2026-11-20'] */
function khoang(s: string): [string, string] {
  const m = s.match(/(\d{1,2})\/(\d{1,2}).*?(\d{1,2})\/(\d{1,2})\s*\/?\s*(\d{4})/);
  if (!m) throw new Error('Không đọc được khoảng ngày: ' + s);
  const iso = (d: string, mo: string, y: string) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return [iso(m[1], m[2], m[5]), iso(m[3], m[4], m[5])];
}

/** tách tên đề tài và loại tiết của một buổi */
function tach(buoi: 'sang' | 'chieu', text: string): { ten: string; loai: string | null } {
  const loai = text.match(/Loại tiết:\s*([A-Za-zÀ-ỹ]+)/)?.[1] ?? null;
  let t = text.split(/-?\s*Loại tiết:/)[0];
  if (buoi === 'chieu') t = t.split(/Nêu gương/)[0];
  t = clean(t).replace(/^-\s*/, '').replace(/[\s+\-]+$/, '');
  return { ten: t, loai };
}

const L: string[] = [];
L.push('-- TỰ SINH bằng `npm run seed:chuong-trinh` từ src/data/chuong-trinh.json. Không sửa tay.');
L.push('do $seed$');
L.push('declare v_to uuid; v_cd uuid; v_nh uuid; v_tuan uuid;');
L.push('begin');
L.push("  select id into v_to from public.to_chuyen_mon where ten = 'Tổ 5–6 tuổi, Trường MN Võ Cường' limit 1;");
L.push("  if v_to is null then insert into public.to_chuyen_mon (ten) values ('Tổ 5–6 tuổi, Trường MN Võ Cường') returning id into v_to; end if;");
L.push("  if exists (select 1 from public.chu_de where to_id = v_to and ten = 'Nghề nghiệp') then return; end if;");
L.push(`  insert into public.chu_de (to_id, ten, ghi_chu, thu_tu) values (v_to, 'Nghề nghiệp', ${q(clean(prog.chuDe))}, 1) returning id into v_cd;`);
prog.weeks.forEach((w, wi) => {
  const [tu, den] = khoang(w.khoang);
  L.push(`  insert into public.nhanh (to_id, chu_de_id, ten, thu_tu) values (v_to, v_cd, ${q(w.nhanh)}, ${wi + 1}) returning id into v_nh;`);
  L.push(`  insert into public.tuan (to_id, chu_de_id, nhanh_id, so_tuan, tu_ngay, den_ngay, co_a, co_b) values (v_to, v_cd, v_nh, ${w.tuan}, '${tu}', '${den}', ${q(w.coA)}, ${q(w.coB)}) returning id into v_tuan;`);
  for (const thu of Object.keys(w.days).sort()) {
    for (const buoi of ['sang', 'chieu'] as const) {
      const raw = w.days[thu][buoi];
      if (!raw) continue;
      const { ten, loai } = tach(buoi, raw);
      if (!ten) continue;
      L.push(`  insert into public.hoat_dong (to_id, tuan_id, thu, buoi, loai_tiet, ten_de_tai, thu_tu) values (v_to, v_tuan, ${+thu}, '${buoi}', ${q(loai)}, ${q(ten)}, ${buoi === 'sang' ? 1 : 2});`);
    }
  }
});
L.push('end $seed$;');

const out = resolve('supabase/seed.sql');
writeFileSync(out, L.join('\n') + '\n', 'utf8');
console.log(`Đã ghi ${out}: ${prog.weeks.length} tuần, ${L.filter(l => l.includes('into public.hoat_dong')).length} hoạt động`);
