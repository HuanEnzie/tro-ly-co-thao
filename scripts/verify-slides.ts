/**
 * Kiểm máy Làm slide: dựng 2 bộ mẫu bằng hình giả rồi soi XML theo luật cứng của cô.
 *   (a) Hoạt động góc – chủ đề Nghề nghiệp   (b) LQVT "Đếm và nối số lượng"   (c) đủ 17 mẫu   (d) dàn đề xuất cho mọi loại tiết
 * Chạy: npx tsx scripts/verify-slides.ts          (chỉ kiểm XML)
 *       PPT=1 npx tsx scripts/verify-slides.ts    (thêm: mở bằng PowerPoint COM, đếm slide/hiệu ứng)
 * File ra: tests/out/slide-*.pptx — không chụp màn hình, không chạy trình chiếu.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { buildDeckWithReport, kiemTraDeck, type BuildReport } from '../src/slides/build';
import { fakePng, type Shape } from '../src/slides/png';
import { deXuatDan, tachChuCai } from '../src/slides/outline';
import { TEMPLATE_NAMES } from '../src/slides/templates';
import { CHUA_CHON, type AssetResolver, type Deck, type LoaiTiet, type SlideSpec } from '../src/slides/types';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) { failed++; console.log(`✘ ${msg}`); } else console.log(`✔ ${msg}`);
};

// ---------- hình giả + nhạc ----------
const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'star'];
const COLORS: [number, number, number][] = [[229, 57, 53], [255, 112, 67], [67, 160, 71], [142, 36, 170], [251, 192, 45], [0, 137, 123]];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
async function loadMusic(): Promise<Uint8Array> {
  const f = 'E:/E Download/co-giao/skill-slide-mam-non/san-pham/Kham-pha-nghe-nong-v24.pptx';
  if (existsSync(f)) {
    const z = await JSZip.loadAsync(readFileSync(f)); // chỉ đọc
    const m = z.file('ppt/media/clap4s.mp3');
    if (m) return m.async('uint8array');
  }
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, ...new Array(2000).fill(0)]);
}
const music = await loadMusic();
const resolver: AssetResolver = id => {
  if (id.startsWith('nhac')) return { data: music, w: 0, h: 0, mime: 'audio/mpeg' };
  if (id === 'thieu-hinh') return null;
  const h = hash(id);
  return { data: fakePng(SHAPES[h % 4], COLORS[h % COLORS.length], 160, h % 5 === 0 ? 110 : 160), w: 160, h: h % 5 === 0 ? 110 : 160 };
};

// ---------- hai bộ mẫu ----------
const base = { lop: '5 – 6 tuổi số 1', giaoVien: 'Từ Thị Thảo', truong: 'Trường Mầm non Võ Cường', donViChuQuan: 'UBND PHƯỜNG VÕ CƯỜNG' };
const deckGoc: Deck = {
  title: 'Hoạt động góc – Chủ đề Nghề nghiệp', chuDe: 'Nghề nghiệp', tacGia: 'Từ Thị Thảo',
  slides: [
    { template: 'mo-dau', tenHoatDong: 'Hoạt động góc', loaiTiet: 'Hoạt động', chuDe: 'Nghề nghiệp', ...base, assets: { nhanVat: 'be-gai', trangTri: 'be-trai' } },
    { template: 'thoa-thuan', cacDieu: ['Chơi đoàn kết, không tranh giành đồ chơi', 'Chơi xong cất đồ chơi gọn gàng', 'Nói nhỏ, nhẹ nhàng khi chơi'], music: { id: 'nhac-thoa-thuan', title: 'Nhạc nền' } },
    {
      template: 'goc', goc: [
        { ten: 'Góc phân vai', hinh: 'bac-si', hoatDong: ['Bác sĩ khám bệnh', 'Cô giáo dạy học', 'Bán hàng'] },
        { ten: 'Góc xây dựng', hinh: 'cong-truong', hoatDong: ['Xây công trình', 'Xây vườn rau'] },
        { ten: 'Góc tạo hình', hinh: 'but-mau', hoatDong: ['Vẽ dụng cụ nghề nông', 'Nặn các loại quả', 'Xé dán'] },
        { ten: 'Góc học tập', hinh: 'sach', hoatDong: ['Nối số lượng', 'Làm bài tập toán', 'Tô chữ cái'] },
        { ten: 'Góc thư viện', hinh: 'ke-sach', hoatDong: ['Xem sách về nghề nghiệp', 'Kể chuyện theo tranh'] },
      ],
    },
    { template: 'qua-trinh-choi', hinh: 'cac-be-choi', music: { id: 'nhac-qua-trinh', title: 'Nhạc nền quá trình chơi', vol: 0.5 } },
    { template: 'nhan-xet', anhSanPham: ['sp-1', 'sp-2', 'sp-3', 'thieu-hinh'], loiKhen: ['Các con chơi đoàn kết', 'Bạn nào cũng làm việc chăm chỉ', 'Sản phẩm rất đẹp'] },
    { template: 'ket-thuc', assets: { nhanVat: 'be-gai', trangTri: 'be-trai' } },
  ],
};
const deckLqvt: Deck = {
  title: 'LQVT – Đếm và nối số lượng', chuDe: 'Nghề nghiệp', tacGia: 'Từ Thị Thảo',
  slides: [
    { template: 'mo-dau', tenHoatDong: 'Đếm và nối số lượng', loaiTiet: 'Làm quen với toán', chuDe: 'Nghề nghiệp', ...base },
    { template: 'gioi-thieu', tieuDe: 'Đếm và nối số lượng', phuDe: 'Làm quen với toán', hinh: 'bac-nong-dan' },
    { template: 'thoa-thuan', cacDieu: ['Nghe hiệu lệnh của cô', 'Chơi đúng luật'] },
    { template: 'dem-noi-so-luong', nhom: [{ hinh: 'cu-ca-rot', soLuong: 3 }, { hinh: 'cai-cuoc', soLuong: 5 }, { hinh: 'bap-ngo', soLuong: 7 }, { hinh: 'qua-cam', soLuong: 9 }], thuTuSo: [2, 0, 3, 1] },
    { template: 'ai-nhanh-hon', cauHoi: 'Nhóm nào có 5 dụng cụ nghề nông?', lua: [{ nhan: 'Nhóm 1', hinh: 'nhom-1' }, { nhan: 'Nhóm 2', hinh: 'nhom-2' }, { nhan: 'Nhóm 3', hinh: 'nhom-3' }], dung: 1 },
    { template: 'rung-chuong-vang', soCau: 1, tongCau: 2, cauHoi: 'Đâu là dụng cụ nghề nông?', dapAn: [{ nhan: 'Ống nghe', hinh: 'ong-nghe' }, { nhan: 'Cái cuốc', hinh: 'cai-cuoc', dung: true }, { nhan: 'Cái chảo', hinh: 'chao' }, { nhan: 'Hộp phấn', hinh: 'phan' }] },
    { template: 'nhan-xet', anhSanPham: ['sp-1', 'sp-2'], loiKhen: ['Các con đếm rất giỏi'] },
    { template: 'ket-thuc' },
  ],
};
const deckTatCa: Deck = {
  title: 'Đủ 17 mẫu', chuDe: 'Nghề nghiệp', slides: [
    deckGoc.slides[0], deckGoc.slides[1], { template: 'gioi-thieu', tieuDe: 'Khám phá nghề nông', phuDe: 'KPXH', hinh: 'bac-nong-dan' },
    { template: 'quan-sat', tieuDe: 'Bác nông dân', hinh: ['qs-1', 'qs-2', 'qs-3'], cauHoi: ['Đây là ai?', 'Bác đang làm gì?', 'Bác dùng dụng cụ gì?'] },
    deckLqvt.slides[5],
    { template: 'rung-chuong-vang', soCau: 7, tongCau: 7, cauHoi: 'Hãy sắp xếp quy trình trồng trọt của bác nông dân?', dapAn: [], dapAnMo: 'Làm đất → Gieo trồng → Chăm sóc → Thu hoạch' },
    deckLqvt.slides[4],
    { template: 'ghep-doi', tieuDe: 'Ghép đôi nghề – dụng cụ', cap: [{ trai: { hinh: 'bac-si' }, phai: { hinh: 'ong-nghe', nhan: 'Ống nghe' } }, { trai: { hinh: 'bac-nong-dan' }, phai: { hinh: 'cai-cuoc', nhan: 'Cái cuốc' } }, { trai: { hinh: 'co-giao' }, phai: { hinh: 'phan', nhan: 'Phấn' } }, { trai: { hinh: 'dau-bep' }, phai: { hinh: 'chao', nhan: 'Cái chảo' } }] },
    deckLqvt.slides[3],
    { template: 'tim-chu', chu: 'ô', cacTu: [{ tu: 'cô giáo', hinh: 'co-giao' }, { tu: 'bác sĩ', hinh: 'bac-si' }, { tu: 'công nhân', hinh: 'cong-nhan' }, { tu: 'nón lá', hinh: 'non-la' }] },
    { template: 'tho-truyen', tenBai: 'Hạt gạo làng ta', tacGia: 'Trần Đăng Khoa', doan: [{ hinh: 'tranh-1', chu: 'Hạt gạo làng ta\nCó vị phù sa' }, { hinh: 'tranh-2', chu: 'Của sông Kinh Thầy\nCó hương sen thơm' }, { hinh: 'tranh-3', chu: 'Có lời mẹ hát\nNgọt bùi hôm nay' }] },
    { template: 'am-nhac', tenBai: 'Lớn lên cháu lái máy cày', tacGia: 'Nhạc và lời: Hoàng Văn Yến', kieu: 'day-hat', loi: ['Lớn lên cháu lái máy cày', 'Cày đất ruộng này', 'Lúa vàng đầy đồng'], music: { id: 'nhac-bai-hat', title: 'Bài hát' }, assets: { nhanVat: 'be-trai' } },
    { template: 'tao-hinh', de: 'Vẽ dụng cụ nghề nông', tranhMau: ['mau-1', 'mau-2', 'mau-3', 'mau-4'], cacBuoc: [{ chu: 'Vẽ hình cái cuốc' }, { chu: 'Vẽ thêm cán và lưỡi', hinh: 'buoc-2' }, { chu: 'Tô màu' }] },
    { template: 'the-duc', tenBai: 'Bật xa 50 cm', doiHinh: 'vong-tron', soTre: 12, cacPhan: [{ phan: 'Khởi động', noiDung: 'Đi, chạy các kiểu chân' }, { phan: 'Trọng động', noiDung: 'Bật xa 50 cm; trò chơi Kéo co' }, { phan: 'Hồi tĩnh', noiDung: 'Đi nhẹ nhàng, hít thở' }] },
    deckGoc.slides[2], deckGoc.slides[3], deckGoc.slides[4], deckGoc.slides[5],
  ],
};
// mỗi mẫu phải có mặt trong bộ "đủ 17 mẫu"
const duMau = new Set(deckTatCa.slides.map(s => s.template));

const LOAI: LoaiTiet[] = ['KPKH', 'KPXH', 'LQVT', 'LQCC', 'THO', 'TRUYEN', 'AM-NHAC', 'TAO-HINH', 'THE-DUC', 'HOAT-DONG-GOC'];
const INFO_MAU = {
  buoc1: '- Cô cho trẻ quan sát hình ảnh bác nông dân\n- Bác nông dân làm nghề gì?\n- Bác dùng dụng cụ gì?',
  buoc2: '- Đâu là dụng cụ nghề nông?\n- Sản phẩm của nghề nông là gì?\n- Góc phân vai: bác sĩ khám bệnh, bán hàng',
  buoc3: '- Trò chơi: Ai nhanh hơn',
};

// ---------- soi XML ----------
const hue = (hex: string) => {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return { h: 0, s: 0, v: mx };
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: d / mx, v: mx };
};
const laXanhDuong = (hex: string) => { const { h, s, v } = hue(hex); return h >= 190 && h <= 262 && s >= 0.2 && v >= 0.2; };
const ID_RE = /<p:cNvPr id="(\d+)"/g;
const GROUP_RE = /<p:cTn id="\d+" fill="hold"><p:stCondLst><p:cond delay="indefinite"\/>/g;
const fillOf = (xml: string, name: string) => new RegExp(`name="${name}"[\\s\\S]*?<\\/a:prstGeom><a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"`).exec(xml)?.[1]?.toUpperCase();

interface XmlStat { effects: number[] }
async function kiemXml(ten: string, buf: ArrayBuffer, rep: BuildReport, deck: Deck): Promise<XmlStat> {
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);
  const slideFiles = files.filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/\d+/)! - +b.match(/\d+/)!);
  ok(slideFiles.length === deck.slides.length, `${ten}: có ${slideFiles.length}/${deck.slides.length} slide`);
  const pres = await zip.file('ppt/presentation.xml')!.async('string');
  ok(/<p:sldSz cx="12192000" cy="6858000"\/>/.test(pres), `${ten}: khổ 13,333 × 7,5 inch`);
  const theme = await zip.file('ppt/theme/theme1.xml')!.async('string');
  ok(/<a:majorFont><a:latin typeface="Segoe UI Black"/.test(theme) && /<a:minorFont><a:latin typeface="Segoe UI"/.test(theme), `${ten}: phông chủ đề Segoe UI Black / Segoe UI`);
  const themeColors = [...theme.matchAll(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/g)].flatMap(m => [...m[0].matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)].map(x => x[1]));
  ok(!themeColors.some(laXanhDuong), `${ten}: bảng màu chủ đề không có xanh dương`);
  const rels = await Promise.all(files.filter(f => f.endsWith('.rels')).map(f => zip.file(f)!.async('string')));
  ok(!rels.some(r => /TargetMode="External"/.test(r) || /relationships\/hyperlink/.test(r)), `${ten}: không có siêu liên kết trong file`);

  const bad = { dupId: [] as string[], link: [] as string[], font: [] as string[], blue: [] as string[], click: [] as string[], music: [] as string[], eff: [] as string[], timing: [] as string[] };
  const fonts = new Set(['Segoe UI', 'Segoe UI Black']);
  const effects: number[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i])!.async('string');
    const w = `slide ${i + 1}`;
    // id không trùng
    const ids = [...xml.matchAll(ID_RE)].map(m => m[1]);
    if (new Set(ids).size !== ids.length) bad.dupId.push(w);
    // không hyperlink / nút bấm
    // <a:hlinkClick r:id="" action="ppaction://media"/> là dấu hiệu PowerPoint tự ghi cho đối tượng nhạc/video, không phải liên kết
    const xmlNoMedia = xml.replace(/<a:hlinkClick r:id="" action="ppaction:\/\/media"\/>/g, '');
    if (/hlinkClick|hlinkHover|interactiveSeq|evt="onClick"|evt="onMouse|<a:hlink|actionButton|action="ppaction/.test(xmlNoMedia)) bad.link.push(w);
    // phông
    for (const m of xml.matchAll(/typeface="([^"]*)"/g)) if (!fonts.has(m[1]) && m[1] !== '') bad.font.push(`${w}: ${m[1]}`);
    // màu
    for (const m of xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)) if (laXanhDuong(m[1])) bad.blue.push(`${w}: #${m[1]}`);
    if (/schemeClr/.test(xml)) bad.blue.push(`${w}: dùng schemeClr`);
    // thứ tự "tới"
    const timing = xml.slice(xml.indexOf('<p:timing>'));
    const hasTiming = xml.includes('<p:timing>');
    const spec = deck.slides[i];
    if (hasTiming !== (rep.slides[i].hieuUng > 0)) bad.timing.push(w);
    if (!hasTiming) { effects.push(0); continue; }
    const starts = [...timing.matchAll(GROUP_RE)].map(m => m.index!);
    const segs = starts.map((s, k) => timing.slice(s, starts[k + 1] ?? timing.indexOf('<p:prevCondLst>')));
    const nodeTypes = segs.map(sg => [...sg.matchAll(/nodeType="(\w+)"/g)].map(m => m[1]));
    const autoFirst = /^<p:cTn id="\d+" fill="hold"><p:stCondLst><p:cond delay="indefinite"\/><p:cond evt="onBegin"/.test(segs[0] ?? '');
    segs.forEach((_, k) => {
      const nt = nodeTypes[k];
      if (k === 0 && autoFirst) { if (nt.includes('clickEffect')) bad.click.push(`${w}: nhóm tự chạy có clickEffect`); }
      else if (nt[0] !== 'clickEffect') bad.click.push(`${w}: nhóm ${k} không mở bằng "tới"`);
      if (nt.slice(1).some(t => t !== 'withEffect')) bad.click.push(`${w}: nhóm ${k} có hiệu ứng ngoài withEffect`);
    });
    const nClick = (timing.match(/nodeType="clickEffect"/g) ?? []).length;
    if (nClick !== rep.slides[i].toi) bad.click.push(`${w}: ${nClick} lần tới ≠ ${rep.slides[i].toi} dự kiến`);
    if (/nodeType="afterEffect"/.test(timing)) bad.click.push(`${w}: có afterEffect`);
    effects.push((timing.match(/presetClass="(entr|exit|emph|path|mediacall)"/g) ?? []).length);
    // mọi spTgt trỏ tới shape có thật
    for (const m of timing.matchAll(/spid="(\d+)"/g)) if (!ids.includes(m[1])) bad.timing.push(`${w}: spid ${m[1]} không có shape`);
    // nhạc sau hình
    const pi = segs.findIndex(sg => sg.includes('cmd="playFrom(0.0)"'));
    const si = segs.findIndex(sg => sg.includes('cmd="stop"'));
    if (spec.music && rep.thieuNhac.length === 0) {
      if (pi < 1 || si <= pi) bad.music.push(`${w}: nhạc phải là "tới" phát rồi "tới" dừng, sau nhóm hình`);
      else {
        if (nodeTypes[pi][0] !== 'clickEffect' || nodeTypes[si][0] !== 'clickEffect') bad.music.push(`${w}: lệnh nhạc không nằm ở nhóm "tới"`);
        if (segs.slice(pi).some(sg => /presetClass="(entr|exit)"/.test(sg))) bad.music.push(`${w}: có hình hiện/mất sau khi nhạc đã phát`);
        if (segs[pi].includes('presetClass="entr"')) bad.music.push(`${w}: nhạc chung nhóm với hình`);
        if (/<p:audio><p:cMediaNode vol="\d+">/.test(timing) === false) bad.music.push(`${w}: thiếu nút nhạc (cMediaNode)`);
      }
      if (!/<p:pic>[\s\S]*?name="bgmusic"[\s\S]*?<a:audioFile/.test(xml)) bad.music.push(`${w}: shape nhạc không phải audioFile`);
    } else if (pi >= 0 || si >= 0) bad.music.push(`${w}: có lệnh nhạc mà slide không khai nhạc`);
    // màu đáp án Rung chuông vàng
    if (spec.template === 'rung-chuong-vang' && spec.dapAn.length) {
      const want = ['E53935', '8E24AA', '43A047', 'FBC02D'];
      spec.dapAn.forEach((_, k) => { const f = fillOf(xml, `chip${k}`); if (f !== want[k]) bad.blue.push(`${w}: ô đáp án ${k} màu ${f} ≠ ${want[k]}`); });
    }
    if (spec.template === 'ai-nhanh-hon') {
      const want = ['E53935', '8E24AA', '43A047', 'FBC02D'];
      spec.lua.forEach((_, k) => { const f = fillOf(xml, `chip${k}`); if (f !== want[k]) bad.blue.push(`${w}: ô ${k} màu ${f} ≠ ${want[k]}`); });
    }
  }
  const show = (a: string[]) => (a.length ? ` — ${a.slice(0, 4).join('; ')}` : '');
  ok(!bad.dupId.length, `${ten}: không có cNvPr id trùng${show(bad.dupId)}`);
  ok(!bad.link.length, `${ten}: không có hyperlink / nút bấm / bấm chuột${show(bad.link)}`);
  ok(!bad.click.length, `${ten}: mọi hiệu ứng thuộc nhóm "tới" (c:true) đúng chỗ${show(bad.click)}`);
  ok(!bad.timing.length, `${ten}: cây timing khớp shape${show(bad.timing)}`);
  ok(!bad.music.length, `${ten}: nhạc phát sau hình (tới = phát, tới = dừng)${show(bad.music)}`);
  ok(!bad.font.length, `${ten}: chỉ dùng phông Segoe UI / Segoe UI Black${show(bad.font)}`);
  ok(!bad.blue.length, `${ten}: không có màu xanh dương, ô đáp án đỏ/tím/xanh lá/vàng${show(bad.blue)}`);
  return { effects };
}

// ---------- chạy ----------
mkdirSync('tests/out', { recursive: true });
const outputs: { file: string; rep: BuildReport; stat: XmlStat; ten: string }[] = [];
async function buildAndCheck(file: string, deck: Deck, ten: string) {
  const err = kiemTraDeck(deck);
  ok(!err.length, `${ten}: kịch bản hợp lệ${err.length ? ' — ' + err.join('; ') : ''}`);
  const t0 = Date.now();
  const rep = await buildDeckWithReport(deck, resolver);
  writeFileSync(file, Buffer.from(rep.data));
  ok(rep.data.byteLength > 5000, `${ten}: dựng xong ${rep.soSlide} slide, ${(rep.data.byteLength / 1024).toFixed(0)} KB, ${Date.now() - t0} ms → ${file}`);
  const stat = await kiemXml(ten, rep.data, rep, deck);
  outputs.push({ file, rep, stat, ten });
  return rep;
}

const repGoc = await buildAndCheck('tests/out/slide-hoat-dong-goc-nghe-nghiep.pptx', deckGoc, '(a) Hoạt động góc');
ok(repGoc.thieuHinh.join() === 'thieu-hinh', '(a) hình thiếu trong thư viện → vẽ khung giữ chỗ, vẫn dựng được');
const repLq = await buildAndCheck('tests/out/slide-lqvt-dem-va-noi-so-luong.pptx', deckLqvt, '(b) LQVT');
ok(repLq.slides[3].toi === 4, '(b) slide nối số lượng: 4 lần "tới" = 4 đường nối');
ok(repLq.slides[5].toi === 1, '(b) Rung chuông vàng: đúng 1 lần "tới" để hiện đáp án');
ok(repGoc.slides[2].toi === 5, '(a) slide 5 góc: mỗi góc một lần "tới"');
ok(repGoc.slides[3].toi === 2, '(a) quá trình chơi: "tới" phát nhạc, "tới" dừng');
await buildAndCheck('tests/out/slide-du-17-mau.pptx', deckTatCa, '(c) đủ 17 mẫu');
ok(TEMPLATE_NAMES.every(t => duMau.has(t)), `(c) bộ kiểm có đủ ${TEMPLATE_NAMES.length} mẫu (${TEMPLATE_NAMES.filter(t => !duMau.has(t)).join(', ') || 'không thiếu'})`);

// luật tạo dàn
ok(tachChuCai('Làm quen chữ cái o, ô, ơ').join('') === 'oôơ', 'outline: tách chữ cái “o, ô, ơ” từ tên đề tài');
for (const loai of LOAI) {
  const deck = deXuatDan({ loaiTiet: loai, tenDeTai: loai === 'LQCC' ? 'Làm quen chữ cái o, ô, ơ' : 'Nghề nông', chuDe: 'Nghề nghiệp', ...INFO_MAU });
  const s: SlideSpec[] = deck.slides;
  ok(s[0].template === 'mo-dau' && s[s.length - 1].template === 'ket-thuc' && s.some(x => x.template === 'nhan-xet'), `outline ${loai}: có mở đầu, nhận xét, kết thúc (${s.map(x => x.template).join(' → ')})`);
  const rep = await buildAndCheck(`tests/out/slide-dan-${loai.toLowerCase()}.pptx`, deck, `(d) dàn ${loai}`);
  ok(rep.thieuHinh.length === 0, `(d) dàn ${loai}: hình giữ chỗ không đi hỏi thư viện`);
}
{
  const g = deXuatDan({ loaiTiet: 'HOAT-DONG-GOC', tenDeTai: 'Nghề nghiệp', chuDe: 'Nghề nghiệp', ...INFO_MAU });
  const goc = g.slides.find(x => x.template === 'goc');
  ok(goc && goc.template === 'goc' && goc.goc.length === 5 && goc.goc[0].hoatDong.join() === 'bác sĩ khám bệnh,bán hàng', 'outline góc: 5 góc, chép hoạt động từ bước của cô');
  ok(CHUA_CHON.length > 0, 'hình giữ chỗ có id riêng');
}

// ---------- PowerPoint COM ----------
if (process.env.PPT === '1') {
  console.log('\n— Mở bằng PowerPoint (COM, ẩn) —');
  const files = outputs.map(o => o.file);
  let json = '';
  try {
    json = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/pptx-check.ps1', '-Path', files.join('|')], { encoding: 'utf8', timeout: 600000 });
  } catch (e) { json = (e as { stdout?: string }).stdout ?? ''; console.log(String((e as Error).message).slice(0, 400)); }
  let res: { file: string; ok: boolean; error?: string; slideCount?: number; width?: number; height?: number; slides?: { effects: number; clicks: number; media: number }[] }[] = [];
  try { res = JSON.parse(json.slice(json.indexOf('['))); } catch { ok(false, 'PowerPoint: không đọc được kết quả JSON'); }
  writeFileSync('tests/out/pptx-check.json', JSON.stringify(res, null, 1));
  for (const o of outputs) {
    const r = res.find(x => x.file.replace(/\\/g, '/').endsWith(o.file));
    if (!r) { ok(false, `PowerPoint: ${o.ten}: không có kết quả`); continue; }
    ok(r.ok, `PowerPoint mở được ${o.ten}${r.error ? ' — ' + r.error : ''}`);
    if (!r.ok) continue;
    ok(r.slideCount === o.rep.soSlide, `PowerPoint ${o.ten}: ${r.slideCount}/${o.rep.soSlide} slide, khổ ${r.width}×${r.height} pt`);
    const eff = r.slides!.map(s => s.effects), want = o.stat.effects;
    ok(eff.join() === want.join(), `PowerPoint ${o.ten}: số hiệu ứng mỗi slide khớp XML (${eff.join(',')})${eff.join() === want.join() ? '' : ' ≠ ' + want.join(',')}`);
    const clicks = r.slides!.map(s => s.clicks);
    ok(clicks.join() === o.rep.slides.map(s => s.toi).join(), `PowerPoint ${o.ten}: số lần "tới" mỗi slide khớp (${clicks.join(',')})`);
  }
}

console.log(failed ? `\n${failed} kiểm tra chưa đạt` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
