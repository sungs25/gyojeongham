import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SEED_HISTORY_COLUMNS, type SeedHistoryLine } from '@/lib/seed-history';
import { SiteHeader } from '@/app/components/SiteHeader';
import { SeedHistoryList } from '@/app/components/SeedHistoryList';

export const metadata: Metadata = { title: '씨앗 내역 — 교정햄' };

// 처음에 펼쳐 보여 줄 최근 줄 수. 나머지는 "이전 내역 N건 보기"에 접는다
const RECENT = 10;

// 씨앗 내역: 충전·사용·반환·환불·소멸과 그때의 남은 씨앗 (KG이니시스 포인트충전 입점조건의 "포인트 차감 페이지").
// 줄은 seed_history 뷰(021)가 만든다. 맨 아래 줄부터 더하고 빼면 맨 위의 남은 씨앗과 맞는다
export default async function SeedHistoryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect('/login');
  }

  // 권한 설정상 본인 줄만 돌아온다
  const { data: row } = await supabase.from('balances').select('balance').maybeSingle();
  const balance = row?.balance ?? 0;

  const { data: lineRows, error } = await supabase
    .from('seed_history')
    .select(SEED_HISTORY_COLUMNS)
    .order('seq', { ascending: false });
  if (error) console.error('씨앗 내역 읽기 실패', error);
  const lines = error ? null : ((lineRows ?? []) as SeedHistoryLine[]);
  const recent = lines?.slice(0, RECENT) ?? [];
  const older = lines?.slice(RECENT) ?? [];

  return (
    <>
      <SiteHeader />
      <main className="credits">
        <a className="credits-back" href="/account">
          ← 내 계정으로
        </a>
        <h1>씨앗 내역</h1>
        <p className="credits-note">
          남은 씨앗은 <strong>{balance}개</strong>입니다. 씨앗을 사고, 교정에 쓰고, 돌려받은 내역을 최근
          것부터 보여 드립니다.
        </p>
        <p className="credits-note">
          씨앗은 산 날부터 1년 동안 쓸 수 있으며, 1년 동안 쓰지 않은 씨앗은 소멸됩니다.{' '}
          <Link href="/refund">환불 정책</Link>
        </p>
        {lines === null ? (
          <p className="credits-note">씨앗 내역을 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>
        ) : lines.length === 0 ? (
          <p className="credits-note">아직 씨앗 내역이 없습니다.</p>
        ) : (
          <>
            <SeedHistoryList lines={recent} />
            {older.length > 0 && (
              <details className="past-purchases">
                <summary>이전 내역 {older.length}건 보기</summary>
                <SeedHistoryList lines={older} />
              </details>
            )}
          </>
        )}
      </main>
    </>
  );
}