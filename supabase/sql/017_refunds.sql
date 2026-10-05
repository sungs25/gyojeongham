-- 환불 (6-5). 환불 정책(app/refund/page.tsx)의 계산을 DB 함수로 옮긴다.
-- 환불은 사람이 처리한다: 이메일로 요청을 받으면 SQL Editor에서 아래 순서로 부른다.
--   1) refund_quote(주문번호)                  얼마를 돌려줘야 하는지 계산만 한다 (아무것도 바꾸지 않음)
--   2) refund_order(주문번호, 'card' 또는 'account', ...)
--                                               씨앗을 묶음에서 빼고 환불 기록을 남긴다 (pending)
--   3) 카드 취소(결제대행사)나 계좌 이체로 돈을 돌려준다
--   4) complete_refund(환불번호, ...)          돈을 돌려준 뒤 done으로 바꾼다
--   잘못 만들었으면 4) 전에 undo_refund(환불번호)로 씨앗을 되돌린다 (canceled)
-- 씨앗을 먼저 빼고 돈을 나중에 돌려주는 이유: 거꾸로 하면 돈은 돌려줬는데 씨앗이 남아
-- 그 씨앗을 또 쓸 수 있는 틈이 생긴다.
--
-- 계산 규칙 (환불 정책과 같다)
--   씨앗 1개 금액 = 묶음 결제 금액 ÷ 묶음 씨앗 수
--   산 지 7일 안에 요청: 쓰지 않은 씨앗 금액 전액 (한국 시간 날짜로 결제일 다음 날부터 7일째 되는 날까지)
--   그 뒤: 쓰지 않은 씨앗 금액에서 10%를 뺀다
--   첫 결제를 모두 환불하면 함께 받은 무료 씨앗도 돌려받는다:
--     남아 있으면 없애고, 이미 썼으면 그 결제의 씨앗 1개 값을 뺀다
--   1원 미만: 돌려드리는 금액은 올리고, 빼는 금액은 버린다
--   이용 기간(5년)이 끝난 묶음은 환불하지 않는다 (디지털콘텐츠 표준약관 13조의 유상 콘텐츠 5년)
--   교정 중(held)인 작업이 있으면 환불하지 않는다: 끝나면서 돌아오는 씨앗이 환불한 묶음으로 들어가기 때문

-- ─────────────────────────────────────────────
-- 1. 환불 기록. 전자상거래법 시행령 6조: 청약철회·대금결제 기록 5년 보관
--    계좌로 돌려줄 때만 은행·계좌번호·예금주를 적는다 (개인정보 처리방침 1항)
-- ─────────────────────────────────────────────
create table public.refunds (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  seeds int not null check (seeds > 0),
  within_7days boolean not null,
  fee int not null check (fee >= 0),
  bonus_deduct int not null check (bonus_deduct >= 0),
  bonus_revoked int not null default 0 check (bonus_revoked >= 0),
  amount int not null check (amount >= 0),
  method text not null check (method in ('card', 'account')),
  bank text,
  account_number text,
  account_holder text,
  status text not null default 'pending' check (status in ('pending', 'done', 'canceled')),
  pg_cancel_id text,
  note text,
  requested_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (method = 'card' or (bank is not null and account_number is not null and account_holder is not null))
);

create index refunds_order_id_idx on public.refunds (order_id);
create index refunds_user_id_idx on public.refunds (user_id);

-- 본인 환불 기록 읽기만 허용 (구매 내역에 환불을 표시하려고). 쓰기는 아래 함수로만
alter table public.refunds enable row level security;

create policy "본인 환불 읽기" on public.refunds
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 원장에 환불 줄 종류를 더한다 (씨앗을 묶음에서 뺄 때 음수, 되돌릴 때 양수)
alter table public.ledger drop constraint ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check
  check (kind in ('signup_grant', 'purchase', 'bonus', 'hold', 'release', 'adjust', 'opening', 'refund'));

