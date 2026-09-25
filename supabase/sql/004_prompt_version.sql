-- chunk_usage에 프롬프트 버전을 남긴다.
-- 로컬 개발 서버와 배포 서버가 같은 DB에 기록하므로, 시간만으로는 어느 프롬프트로 부른 기록인지 가를 수 없다.
-- 값은 서버가 읽은 prompts/prompt-changes.txt의 SHA-256 앞 12자리다.

alter table public.chunk_usage add column prompt_version text;

-- 지금까지의 기록은 모두 현재 프롬프트로 부른 것이다 (chunk_usage를 만든 4-6 이후 프롬프트 파일이 바뀌지 않았다)
update public.chunk_usage set prompt_version = 'e215c559f113' where prompt_version is null;

-- finish_chunk: usage에 실려 온 prompt_version을 같이 적는다. 나머지는 002_jobs.sql과 같다.
-- create or replace는 실행 권한을 그대로 둔다 (service_role만 실행 가능한 상태 유지)
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
    output_tokens, thinking_tokens, prompt_version
  ) values (
    p_job, p_idx, v_attempts, p_ok,
    coalesce((p_usage->>'input_tokens')::int, 0),
    coalesce((p_usage->>'cache_creation_tokens')::int, 0),
    coalesce((p_usage->>'cache_read_tokens')::int, 0),
    coalesce((p_usage->>'output_tokens')::int, 0),
    coalesce((p_usage->>'thinking_tokens')::int, 0),
    p_usage->>'prompt_version'
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