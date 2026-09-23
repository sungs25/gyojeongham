import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '교정햄',
  description: '글을 넣으면 고친 곳과 이유를 보여주는 한국어 교정 서비스',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko">
      <head>
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