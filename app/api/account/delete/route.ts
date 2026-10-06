import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PURCHASE_COLUMNS } from '@/lib/purchases';

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

  // 교정 중에는 탈퇴하지 않는다. 잡아 둔 씨앗이 묶음으로 돌아온 뒤에야 남은 씨앗을 바로 셀 수 있다
  const { data: running, error: jobError } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'held')
    .limit(1);
  if (jobError) {
    console.error('탈퇴 전 교정 확인 실패', jobError);
    return Response.json({ error: '탈퇴를 처리하지 못했습니다.', code: 'SERVER' }, { status: 500 });
  }
  if (running.length > 0) {
    return Response.json(
      { error: '교정이 끝난 뒤에 탈퇴할 수 있습니다.', code: 'JOB_RUNNING' },
      { status: 409 },
    );
  }

  // 탈퇴하면 이 계정의 구매 내역을 다시 볼 수 없다. 환불받을 수 있는 주문
  // (환불 기한이 남고 씨앗이 남은 결제)을 탈퇴 전에 읽어 두었다가 탈퇴를 마친 화면에 보여 준다.
  // 읽지 못하면 주문번호를 알려 드릴 수 없으므로 탈퇴하지 않는다
  const { data: refundable, error: listError } = await supabase
    .from('purchases')
    .select(PURCHASE_COLUMNS)
    .eq('refundable', true)
    .gt('remaining', 0)
    .order('paid_at', { ascending: false });
  if (listError) {
    console.error('탈퇴 전 구매 내역 읽기 실패', listError);
    return Response.json({ error: '탈퇴를 처리하지 못했습니다.', code: 'SERVER' }, { status: 500 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId, true);
  if (error) {
    console.error('회원 탈퇴 실패', error);
    return Response.json({ error: '탈퇴를 처리하지 못했습니다.', code: 'SERVER' }, { status: 500 });
  }

  return Response.json({ ok: true, refundable });
}
