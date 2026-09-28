import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// 회원 탈퇴. Supabase의 소프트 삭제를 쓴다.
// 계정 줄(auth.users)은 남고 이메일·전화번호는 가려지며, 닉네임 등 메타데이터와
// 소셜 계정 연결 정보가 지워진다. 원장·주문 기록은 거래기록 보존(5년)을 위해 그대로 둔다.
// 같은 소셜 계정으로 다시 로그인하면 새 계정으로 가입된다.
export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return Response.json({ error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId, true);
  if (error) {
    console.error('회원 탈퇴 실패', error);
    return Response.json({ error: '탈퇴를 처리하지 못했습니다.', code: 'SERVER' }, { status: 500 });
  }

  return Response.json({ ok: true });
}