/**
 * Mô hình kịch bản slide: Deck → SlideSpec (union theo mẫu `template`).
 * Hình chỉ tham chiếu theo id (thư viện hình do phần khác làm), máy dựng hỏi AssetResolver để lấy dữ liệu.
 */

/** Dữ liệu một hình/nhạc đã lấy ra từ thư viện. `data` là byte hoặc data URL (data:image/png;base64,…). */
export interface ResolvedAsset {
  data: ArrayBuffer | Uint8Array | string;
  /** kích thước điểm ảnh (để giữ tỉ lệ). Nhạc: bỏ qua. */
  w: number;
  h: number;
  /** MIME nếu biết (image/png, image/jpeg, image/gif, audio/mpeg…). Không có thì đoán theo byte đầu. */
  mime?: string;
}
/** Trả null/undefined (hoặc ném lỗi) nếu không có hình: máy dựng vẽ khung giữ chỗ ghi tên id. */
export type AssetResolver = (id: string) => Promise<ResolvedAsset | null | undefined> | ResolvedAsset | null | undefined;

export interface MusicRef {
  /** id nhạc trong thư viện/nhạc của cô */
  id: string;
  /** 0–1, mặc định 0,5 */
  vol?: number;
  /** nhạc ngắn chỉ phát một lần (mặc định lặp đến khi bấm tới để dừng) */
  once?: boolean;
  /** tên bài (ghi vào ghi chú slide) */
  title?: string;
}

/** id giữ chỗ: chưa chọn hình (máy dựng vẽ khung "[chưa chọn hình]", không đi hỏi thư viện) */
export const CHUA_CHON = '__chua-chon__';

export type SlideRoles = {
  /** hình nền (jpg/png) */
  nen?: string;
  /** nhân vật/linh vật góc tiêu đề (chỉ nhân vật người/con vật mới có mặt) */
  nhanVat?: string;
  /** hình trang trí phụ */
  trangTri?: string;
};

export interface SlideBase {
  /** id tuỳ chọn để giao diện nhận ra slide */
  id?: string;
  /** vai trò hình dùng chung của slide (nền, linh vật…) */
  assets?: SlideRoles;
  /** nhạc phát bằng nút "tới" SAU khi hình đã hiện */
  music?: MusicRef;
  /** ghi chú trình chiếu cho cô */
  ghiChu?: string;
}

