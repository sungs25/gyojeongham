-- 멈춘 작업 정산을 바꾼다 (010의 release_stale_jobs를 대체).
-- 이전: 15분 넘게 멈춘 작업은 끝난 문단이 있어도 씨앗을 전액 돌려줬다.
--       → 긴 글을 거의 다 교정받은 뒤 일부러 나가 15분 기다리면, 결과도 받고 씨앗도 돌려받는 구멍이 있었다.
-- 이후: 끝난 문단의 글자 수만큼(씨앗 1개 = 3,000자, 올림)만 쓰고 나머지를 돌려준다.
--       끝난 문단이 하나도 없으면 이전처럼 전액 반환(released).
--       모델이 3번 실패해 반환되는 경우(finish_chunk)는 그대로 전액 반환이다.

create or replace function public.release_stale_jobs()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_used int;
  v_refund int;
  v_count int := 0;
begin
  for v_job in
    select j.id, j.user_id, j.seeds, j.chars_used
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

    -- 끝난 문단 글자 수만큼 쓴 씨앗 (잡아 둔 씨앗보다 많을 수는 없다)
    v_used := least(ceil(v_job.chars_used / 3000.0)::int, v_job.seeds);
    v_refund := v_job.seeds - v_used;

    update public.jobs j
    set status = case when v_used = 0 then 'released' else 'committed' end,
        finished_at = now()
    where j.id = v_job.id;

    if v_refund > 0 then
      insert into public.ledger (user_id, delta, kind, job_id, ref_key)
      values (v_job.user_id, v_refund, 'release', v_job.id, 'release:' || v_job.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;