-- Trợ lý cô Thảo: cấu trúc dữ liệu ban đầu.
-- Quy tắc: phiên bản tài liệu chỉ được THÊM, không sửa/xóa (không ghi đè file của cô).

create extension if not exists pgcrypto;

-- ============ Bảng ============
create table public.to_chuyen_mon (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  tao_luc timestamptz not null default now()
);

create table public.thanh_vien (
  user_id uuid primary key references auth.users(id) on delete cascade,
  to_id uuid not null references public.to_chuyen_mon(id) on delete restrict,
  ho_ten text not null,
  vai_tro text not null default 'giao-vien' check (vai_tro in ('giao-vien', 'to-truong', 'quan-tri')),
  tao_luc timestamptz not null default now()
);
create index on public.thanh_vien (to_id);

create table public.chu_de (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  ten text not null,
  ghi_chu text,
  thu_tu int not null default 0
);
create index on public.chu_de (to_id);

create table public.nhanh (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  chu_de_id uuid not null references public.chu_de(id) on delete cascade,
  ten text not null,
  thu_tu int not null default 0
);
create index on public.nhanh (chu_de_id);

create table public.tuan (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  chu_de_id uuid references public.chu_de(id) on delete set null,
  nhanh_id uuid references public.nhanh(id) on delete set null,
  so_tuan int not null,
  tu_ngay date,
  den_ngay date,
  co_a text,
  co_b text,
  unique (to_id, so_tuan, tu_ngay)
);
create index on public.tuan (to_id, so_tuan);

create table public.hoat_dong (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  tuan_id uuid not null references public.tuan(id) on delete cascade,
  thu int not null check (thu between 2 and 7),
  buoi text not null check (buoi in ('sang', 'chieu')),
  loai_tiet text,
  ten_de_tai text not null,
  thu_tu int not null default 1
);
create index on public.hoat_dong (tuan_id, thu, buoi, thu_tu);

create table public.tai_lieu (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  loai text not null check (loai in ('kh-tuan', 'kh-ngay', 'chuong-trinh', 'slide', 'mau', 'khac')),
  tuan_id uuid references public.tuan(id) on delete set null,
  ten text not null,
  nguoi_tao uuid not null default auth.uid() references auth.users(id),
  tao_luc timestamptz not null default now()
);
create index on public.tai_lieu (to_id, loai);
create index on public.tai_lieu (tuan_id);

create table public.phien_ban (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  tai_lieu_id uuid not null references public.tai_lieu(id) on delete restrict,
  so int not null default 0,   -- trigger tự gán
  duoi text not null default 'docx' check (duoi ~ '^[a-z0-9]{1,8}$'),
  storage_path text not null default '',   -- trigger tự gán
  nguon text not null check (nguon in ('tai-len', 'may-sua', 'sua-tay', 'may-soan')),
  ghi_chu text,
  tom_tat_soat jsonb,
  nguoi_tao uuid not null default auth.uid() references auth.users(id),
  tao_luc timestamptz not null default now(),
  unique (tai_lieu_id, so)
);
create index on public.phien_ban (to_id);

create table public.lan_soat (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  phien_ban_id uuid not null references public.phien_ban(id) on delete restrict,
  issues jsonb not null default '[]'::jsonb,
  so_nang int not null default 0,
  so_xem int not null default 0,
  so_chinh_ta int not null default 0,
  model_ai text,
  tao_luc timestamptz not null default now()
);
create index on public.lan_soat (phien_ban_id);

create table public.hinh_slide (
  id uuid primary key default gen_random_uuid(),
  to_id uuid not null references public.to_chuyen_mon(id) on delete cascade,
  chu_de text not null,
  loai text,
  ten text not null,
  the text[] not null default '{}',
  storage_path text not null,
  da_duyet boolean not null default false
);
create index on public.hinh_slide (to_id, chu_de);

-- Lượt gọi AI theo ngày (giờ Việt Nam) và theo người dùng.
create table public.luot_ai (
  ngay date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  so_luot int not null default 0,
  primary key (ngay, user_id)
);

-- ============ Hàm hỗ trợ ============
-- Các tổ của người đang đăng nhập. security definer để dùng được trong RLS của chính bảng thanh_vien.
create or replace function public.my_to_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$ select to_id from public.thanh_vien where user_id = auth.uid() $$;
revoke all on function public.my_to_ids() from public;
grant execute on function public.my_to_ids() to authenticated;

