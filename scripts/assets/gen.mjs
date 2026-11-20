// Vẽ hình theo assets-slide/manifest.json bằng GPT (gpt-image-2 qua proxy openai-oauth).
// Dùng: node scripts/assets/gen.mjs [--chu-de nghe-nghiep] [--loai do-vat] [--id a,b] [--limit 10]
//        [--sleep 8] [--redo-hong] [--dry] [--force]
// - Bỏ qua mục đã vẽ (da-ve, da-duyet). --redo-hong vẽ lại mục "hong". --force vẽ lại cả mục đã vẽ (không đụng da-duyet).
// - Tuần tự, nghỉ --sleep giây giữa các lượt, dừng sau --limit lượt (mặc định 10).
// - Hình gốc: $ASSETS_RAW (mặc định ../../tro-ly-co-thao-assets/raw cạnh worktree). Bản nhỏ: assets-slide/img/<id>.png|webp
// - Không tự khởi động proxy. Proxy tắt thì dừng ngay.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const slide = resolve(root, "assets-slide");
const manifestPath = resolve(slide, "manifest.json");
const rawDir = process.env.ASSETS_RAW || resolve(root, "..", "..", "tro-ly-co-thao-assets", "raw");
const genImage = process.env.GPT_GEN_IMAGE || resolve(homedir(), ".claude", "skills", "gpt", "gen-image.mjs");
const base = process.env.GPT_BASE || "http://127.0.0.1:10531/v1";
const logPath = resolve(rawDir, "..", "gen.log");

// ---- tham số
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2);
  const nxt = argv[i + 1];
  if (nxt === undefined || nxt.startsWith("--")) opt[k] = true; else { opt[k] = nxt; i++; }
}
const limit = opt.limit ? Number(opt.limit) : 10;
const sleepSec = opt.sleep ? Number(opt.sleep) : 8;
const ids = opt.id ? String(opt.id).split(",") : null;

// ---- đọc style.md
const styleMd = readFileSync(resolve(slide, "style.md"), "utf8").replace(/
/g, String.fromCharCode(10));
const block = (name) => {
  const fence = "`".repeat(3);
  const NL = String.fromCharCode(10);
  const i = styleMd.indexOf(fence + name + NL);
  const m = i < 0 ? null : [0, styleMd.slice(i + fence.length + name.length + 1, styleMd.indexOf(NL + fence, i))];
  if (!m) throw new Error("style.md thiếu khối " + name);
  return m[1].trim();
};
const STYLE = block("style"), NEG = block("negative");

function buildPrompt(m) {
  const parts = [];
  if (m.loai === "nen") parts.push(`Illustration of ${m.prompt}.`, block("scene"));
  else if (m.loai === "so" || m.loai === "chu") parts.push(`Draw ${m.prompt}.`, block("glyph"));
  else {
    parts.push(`Illustration of ${m.prompt}.`);
    if (m.loai === "nhan-vat") parts.push(block("character"));
    else parts.push(block("object"));
    parts.push(block("sticker"));
  }
  parts.push(STYLE);
  // số/chữ: được có đúng một ký tự
  parts.push(m.loai === "so" || m.loai === "chu" ? NEG.replace("No text, no letters, no numbers,", "No other text,") : NEG);
  return parts.join(" ");
}
const sizeOf = (m) => (m.loai === "nen" ? "1536x1024" : "1024x1024");
const outRel = (m) => `img/${m.id}.${m.loai === "nen" ? "webp" : "png"}`;

const log = (s) => {
  const line = `[${new Date().toISOString()}] ${s}`;
  console.log(line);
  try { mkdirSync(dirname(logPath), { recursive: true }); appendFileSync(logPath, line + "\n"); } catch {}
};
const save = (mf) => {
  writeFileSync(manifestPath, JSON.stringify(mf, null, 1) + "\n");
  // bản .js cho review.html mở bằng file:// (fetch json bị chặn)
  writeFileSync(resolve(slide, "manifest.js"), "window.MANIFEST = " + JSON.stringify(mf) + ";\n");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- chọn mục
const mf = JSON.parse(readFileSync(manifestPath, "utf8"));
let todo = mf.mucs.filter((m) => {
  if (ids && !ids.includes(m.id)) return false;
  if (opt["chu-de"] && m.chuDe !== opt["chu-de"]) return false;
  if (opt.loai && m.loai !== opt.loai) return false;
  if (m.trangThai === "da-duyet") return false;
  if (m.trangThai === "da-ve" && !opt.force) return false;
  if (m.trangThai === "hong" && !(opt["redo-hong"] || ids || opt.force)) return false;
  return true;
});
const total = todo.length;
todo = todo.slice(0, limit);
log(`Chọn ${todo.length}/${total} mục (limit ${limit}).`);
if (opt.dry) {
  for (const m of todo) console.log(`\n# ${m.id} (${sizeOf(m)})\n${buildPrompt(m)}`);
  process.exit(0);
}
if (!todo.length) process.exit(0);

// ---- kiểm tra proxy (không tự khởi động)
try {
  const r = await fetch(base + "/models", { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
} catch (e) {
  log(`Proxy GPT không chạy (${base}): ${e.message}. Dừng, không vẽ gì.`);
  process.exit(2);
}
if (!existsSync(genImage)) { log("Không thấy gen-image.mjs: " + genImage); process.exit(2); }

let used = 0, ok = 0, fail = 0;
for (const m of todo) {
  const raw = resolve(rawDir, `${m.id}.png`);
  const out = resolve(slide, outRel(m));
  mkdirSync(dirname(raw), { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  used++;
  log(`Vẽ ${m.id} ...`);
  const g = spawnSync(process.execPath, [genImage, "--prompt", buildPrompt(m), "--out", raw, "--size", sizeOf(m)], { encoding: "utf8", timeout: 300000 });
  if (g.status !== 0 || !existsSync(raw)) {
    fail++;
    m.ghiChu = "lỗi vẽ: " + String(g.stderr || g.stdout || "").trim().slice(0, 200);
    log(`LỖI ${m.id}: ${m.ghiChu}`);
    save(mf);
    if (/401|403|429|login|quota|limit/i.test(m.ghiChu)) { log("Có vẻ hết hạn mức hoặc mất đăng nhập, dừng."); break; }
    await sleep(sleepSec * 1000);
    continue;
  }
  const c = spawnSync("python", ["-I", resolve(here, "clean.py"), raw, out, m.loai === "nen" ? "scene" : "sticker"], { encoding: "utf8" });
  if (c.status !== 0) {
    fail++;
    m.ghiChu = "lỗi làm sạch: " + String(c.stderr).trim().split("\n").pop();
    log(`LỖI ${m.id}: ${m.ghiChu}`);
  } else {
    ok++;
    const info = JSON.parse(c.stdout.trim().split("\n").pop());
    m.trangThai = "da-ve";
    m.tep = outRel(m);
    m.kiemTra = info;
    delete m.ghiChu;
    log(`OK ${m.id} ${JSON.stringify(info)}`);
  }
  save(mf);
  if (used < todo.length) await sleep(sleepSec * 1000);
}
log(`Xong: ${ok} đạt, ${fail} lỗi, ${used} lượt GPT.`);
