/** Mô hình dữ liệu của máy soạn KH tuần / KH ngày. Chỉ là kiểu. */
import type { Kind } from './rules';

export type LoaiKH = 'kh-tuan' | 'kh-ngay';
/** 2 = thứ hai … 6 = thứ sáu */
export type Thu = 2 | 3 | 4 | 5 | 6;
export type Buoi = 'sáng' | 'chiều';

export interface ComposeRequest {
  tuan: number;
  loai: LoaiKH;
  /** chỉ soạn các thứ này (KH ngày); bỏ trống = cả tuần */
  ngay?: Thu[];
  /** file mẫu khung (.docx) – bản KH đã duyệt của tuần trước; giữ nguyên định dạng và bảng */
  mau: ArrayBuffer;
  /** giáo án cũ để chép lại hoạt động cùng tên đề tài */
  thamKhao?: ArrayBuffer[];
}

/** một bước = cặp cô–trẻ ngang hàng: co[i] ↔ tre[i] (cùng số đoạn; tre[i] = '' nếu trẻ không có việc riêng) */
export interface LessonStep {
  phan: string;     // tiêu đề phần (in đậm), vd "2. HĐ 2: Bài mới:", "a. Khởi động"
  co: string[];
  tre: string[];
}

export type NguonBai = 'tham-khao' | 'ai' | 'khung';

export interface LessonDraft {
  thu: number;
  buoi: Buoi;
  loaiTiet: string;      // "Loại tiết: CCKT" (hoặc "")
  tenDeTai: string;
  md: string[];          // mục đích yêu cầu, mỗi dòng 1 đoạn: "- Kiến thức: …"
  cb: string[];          // chuẩn bị: "* ĐD của cô:", "- …", "* ĐD của trẻ:", "- …"
  steps: LessonStep[];
  nguon?: NguonBai;
  /** vd "chép từ 5T1- KH NGÀY TUẦN 12.docx – Thứ ba sáng" */
  ghiChu?: string[];
}

export interface NameLine { text: string; bold: boolean }

/** khung chắc chắn của một buổi, do luật sinh ra từ chương trình */
export interface SlotFrame {
  buoi: Buoi;
  raw: string;               // nguyên văn ô chương trình
  tenLines: NameLine[];      // các dòng tên hoạt động (đã bỏ dòng "Loại tiết", "Nêu gương…")
  ten: string;               // tên gộp 1 dòng (để so với chương trình / giáo án cũ)
  tenDeTai: string;          // tên đề tài đã bỏ mã lĩnh vực ("Bật liên tục vào vòng")
  loaiTiet: string;
  kind: Kind;
  coBaiSoan: boolean;        // false: chỉ có tên (vd "Chơi ở các góc") – không soạn tiến hành
}

export interface DayFrame {
  thu: Thu;
  thuTen: string;            // "Thứ hai"
  ngay: string;              // "23/11/2026"
  sang: SlotFrame;
  chieu: SlotFrame;
  /** dòng cuối ngày: ["- Nêu gương", "- Vệ sinh - Trả trẻ"] */
  cuoiNgay: string[];
}

export interface WeekFrame {
  tuan: number;
  nhanh: string;
  tuNgay: string;            // "23/11/2026"
  denNgay: string;           // "27/11/2026"
  tuanChan: boolean;         // chẵn: HĐLĐ, lẻ: HĐVS
  days: DayFrame[];
  /** việc luật thấy lạ (chương trình lệch quy định…) – để hiện "Cần chị quyết" */
  canQuyet: string[];
}

/** nội dung đã soạn cho 1 buổi (khung + bài) */
export interface SlotContent { frame: SlotFrame; bai: LessonDraft | null }
export interface DayContent { frame: DayFrame; sang: SlotContent; chieu: SlotContent }

/** hàm gọi AI được truyền vào (Gemini ở máy chủ, bản giả khi test): trả chuỗi JSON */
export type GenerateFn = (req: { system: string; user: string; schema: Record<string, unknown> }) => Promise<string>;

export interface ComposeResult {
  docx: ArrayBuffer;
  frame: WeekFrame;
  days: DayContent[];
  /** việc cần cô quyết / đối chiếu */
  canQuyet: string[];
  /** đếm nguồn từng buổi: bao nhiêu buổi chép từ giáo án cũ / AI / khung trống */
  nguon: Record<NguonBai, number>;
}
