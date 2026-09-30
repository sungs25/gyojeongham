import Link from 'next/link';
import { SiteHeader } from '@/app/components/SiteHeader';
import { Hamster } from '@/app/components/Hamster';

// 없는 주소로 들어왔을 때 보이는 화면
export default function NotFound() {
  return (
    <div className="status-page">
      <SiteHeader />
      <main className="status-card">
        <Hamster scene="ready" scale={2} line="여기엔 아무것도 없어!" />
        <h1>찾는 화면이 없습니다</h1>
        <p>주소가 바뀌었거나 잘못 입력된 것 같습니다.</p>
        <div className="status-actions">
          <Link className="primary" href="/">
            첫 화면으로
          </Link>
          <Link className="ghost" href="/write">
            글 맡기기
          </Link>
        </div>
      </main>
    </div>
  );
}