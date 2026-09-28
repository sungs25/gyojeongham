-- 가입 씨앗을 소셜 계정 하나당 한 번만 준다.
-- 탈퇴(소프트 삭제) 후 같은 소셜 계정으로 재가입하면 새 계정이 생기므로,
-- 계정(auth.users)이 아니라 소셜 계정 연결(auth.identities)을 기준으로 판단한다.
-- "제공자:제공자 쪽 계정 ID"의 SHA-256만 저장하고, 탈퇴해도 지우지 않는다.

create table public.signup_grants (
  identity_hash text primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- 브라우저에서는 읽기·쓰기 불가 (정책 없음)
alter table public.signup_grants enable row level security;

-- 지금 연결된 소셜 계정은 이미 씨앗을 받았으므로 미리 채운다
-- (탈퇴한 계정은 원래 ID가 가려져 있어 채울 수 없다)
insert into public.signup_grants (identity_hash, user_id)
select encode(sha256(convert_to(i.provider || ':' || i.provider_id, 'UTF8')), 'hex'), i.user_id
from auth.identities i
join auth.users u on u.id = i.user_id
where u.deleted_at is null
on conflict (identity_hash) do nothing;

-- 가입 씨앗 지급: 처음 보는 소셜 계정일 때만 1개
create or replace function public.grant_signup_seed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.signup_grants (identity_hash, user_id)
  values (
    encode(sha256(convert_to(new.provider || ':' || new.provider_id, 'UTF8')), 'hex'),
    new.user_id
  )
  on conflict (identity_hash) do nothing;

  -- 위에서 새 줄이 들어갔을 때만 (이미 있던 소셜 계정이면 found = false)
  if found then
    insert into public.ledger (user_id, delta, kind, ref_key)
    values (new.user_id, 1, 'signup_grant', 'signup:' || new.user_id)
    on conflict (ref_key) do nothing;
  end if;

  return new;
end;
$$;

-- 기준을 계정 생성에서 소셜 계정 연결로 옮긴다
drop trigger on_auth_user_created on auth.users;

create trigger on_auth_identity_created
  after insert on auth.identities
  for each row execute function public.grant_signup_seed();