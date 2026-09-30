import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// 보관 기간. 이보다 오래된 결과는 지우기 전이라도 돌려주지 않는다
const KEEP_MS = 24 * 60 * 60 * 1000;

// 새로 고친 화면이 작업 상태와 보관된 결과를 다시 받아 간다. 본인 작업만 볼 수 있다.
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/jobs/[id]'>) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return Response.json({ error: '로그인이 필요합니다', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin
    .from('jobs')
    .select('status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<{ status: string }>();

  // 22P02: id가 uuid 모양이 아님
  if (jobError && jobError.code !== '22P02') {
    console.error('jobs 조회 실패', jobError);
    return Response.json({ error: '서버 오류', code: 'SERVER' }, { status: 500 });
  }
  if (!job) {
    return Response.json({ error: '작업을 찾을 수 없습니다', code: 'JOB_NOT_FOUND' }, { status: 404 });
  }

  const [chunks, results] = await Promise.all([
    admin.from('job_chunks').select('idx, status').eq('job_id', id).order('idx'),
    admin
      .from('chunk_results')
      .select('idx, changes')
      .eq('job_id', id)
      .gte('created_at', new Date(Date.now() - KEEP_MS).toISOString()),
  ]);
  if (chunks.error || results.error) {
    console.error('작업 조회 실패', chunks.error ?? results.error);
    return Response.json({ error: '서버 오류', code: 'SERVER' }, { status: 500 });
  }

  return Response.json({ status: job.status, chunks: chunks.data, results: results.data });
}