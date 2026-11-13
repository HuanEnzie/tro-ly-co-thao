# Trợ lý soát giáo án – Lớp 5T1, Trường MN Võ Cường

Web soát lỗi kế hoạch ngày, kế hoạch tuần (file Word) cho cô Từ Thị Thảo và cô Vũ Thị Chinh.

## 3 lớp soát

| Lớp | Chạy ở | Tốn lượt AI? | Làm gì |
|---|---|---|---|
| **Luật JS** (`src/engine/rules/`) | Trình duyệt | Không | Đối chiếu tên tiết với chương trình chủ đề, đúng ngày – đúng thứ, năm học, tuần lẻ vệ sinh / tuần chẵn lao động, quan sát có mục đích thứ 3 – thứ 5, cấu trúc bài soạn theo loại tiết, HĐ 3 trống, chuẩn bị thiếu nhạc/video, khổ giấy, soát chéo KH tuần ↔ KH ngày, chính tả (từ điển lỗi của các cô), dấu cách, dấu câu, ngoặc kép |
| **Tự sửa file Word** (`src/engine/fixer.ts`, JSZip) | Trình duyệt | Không | Sửa chắc chắn: chính tả theo từ điển, gõ đúp, lặp chữ, dấu cách, dấu câu. Sửa thẳng trong XML (giữ định dạng), tô vàng đúng chữ được sửa, file mới tên “(đã sửa).docx”. Lỗi nội dung không tự sửa |
| **Gemini** (`api/review.ts`) | Máy chủ | 1 lượt / file | Nội dung: mục đích ↔ tiến hành, chuẩn bị hợp lý, cột trẻ ↔ cột cô, câu cụt… Kết quả qua **bộ lọc** `src/ai/guard.ts`: bỏ lỗi có đoạn trích không có thật trong giáo án, bỏ lỗi trùng luật, gắn lại vị trí thật. Kết quả lưu theo mã file, mở lại không tốn lượt |

## Chạy

```bash
npm install
cp .env.example .env.local   # điền GEMINI_API_KEY, GEMINI_MODELS (thêm model Antigravity vào đầu danh sách nếu dùng)
npm run dev                  # http://localhost:3010
```

- `npm run verify` — bộ kiểm ✔/✘ (giống `npm run verify` của dự án rubik): chạy trên giáo án thật trong `tests/fixtures/`, đáp án lấy từ các lần soát tay. **Sửa luật xong phải chạy lại.**
- `npm run check -- "<file.docx>" ["<file2.docx>"]` — soát từ dòng lệnh, in báo cáo.
- `npm run import:chuong-trinh -- "<CHƯƠNG TRÌNH HỌC CĐ ….docx>"` — nạp chương trình chủ đề mới vào `src/data/chuong-trinh.json` (trên web cũng có nút “Nạp chương trình khác”).

## Thêm lỗi chính tả mới

Thêm 1 dòng vào `DICT` trong `src/engine/rules/spelling.ts` (`['sai', 'đúng']`, thêm `true` nếu phân biệt hoa/thường), rồi thêm 1 dòng kiểm vào `scripts/verify-checker.ts` và chạy `npm run verify`.

## Triển khai (Vercel)

Thư mục `api/` là Vercel Functions (`export POST/GET(request)`). Đặt biến môi trường `GEMINI_API_KEY`, `GEMINI_MODELS`, `AI_DAILY_LIMIT` (mặc định 60), nên đặt thêm `APP_PASSCODE` để người ngoài không dùng hết lượt.
