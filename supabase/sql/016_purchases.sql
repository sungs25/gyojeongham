-- 구매 내역 (6-4). 결제 완료·내 계정·탈퇴 화면이 읽는다.
-- 왜: 전자상거래법 13조②는 계약이 체결되면 계약 내용(상품·가격·청약철회 등)을 적은 서면을
--     소비자에게 주라고 한다. 그리고 환불을 요청할 때 주문번호가 필요하다.
-- 결제 한 건마다 결제 때 정해진 값(씨앗 수·금액·결제 시각·이용 기한)과 지금 남은 씨앗 수를 보여 준다.
-- 상품 이름은 코드(lib/products.ts)에 있어 나중에 바뀔 수 있으므로 화면에는 씨앗 수로만 적는다.
--
--   remaining: 그 묶음에 붙은 원장 줄의 합 (교정 중이면 잡아 둔 씨앗만큼 줄어 있다)
--   expired:   이용 기간(산 날부터 5년)이 끝났는지
--   bonus:     이 결제와 함께 첫 결제 보너스 씨앗을 받았는지 (015가 남긴 bonus:주문 줄)

create view public.purchases
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
  ) as bonus
from public.orders o
join public.seed_lots s on s.order_id = o.id
left join public.ledger l on l.lot_id = s.id
where o.status = 'paid'
group by o.id, s.id;

-- security_invoker라서 읽는 사람의 권한(RLS)으로 돈다: 로그인한 사람은 자기 결제만 보인다.
-- 로그인하지 않은 사람(anon)은 읽을 일이 없으므로 권한을 뺀다
revoke all on public.purchases from public, anon;
grant select on public.purchases to authenticated, service_role;
