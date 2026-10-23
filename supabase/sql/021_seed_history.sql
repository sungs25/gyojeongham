-- 씨앗 내역(충전·사용·반환·환불·소멸과 그때의 남은 씨앗)을 한 줄씩 돌려주는 뷰.
-- 왜: KG이니시스 포인트충전 입점조건(2026-10-23 메일) — 포인트 차감 페이지에 충전내역·차감내역(상품명)·잔여포인트가
--     보여야 하고, 이용 흐름과 계산이 맞아야 한다. 내 계정 > 씨앗 내역(/account/history)이 읽는다.
--
-- 원장(ledger)을 그대로 보여 주지 않고 아래처럼 묶는다.
--   - 교정 한 번: hold(묶음마다 한 줄)와 release(반환)를 작업마다 합쳐 한 줄. 글자 수는 jobs에서
--   - 환불: refund_order가 남긴 줄을 환불마다 한 줄(보너스 회수는 따로 한 줄). 되돌린 환불(undo)은 합이 0이라 뺀다
--   - 소멸: 원장에 줄이 없다(잔액 뷰가 기간 지난 묶음을 빼고 셀 뿐). 기간이 지난 묶음의 남은 씨앗을 이용 기한 날짜에
--     한 줄로 만든다. 이 줄이 있어야 위에서부터 더하고 뺀 값이 잔액(balances)과 맞는다
--   - lot_id가 없는 원장 줄(014 이전 기록)은 잔액에도 안 쓰이므로 뺀다
-- balance: 그 줄까지 더한 남은 씨앗 (시각 순, 같은 시각이면 원장 순서)
-- security_invoker라 원장·묶음·작업의 "본인 읽기" 정책이 그대로 적용된다(본인 줄만 나온다).

create or replace view public.seed_history
with (security_invoker = true) as
with lines as (
  -- 충전·보너스·옮긴 씨앗·조정: 원장 한 줄 = 내역 한 줄
  select
    l.user_id,
    l.created_at as at,
    l.id as sort_id,
    case l.kind
      when 'purchase' then 'purchase'
      when 'bonus' then 'bonus'
      when 'opening' then 'opening'
      else 'adjust'
    end as kind,
    l.delta,
    case when l.kind = 'purchase' then s.seeds end as lot_seeds,
    case when l.kind = 'purchase' then s.amount end as lot_amount,
    null::int as chars,
    null::int as chars_done
  from public.ledger l
  join public.seed_lots s on s.id = l.lot_id
  where l.kind not in ('hold', 'release', 'refund')

  union all

  -- 교정: 작업마다 한 줄 (잡아 둔 씨앗 − 돌려준 씨앗)
  select
    j.user_id,
    j.created_at,
    min(l.id),
    case
      when j.status = 'held' then 'use_running'
      when j.status = 'released' then 'use_failed'
      when bool_or(l.kind = 'release') then 'use_stopped'
      else 'use'
    end,
    sum(l.delta)::int,
    null,
    null,
    j.char_limit,
    j.chars_used
  from public.ledger l
  join public.jobs j on j.id = l.job_id
  where l.kind in ('hold', 'release') and l.lot_id is not null
  group by j.id

  union all

  -- 환불: 환불마다 한 줄, 보너스 회수는 따로 (ref_key 끝의 환불 번호로 묶는다)
  select
    min(l.user_id::text)::uuid,
    min(l.created_at),
    min(l.id),
    case when bool_or(l.ref_key like '%refund-bonus:%') then 'refund_bonus' else 'refund' end,
    sum(l.delta)::int,
    null,
    null,
    null,
    null
  from public.ledger l
  where l.kind = 'refund' and l.lot_id is not null
  group by substring(l.ref_key from '[0-9]+$'), (l.ref_key like '%refund-bonus:%')
  having sum(l.delta) <> 0

  union all

  -- 소멸: 이용 기한이 지난 묶음의 남은 씨앗
  select
    s.user_id,
    s.expires_at,
    null,
    'expire',
    -sum(l.delta)::int,
    null,
    null,
    null,
    null
  from public.seed_lots s
  join public.ledger l on l.lot_id = s.id
  where s.expires_at <= now()
  group by s.id
  having sum(l.delta) > 0
)
select
  user_id,
  at,
  kind,
  delta,
  lot_seeds,
  lot_amount,
  chars,
  chars_done,
  sum(delta) over (
    partition by user_id
    order by at, sort_id nulls last
    rows between unbounded preceding and current row
  )::int as balance,
  -- 화면의 정렬·key용 (시각 순서와 같은 차례)
  row_number() over (partition by user_id order by at, sort_id nulls last) as seq
from lines;

grant select on public.seed_history to authenticated, service_role;