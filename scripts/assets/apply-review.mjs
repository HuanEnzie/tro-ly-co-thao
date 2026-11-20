// Áp quyết định duyệt (xuất từ assets-slide/review.html) vào manifest.
// Dùng: node scripts/assets/apply-review.mjs quyet-dinh.json [--dry]
// File JSON: { "quyetDinh": { "<id>": "da-duyet" | "hong" } }
// - "da-duyet": chỉ áp cho mục đã vẽ (có tep).
// - "hong": đổi trangThai = hong, xóa hình nhỏ (hình gốc ngoài git giữ nguyên) để vẽ lại bằng gen.mjs --redo-hong.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const slide = resolve(here, "..", "..", "assets-slide");
const file = process.argv[2];
const dry = process.argv.includes("--dry");
if (!file) { console.error("Dùng: node scripts/assets/apply-review.mjs quyet-dinh.json [--dry]"); process.exit(1); }

const q = JSON.parse(readFileSync(file, "utf8")).quyetDinh || {};
const mf = JSON.parse(readFileSync(resolve(slide, "manifest.json"), "utf8"));
const byId = new Map(mf.mucs.map((m) => [m.id, m]));
let duyet = 0, hong = 0, bo = 0;
for (const [id, tt] of Object.entries(q)) {
  const m = byId.get(id);
  if (!m) { console.warn("Không có id trong manifest:", id); bo++; continue; }
  if (tt === "da-duyet") {
    if (!m.tep) { console.warn("Chưa vẽ, bỏ qua:", id); bo++; continue; }
    m.trangThai = "da-duyet"; delete m.ghiChu; duyet++;
  } else if (tt === "hong") {
    m.trangThai = "hong";
    if (m.tep) {
      const f = resolve(slide, m.tep);
      if (!dry && existsSync(f)) unlinkSync(f);
      delete m.tep; delete m.kiemTra;
    }
    hong++;
  } else { console.warn("Giá trị lạ:", id, tt); bo++; }
}
console.log(`${dry ? "[thử] " : ""}Duyệt ${duyet}, hỏng ${hong}, bỏ qua ${bo}.`);
if (!dry) {
  writeFileSync(resolve(slide, "manifest.json"), JSON.stringify(mf, null, 1) + "\n");
  writeFileSync(resolve(slide, "manifest.js"), "window.MANIFEST = " + JSON.stringify(mf) + ";\n");
}