-- Phiên bản: tự gán to_id, số phiên bản (tăng dần theo tài liệu), đường dẫn file.
-- Khóa dòng tài liệu để hai người cùng thêm không trùng số.
create or replace function public.phien_ban_truoc_khi_them()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_to uuid;
  v_so int;
begin
  select to_id into v_to from public.tai_lieu where id = new.tai_lieu_id for update;
  if v_to is null then
    raise exception 'Không tìm thấy tài liệu';
  end if;
  select coalesce(max(so), 0) + 1 into v_so from public.phien_ban where tai_lieu_id = new.tai_lieu_id;
  new.to_id := v_to;
  new.so := v_so;
  new.storage_path := v_to || '/' || new.tai_lieu_id || '/v' || v_so || '.' || new.duoi;
  new.nguoi_tao := auth.uid();
  new.tao_luc := now();
  return new;
end $$;

create trigger phien_ban_them
  before insert on public.phien_ban
  for each row execute function public.phien_ban_truoc_khi_them();

-- Chặn sửa/xóa phiên bản và lần soát (kể cả khi dùng service role).
create or replace function public.chan_sua_xoa()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Không được sửa hoặc xóa % (quy tắc không ghi đè: chỉ thêm bản mới)', tg_table_name;
end $$;

create trigger phien_ban_khong_sua before update or delete on public.phien_ban
  for each row execute function public.chan_sua_xoa();
create trigger lan_soat_khong_sua before update or delete on public.lan_soat
  for each row execute function public.chan_sua_xoa();

-- lan_soat tự gán to_id theo phiên bản
create or replace function public.lan_soat_truoc_khi_them()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  select to_id into new.to_id from public.phien_ban where id = new.phien_ban_id;
  if new.to_id is null then raise exception 'Không tìm thấy phiên bản'; end if;
  return new;
end $$;
create trigger lan_soat_them before insert on public.lan_soat
  for each row execute function public.lan_soat_truoc_khi_them();

-- Đếm lượt AI. Trả ok=false (và không tăng) nếu vượt giới hạn chung hoặc của người dùng.
create or replace function public.tang_luot_ai(p_gioi_han_chung int, p_gioi_han_user int)
returns table (ok boolean, chung int, cua_toi int)
language plpgsql security definer
set search_path = public
as $$
declare
  v_ngay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_chung int;
  v_toi int;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  insert into public.luot_ai (ngay, user_id, so_luot) values (v_ngay, auth.uid(), 0)
    on conflict do nothing;
  perform 1 from public.luot_ai where ngay = v_ngay and user_id = auth.uid() for update;
  select coalesce(sum(l.so_luot), 0)::int into v_chung from public.luot_ai l where l.ngay = v_ngay;
  select l.so_luot into v_toi from public.luot_ai l where l.ngay = v_ngay and l.user_id = auth.uid();
  if v_chung >= p_gioi_han_chung or v_toi >= p_gioi_han_user then
    return query select false, v_chung, v_toi;
    return;
  end if;
  update public.luot_ai l set so_luot = l.so_luot + 1 where l.ngay = v_ngay and l.user_id = auth.uid();
  return query select true, v_chung + 1, v_toi + 1;
end $$;
revoke all on function public.tang_luot_ai(int, int) from public;
grant execute on function public.tang_luot_ai(int, int) to authenticated;

