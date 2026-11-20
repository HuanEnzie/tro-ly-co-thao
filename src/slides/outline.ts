/**
 * Đề xuất dàn slide mặc định theo loại tiết — chỉ dùng luật, không AI.
 * Đầu vào lấy từ KH ngày (loại tiết, tên đề tài, các bước HĐ 1/2/3 dạng chuỗi).
 * Chữ trong slide chỉ CHÉP từ các bước của cô; chỗ chưa có thì để chữ giữ chỗ trong ngoặc cô tự sửa.
 */
import { CHUA_CHON, type Deck, type DoiHinh, type Goc, type LoaiTiet, type SlideSpec } from './types';

export interface HoatDongInfo {
  loaiTiet: LoaiTiet;
  /** tên đề tài, vd "Nghề nông", "Làm quen chữ cái o, ô, ơ" */
  tenDeTai: string;
  chuDe: string;
  /** các bước HĐ 1/2/3 như trong KH ngày (nhiều dòng, dòng bắt đầu bằng - hoặc + được) */
  buoc1?: string;
  buoc2?: string;
  buoc3?: string;
  lop?: string;
  giaoVien?: string;
  truong?: string;
  donViChuQuan?: string;
}

const TEN_TIET: Record<LoaiTiet, string> = {
  KPKH: 'KHÁM PHÁ KHOA HỌC', KPXH: 'KHÁM PHÁ XÃ HỘI', LQVT: 'LÀM QUEN VỚI TOÁN', LQCC: 'LÀM QUEN CHỮ CÁI',
  THO: 'THƠ', TRUYEN: 'TRUYỆN', 'AM-NHAC': 'ÂM NHẠC', 'TAO-HINH': 'TẠO HÌNH', 'THE-DUC': 'THỂ DỤC', 'HOAT-DONG-GOC': 'HOẠT ĐỘNG GÓC',
};

/** tách chuỗi bước thành các dòng sạch (bỏ gạch đầu dòng, dòng trống) */
export function tachDong(s?: string): string[] {
  return (s ?? '').split(/\r?\n/).map(l => l.replace(/^\s*[-+•*–]+\s*/, '').trim()).filter(Boolean);
}
const laCauHoi = (l: string) => /\?\s*$/.test(l);
const gomNhom = <T,>(a: T[], k: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += k) o.push(a.slice(i, i + k)); return o; };

function doiHinhTu(text: string): DoiHinh {
  const t = text.toLowerCase();
  if (/vòng tròn/.test(t)) return 'vong-tron';
  if (/hai hàng|2 hàng/.test(t)) return 'hai-hang';
  if (/hàng dọc/.test(t)) return 'hang-doc';
  if (/hình chữ nhật|3 hàng|ba hàng|4 hàng|bốn hàng/.test(t)) return 'hinh-chu-nhat';
  return 'hang-ngang';
}

/** chữ cái cần tìm trong tên đề tài ("chữ cái o, ô, ơ" → ['o','ô','ơ']) */
export function tachChuCai(ten: string): string[] {
  const m = ten.match(/ch[ữu]\s*c[áa]i\s+(.+)$/i) ?? ten.match(/:\s*(.+)$/);
  const part = (m ? m[1] : ten).replace(/[.]/g, '');
  const out = [...part.matchAll(/(?:^|[\s,;/-])([A-Za-zÀ-ỹĐđ])(?=$|[\s,;/-])/g)].map(x => x[1].toLowerCase());
  return [...new Set(out)];
}

const GOC_MAC_DINH = ['Góc phân vai', 'Góc xây dựng', 'Góc tạo hình', 'Góc học tập', 'Góc thư viện'];

