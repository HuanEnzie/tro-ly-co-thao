import { CHUA_CHON, type SlideSpec, type TemplateName } from '../types';
import type { Ctx } from './common';
import { gioiThieu, ketThuc, moDau, nhanXet, thoaThuan } from './chung';
import { aiNhanhHon, ghepDoi, quanSat, rungChuongVang } from './kham-pha';
import { demNoiSoLuong, timChu } from './toan-chu';
import { amNhac, thoTruyen } from './van-hoc-nhac';
import { taoHinh, theDuc } from './tao-hinh-the-duc';
import { goc, quaTrinhChoi } from './goc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LAYOUTS: Record<TemplateName, (c: Ctx, d: any) => void> = {
  'mo-dau': moDau,
  'thoa-thuan': thoaThuan,
  'gioi-thieu': gioiThieu,
  'quan-sat': quanSat,
  'rung-chuong-vang': rungChuongVang,
  'ai-nhanh-hon': aiNhanhHon,
  'ghep-doi': ghepDoi,
  'dem-noi-so-luong': demNoiSoLuong,
  'tim-chu': timChu,
  'tho-truyen': thoTruyen,
  'am-nhac': amNhac,
  'tao-hinh': taoHinh,
  'the-duc': theDuc,
  goc,
  'qua-trinh-choi': quaTrinhChoi,
  'nhan-xet': nhanXet,
  'ket-thuc': ketThuc,
};

const IMG_KEYS = new Set(['hinh', 'nen', 'nhanVat', 'trangTri', 'anhSanPham', 'tranhMau']);

/** mọi id hình mà slide tham chiếu (không gồm nhạc) */
export function assetIds(spec: SlideSpec): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, key?: string): void => {
    if (typeof v === 'string') { if (key && IMG_KEYS.has(key) && v !== CHUA_CHON) out.add(v); return; }
    if (Array.isArray(v)) { v.forEach(x => walk(x, key)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'music') continue; walk(x, k); }
  };
  walk(spec);
  return [...out];
}

export const TEMPLATE_NAMES = Object.keys(LAYOUTS) as TemplateName[];
