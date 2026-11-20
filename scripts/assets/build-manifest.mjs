// Sinh assets-slide/manifest.json từ catalog-chung.txt + catalog-chude.txt (+ số, chữ cái).
// Giữ trangThai/ghi chú của mục đã có trong manifest cũ (chạy lại không mất tiến độ).
// Dùng: node scripts/assets/build-manifest.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const out = resolve(root, "assets-slide", "manifest.json");
const read = (f) => readFileSync(resolve(here, f), "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));

const items = [];
const seen = new Set();
const add = (it) => {
  if (seen.has(it.id)) throw new Error("Trùng id: " + it.id);
  seen.add(it.id);
  items.push({ ...it, trangThai: "chua-ve" });
};

// Bộ chung
for (const l of read("catalog-chung.txt")) {
  const [id, loai, tenVi, prompt, the] = l.split("|");
  add({ id, chuDe: "chung", loai, tenVi, prompt, the: (the || "").split(",").filter(Boolean) });
}
const SO = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
SO.forEach((w, i) => add({
  id: `chung/so/${i}`, chuDe: "chung", loai: "so", tenVi: `Số ${i}`,
  prompt: `a single big bubbly cartoon digit "${i}" (the number ${w}) in bright rainbow-colored 3D-ish style with a thick outline, the digit is the ONLY text in the image`,
  the: ["số", String(i)],
}));
const CHU = "a ă â b c d đ e ê g h i k l m n o ô ơ p q r s t u ư v x y".split(" ");
const CHU_ID = { "ă":"aw","â":"aa","đ":"dd","ê":"ee","ô":"oo","ơ":"ow","ư":"uw" };
CHU.forEach((c) => add({
  id: `chung/chu/${CHU_ID[c] || c}`, chuDe: "chung", loai: "chu", tenVi: `Chữ ${c}`,
  prompt: `a single big bubbly cartoon lowercase Vietnamese letter "${c}" in print (school handwriting-free, simple round print form) with correct Vietnamese diacritics exactly as shown, bright colors and a thick outline, the letter is the ONLY text in the image`,
  the: ["chữ cái", c],
}));

// Theo chủ đề
const chuDeList = [];
let cd = null;
for (const l of read("catalog-chude.txt")) {
  const m = l.match(/^\[(.+?)\|(.+)\]$/);
  if (m) { cd = m[1]; chuDeList.push({ slug: cd, ten: m[2] }); continue; }
  const [loai, id, tenVi, prompt] = l.split("|");
  if (!prompt) throw new Error("Dòng thiếu cột: " + l);
  const folder = { nen: "nen", "nhan-vat": "nhan-vat", "do-vat": "do-vat" }[loai];
  if (!folder) throw new Error("Loại lạ: " + l);
  add({ id: `${cd}/${folder}/${id}`, chuDe: cd, loai, tenVi, prompt, the: [chuDeList.at(-1).ten.toLowerCase()] });
}

// giữ tiến độ cũ
if (existsSync(out)) {
  const old = JSON.parse(readFileSync(out, "utf8"));
  const map = new Map(old.mucs.map((m) => [m.id, m]));
  for (const it of items) {
    const o = map.get(it.id);
    if (o) { it.trangThai = o.trangThai; if (o.tep) it.tep = o.tep; if (o.ghiChu) it.ghiChu = o.ghiChu; }
  }
}
const dem = {};
for (const it of items) dem[it.chuDe] = (dem[it.chuDe] || 0) + 1;
writeFileSync(out, JSON.stringify({ phienBan: 1, tong: items.length, demTheoChuDe: dem, chuDe: chuDeList, mucs: items }, null, 1) + "\n");
writeFileSync(resolve(root, "assets-slide", "manifest.js"), "window.MANIFEST = " + readFileSync(out, "utf8").trim() + ";" + String.fromCharCode(10));
console.log("Tổng", items.length, dem);
