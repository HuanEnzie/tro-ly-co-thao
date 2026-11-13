/** Mức độ lỗi: nặng (sai chương trình/ngày/quy định) – cần xem (nội dung, cấu trúc) – chính tả & trình bày */
export type Level = 'nang' | 'xem' | 'chinh-ta';

export const LEVEL_LABEL: Record<Level, string> = {
  nang: 'Lỗi nặng',
  xem: 'Cần xem',
  'chinh-ta': 'Chính tả, trình bày',
};

export interface Issue {
  rule: string;          // mã luật, vd "chuong-trinh.ten-tiet"
  level: Level;
  where: string;         // vd "Thứ ba – sáng – Hoạt động của cô"
  message: string;       // lỗi gì
  found?: string;        // đoạn chữ gốc bị lỗi (trích nguyên văn)
  fix?: string;          // đề xuất sửa
  source: 'luat' | 'ai';
}

export type DocKind = 'kh-ngay' | 'kh-tuan' | 'chuong-trinh' | 'khac';

export const KIND_LABEL: Record<DocKind, string> = {
  'kh-ngay': 'Kế hoạch ngày',
  'kh-tuan': 'Kế hoạch tuần',
  'chuong-trinh': 'Chương trình chủ đề',
  khac: 'Văn bản khác',
};

/** một buổi (sáng/chiều) trong kế hoạch ngày */
export interface Section {
  buoi: 'sáng' | 'chiều';
  tenLines: string[];    // tên hoạt động (cột 1, đã bỏ dòng trống)
  ten: string;           // tên gộp 1 dòng
  loai: string;          // "Loại tiết: CCKT"
  md: string[];
  cb: string[];
  co: string[];
  tre: string[];
}

export interface DayPlan {
  thu: string;           // "Thứ hai"
  thuSo: number;         // 2..6
  ngay: string | null;   // "23/11/2026"
  sang: Section;
  chieu: Section;
  col0: string[];        // nguyên cột 1 (để soát Nêu gương / Vệ sinh – Trả trẻ)
}

export interface WeekDay {
  thu: string;
  thuSo: number;
  ngay: string | null;
  hoc: string[];         // cột Hoạt động học
  chieu: string[];       // cột Hoạt động chiều
}

export interface ParsedDoc {
  kind: DocKind;
  title: string[];       // các đoạn tiêu đề phía trên bảng
  tuan: number | null;
  days: DayPlan[];       // kế hoạch ngày
  week: {                // kế hoạch tuần
    days: WeekDay[];
    donTre: string[];
    theDucSang: string[];
    ngoaiTroi: string[];
    goc: string[];
  } | null;
  headers: string[];     // chữ hàng tiêu đề bảng chính
  allLines: { where: string; text: string }[]; // mọi dòng chữ, kèm vị trí (cho luật chính tả)
  footer: string[];      // đoạn văn + bảng ký tên sau bảng chính
}

/** chương trình chủ đề theo tuần (lấy từ file "CHƯƠNG TRÌNH HỌC CĐ …") */
export interface ProgramWeek {
  tuan: number;
  nhanh: string;         // "Nghề sản xuất"
  khoang: string;        // "(từ 23/11 đến 27/11/ 2026)"
  days: Record<number, { sang: string; chieu: string }>; // 2..6
  coA?: string;
  coB?: string;
}
export interface Program {
  chuDe: string;
  weeks: ProgramWeek[];
}
