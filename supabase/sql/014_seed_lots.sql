-- 씨앗을 묶음(산 건마다 하나)으로 나눠 관리한다 (6-4).
-- 왜: 환불 정책의 세 가지를 지키려면 씨앗 하나하나가 어느 묶음에서 왔는지 알아야 한다.
--   1) 묶음마다 산 날부터 5년 동안 쓸 수 있다
--   2) 무료 씨앗부터, 그다음은 기간이 먼저 끝나는 묶음부터 쓴다
--   3) 환불 금액은 묶음 결제 금액 ÷ 묶음 씨앗 수로 계산한다
-- 원장(ledger)은 계속 모든 씨앗 움직임의 기록이고, 줄마다 어느 묶음의 씨앗인지(lot_id)를 붙인다.
-- 묶음의 남은 씨앗 = 그 묶음에 붙은 원장 줄의 합. 잔액 = 기간이 남은 묶음의 남은 씨앗 합.
--
-- 적용 조건: 진행 중(held)인 교정이 없어야 한다. 있으면 0번에서 멈춘다.

-- ─────────────────────────────────────────────
-- 0. 진행 중인 교정이 있으면 멈춘다
-- ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.jobs where status = 'held') then
    raise exception '진행 중인 교정이 있습니다. 끝나거나 반환된 뒤에 다시 실행하세요';
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- 1. 묶음
--    paid: 결제 한 건 = 묶음 하나 (order_id, amount 필수)
--    free: 첫 결제 보너스, 관리자 지급, 이 파일이 옮기는 테스트 씨앗
-- ─────────────────────────────────────────────
create table public.seed_lots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('paid', 'free')),
  order_id uuid unique references public.orders (id) on delete restrict,
  seeds int not null check (seeds > 0),
  amount int not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check ((kind = 'paid') = (order_id is not null)),
  check (kind = 'paid' or amount = 0)
);

create index seed_lots_user_id_idx on public.seed_lots (user_id);

-- 본인 묶음 읽기만 허용. 쓰기는 서버 전용 함수로만
alter table public.seed_lots enable row level security;

create policy "본인 묶음 읽기" on public.seed_lots
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- 2. 원장 줄에 묶음 번호를 붙인다
--    bonus: 첫 결제 보너스(6-4 다음 단계), opening: 아래 3번이 옮긴 테스트 씨앗
-- ─────────────────────────────────────────────
alter table public.ledger add column lot_id bigint references public.seed_lots (id) on delete restrict;
create index ledger_lot_id_idx on public.ledger (lot_id);

alter table public.ledger drop constraint ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check
  check (kind in ('signup_grant', 'purchase', 'bonus', 'hold', 'release', 'adjust', 'opening'));

-- ─────────────────────────────────────────────
-- 3. 지금 남은 씨앗(출시 전 테스트 씨앗)을 계정마다 무료 묶음 하나로 옮긴다.
--    이전 원장 줄은 묶음 없이(lot_id 없음) 기록으로만 남고, 잔액 계산에서는 빠진다.
-- ─────────────────────────────────────────────
with old as (
  select l.user_id, sum(l.delta)::int as balance
  from public.ledger l
  group by l.user_id
  having sum(l.delta) > 0
), lots as (
  insert into public.seed_lots (user_id, kind, seeds, expires_at)
  select o.user_id, 'free', o.balance, now() + interval '5 years'
  from old o
  returning id, user_id, seeds
)
insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
select l.user_id, l.seeds, 'opening', l.id, 'opening:' || l.id
from lots l;

-- ─────────────────────────────────────────────
-- 4. 잔액: 기간이 남은 묶음의 씨앗만 센다 (머리글·내 계정 화면이 읽는다)
-- ─────────────────────────────────────────────
create or replace view public.balances
with (security_invoker = true) as
select l.user_id, sum(l.delta)::int as balance
from public.ledger l
join public.seed_lots s on s.id = l.lot_id
where s.expires_at > now()
group by l.user_id;

