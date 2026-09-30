import localFont from 'next/font/local';

// 도트 한글 글꼴(갈무리11, OFL). 자주 쓰는 한글 2,350자와 영문·기호만 남겨 파일을 줄였다.
// 이름, 말풍선, 작은 이름표에 쓴다. 없는 글자는 뒤의 글꼴로 대신 그린다
export const pixelFont = localFont({
  src: [
    { path: './fonts/Galmuri11.woff2', weight: '400' },
    { path: './fonts/Galmuri11-Bold.woff2', weight: '700' },
  ],
  variable: '--font-pixel',
  fallback: ['Pretendard Variable', 'sans-serif'],
});

// 빨간 펜 손글씨(나눔손글씨 펜, OFL). 첫 화면 원고지에 쓰인 글자만 남겼다.
// 원고지의 손글씨 문구를 바꾸면 이 파일도 새 글자로 다시 만들어야 한다
export const penFont = localFont({
  src: './fonts/NanumPenScript-landing.woff2',
  weight: '400',
  variable: '--font-pen',
  fallback: ['cursive'],
});