export interface MoDau extends SlideBase {
  template: 'mo-dau';
  /** tên hoạt động, vd "HOẠT ĐỘNG GÓC" */
  tenHoatDong: string;
  loaiTiet?: string;
  chuDe: string;
  lop: string;
  giaoVien: string;
  truong: string;
  /** dòng "UBND …" phía trên (tuỳ chọn) */
  donViChuQuan?: string;
}
export interface ThoaThuan extends SlideBase {
  template: 'thoa-thuan';
  tieuDe?: string;
  /** 2–5 điều thỏa thuận, mỗi điều hiện bằng một lần "tới" */
  cacDieu: string[];
}
export interface GioiThieu extends SlideBase {
  template: 'gioi-thieu';
  tieuDe: string;
  phuDe?: string;
  hinh?: string;
}
export interface QuanSat extends SlideBase {
  template: 'quan-sat';
  tieuDe: string;
  /** 1–3 hình */
  hinh: string[];
  /** câu hỏi đàm thoại, mỗi câu một lần "tới" */
  cauHoi: string[];
}
export interface DapAnRung {
  nhan: string;
  hinh?: string;
  dung?: boolean;
}
export interface RungChuongVang extends SlideBase {
  template: 'rung-chuong-vang';
  /** thứ tự câu, vd "CÂU 3/7" tự ghép từ soCau/tongCau */
  soCau?: number;
  tongCau?: number;
  cauHoi: string;
  /** 3–4 đáp án gán màu theo thứ tự Đỏ, Tím, Xanh lá, Vàng. Có đúng 1 đáp án dung:true */
  dapAn: DapAnRung[];
  /** câu hỏi mở (không có ô đáp án): chữ hiện ra khi "tới" */
  dapAnMo?: string;
}
export interface AiNhanhHon extends SlideBase {
  template: 'ai-nhanh-hon';
  cauHoi: string;
  /** 2–4 hình/đồ vật đánh số 1..n */
  lua: { hinh?: string; nhan: string }[];
  /** vị trí (từ 0) của đáp án đúng */
  dung: number;
}
export interface GhepDoi extends SlideBase {
  template: 'ghep-doi';
  tieuDe: string;
  /** 3–5 cặp: trái nối với phải. Cột phải được đảo vị trí (`thuTuPhai`) */
  cap: { trai: { hinh?: string; nhan?: string }; phai: { hinh?: string; nhan?: string } }[];
  /** thuTuPhai[i] = vị trí hiển thị ở cột phải của cặp thứ i (mặc định xoay vòng 1 bước) */
  thuTuPhai?: number[];
}
export interface DemNoiSoLuong extends SlideBase {
  template: 'dem-noi-so-luong';
  tieuDe?: string;
  /** 3–4 nhóm: hình lặp `soLuong` lần (1–10), nối với chữ số tương ứng */
  nhom: { hinh?: string; soLuong: number }[];
  /** thuTuSo[i] = vị trí hiển thị ở cột số của nhóm i (mặc định xoay vòng 1 bước) */
  thuTuSo?: number[];
}
export interface TimChu extends SlideBase {
  template: 'tim-chu';
  /** chữ cái cần tìm, vd "o" */
  chu: string;
  tieuDe?: string;
  /** 3–4 từ có kèm hình; từ nào chứa chữ thì được tô sáng khi "tới" */
  cacTu: { tu: string; hinh?: string }[];
}
export interface ThoTruyen extends SlideBase {
  template: 'tho-truyen';
  tenBai: string;
  tacGia?: string;
  /** 1–3 đoạn: tranh + chữ, mỗi đoạn một lần "tới" */
  doan: { hinh?: string; chu: string }[];
}
export interface AmNhac extends SlideBase {
  template: 'am-nhac';
  tenBai: string;
  tacGia?: string;
  kieu?: 'nghe-hat' | 'day-hat' | 'tro-choi';
  /** lời bài hát: mỗi phần tử một dòng */
  loi: string[];
  /** nhạc bắt buộc nên có; thiếu thì slide chỉ còn lời */
}
export interface TaoHinh extends SlideBase {
  template: 'tao-hinh';
  de: string;
  /** ít nhất 3 tranh mẫu */
  tranhMau: string[];
  /** các bước làm */
  cacBuoc: { chu: string; hinh?: string }[];
}
export type DoiHinh = 'hang-ngang' | 'hang-doc' | 'hai-hang' | 'vong-tron' | 'hinh-chu-nhat';
export interface TheDuc extends SlideBase {
  template: 'the-duc';
  tenBai: string;
  doiHinh: DoiHinh;
  /** các phần: khởi động / trọng động / hồi tĩnh… */
  cacPhan: { phan: string; noiDung: string }[];
  soTre?: number;
}
export interface Goc extends SlideBase {
  template: 'goc';
  tieuDe?: string;
  /** đúng 5 góc, mỗi góc một dải ngang + chip hoạt động */
  goc: { ten: string; hinh?: string; hoatDong: string[] }[];
}
export interface QuaTrinhChoi extends SlideBase {
  template: 'qua-trinh-choi';
  tieuDe?: string;
  /** 1 hình động (GIF) hoặc ảnh tĩnh */
  hinh: string;
  /** thường là nhạc dài; nên khai ở `music` */
}
export interface NhanXet extends SlideBase {
  template: 'nhan-xet';
  tieuDe?: string;
  /** 1–6 ảnh sản phẩm của trẻ */
  anhSanPham: string[];
  loiKhen: string[];
}
export interface KetThuc extends SlideBase {
  template: 'ket-thuc';
  loiChao?: string;
  loiCamOn?: string;
}

export type SlideSpec =
  | MoDau | ThoaThuan | GioiThieu | QuanSat | RungChuongVang | AiNhanhHon | GhepDoi
  | DemNoiSoLuong | TimChu | ThoTruyen | AmNhac | TaoHinh | TheDuc | Goc | QuaTrinhChoi
  | NhanXet | KetThuc;

export type TemplateName = SlideSpec['template'];

export interface Deck {
  title: string;
  chuDe: string;
  /** tuỳ chọn, ghi vào thuộc tính file */
  tacGia?: string;
  slides: SlideSpec[];
}

/** Loại tiết/hoạt động (phục vụ outline) */
export type LoaiTiet =
  | 'KPKH' | 'KPXH' | 'LQVT' | 'LQCC' | 'THO' | 'TRUYEN' | 'AM-NHAC' | 'TAO-HINH' | 'THE-DUC' | 'HOAT-DONG-GOC';
