-- 하루 결제 한도(5만 원 미만)를 뺀다.
-- 이 숫자는 토스페이먼츠 블로그(2021)에 적힌 충전 서비스 기준이었다.
-- 포인트 충전 업종의 실제 한도는 카드사가 카드번호마다 건다(카드사마다 금액이 다름, 신한은 월 5만 원).
-- 교정햄은 카드번호를 받지 않아 같은 규칙을 만들 수 없고, 한도를 넘으면 결제창에서 카드사가 거절한다.
-- 교정햄에 걸릴 한도는 KG이니시스 RM 심사로 정해진다(포트원 답변 2026-10-06). 정해지면 그때 다시 본다.
-- 함수 이름·인자·반환값은 그대로라 서버 코드(app/api/orders/route.ts)는 한도 오류 처리만 지우면 된다.

create or replace function public.create_order(
  p_user uuid, p_product text, p_seeds int, p_amount int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
begin
  insert into public.orders (user_id, product_id, seeds, amount)
  values (p_user, p_product, p_seeds, p_amount)
  returning id into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, int, int) to service_role;