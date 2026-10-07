import type { Metadata, Viewport } from 'next';
import './globals.css';
import { pixelFont } from './fonts';
import { SiteFooter } from './components/SiteFooter';

export const metadata: Metadata = {
    // 미리보기 그림 같은 상대 주소를 이 주소 기준의 절대 주소로 바꾼다
    metadataBase: new URL('https://gyojeongham.com'),
    title: '교정햄',
    description: '글을 넣으면 고친 곳과 이유를 보여주는 한국어 교정 서비스',
    // 카카오톡·SNS에 주소를 붙였을 때 뜨는 미리보기. 그림은 app/opengraph-image.png
    openGraph: {
      title: '교정햄 — 고친 곳마다, 이유까지.',
      description: '맞춤법부터 군더더기·번역투·어색한 어순까지, 문단마다 고치고 왜 고쳤는지 적어 드립니다.',
      siteName: '교정햄',
      locale: 'ko_KR',
      type: 'website',
    },
};

   // 모바일 브라우저의 주소창 색을 바탕색(크림)에 맞춘다
  export const viewport: Viewport = {
    themeColor: '#fff8ec',
  };

// 새로 고친 /write가 결과를 되찾는 동안 입력 화면이 잠깐 비치지 않게,
// 화면을 그리기 전에 "되찾는 중" 표시를 붙인다. 표시는 /write가 결과를 띄우거나 되찾기를 포기할 때 뗀다.
const RESUMING_SCRIPT = `try{if(location.pathname==='/write'&&sessionStorage.getItem('gyojeongham:job'))document.documentElement.dataset.resuming=''}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // 위 스크립트가 html에 표시를 붙이므로, 서버가 그린 것과 달라도 경고하지 않게 한다
    <html lang="ko" className={pixelFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: RESUMING_SCRIPT }} />
        {/* Pretendard 가변 다이나믹 서브셋: 화면에 쓰인 글자 묶음만 내려받는다 */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {/* 내용이 짧은 화면에서도 바닥글이 화면 맨 아래에 붙도록, 내용을 한 칸에 모아 늘린다 */}
        <div className="site-body">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}