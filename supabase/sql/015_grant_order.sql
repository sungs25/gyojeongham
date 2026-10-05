-- 결제가 승인된 주문에 씨앗을 지급한다 (6-4).
-- 서버가 결제대행사에 "이 결제가 정말 끝났고 금액이 맞는지" 확인한 뒤에만 부른다 (확인 부분은 6-2에서 붙인다).
-- 이 함수는 결제대행사와 상관없이 DB 쪽 일만 한다.
--   1) 주문을 paid로 바꾸고 결제 키를 적는다
--   2) 유료 묶음 하나를 만든다 (산 날부터 5년)
--   3) 계정의 첫 결제면 무료 씨앗 1개 묶음을 함께 만든다 (산 날부터 5년)
-- 같은 주문으로 두 번 불려도(새로 고침, 웹훅 중복 등) 씨앗은 한 번만 준다.

create function public.grant_order(p_user uuid, p_order uuid, p_payment_key text, p_amount int)
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
  values (p_user, 'paid', p_order, v_order.seeds, v_order.amount, now() + interval '5 years')
  returning id into v_lot;

  insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
  values (p_user, v_order.seeds, 'purchase', v_lot, 'purchase:' || p_order);

  -- 첫 결제 보너스: 이 계정이 보너스를 한 번도 받은 적 없을 때만.
  -- 원장 줄의 ref_key(bonus:주문)로 어느 결제에 딸린 보너스인지 남긴다 (환불 계산에 쓴다)
  if not exists (
    select 1 from public.ledger l where l.user_id = p_user and l.kind = 'bonus'
  ) then
    insert into public.seed_lots (user_id, kind, seeds, expires_at)
    values (p_user, 'free', 1, now() + interval '5 years')
    returning id into v_lot;

    insert into public.ledger (user_id, delta, kind, lot_id, ref_key)
    values (p_user, 1, 'bonus', v_lot, 'bonus:' || p_order);
    v_bonus := 1;
  end if;

  return query select v_order.seeds, v_bonus, false;
end;
$$;

-- 서버(비밀 키)만 부를 수 있다
revoke execute on function public.grant_order(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.grant_order(uuid, uuid, text, int) to service_role;
