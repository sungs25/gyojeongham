-- 환불 기한을 산 날부터 5년에서 이용 기한(산 날부터 1년)으로 줄인다.
-- 왜: KG이니시스 포인트충전 입점조건(2026-10-23 메일)
--     - 포인트는 결제한 때부터 최대 1년 안에 쓰고, 쓰지 않은 포인트는 소멸됨을 명시해야 한다
--     - 충전한 포인트를 현금으로 돌려주는 방식은 입점 불가, 환불은 결제수단(카드)으로만 가능하다
--     019의 "이용 기간이 지나도 5년 안 환불"은 1년이 지나 카드 취소 기한이 끝난 뒤에는 계좌 송금(현금 환급)으로만
--     처리할 수 있어 이 조건과 맞지 않는다. 이용 기한이 끝나 소멸된 씨앗은 환불하지 않는다.
--
-- 바뀌는 것
--   1) refund_quote: 환불 기한(refund_until)이 결제 시각 + 5년 → 그 묶음의 이용 기한(seed_lots.expires_at)
--   2) purchases: refund_until·refundable을 이용 기한 기준으로
--   refund_order는 019 그대로다. 이미 q.refund_until로 막으므로(REFUND_PERIOD_OVER) 1)만으로 이용 기한이 지난
--   묶음의 환불이 막힌다. 'account' 환불 경로는 지우지 않고 쓰지 않는다.
--   돌려주는 열·뷰의 열은 그대로라 create or replace로 바꾼다.

-- ─────────────────────────────────────────────
-- 1. 환불 계산: 019와 같고, 맨 끝 refund_until만 바꿨다
-- ─────────────────────────────────────────────
create or replace function public.refund_quote(
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
    v_lot.expires_at;
end;
$$;

revoke execute on function public.refund_quote(uuid, int, timestamptz) from public, anon, authenticated;
grant execute on function public.refund_quote(uuid, int, timestamptz) to service_role;

-- ─────────────────────────────────────────────
-- 2. 구매 내역: 019와 같고, 환불 기한·환불 가능 여부를 이용 기한 기준으로 바꿨다
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
  s.expires_at as refund_until,
  s.expires_at > now() as refundable
from public.orders o
join public.seed_lots s on s.order_id = o.id
left join public.ledger l on l.lot_id = s.id
where o.status = 'paid'
group by o.id, s.id;