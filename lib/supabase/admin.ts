import { createClient } from '@supabase/supabase-js';

// 서버 전용. 비밀 키로 만든 클라이언트는 RLS를 무시하므로
// 브라우저 코드('use client' 파일)에서 절대 import하지 않는다.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}