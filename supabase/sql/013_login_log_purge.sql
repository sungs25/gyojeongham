-- 로그인 기록(auth.audit_log_entries: 접속 IP·브라우저 정보 포함)을 3개월만 남긴다.
-- 개인정보 처리방침 1항 "로그인 기록 3개월"(통신비밀보호법 시행령 41조 로그기록자료 3개월)에 맞춘다.
--
-- 적용 순서
--   1. 대시보드 Authentication → Audit Logs → "Write audit logs to the database"를 켠다
--   2. 아래 delete 문만 SQL Editor에서 먼저 실행해, 0건이라도 오류 없이 끝나는지(삭제 권한) 확인한다
--   3. 그다음 cron.schedule까지 실행한다 (매일 03:20 UTC = 한국 12:20)
delete from auth.audit_log_entries where created_at < now() - interval '3 months';

select cron.schedule(
  'purge-auth-audit-log',
  '20 3 * * *',
  $$delete from auth.audit_log_entries where created_at < now() - interval '3 months'$$
);