-- ─────────────────────────────────────────────
-- 5. 씨앗 잡기: 무료 묶음부터, 그다음 기간이 먼저 끝나는 묶음부터 잡는다.
--    묶음마다 원장 줄 하나 (hold:작업:묶음). 모자라면 INSUFFICIENT_SEEDS
-- ─────────────────────────────────────────────
create function public.hold_seeds(p_user uuid, p_job uuid, p_seeds int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot record;
  v_left int := p_seeds;
  v_take int;
begin
  -- 같은 사용자의 동시 요청을 한 줄로 세운다 (잔액 초과 사용 방지)
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  for v_lot in
    select s.id, sum(l.delta)::int as remaining
    from public.seed_lots s
    join public.ledger l on l.lot_id = s.id
    where s.user_id = p_user and s.expires_at > now()
    group by s.id, s.kind, s.expires_at
    having sum(l.delta) > 0
    order by (s.kind = 'free') desc, s.expires_at, s.id
  loop
    exit when v_left = 0;
    v_take := least(v_left, v_lot.remaining);
    insert into public.ledger (user_id, delta, kind, job_id, lot_id, ref_key)
    values (p_user, -v_take, 'hold', p_job, v_lot.id, 'hold:' || p_job || ':' || v_lot.id);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'INSUFFICIENT_SEEDS';
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- 6. 씨앗 돌려주기: 작업이 잡은 씨앗 중 p_count개를 원래 묶음으로 돌려준다.
--    나중에 잡은 묶음부터 돌려주므로, 쓴 씨앗은 무료·기간이 먼저 끝나는 묶음에서 나간 것이 된다.
-- ─────────────────────────────────────────────
create function public.return_seeds(p_job uuid, p_count int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_left int := p_count;
  v_back int;
begin
  for v_row in
    select l.user_id, l.lot_id, -l.delta as held
    from public.ledger l
    where l.job_id = p_job and l.kind = 'hold'
    order by l.id desc
  loop
    exit when v_left <= 0;
    v_back := least(v_left, v_row.held);
    insert into public.ledger (user_id, delta, kind, job_id, lot_id, ref_key)
    values (v_row.user_id, v_back, 'release', p_job, v_row.lot_id,
            'release:' || p_job || ':' || v_row.lot_id);
    v_left := v_left - v_back;
  end loop;
end;
$$;

-- 두 함수는 아래 함수들 안에서만 쓴다
revoke execute on function public.hold_seeds(uuid, uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.return_seeds(uuid, int) from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────
-- 7. 작업 등록: 006과 같고, 잔액 확인과 원장 기록을 hold_seeds로 바꿨다
-- ─────────────────────────────────────────────
create or replace function public.create_job(p_user uuid, p_chunks jsonb)
returns table (job_id uuid, seeds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_seeds int;
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

  insert into public.jobs (user_id, seeds, char_limit)
  values (p_user, v_seeds, v_total)
  returning id into v_job;

  insert into public.job_chunks (job_id, idx, hash, chars)
  select v_job, (e.ord - 1)::int, e.c->>'hash', (e.c->>'chars')::int
  from jsonb_array_elements(p_chunks) with ordinality as e(c, ord);

  -- 모자라면 여기서 오류가 나고, 위에서 만든 작업도 함께 취소된다
  perform public.hold_seeds(p_user, v_job, v_seeds);

  return query select v_job, v_seeds;
end;
$$;

-- ─────────────────────────────────────────────
-- 8. 청크 시작: 002와 같고, 반환 줄 기록을 return_seeds로 바꿨다
-- ─────────────────────────────────────────────
create or replace function public.start_chunk(p_user uuid, p_job uuid, p_hash text)
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
      perform public.return_seeds(p_job, v_seeds);
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
-- 9. 청크 종료: 005와 같고, 반환 줄 기록을 return_seeds로 바꿨다
-- ─────────────────────────────────────────────
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
    perform public.return_seeds(p_job, v_seeds);
    return 'released';
  end if;

  return 'held';
end;
$$;

-- ─────────────────────────────────────────────
-- 10. 멈춘 작업 정산: 012와 같고, 반환 줄 기록을 return_seeds로 바꿨다
-- ─────────────────────────────────────────────
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
      perform public.return_seeds(v_job.id, v_refund);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────
-- 11. 가입 씨앗 기록을 지운다.
--     009에서 지급을 멈췄고, 첫 결제 보너스는 결제를 해야 받으므로 계정을 새로 만들어
--     반복해 받아도 이득이 없다. 소셜 계정 지문을 더 보관할 이유가 없다.
-- ─────────────────────────────────────────────
drop table public.signup_grants;
drop function public.grant_signup_seed();
