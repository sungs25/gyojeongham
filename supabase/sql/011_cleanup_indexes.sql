-- 010의 예약 작업이 표 전체를 훑지 않게 하는 인덱스.
-- 로컬 측정(작업 20만 건): 멈춘 작업 반환 94~262ms → 약 1ms

-- 잡혀 있는(held) 작업만 모은 인덱스. 대부분의 작업은 끝난 상태라 인덱스가 아주 작다
create index jobs_held_idx on public.jobs (created_at) where status = 'held';

-- 24시간 지난 결과를 찾는 인덱스
create index chunk_results_created_at_idx on public.chunk_results (created_at);