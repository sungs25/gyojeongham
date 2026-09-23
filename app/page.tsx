import { redirect } from 'next/navigation';

// 첫 화면(랜딩)은 7단계에서 만든다. 그 전까지는 교정 화면으로 보낸다.
export default function Home() {
  redirect('/write');
}