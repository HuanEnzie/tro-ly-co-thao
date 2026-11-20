"""Làm sạch nền magenta -> trong suốt, cắt sát, thu nhỏ.
Dùng: python clean.py <vào.png> <ra.png> <sticker|scene> [maxpx]
In ra JSON: kích thước, tỉ lệ trong suốt, pixel hồng sót, góc trong suốt."""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def main():
    src, dst, kind = sys.argv[1], sys.argv[2], sys.argv[3]
    maxpx = int(sys.argv[4]) if len(sys.argv) > 4 else (1280 if kind == "scene" else 800)
    im = Image.open(src).convert("RGBA")
    if kind == "scene":
        im = im.convert("RGB")
        if im.width > maxpx:
            im = im.resize((maxpx, round(im.height * maxpx / im.width)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=88, method=6)
        print(json.dumps({"w": im.width, "h": im.height, "kind": "scene"}))
        return

    a = np.array(im).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    has_alpha = (al < 250).mean() > 0.05  # GPT đã trả nền trong suốt
    if not has_alpha:
        # độ "magenta": R và B cao, G thấp
        mag = np.minimum(r, b) - g
        is_mag = (mag > 70) & (r > 150) & (b > 150)
        lab, n = ndimage.label(is_mag)
        border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        border = border[border != 0]
        bg = np.isin(lab, border)
        # lỗ magenta kín: chỉ xóa vùng lớn và thật hồng (tránh ăn vào vật màu hồng)
        strong = (mag > 120) & (r > 200) & (b > 200)
        lab2, n2 = ndimage.label(strong & ~bg)
        if n2:
            sizes = ndimage.sum(strong, lab2, range(1, n2 + 1))
            for i, s in enumerate(sizes, 1):
                if s > 150:
                    bg |= lab2 == i
        # mở rộng 1 px để ăn viền khử răng cưa, rồi khử hồng ở rìa
        edge = ndimage.binary_dilation(bg, iterations=2) & ~bg
        fringe = edge & (mag > 25)
        bg |= fringe
        al = np.where(bg, 0, 255)
        # làm mềm biên 1 px
        soft = ndimage.gaussian_filter(al.astype(float), 0.7)
        al = np.clip(soft, 0, 255)
        al = np.where(bg, 0, al).astype(np.int16)
        # khử màu hồng còn dính ở rìa vật
        rim = ndimage.binary_dilation(bg, iterations=3) & ~bg
        d = np.clip((np.minimum(r, b) - g) // 2, 0, 60)
        r = np.where(rim, np.clip(r - d, 0, 255), r)
        b = np.where(rim, np.clip(b - d, 0, 255), b)
        a = np.stack([r, g, b, al], axis=-1).astype(np.uint8)
    else:
        a = a.astype(np.uint8)
    out = Image.fromarray(a, "RGBA")
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        pad = 6
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(out.width, bbox[2] + pad), min(out.height, bbox[3] + pad))
        out = out.crop(bbox)
    if max(out.size) > maxpx:
        k = maxpx / max(out.size)
        out = out.resize((max(1, round(out.width * k)), max(1, round(out.height * k))), Image.LANCZOS)
    out.save(dst, "PNG", optimize=True)
    arr = np.array(out)
    alpha = arr[..., 3]
    vis = alpha > 40
    pink = ((np.minimum(arr[..., 0].astype(int), arr[..., 2].astype(int)) - arr[..., 1]) > 90) & vis & (arr[..., 0] > 200)
    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    print(json.dumps({
        "w": out.width, "h": out.height, "kind": "sticker",
        "trongSuot": round(float((alpha < 20).mean()), 3),
        "hongSot": int(pink.sum()),
        "gocTrongSuot": all(c < 20 for c in corners),
    }))


if __name__ == "__main__":
    main()
