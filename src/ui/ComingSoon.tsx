import { ReactNode } from 'react';

/** khung trống cho trang chưa làm; `children` là chỗ gắn phần sau */
export default function ComingSoon({ title, text }: { title: string; text: string }): ReactNode {
  return (
    <section className="soon" data-slot={title}>
      <h2>{title}</h2>
      <p><b>Đang làm.</b> {text}</p>
    </section>
  );
}
