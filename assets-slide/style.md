# Phong cách hình cho slide mầm non (lớp 5T1, 5–6 tuổi)

File này là nguồn duy nhất cho câu dẫn phong cách. `scripts/assets/gen.mjs` đọc trực tiếp các khối ``` có tên bên dưới, nên sửa ở đây là sửa cho mọi hình.
Phong cách lấy lại từ bộ "Khám phá nghề nông" và Hoạt động góc (kawaii chibi, viền nâu đậm, màu tươi).

## Câu dẫn cố định (tiếng Anh, đứng cuối mọi prompt)

```style
Cute kawaii chibi cartoon style for a Vietnamese kindergarten classroom, bright cheerful saturated colors, soft gradient shading, clean dark-brown outlines, friendly and simple shapes for 5 to 6 year old children.
```

## Luật âm (negative, ghép vào mọi prompt)

```negative
No text, no letters, no numbers, no watermark, no logo, no signature, no photo-realism, no scary or dark mood.
```

Riêng bộ số/chữ cái (loại `so`, `chu`) được phép có đúng một ký tự cần vẽ, ngoài ra không có chữ nào khác.

## Luật nội dung

- Đồ vật, đồ ăn, dụng cụ, phương tiện, cây cối: KHÔNG có mặt, mắt, miệng. Chỉ người và con vật có nét mặt.
- Người là người Việt: trẻ em, cô giáo, các nghề mặc trang phục Việt Nam phù hợp (nón lá, áo bà ba, áo dài, đồng phục...).
- Màu ô đáp án: Đỏ, Tím, Xanh lá, Vàng. Không dùng xanh dương làm màu đáp án.
- Chữ trên slide do slide tự thêm; hình không chứa chữ.

## Khối theo loại (ghép sau mô tả riêng của từng hình)

Nhân vật, đồ vật, chung:

```sticker
Exactly one single subject, centered, whole subject visible, not touching the image edges. Die-cut sticker with a thick clean white border all around and NO drop shadow, NO floor patch. The whole background is one perfectly flat solid pure magenta color (#FF00FF) with nothing else on it.
```

Đồ vật và chung (thêm):

```object
The object itself has NO face, NO eyes, NO mouth and no human features.
```

Nhân vật (thêm):

```character
Full body, friendly smiling face, big sparkly eyes and rosy cheeks.
```

Nền (không trong suốt):

```scene
A wide full-bleed scene illustration that fills the whole image, with empty open space in the middle and lower part so that stickers can be placed on top of it. No sticker border, no magenta.
```

Số, chữ cái:

```glyph
Die-cut sticker with a thick clean white border and NO drop shadow, centered, not touching the image edges, on a perfectly flat solid pure magenta (#FF00FF) background.
```

## Kích thước, nền, cách tách nền

| Loại | Vẽ (GPT) | Xuất | Nền |
|---|---|---|---|
| do-vat, nhan-vat, chung, so, chu | 1024x1024 | PNG, cạnh dài tối đa 800 px, cắt sát | trong suốt |
| nen | 1536x1024 | WebP, rộng tối đa 1280 px | đặc (không trong suốt) |

- Hình gốc lớn lưu ngoài git: `E:/Source Code/tro-ly-co-thao-assets/raw/<id>.png`.
- Tách nền: GPT vẽ trên nền magenta phẳng. `scripts/assets/clean.py` xóa vùng magenta nối với biên ảnh, xóa cả các lỗ magenta kín (ví dụ quai cặp), khử viền hồng, cắt sát (`getbbox`), thu nhỏ. Nếu GPT trả sẵn nền trong suốt thì giữ nguyên.
- Kiểm tra bằng số: tỉ lệ pixel trong suốt phải trong khoảng 8% đến 92%, góc ảnh phải trong suốt, không còn pixel hồng sót.
