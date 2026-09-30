'use client';

import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

// 카카오·구글 로그인 버튼. 두 회사의 버튼 규정을 따른다.
// - 카카오: 노란 바탕(#FEE500), 모서리 12px. 심볼과 문구는 카카오가 준 표준 버튼 파일에서 그대로 떼어 왔고,
//   바탕만 좌우로 늘렸다 (규정상 허용되는 방법)
// - 구글: 구글 버튼 생성기의 CSS(gsi-material-button)와 구글이 준 G 로고 그대로
export function LoginButtons() {
  async function signIn(provider: 'google' | 'kakao') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // 로그인이 끝나면 교정 화면으로 돌아간다
        redirectTo: `${window.location.origin}/auth/callback?next=/write`,
      },
    });
  }

  return (
    <>
      <button
        type="button"
        className="kakao-login"
        aria-label="카카오 로그인"
        onClick={() => signIn('kakao')}
      >
        <Image src="/login/kakao-login.svg" alt="" width={102} height={46} unoptimized />
      </button>
      <button type="button" className="gsi-material-button" onClick={() => signIn('google')}>
        <span className="gsi-material-button-state" />
        <span className="gsi-material-button-content-wrapper">
          <Image
            className="gsi-material-button-icon"
            src="/login/google-g.png"
            alt=""
            width={20}
            height={20}
            unoptimized
          />
          <span className="gsi-material-button-contents">Google 계정으로 로그인</span>
        </span>
      </button>
    </>
  );
}