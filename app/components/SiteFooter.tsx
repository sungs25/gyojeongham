import Link from 'next/link';

// 사이버몰 사업자 정보. 전자상거래법 10조①(상호·대표자, 주소, 전화번호·전자우편주소, 사업자등록번호, 이용약관)과
// 시행령 11조의4(호스팅서비스 제공자의 상호), 통신판매업 신고번호
const BUSINESS = {
  name: '교정햄',
  owner: '임성민',
  registrationNo: '593-15-03143',
  // 통신판매업 신고번호. 구청 처리가 끝나면 신고증에 적힌 번호를 그대로 넣는다
  mailOrderNo: null as string | null,
  address: '경기도 고양시 일산동구 강석로 110, 511동 1401호',
  phone: '0507-1340-0205',
  email: 'gyojeongham2@gmail.com',
  hosting: 'Vercel Inc.',
};

// 모든 화면 맨 아래 바닥글. 약관 세 가지로 가는 링크와 사업자 정보.
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
      <ul className="footer-biz">
        <li>상호 {BUSINESS.name}</li>
        <li>대표 {BUSINESS.owner}</li>
        <li>사업자등록번호 {BUSINESS.registrationNo}</li>
        <li>통신판매업 신고번호 {BUSINESS.mailOrderNo ?? '처리 중'}</li>
        <li>주소 {BUSINESS.address}</li>
        <li>
          전화 <a href={`tel:${BUSINESS.phone}`}>{BUSINESS.phone}</a>
        </li>
        <li>
          이메일 <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        </li>
        <li>호스팅 제공 {BUSINESS.hosting}</li>
      </ul>
    </footer>
  );
}