-- ─────────────────────────────────────────────
-- 2. 환불 금액 계산 (바꾸는 것 없음)
--    p_seeds: 환불할 씨앗 수. 비우면 남은 씨앗 전부
--    p_requested_at: 환불 요청을 받은 시각 (이메일 받은 시각). 7일 판단에 쓴다
-- ─────────────────────────────────────────────
create function public.refund_quote(
  p_order uuid,
  p_seeds int default null,
  p_requested_at timestamptz default now()
)
returns table (
  order_id uuid,
  user_id uuid,
  paid_at timestamptz,
  order_seeds int,
  order_amount int,
  remaining int,
  refund_seeds int,
  within_7days boolean,
  base_amount numeric,
  fee int,
  full_refund boolean,
  bonus_lot bigint,
  bonus_left int,
  bonus_deduct int,
  amount int,
  expired boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_lot record;
  v_remaining int;
  v_refunded int;
  v_seeds int;
  v_within boolean;
  v_base numeric;
  v_fee int;
  v_full boolean;
  v_bonus_lot bigint;
  v_bonus_left int := 0;
  v_bonus_deduct int := 0;
begin
  select o.* into v_order from public.orders o where o.id = p_order;
  if not found or v_order.status <> 'paid' then
    raise exception 'ORDER_NOT_PAID';
  end if;

  select s.* into v_lot from public.seed_lots s where s.order_id = p_order;

  select coalesce(sum(l.delta), 0)::int into v_remaining
  from public.ledger l where l.lot_id = v_lot.id;

  -- 이미 환불했거나 환불 중인 씨앗 (되돌린 환불은 빼고)
  select coalesce(sum(r.seeds), 0)::int into v_refunded
  from public.refunds r where r.order_id = p_order and r.status <> 'canceled';

  v_seeds := coalesce(p_seeds, v_remaining);

  -- 한국 시간 날짜로 결제일 다음 날부터 7일째 되는 날까지 (민법 157조: 첫날은 세지 않는다)
  v_within := (p_requested_at at time zone 'Asia/Seoul')::date
              <= (v_order.paid_at at time zone 'Asia/Seoul')::date + 7;

  -- 쓰지 않은 씨앗 금액 (나누어 떨어지지 않으면 소수 그대로 두고 마지막에 올린다)
  v_base := v_seeds * v_order.amount::numeric / v_order.seeds;
  v_fee := case when v_within then 0 else floor(v_base / 10)::int end;

  -- 이번 환불로 이 결제의 씨앗을 하나도 쓰지 않고 모두 환불하게 되는가
  v_full := v_refunded + v_seeds = v_order.seeds;

  -- 이 결제와 함께 받은 첫 결제 무료 씨앗 (015가 남긴 bonus:주문 줄)
  select l.lot_id into v_bonus_lot
  from public.ledger l
  where l.kind = 'bonus' and l.ref_key = 'bonus:' || p_order;

  if v_full and v_bonus_lot is not null then
    select coalesce(sum(l.delta), 0)::int into v_bonus_left
    from public.ledger l where l.lot_id = v_bonus_lot;
    -- 무료 씨앗을 이미 썼으면 그 결제의 씨앗 1개 값을 뺀다 (빼는 금액은 버림)
    if v_bonus_left = 0 then
      v_bonus_deduct := floor(v_order.amount::numeric / v_order.seeds)::int;
    end if;
  end if;

  return query select
    p_order,
    v_order.user_id,
    v_order.paid_at,
    v_order.seeds,
    v_order.amount,
    v_remaining,
    v_seeds,
    v_within,
    round(v_base, 2),
    v_fee,
    v_full,
    v_bonus_lot,
    v_bonus_left,
    v_bonus_deduct,
    greatest(0, ceil(v_base - v_fee - v_bonus_deduct))::int,
    v_lot.expires_at <= now();
end;
$$;

-- ─────────────────────────────────────────────
-- 3. 환불 만들기: 씨앗을 묶음에서 빼고 pending 기록을 남긴다. 환불번호와 돌려줄 금액을 돌려준다
--    카드: refund_order('주문번호', 'card')
--    계좌: refund_order('주문번호', 'account', p_bank => '은행', p_account_number => '계좌', p_account_holder => '예금주')
-- ─────────────────────────────────────────────
create function public.refund_order(
  p_order uuid,
  p_method text,
  p_seeds int default null,
  p_requested_at timestamptz default now(),
  p_bank text default null,
  p_account_number text default null,
  p_account_holder text default null,
  p_note text default null
)
returns table (refund_id bigint, seeds int, amount int, fee int, bonus_deduct int, bonus_revoked int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_lot bigint;
  q record;
  v_refund bigint;
begin
  -- 같은 주문의 환불을 한 줄로 세운다
  select o.user_id into v_user from public.orders o where o.id = p_order for update;
  if not found then
    raise exception 'ORDER_NOT_PAID';
  end if;

  -- 같은 사용자의 씨앗 잡기(hold_seeds)·지급(grant_order)과 한 줄로 세운다
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if exists (select 1 from public.jobs j where j.user_id = v_user and j.status = 'held') then
    raise exception 'JOB_RUNNING';
  end if;

  if p_method not in ('card', 'account') then
    raise exception 'BAD_METHOD';
  end if;
  if p_method = 'account'
     and (p_bank is null or p_account_number is null or p_account_holder is null) then
    raise exception 'ACCOUNT_REQUIRED';
  end if;

  select * into q from public.refund_quote(p_order, p_seeds, p_requested_at);

  if q.expired then
    raise exception 'LOT_EXPIRED';
  end if;
  if q.refund_seeds <= 0 or q.remaining = 0 then
    raise exception 'NOTHING_TO_REFUND';
  end if;
  if q.refund_seeds > q.remaining then
    raise exception 'TOO_MANY_SEEDS';
  end if;

  insert into public.refunds (
    order_id, user_id, seeds, within_7days, fee, bonus_deduct, bonus_revoked, amount,
    method, bank, account_number, account_holder, note, requested_at
  )
  values (
    p_order, v_user, q.refund_seeds, q.within_7days, q.fee, q.bonus_deduct,
    case when q.full_refund then q.bonus_left else 0 end, q.amount,
    p_method,
    case when p_method = 'account' then p_bank end,
    case when p_method = 'account' then p_account_number end,
    case when p_method = 'account' then p_account_holder end,
    p_note, p_requested_at
  )
  returning id into v_refund;

  select s.id into v_lot from public.seed_lots s where s.order_id = p_order;

  insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
  values (v_user, -q.refund_seeds, 'refund', v_lot, 'refund:' || v_refund);

  -- 첫 결제를 모두 환불하면 남은 무료 씨앗을 없앤다
  if q.full_refund and q.bonus_left > 0 then
    insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
    values (v_user, -q.bonus_left, 'refund', q.bonus_lot, 'refund-bonus:' || v_refund);
  end if;

  return query
  select r.id, r.seeds, r.amount, r.fee, r.bonus_deduct, r.bonus_revoked
  from public.refunds r where r.id = v_refund;
end;
$$;

-- ─────────────────────────────────────────────
-- 4. 돈을 돌려준 뒤: done으로 바꾼다. 카드 취소면 결제대행사 취소 번호를 적는다
-- ─────────────────────────────────────────────
create function public.complete_refund(p_refund bigint, p_pg_cancel_id text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.refunds r
  set status = 'done',
      completed_at = now(),
      pg_cancel_id = coalesce(p_pg_cancel_id, r.pg_cancel_id),
      note = coalesce(p_note, r.note)
  where r.id = p_refund and r.status = 'pending';

  if not found then
    raise exception 'REFUND_NOT_PENDING';
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- 5. 잘못 만든 환불 되돌리기 (돈을 돌려주기 전, pending일 때만): 뺀 씨앗을 원래 묶음으로 돌려놓는다
-- ─────────────────────────────────────────────
create function public.undo_refund(p_refund bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref record;
  v_line record;
begin
  select r.* into v_ref from public.refunds r where r.id = p_refund for update;
  if not found or v_ref.status <> 'pending' then
    raise exception 'REFUND_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_ref.user_id::text, 0));

  -- refund_order가 남긴 줄(refund:번호, refund-bonus:번호)을 그대로 되돌린다
  for v_line in
    select l.lot_id, l.delta, l.ref_key
    from public.ledger l
    where l.ref_key in ('refund:' || p_refund, 'refund-bonus:' || p_refund)
  loop
    insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
    values (v_ref.user_id, -v_line.delta, 'refund', v_line.lot_id, 'undo-' || v_line.ref_key);
  end loop;

  update public.refunds r set status = 'canceled', completed_at = now() where r.id = p_refund;
end;
$$;

-- 서버(비밀 키)와 SQL Editor만 부를 수 있다
revoke execute on function public.refund_quote(uuid, int, timestamptz) from public, anon, authenticated;
revoke execute on function public.refund_order(uuid, text, int, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.complete_refund(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.undo_refund(bigint) from public, anon, authenticated;
grant execute on function public.refund_quote(uuid, int, timestamptz) to service_role;
grant execute on function public.refund_order(uuid, text, int, timestamptz, text, text, text, text) to service_role;
grant execute on function public.complete_refund(bigint, text, text) to service_role;
grant execute on function public.undo_refund(bigint) to service_role;

-- ─────────────────────────────────────────────
-- 6. 구매 내역(016)에 환불한 씨앗 수와 금액을 더한다 (되돌린 환불은 빼고).
--    열을 맨 뒤에 더하는 것이라 create or replace로 바꿀 수 있다
-- ─────────────────────────────────────────────
create or replace view public.purchases
with (security_invoker = true) as
select
  o.id as order_id,
  o.user_id,
  o.seeds,
  o.amount,
  o.paid_at,
  s.expires_at,
  s.expires_at <= now() as expired,
  coalesce(sum(l.delta), 0)::int as remaining,
  exists (
    select 1
    from public.ledger b
    where b.user_id = o.user_id and b.kind = 'bonus' and b.ref_key = 'bonus:' || o.id
  ) as bonus,
  coalesce((
    select sum(r.seeds) from public.refunds r where r.order_id = o.id and r.status <> 'canceled'
  ), 0)::int as refunded_seeds,
  coalesce((
    select sum(r.amount) from public.refunds r where r.order_id = o.id and r.status <> 'canceled'
  ), 0)::int as refunded_amount
from public.orders o
join public.seed_lots s on s.order_id = o.id
left join public.ledger l on l.lot_id = s.id
where o.status = 'paid'
group by o.id, s.id;
