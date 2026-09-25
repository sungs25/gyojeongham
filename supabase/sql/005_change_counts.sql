-- chunk_usage에 청크별 변경 건수와 미매칭 근사치를 남긴다.
-- 사용자 글은 저장하지 않으므로, 다른 사람의 글에서 before 매칭이 얼마나 실패하는지는 이 숫자로만 확인할 수 있다.
-- 성공한 호출만 값이 있고, 실패한 호출과 이전 기록은 비워 둔다.

alter table public.chunk_usage add column change_count int;
alter table public.chunk_usage add column unmatched_count int;

-- finish_chunk: 두 값을 같이 적는다. 나머지는 004_prompt_version.sql과 같다.
create or replace function public.finish_chunk(
  p_user uuid, p_job uuid, p_idx int, p_ok boolean, p_usage jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_seeds int;
  v_attempts int;
  v_chars int;
begin
  select j.status, j.seeds into v_status, v_seeds
  from public.jobs j
  where j.id = p_job and j.user_id = p_user
  for update;

  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  select c.attempts, c.chars into v_attempts, v_chars
  from public.job_chunks c
  where c.job_id = p_job and c.idx = p_idx;

  if not found then
    raise exception 'CHUNK_NOT_FOUND';
  end if;

  -- 비용은 작업 상태와 무관하게 나갔으므로 항상 기록
  insert into public.chunk_usage (
    job_id, idx, attempt, ok,
    input_tokens, cache_creation_tokens, cache_read_tokens,
    output_tokens, thinking_tokens, prompt_version,
    change_count, unmatched_count
  ) values (
    p_job, p_idx, v_attempts, p_ok,
    coalesce((p_usage->>'input_tokens')::int, 0),
    coalesce((p_usage->>'cache_creation_tokens')::int, 0),
    coalesce((p_usage->>'cache_read_tokens')::int, 0),
    coalesce((p_usage->>'output_tokens')::int, 0),
    coalesce((p_usage->>'thinking_tokens')::int, 0),
    p_usage->>'prompt_version',
    (p_usage->>'change_count')::int,
    (p_usage->>'unmatched_count')::int
  );

  if v_status <> 'held' then
    return v_status;
  end if;

  if p_ok then
    update public.job_chunks c set status = 'done'
    where c.job_id = p_job and c.idx = p_idx and c.status = 'pending';

    -- 같은 청크의 성공이 두 번 기록돼도 글자 수는 한 번만 더한다
    if found then
      update public.jobs j set chars_used = j.chars_used + v_chars
      where j.id = p_job;
    end if;

    if not exists (
      select 1 from public.job_chunks c
      where c.job_id = p_job and c.status <> 'done'
    ) then
      update public.jobs j set status = 'committed', finished_at = now()
      where j.id = p_job;
      return 'committed';
    end if;
    return 'held';
  end if;

  if v_attempts >= 3 then
    update public.job_chunks c set status = 'failed'
    where c.job_id = p_job and c.idx = p_idx;
    update public.jobs j set status = 'released', finished_at = now()
    where j.id = p_job;
    insert into public.ledger (user_id, delta, kind, job_id, ref_key)
    values (p_user, v_seeds, 'release', p_job, 'release:' || p_job);
    return 'released';
  end if;

  return 'held';
end;
$$;