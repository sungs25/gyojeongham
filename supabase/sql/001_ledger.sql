-- 교정 작업: 교정 한 번 = 한 줄
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  seeds int not null check (seeds > 0),
  char_limit int not null check (char_limit > 0),
  chars_used int not null default 0 check (chars_used >= 0),
  status text not null default 'held'
    check (status in ('held', 'committed', 'released')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 씨앗 원장: 씨앗이 움직인 기록 한 건 = 한 줄
create table public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  delta int not null check (delta <> 0),
  kind text not null
    check (kind in ('signup_grant', 'purchase', 'hold', 'release')),
  job_id uuid references public.jobs (id) on delete restrict,
  ref_key text not null unique,
  created_at timestamptz not null default now()
);

create index ledger_user_id_idx on public.ledger (user_id);
create index jobs_user_id_idx on public.jobs (user_id);

-- 잔액: 원장 합계
create view public.balances
with (security_invoker = true) as
select user_id, sum(delta)::int as balance
from public.ledger
group by user_id;

-- 권한: 본인 줄 읽기만 허용, 쓰기 정책은 두지 않는다
alter table public.ledger enable row level security;
alter table public.jobs enable row level security;

create policy "본인 원장 읽기" on public.ledger
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 작업 읽기" on public.jobs
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 가입 시 씨앗 1개 지급
create function public.grant_signup_seed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger (user_id, delta, kind, ref_key)
  values (new.id, 1, 'signup_grant', 'signup:' || new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.grant_signup_seed();

-- 이미 가입한 계정에도 1개 지급 (두 번 실행해도 중복 지급되지 않음)
insert into public.ledger (user_id, delta, kind, ref_key)
select id, 1, 'signup_grant', 'signup:' || id
from auth.users
on conflict (ref_key) do nothing;