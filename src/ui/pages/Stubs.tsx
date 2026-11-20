import ComingSoon from '../ComingSoon';
import { useSession } from '../session';
import { slots } from '../slots';

function useProps() {
  const { program, week, items } = useSession();
  return { program, week, items };
}

export function Compose() {
  const props = useProps();
  const Slot = slots.compose;
  return Slot ? <Slot {...props} /> : <ComingSoon title="Soạn thảo" text="Máy soạn kế hoạch tuần, kế hoạch ngày sẽ gắn ở đây." />;
}

export function Slides() {
  const props = useProps();
  const Slot = slots.slides;
  return Slot ? <Slot {...props} /> : <ComingSoon title="Slide" text="Máy làm slide cho bài giảng sẽ gắn ở đây." />;
}

export function Library() {
  const props = useProps();
  const Slot = slots.library;
  return Slot ? <Slot {...props} /> : <ComingSoon title="Thư viện" text="Mọi file theo tuần, chủ đề và lịch sử phiên bản sẽ gắn ở đây." />;
}

export function ProgramPage() {
  const props = useProps();
  const { pickProgram } = useSession();
  const { program } = props;
  const Slot = slots.program;
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Chương trình</h1>
        <p className="sub">Bảng chủ đề dùng để đối chiếu tên tiết, ngày, tuần.</p>
      </header>
      <section className="card">
        <h2>{program.chuDe || 'Chương trình chủ đề'}</h2>
        <p className="meta">{program.weeks.map(w => `Tuần ${w.tuan}: ${w.nhanh}`).join(' · ')}</p>
        <div className="actions"><button className="btn" onClick={pickProgram}>Nạp chương trình khác (.docx)</button></div>
      </section>
      {Slot ? <Slot {...props} /> : <ComingSoon title="Cây chương trình" text="Cây chủ đề → nhánh → tuần → ngày, nhập và sửa chương trình sẽ gắn ở đây." />}
    </div>
  );
}
