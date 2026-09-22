-- 관리자가 손으로 씨앗을 넣고 빼는 기록 (테스트 충전, 고객 문의 보상 등)
alter table public.ledger drop constraint ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check
  check (kind in ('signup_grant', 'purchase', 'hold', 'release', 'adjust'));