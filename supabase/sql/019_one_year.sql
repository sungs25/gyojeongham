-- 유료 씨앗 이용 기간을 산 날부터 1년으로 줄이고, 쓰지 않은 씨앗은 산 날부터 5년 안에 환불한다.
-- 왜: 포트원 안내(PG 심사 반려 사유와 해결책, 2025-09)가 포인트 충전 서비스의 개선안으로
--     "포인트 유효기간을 1년으로 제한"을 제시하고, 포트원 답변(2026-10-06)도 기간이 길수록
--     PG가 리스크로 본다고 했다. 이용 기간을 1년으로 둔다(첫 결제 무료 씨앗도 같은 1년).
--     대신 환불 청구는 상사채권 소멸시효(5년)에 맞춰 산 날부터 5년까지 받는다.
--     신유형 상품권 표준약관의 구조(유효기간 1년 이상, 지나도 5년 안 90% 환불)와 같고,
--     7일 뒤 10% 공제는 그대로라 기간이 지난 씨앗도 90%를 돌려준다.
--     과기정통부 디지털콘텐츠 표준약관 13조③(유상포인트 유효기간 5년)과는 다르다. 표준약관은 권장이다.
--
-- 바뀌는 것
--   1) grant_order: 새 묶음의 이용 기한을 1년으로
--   2) 이미 있는 묶음(출시 전이라 테스트 묶음뿐)도 산 날부터 1년으로 맞춘다
--   3) refund_quote: 환불 기한(refund_until = 결제 시각 + 5년)을 함께 돌려준다
--   4) refund_order: 이용 기간이 끝난 묶음도 환불 기한 안이면 환불한다 (LOT_EXPIRED 대신 REFUND_PERIOD_OVER)
--   5) purchases: 환불 기한과 환불 가능 여부를 더한다 (내 계정·결제 완료·탈퇴 화면이 쓴다)

-- ─────────────────────────────────────────────
-- 1. 씨앗 지급: 015와 같고, 이용 기한만 1년으로 바꿨다
-- ─────────────────────────────────────────────
create or replace function public.grant_order(p_user uuid, p_order uuid, p_payment_key text, p_amount int)
returns table (seeds int, bonus int, already boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_lot bigint;
  v_bonus int := 0;
begin
  select o.* into v_order
  from public.orders o
  where o.id = p_order and o.user_id = p_user
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- 이미 지급한 주문: 같은 결제면 아무것도 하지 않고 알려 주기만 한다
  if v_order.status = 'paid' then
    if v_order.payment_key is distinct from p_payment_key then
      raise exception 'ORDER_ALREADY_PAID';
    end if;
    return query select v_order.seeds, 0, true;
    return;
  end if;

  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  -- 결제대행사가 확인해 준 금액이 주문 금액과 다르면 지급하지 않는다
  if p_amount <> v_order.amount then
    raise exception 'AMOUNT_MISMATCH';
  end if;

  update public.orders o
  set status = 'paid', payment_key = p_payment_key, paid_at = now()
  where o.id = p_order;

  -- 같은 사용자의 씨앗 잡기(hold_seeds)와 한 줄로 세운다
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  insert into public.seed_lots (user_id, kind, order_id, seeds, amount, expires_at)
  values (p_user, 'paid', p_order, v_order.seeds, v_order.amount, now() + interval '1 year')
  returning id into v_lot;

  insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
  values (p_user, v_order.seeds, 'purchase', v_lot, 'purchase:' || p_order);

  -- 첫 결제 보너스: 이 계정이 보너스를 한 번도 받은 적 없을 때만.
  -- 원장 줄의 ref_key(bonus:주문)로 어느 결제에 딸린 보너스인지 남긴다 (환불 계산에 쓴다)
  if not exists (
    select 1 from public.ledger l where l.user_id = p_user and l.kind = 'bonus'
  ) then
    insert into public.seed_lots (user_id, kind, seeds, expires_at)
    values (p_user, 'free', 1, now() + interval '1 year')
    returning id into v_lot;

    insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
    values (p_user, 1, 'bonus', v_lot, 'bonus:' || p_order);
    v_bonus := 1;
  end if;

  return query select v_order.seeds, v_bonus, false;
end;
$$;

-- ─────────────────────────────────────────────
-- 2. 이미 있는 묶음을 산 날부터 1년으로 맞춘다 (1년보다 긴 것만)
-- ─────────────────────────────────────────────
update public.seed_lots s
set expires_at = s.created_at + interval '1 year'
where s.expires_at > s.created_at + interval '1 year';

-- ─────────────────────────────────────────────
-- 3. 환불 계산: 017과 같고, 돌려주는 값 맨 끝에 환불 기한을 더했다.
--    돌려주는 열이 바뀌면 create or replace를 쓸 수 없어 지우고 다시 만든다
-- ─────────────────────────────────────────────
drop function public.refund_quote(uuid, int, timestamptz);

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
  expired boolean,
  refund_until timestamptz
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
    v_lot.expires_at <= now(),
    v_order.paid_at + interval '5 years';
end;
$$;

revoke execute on function public.refund_quote(uuid, int, timestamptz) from public, anon, authenticated;
grant execute on function public.refund_quote(uuid, int, timestamptz) to service_role;

-- ─────────────────────────────────────────────
-- 4. 환불 만들기: 017과 같고, 이용 기간 대신 환불 기한(산 날부터 5년)을 본다
-- ─────────────────────────────────────────────
create or replace function public.refund_order(
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

  -- 이용 기간(1년)이 끝난 묶음도 산 날부터 5년 안에 받은 요청이면 환불한다
  if p_requested_at > q.refund_until then
    raise exception 'REFUND_PERIOD_OVER';
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
-- 5. 구매 내역: 017과 같고, 맨 뒤에 환불 기한과 환불 가능 여부를 더했다
--    refundable: 환불 기한이 남았는지 (남은 씨앗이 있는지는 remaining으로 따로 본다)
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
  ), 0)::int as refunded_amount,
  o.paid_at + interval '5 years' as refund_until,
  o.paid_at + interval '5 years' > now() as refundable
from public.orders o
join public.seed_lots s on s.order_id = o.id
left join public.ledger l on l.lot_id = s.id
where o.status = 'paid'
group by o.id, s.id;
