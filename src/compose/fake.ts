/**
 * Bản AI GIẢ để test/chạy thử không cần key: trả JSON đúng khuôn từ khung luật
 * (điền mục đích yêu cầu chung chung; các chỗ nội dung riêng vẫn là "[Cô điền: …]"). Không gọi mạng.
 */
import { INPUT_MARK } from './ai';
import { coreOf, khungTiet, type Kind } from './rules';
import type { GenerateFn } from './types';

export const fakeGenerate: GenerateFn = async ({ user }) => {
  const input = JSON.parse(user.slice(user.indexOf(INPUT_MARK) + INPUT_MARK.length).split('\n')[0]) as { kieu_tiet: Kind; ten_de_tai: string };
  const k = khungTiet(input.kieu_tiet, input.ten_de_tai);
  const q = `“${coreOf(input.ten_de_tai)}”`;
  const md = [
    `- Kiến thức: Trẻ biết, hiểu nội dung ${q}.`,
    `- Kỹ năng: Rèn kỹ năng chú ý, ghi nhớ, trả lời rõ ràng, mạch lạc.`,
    `- Thái độ: Trẻ hứng thú, tích cực tham gia hoạt động.`,
  ];
  return JSON.stringify({ md, cb: k.cb, steps: k.steps });
};
