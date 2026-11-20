import { useMemo } from 'react';
import { countLevels } from './engine/checker';
import Review from './ui/pages/Review';
import { Compose, Library, ProgramPage, Slides } from './ui/pages/Stubs';
import Home from './ui/pages/Home';
import { go, useRoute } from './ui/router';
import { SessionProvider, useSession } from './ui/session';
import Shell from './ui/Shell';

function Routes() {
  const route = useRoute();
  const { items } = useSession();
  // số lỗi nặng của các file đang mở, hiện trên mục Soát
  const badge = useMemo(() => ({ soat: items.reduce((n, i) => n + countLevels(i.report.issues).nang, 0) }), [items]);
  return (
    <Shell route={route} badge={badge}>
      {route === 'tuan' && <Home />}
      {route === 'soat' && <Review />}
      {route === 'soan' && <Compose />}
      {route === 'slide' && <Slides />}
      {route === 'thu-vien' && <Library />}
      {route === 'chuong-trinh' && <ProgramPage />}
    </Shell>
  );
}

export default function App() {
  // nạp file xong thì chuyển sang trang Soát & sửa
  return <SessionProvider onFilesAdded={() => go('soat')}><Routes /></SessionProvider>;
}
