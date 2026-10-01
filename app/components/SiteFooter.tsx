import Link from 'next/link';

// 모든 화면 맨 아래 바닥글. 약관 세 가지로 가는 링크.
// 사업자 정보(상호·대표·사업자등록번호·통신판매업 신고·주소·연락처)는 사업자등록 뒤 여기에 넣는다
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="footer-links">
        <Link href="/terms">이용약관</Link>
        {/* 개인정보 보호법 시행령 31조: 표준 명칭을 쓰고, 다른 링크와 구분되게 굵게 표시한다 */}
        <Link className="footer-privacy" href="/privacy">
          개인정보 처리방침
        </Link>
        <Link href="/refund">환불 정책</Link>
      </nav>
    </footer>
  );
}