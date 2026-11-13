# Trợ lý soát giáo án – quy tắc khi sửa code

- Hồ sơ lớp, quy định của tổ, lịch sử việc đã làm: `E:\E Download\co-giao\HO-SO-LOP-5T1\README.md`.
- Luật chắc chắn viết bằng JS trong `src/engine/rules/`; AI (Gemini) chỉ làm phần nội dung, và mọi kết quả AI phải qua `src/ai/guard.ts`.
- Sửa hoặc thêm luật ⇒ thêm dòng kiểm vào `scripts/verify-*.ts` và chạy `npm run verify` (phải “Tất cả kiểm tra đều đạt”), có cả dòng “không báo nhầm”.
- `tests/fixtures/kh-*-claude.docx` là bản đối chứng phải sạch lỗi nặng.
- Bộ tự sửa (`fixer.ts`) chỉ sửa lỗi chắc chắn (chính tả theo từ điển, dấu); không bao giờ tự sửa nội dung, tên tiết, ngày tháng.
- Key Gemini chỉ ở máy chủ (`.env.local` / biến môi trường Vercel), gửi trong header; không đưa xuống trình duyệt, không in ra.
- Không gửi dữ liệu học sinh/phụ huynh lên AI.