create or replace function public.luot_ai_hom_nay()
returns table (chung int, cua_toi int)
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(l.so_luot), 0)::int,
         coalesce(sum(l.so_luot) filter (where l.user_id = auth.uid()), 0)::int
  from public.luot_ai l where l.ngay = (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;
revoke all on function public.luot_ai_hom_nay() from public;
grant execute on function public.luot_ai_hom_nay() to authenticated;

-- ============ RLS ============
alter table public.to_chuyen_mon enable row level security;
alter table public.thanh_vien enable row level security;
alter table public.chu_de enable row level security;
alter table public.nhanh enable row level security;
alter table public.tuan enable row level security;
alter table public.hoat_dong enable row level security;
alter table public.tai_lieu enable row level security;
alter table public.phien_ban enable row level security;
alter table public.lan_soat enable row level security;
alter table public.hinh_slide enable row level security;
alter table public.luot_ai enable row level security;  -- không có policy: chỉ truy cập qua hàm tang_luot_ai

-- Tổ và thành viên: chỉ đọc. Thêm thành viên/tổ do quản trị làm bằng SQL (xem docs/supabase.md).
create policy "to: doc to cua minh" on public.to_chuyen_mon for select to authenticated
  using (id in (select public.my_to_ids()));
create policy "thanh_vien: doc cung to" on public.thanh_vien for select to authenticated
  using (to_id in (select public.my_to_ids()));

-- Dữ liệu chương trình: đọc/ghi trong tổ mình
create policy "chu_de: to minh" on public.chu_de for all to authenticated
  using (to_id in (select public.my_to_ids())) with check (to_id in (select public.my_to_ids()));
create policy "nhanh: to minh" on public.nhanh for all to authenticated
  using (to_id in (select public.my_to_ids())) with check (to_id in (select public.my_to_ids()));
create policy "tuan: to minh" on public.tuan for all to authenticated
  using (to_id in (select public.my_to_ids())) with check (to_id in (select public.my_to_ids()));
create policy "hoat_dong: to minh" on public.hoat_dong for all to authenticated
  using (to_id in (select public.my_to_ids())) with check (to_id in (select public.my_to_ids()));
create policy "hinh_slide: to minh" on public.hinh_slide for all to authenticated
  using (to_id in (select public.my_to_ids())) with check (to_id in (select public.my_to_ids()));

-- Tài liệu: đọc + thêm + sửa tên/tuần (không có policy xóa)
create policy "tai_lieu: doc" on public.tai_lieu for select to authenticated
  using (to_id in (select public.my_to_ids()));
create policy "tai_lieu: them" on public.tai_lieu for insert to authenticated
  with check (to_id in (select public.my_to_ids()) and nguoi_tao = auth.uid());
create policy "tai_lieu: sua" on public.tai_lieu for update to authenticated
  using (to_id in (select public.my_to_ids())) with check (to_id in (select public.my_to_ids()));

-- Phiên bản và lần soát: chỉ đọc + thêm. Không có policy update/delete (kèm trigger chặn).
create policy "phien_ban: doc" on public.phien_ban for select to authenticated
  using (to_id in (select public.my_to_ids()));
create policy "phien_ban: them" on public.phien_ban for insert to authenticated
  with check (
    exists (select 1 from public.tai_lieu t where t.id = tai_lieu_id and t.to_id in (select public.my_to_ids()))
  );
create policy "lan_soat: doc" on public.lan_soat for select to authenticated
  using (to_id in (select public.my_to_ids()));
create policy "lan_soat: them" on public.lan_soat for insert to authenticated
  with check (
    exists (select 1 from public.phien_ban p where p.id = phien_ban_id and p.to_id in (select public.my_to_ids()))
  );

-- ============ Storage ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('tai-lieu', 'tai-lieu', false, 52428800),
       ('hinh-slide', 'hinh-slide', false, 10485760)
on conflict (id) do nothing;

-- tai-lieu: đường dẫn <to_id>/<tai_lieu_id>/v<so>.<ext>. Đọc + thêm trong tổ mình; KHÔNG có update/delete (không ghi đè).
create policy "tai-lieu: doc" on storage.objects for select to authenticated
  using (bucket_id = 'tai-lieu' and (storage.foldername(name))[1] in (select public.my_to_ids()::text));
create policy "tai-lieu: them" on storage.objects for insert to authenticated
  with check (bucket_id = 'tai-lieu' and (storage.foldername(name))[1] in (select public.my_to_ids()::text));

-- hinh-slide: <to_id>/... thành viên đọc; thêm/sửa/xóa trong tổ mình (thư viện hình có thể thay ảnh)
create policy "hinh-slide: doc" on storage.objects for select to authenticated
  using (bucket_id = 'hinh-slide' and (storage.foldername(name))[1] in (select public.my_to_ids()::text));
create policy "hinh-slide: them" on storage.objects for insert to authenticated
  with check (bucket_id = 'hinh-slide' and (storage.foldername(name))[1] in (select public.my_to_ids()::text));
create policy "hinh-slide: sua" on storage.objects for update to authenticated
  using (bucket_id = 'hinh-slide' and (storage.foldername(name))[1] in (select public.my_to_ids()::text));
create policy "hinh-slide: xoa" on storage.objects for delete to authenticated
  using (bucket_id = 'hinh-slide' and (storage.foldername(name))[1] in (select public.my_to_ids()::text));
