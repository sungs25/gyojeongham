-- 씨앗 1개가 교정하는 분량을 5,000자에서 3,000자로 바꾼다.
-- 부가세·PG 수수료·Vercel Pro·보험료를 넣어 다시 계산한 결과 (6단계에서 결정).
-- create_job에서 바뀌는 곳은 씨앗 수 계산 한 줄뿐이고, 나머지는 002_jobs.sql과 같다.
-- create or replace는 실행 권한(service_role만)을 그대로 유지한다.

create or replace function public.create_job(p_user uuid, p_chunks jsonb)
returns table (job_id uuid, seeds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_seeds int;
  v_balance int;
  v_job uuid;
begin
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'EMPTY_CHUNKS';
  end if;

  select sum((c->>'chars')::int) into v_total
  from jsonb_array_elements(p_chunks) as c;

  if v_total is null or v_total <= 0 then
    raise exception 'EMPTY_CHUNKS';
  end if;

  -- 씨앗 1개 = 3,000자
  v_seeds := ceil(v_total / 3000.0)::int;

  -- 같은 사용자의 동시 요청을 한 줄로 세운다 (잔액 초과 사용 방지)
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select coalesce(sum(l.delta), 0) into v_balance
  from public.ledger l
  where l.user_id = p_user;

  if v_balance < v_seeds then
    raise exception 'INSUFFICIENT_SEEDS';
  end if;

  insert into public.jobs (user_id, seeds, char_limit)
  values (p_user, v_seeds, v_total)
  returning id into v_job;

  insert into public.job_chunks (job_id, idx, hash, chars)
  select v_job, (e.ord - 1)::int, e.c->>'hash', (e.c->>'chars')::int
  from jsonb_array_elements(p_chunks) with ordinality as e(c, ord);

  insert into public.ledger (user_id, delta, kind, job_id, ref_key)
  values (p_user, -v_seeds, 'hold', v_job, 'hold:' || v_job);

  return query select v_job, v_seeds;
end;
$$;