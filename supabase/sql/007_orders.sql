-- 씨앗 구매 주문.
-- 결제창을 띄우기 전에 서버가 주문을 만들고(pending), 토스 승인이 끝나면 paid로 바꾼다.
-- 주문 ID(uuid)를 토스 orderId로 그대로 쓴다 (토스 규칙: 영문·숫자·-_= 6~64자).
-- 금액은 서버가 상품 목록으로 정해 여기 적고, 승인 때 토스가 돌려준 금액과 대조한다.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  product_id text not null,
  seeds int not null check (seeds > 0),
  amount int not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  payment_key text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index orders_user_id_idx on public.orders (user_id);

-- 본인 주문 읽기만 허용. 쓰기는 서버 전용 함수로만
alter table public.orders enable row level security;

create policy "본인 주문 읽기" on public.orders
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- 주문 생성 + 하루 결제 한도 검사
--   충전 서비스는 1일 결제 5만 원 미만 (토스 심사 조건).
--   한국 시간 오늘 만든 주문 중 결제된 것과, 30분 안에 만든 결제 대기 주문을 더한다.
--   대기 주문까지 세는 것은 창을 여러 개 띄워 한꺼번에 결제하는 경우를 막기 위해서다.
-- ─────────────────────────────────────────────
create function public.create_order(
  p_user uuid, p_product text, p_seeds int, p_amount int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today int;
  v_order uuid;
begin
  -- 같은 사용자의 주문 생성을 한 줄로 세운다 (동시 요청으로 한도를 넘지 않게)
  perform pg_advisory_xact_lock(hashtextextended('order:' || p_user::text, 0));

  select coalesce(sum(o.amount), 0) into v_today
  from public.orders o
  where o.user_id = p_user
    and (o.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
    and (
      o.status = 'paid'
      or (o.status = 'pending' and o.created_at > now() - interval '30 minutes')
    );

  if v_today + p_amount >= 50000 then
    raise exception 'DAILY_LIMIT';
  end if;

  insert into public.orders (user_id, product_id, seeds, amount)
  values (p_user, p_product, p_seeds, p_amount)
  returning id into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, int, int) to service_role;