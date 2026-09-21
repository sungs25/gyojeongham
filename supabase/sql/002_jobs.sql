-- 청크 목록: 작업 시작 때 서버가 등록한 청크의 지문과 글자 수
create table public.job_chunks (
  job_id uuid not null references public.jobs (id) on delete restrict,
  idx int not null check (idx >= 0),
  hash text not null,
  chars int not null check (chars > 0),
  attempts int not null default 0 check (attempts >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed')),
  primary key (job_id, idx)
);

-- 청크 호출 한 번의 토큰 사용량 (성공·실패 모두 기록)
create table public.chunk_usage (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete restrict,
  idx int not null,
  attempt int not null,
  ok boolean not null,
  input_tokens int not null default 0,
  cache_creation_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  output_tokens int not null default 0,
  thinking_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index chunk_usage_job_id_idx on public.chunk_usage (job_id);

-- 두 테이블 모두 브라우저에서는 읽기·쓰기 불가 (정책 없음)
alter table public.job_chunks enable row level security;
alter table public.chunk_usage enable row level security;

-- ─────────────────────────────────────────────
-- 1. 작업 등록 + hold
--    p_chunks: [{"hash": "...", "chars": 1200}, ...] 원문 순서대로
-- ─────────────────────────────────────────────
create function public.create_job(p_user uuid, p_chunks jsonb)
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

  -- 씨앗 1개 = 5,000자
  v_seeds := ceil(v_total / 5000.0)::int;

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

-- ─────────────────────────────────────────────
-- 2. 청크 시작: 지문이 등록된 청크와 맞는지 확인하고 시도 횟수를 올린다
--    idx가 null이면 처리 불가 (job_status로 이유 판단)
-- ─────────────────────────────────────────────
create function public.start_chunk(p_user uuid, p_job uuid, p_hash text)
returns table (idx int, attempt int, job_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_seeds int;
  v_idx int;
  v_attempt int;
begin
  select j.status, j.seeds into v_status, v_seeds
  from public.jobs j
  where j.id = p_job and j.user_id = p_user
  for update;

  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if v_status <> 'held' then
    return query select null::int, null::int, v_status;
    return;
  end if;

  -- 같은 글이 두 번 나오는 경우를 위해, 시도가 적은 청크부터 배정
  select c.idx into v_idx
  from public.job_chunks c
  where c.job_id = p_job and c.hash = p_hash
    and c.status = 'pending' and c.attempts < 3
  order by c.attempts, c.idx
  limit 1;

  if v_idx is null then
    -- 서버가 중간에 죽어 종료 기록 없이 3회를 다 쓴 청크면 작업을 반환 처리
    if exists (
      select 1 from public.job_chunks c
      where c.job_id = p_job and c.hash = p_hash
        and c.status = 'pending' and c.attempts >= 3
    ) then
      update public.job_chunks c set status = 'failed'
      where c.job_id = p_job and c.hash = p_hash
        and c.status = 'pending' and c.attempts >= 3;
      update public.jobs j set status = 'released', finished_at = now()
      where j.id = p_job;
      insert into public.ledger (user_id, delta, kind, job_id, ref_key)
      values (p_user, v_seeds, 'release', p_job, 'release:' || p_job);
      return query select null::int, null::int, 'released'::text;
      return;
    end if;
    raise exception 'CHUNK_NOT_ALLOWED';
  end if;

  update public.job_chunks c
  set attempts = c.attempts + 1
  where c.job_id = p_job and c.idx = v_idx
  returning c.attempts into v_attempt;

  return query select v_idx, v_attempt, 'held'::text;
end;
$$;

-- ─────────────────────────────────────────────
-- 3. 청크 종료: usage를 적고, 전부 성공이면 commit, 3회 실패면 release
-- ─────────────────────────────────────────────
create function public.finish_chunk(
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
    output_tokens, thinking_tokens
  ) values (
    p_job, p_idx, v_attempts, p_ok,
    coalesce((p_usage->>'input_tokens')::int, 0),
    coalesce((p_usage->>'cache_creation_tokens')::int, 0),
    coalesce((p_usage->>'cache_read_tokens')::int, 0),
    coalesce((p_usage->>'output_tokens')::int, 0),
    coalesce((p_usage->>'thinking_tokens')::int, 0)
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

-- 세 함수는 서버(비밀 키)만 호출할 수 있다
revoke execute on function public.create_job(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.start_chunk(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.finish_chunk(uuid, uuid, int, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.create_job(uuid, jsonb) to service_role;
grant execute on function public.start_chunk(uuid, uuid, text) to service_role;
grant execute on function public.finish_chunk(uuid, uuid, int, boolean, jsonb) to service_role;