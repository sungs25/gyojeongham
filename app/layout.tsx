import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '교정햄',
  description: '글을 넣으면 고친 곳과 이유를 보여주는 한국어 교정 서비스',
};

// 새로 고친 /write가 결과를 되찾는 동안 입력 화면이 잠깐 비치지 않게,
// 화면을 그리기 전에 "되찾는 중" 표시를 붙인다. 표시는 /write가 결과를 띄우거나 되찾기를 포기할 때 뗀다.
const RESUMING_SCRIPT = `try{if(location.pathname==='/write'&&sessionStorage.getItem('gyojeongham:job'))document.documentElement.dataset.resuming=''}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // 위 스크립트가 html에 표시를 붙이므로, 서버가 그린 것과 달라도 경고하지 않게 한다
    <html lang="ko" suppressHydrationWarning>
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
      <body>{children}</body>
    </html>
  );
}