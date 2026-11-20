# Cài backend Supabase (làm một lần)

Mọi thứ đã viết sẵn trong thư mục `supabase/`. Chỉ cần tạo dự án rồi chạy vài lệnh. Dùng gói **Free**.

## 0. Chuẩn bị
- Cài [Supabase CLI](https://supabase.com/docs/guides/cli) (Windows: `scoop install supabase`, hoặc dùng `npx supabase ...`).
- Chạy lệnh trong thư mục repo `tro-ly-co-thao`.

## 1. Tạo dự án
1. Vào https://supabase.com/dashboard, đăng nhập, **New project**.
2. Tên: `tro-ly-co-thao`. **Region: Southeast Asia (Singapore)**. Đặt mật khẩu cơ sở dữ liệu và cất kỹ.
3. Đợi dự án khởi tạo xong. Vào **Project Settings → API**, ghi lại **Project URL** và khóa **anon public**. Khóa `service_role` thì KHÔNG đưa cho ai, không dán vào web.
4. Mã dự án (project ref) là phần đầu của URL: `https://<ref>.supabase.co`.

## 2. Nối repo với dự án và tạo bảng
```
supabase login
supabase link --project-ref <ref>
supabase db push
```
`db push` chạy `supabase/migrations/20261120000000_init.sql` (bảng, quy tắc RLS, hai kho file `tai-lieu` và `hinh-slide`).

Nạp chương trình chủ đề Nghề nghiệp (tuần 11–14) và tạo tổ:
- Mở **SQL Editor** trên dashboard, dán nội dung `supabase/seed.sql`, bấm Run. Chạy lại không bị nhân đôi.
- Muốn sinh lại seed từ `src/data/chuong-trinh.json`: `npm run seed:chuong-trinh`.

## 3. Đăng nhập bằng email (mã OTP)
- **Authentication → Providers → Email**: bật.
- **Authentication → Email Templates**, mẫu **Magic Link** và **Confirm signup**: thêm `{{ .Token }}` vào nội dung thư để thư có mã 6 số. Ví dụ: `Mã đăng nhập của cô: {{ .Token }}`.
- **Authentication → URL Configuration**: Site URL `https://huanenzie.github.io/tro-ly-co-thao/`, thêm `http://localhost:3010` vào Redirect URLs.
- Gói Free giới hạn số thư gửi mỗi giờ; dùng cho một tổ thì đủ.

## 4. Thêm cô vào tổ (quan trọng)
Đăng nhập xong mà chưa được thêm vào tổ thì chưa thấy dữ liệu gì. Mỗi cô đăng nhập web một lần bằng email, rồi quản trị chạy trong **SQL Editor**:
```sql
insert into public.thanh_vien (user_id, to_id, ho_ten, vai_tro)
select u.id, (select id from public.to_chuyen_mon limit 1), 'Từ Thị Thảo', 'quan-tri'
from auth.users u where u.email = 'email-cua-co@example.com';
```
Đổi tên và email cho từng người. `vai_tro`: `giao-vien`, `to-truong` hoặc `quan-tri`.

## 5. Hàm AI (Gemini)
```
npm run sync:ai                                  # chép src/ai/system.ts sang supabase/functions/_shared
supabase secrets set GEMINI_API_KEY=<khóa Gemini>
supabase functions deploy review --no-verify-jwt
```
- `--no-verify-jwt` khớp với `supabase/config.toml`: hàm tự kiểm đăng nhập trong code (để trình duyệt gọi được yêu cầu OPTIONS).
- Tuỳ chọn: `supabase secrets set AI_DAILY_LIMIT=60 AI_USER_DAILY_LIMIT=30 GEMINI_MODELS=gemini-3.5-flash,gemini-2.5-flash`.
- CORS mặc định cho `https://huanenzie.github.io` và `http://localhost:3010`. Thêm nguồn khác: `supabase secrets set ALLOWED_ORIGINS=https://a.com,https://b.com` (thay hẳn danh sách mặc định, nhớ ghi lại cả hai nguồn trên).
- Mỗi lần sửa `src/ai/system.ts` phải chạy lại `npm run sync:ai` rồi deploy lại hàm. `npm run sync:ai -- --check` để kiểm có lệch không.
- Đừng dán khóa Gemini vào chat, vào code hay vào repo. Chỉ dùng lệnh `secrets set`.

## 6. Nối web với backend
**Chạy ở máy:** tạo file `.env.local` (đã nằm trong .gitignore) có hai dòng:
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<khóa anon public>
```
**GitHub Pages:** repo → Settings → Secrets and variables → Actions:
- Tab **Variables**: thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Workflow `pages.yml` truyền hai biến này vào bước build. Khóa anon là công khai nên để dạng Variable được.
- Tab **Secrets**: thêm `SUPABASE_URL` và `SUPABASE_ANON_KEY` cho workflow `keepalive.yml`.

Thiếu hai biến VITE_* thì web vẫn chạy bình thường ở chế độ không backend (chỉ soát/sửa file trong trình duyệt).

## 7. Giữ dự án không bị tạm dừng
Gói Free tạm dừng sau 7 ngày không hoạt động. `.github/workflows/keepalive.yml` chạy mỗi 3 ngày, gọi nhẹ vào REST của Supabase. Sau khi đặt secret, vào **Actions → Supabase keepalive → Run workflow** chạy thử một lần, phải thấy `HTTP 200`.

## Quy tắc dữ liệu cần nhớ
- **Phiên bản không bị sửa/xóa**: bảng `phien_ban` và `lan_soat` chỉ cho thêm. Có cả trigger chặn nên ngay cả service role cũng không sửa được. Kho file `tai-lieu` cũng không có quyền sửa/xóa. Muốn xóa thật (hiếm) phải tắt trigger bằng SQL Editor và biết mình đang làm gì.
- Mỗi cô chỉ thấy dữ liệu của tổ mình (RLS, hàm `my_to_ids()`).
- Đường dẫn file: `<to_id>/<tai_lieu_id>/v<số>.<đuôi>`. Số phiên bản do máy chủ tự tăng.
- Nếu tải file lên Storage lỗi mạng giữa chừng thì dòng phiên bản đã có nhưng chưa có file; web gọi `retryUpload` để tải lại đúng đường dẫn đó.

## Thử ở máy (cần Docker)
`supabase start` rồi `supabase db reset` chạy migration + seed trên Postgres cục bộ. Hàm: `supabase functions serve review --env-file <file chứa GEMINI_API_KEY>`.