export function deXuatDan(h: HoatDongInfo): Deck {
  const ten = TEN_TIET[h.loaiTiet];
  const b1 = tachDong(h.buoc1), b2 = tachDong(h.buoc2), b3 = tachDong(h.buoc3);
  const slides: SlideSpec[] = [];
  const moDau: SlideSpec = {
    template: 'mo-dau', tenHoatDong: h.loaiTiet === 'HOAT-DONG-GOC' ? ten : h.tenDeTai, loaiTiet: h.loaiTiet === 'HOAT-DONG-GOC' ? 'Hoạt động' : ten, chuDe: h.chuDe,
    lop: h.lop ?? '5 – 6 tuổi số 1', giaoVien: h.giaoVien ?? 'Từ Thị Thảo', truong: h.truong ?? 'Trường Mầm non Võ Cường', donViChuQuan: h.donViChuQuan ?? 'UBND PHƯỜNG VÕ CƯỜNG',
  };
  slides.push(moDau);
  const thoaThuan = (cac: string[]): SlideSpec => ({ template: 'thoa-thuan', tieuDe: 'THỎA THUẬN CHƠI', cacDieu: cac });
  const luatChoi = ['Nghe hiệu lệnh của cô', 'Chơi đúng luật, trung thực', 'Chơi vui vẻ, đoàn kết'];
  const choDapAn = (cauHoi: string, i: number, n: number): SlideSpec => ({
    template: 'rung-chuong-vang', soCau: i + 1, tongCau: n, cauHoi,
    dapAn: [{ nhan: '(đáp án 1)', hinh: CHUA_CHON, dung: true }, { nhan: '(đáp án 2)', hinh: CHUA_CHON }, { nhan: '(đáp án 3)', hinh: CHUA_CHON }],
  });
  const tenTroChoi = [...b3, ...b2, ...b1].find(l => /trò chơi/i.test(l));

  switch (h.loaiTiet) {
    case 'KPKH':
    case 'KPXH': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      const cauQS = b1.filter(laCauHoi).slice(0, 3);
      slides.push({ template: 'quan-sat', tieuDe: h.tenDeTai, hinh: [CHUA_CHON, CHUA_CHON], cauHoi: cauQS.length ? cauQS : ['(câu hỏi đàm thoại)'] });
      if (h.loaiTiet === 'KPXH') slides.push({
        template: 'ghep-doi', tieuDe: 'GHÉP ĐÔI',
        cap: [0, 1, 2].map(() => ({ trai: { hinh: CHUA_CHON }, phai: { hinh: CHUA_CHON } })),
      });
      slides.push(thoaThuan(luatChoi));
      const cauRung = b2.filter(laCauHoi);
      const nRung = Math.max(2, Math.min(7, cauRung.length));
      for (let i = 0; i < nRung; i++) slides.push(choDapAn(cauRung[i] ?? '(câu hỏi ' + (i + 1) + ')', i, nRung));
      slides.push({ template: 'ai-nhanh-hon', cauHoi: tenTroChoi ?? '(câu hỏi trò chơi)', lua: [{ nhan: '(lựa chọn 1)', hinh: CHUA_CHON }, { nhan: '(lựa chọn 2)', hinh: CHUA_CHON }, { nhan: '(lựa chọn 3)', hinh: CHUA_CHON }], dung: 0 });
      break;
    }
    case 'LQVT': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      slides.push(thoaThuan(luatChoi));
      slides.push({ template: 'dem-noi-so-luong', tieuDe: 'ĐẾM VÀ NỐI SỐ LƯỢNG', nhom: [{ hinh: CHUA_CHON, soLuong: 2 }, { hinh: CHUA_CHON, soLuong: 3 }, { hinh: CHUA_CHON, soLuong: 5 }] });
      slides.push({ template: 'ai-nhanh-hon', cauHoi: tenTroChoi ?? '(câu hỏi trò chơi)', lua: [{ nhan: '(lựa chọn 1)', hinh: CHUA_CHON }, { nhan: '(lựa chọn 2)', hinh: CHUA_CHON }, { nhan: '(lựa chọn 3)', hinh: CHUA_CHON }], dung: 0 });
      break;
    }
    case 'LQCC': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      const chu = tachChuCai(h.tenDeTai);
      for (const ch of chu.length ? chu : ['a']) slides.push({ template: 'tim-chu', chu: ch, cacTu: [{ tu: `(từ có ${ch})`, hinh: CHUA_CHON }, { tu: `${ch}…`, hinh: CHUA_CHON }, { tu: '(từ khác)', hinh: CHUA_CHON }] });
      slides.push(thoaThuan(luatChoi));
      break;
    }
    case 'THO':
    case 'TRUYEN': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      const noiDung = b1.filter(l => !laCauHoi(l));
      const doan = noiDung.length ? gomNhom(noiDung, h.loaiTiet === 'THO' ? 4 : 2).map(g => ({ hinh: CHUA_CHON, chu: g.join(h.loaiTiet === 'THO' ? '\n' : ' ') })) : [{ hinh: CHUA_CHON, chu: '(lời đoạn 1)' }];
      gomNhom(doan, 3).forEach(g => slides.push({ template: 'tho-truyen', tenBai: h.tenDeTai, doan: g }));
      const cau = [...b1, ...b2].filter(laCauHoi).slice(0, 4);
      slides.push({ template: 'quan-sat', tieuDe: 'ĐÀM THOẠI', hinh: [CHUA_CHON], cauHoi: cau.length ? cau : ['(câu hỏi đàm thoại)'] });
      break;
    }
    case 'AM-NHAC': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      slides.push({ template: 'am-nhac', tenBai: h.tenDeTai, kieu: 'day-hat', loi: ['(lời bài hát — cô nhập)'] });
      slides.push({ template: 'am-nhac', tenBai: tenTroChoi ?? 'Trò chơi âm nhạc', kieu: 'tro-choi', loi: ['(luật chơi / lời bài hát)'] });
      break;
    }
    case 'TAO-HINH': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      slides.push({ template: 'quan-sat', tieuDe: 'XEM TRANH MẪU', hinh: [CHUA_CHON, CHUA_CHON, CHUA_CHON], cauHoi: b1.filter(laCauHoi).slice(0, 3).length ? b1.filter(laCauHoi).slice(0, 3) : ['(câu hỏi đàm thoại)'] });
      const buoc = (b2.length ? b2 : ['(bước 1)', '(bước 2)', '(bước 3)']).slice(0, 5).map(chu => ({ chu }));
      slides.push({ template: 'tao-hinh', de: h.tenDeTai, tranhMau: [CHUA_CHON, CHUA_CHON, CHUA_CHON], cacBuoc: buoc });
      slides.push({ template: 'nhan-xet', tieuDe: 'TRƯNG BÀY SẢN PHẨM', anhSanPham: [CHUA_CHON, CHUA_CHON, CHUA_CHON], loiKhen: ['(lời nhận xét)'] });
      break;
    }
    case 'THE-DUC': {
      slides.push({ template: 'gioi-thieu', tieuDe: h.tenDeTai, phuDe: ten });
      const cacPhan = [
        { phan: 'Khởi động', noiDung: b1.join('; ') || '(nội dung khởi động)' },
        { phan: 'Trọng động', noiDung: b2.join('; ') || '(vận động cơ bản, trò chơi vận động)' },
        { phan: 'Hồi tĩnh', noiDung: b3.join('; ') || '(hồi tĩnh)' },
      ];
      slides.push({ template: 'the-duc', tenBai: h.tenDeTai, doiHinh: doiHinhTu([...b1, ...b2].join(' ')), cacPhan, soTre: 12 });
      break;
    }
    case 'HOAT-DONG-GOC': {
      slides.push(thoaThuan(['Chơi đoàn kết, không tranh giành đồ chơi', 'Chơi xong cất đồ chơi gọn gàng', 'Nói nhỏ, nhẹ nhàng khi chơi']));
      const goc: Goc['goc'] = GOC_MAC_DINH.map((t, i) => {
        const dong = b2.find(l => l.toLowerCase().startsWith(t.toLowerCase()));
        const hd = dong ? dong.replace(/^[^:]*:\s*/, '').split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];
        return { ten: t, hoatDong: hd.length ? hd.slice(0, 5) : [`(hoạt động góc ${i + 1})`] };
      });
      slides.push({ template: 'goc', goc });
      slides.push({ template: 'qua-trinh-choi', hinh: CHUA_CHON });
      slides.push({ template: 'nhan-xet', tieuDe: 'NHẬN XÉT – KHEN', anhSanPham: [CHUA_CHON, CHUA_CHON, CHUA_CHON], loiKhen: ['(lời nhận xét)'] });
      break;
    }
  }
  if (!slides.some(s => s.template === 'nhan-xet')) slides.push({ template: 'nhan-xet', anhSanPham: [CHUA_CHON, CHUA_CHON], loiKhen: ['(lời khen, nhận xét)'] });
  slides.push({ template: 'ket-thuc' });
  return { title: `${ten} – ${h.tenDeTai}`, chuDe: h.chuDe, tacGia: h.giaoVien ?? 'Từ Thị Thảo', slides };
}
