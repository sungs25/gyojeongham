-- 교정 도중이나 끝난 뒤 새로 고쳐도 결과를 다시 받을 수 있게,
-- 문단별 교정 결과(고친 곳 목록)를 서버에 최대 24시간 보관한다.
-- 원문 전체는 두지 않는다. 원문은 사용자의 탭 안 저장소에만 있다.
-- 근거: 개인정보 보호법 제15조 제1항 제4호(계약 이행), 제21조(목적 달성 후 지체 없이 파기)

create table public.chunk_results (
  job_id uuid not null references public.jobs (id) on delete cascade,
  idx int not null,
  changes jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, idx)
);

-- 브라우저에서는 읽기·쓰기 불가 (정책 없음). 서버(service_role)만 다룬다
alter table public.chunk_results enable row level security;

-- ─────────────────────────────────────────────
-- 1. 24시간 지난 결과 삭제 (10분마다)
-- ─────────────────────────────────────────────
create function public.purge_chunk_results()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.chunk_results
  where created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────
-- 2. 멈춘 작업 반환 (5분마다)
--    held 상태인데 15분 넘게 아무 움직임이 없으면, 화면이 사라진 것으로 보고 씨앗을 전액 돌려준다.
--    움직임 = 작업을 만든 시각, 또는 마지막 청크 호출 기록(chunk_usage) 시각 중 늦은 쪽.
--    청크 호출 하나는 최대 300초라서, 화면이 살아 있으면 15분 공백이 생기지 않는다.
-- ─────────────────────────────────────────────
create function public.release_stale_jobs()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_count int := 0;
begin
  for v_job in
    select j.id, j.user_id, j.seeds
    from public.jobs j
    where j.status = 'held'
      and greatest(
        j.created_at,
        coalesce((select max(u.created_at) from public.chunk_usage u where u.job_id = j.id), j.created_at)
      ) < now() - interval '15 minutes'
    for update of j skip locked
  loop
    update public.job_chunks c set status = 'failed'
    where c.job_id = v_job.id and c.status = 'pending';
    update public.jobs j set status = 'released', finished_at = now()
    where j.id = v_job.id;
    insert into public.ledger (user_id, delta, kind, job_id, ref_key)
    values (v_job.user_id, v_job.seeds, 'release', v_job.id, 'release:' || v_job.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 두 함수는 예약 작업만 부른다. 브라우저·서버 어디서도 호출하지 못하게 막는다
revoke execute on function public.purge_chunk_results() from public, anon, authenticated, service_role;
revoke execute on function public.release_stale_jobs() from public, anon, authenticated, service_role;