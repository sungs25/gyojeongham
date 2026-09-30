-- 010_chunk_results.sql을 적용한 뒤, pg_cron을 켠 상태에서 실행한다.
-- (대시보드 Integrations → Cron → pg_cron 켜기)
select cron.schedule('purge-chunk-results', '*/10 * * * *', 'select public.purge_chunk_results()');
select cron.schedule('release-stale-jobs', '*/5 * * * *', 'select public.release_stale_jobs()');