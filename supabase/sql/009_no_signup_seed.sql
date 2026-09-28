-- 가입 씨앗 지급을 끈다. 무료 씨앗은 첫 결제 보너스로 대신한다 (6-4).
-- 가입만으로 받는 씨앗은 계정을 새로 만들어 반복해서 받아 갈 수 있고, 막을 수단이 없다.
-- 이미 지급된 씨앗(원장의 signup_grant 줄)은 그대로 둔다.
-- signup_grants 테이블과 grant_signup_seed 함수는 기록으로 남기고, 트리거만 지운다.

drop trigger on_auth_identity_created on auth.identities;