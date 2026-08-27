// Supabase 클라이언트 생성.
// 빌드 도구 없이 CDN(ESM)에서 바로 불러옵니다 — 순수 정적 배포에 적합.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// 아직 config.js 를 안 채웠는지 검사 (플레이스홀더 그대로면 false)
export const CONFIGURED =
  /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

// 설정 전이면 createClient 가 잘못된 URL로 터지지 않도록 안전한 더미 URL 사용
const url = CONFIGURED ? SUPABASE_URL : "https://placeholder.supabase.co";
const key = CONFIGURED ? SUPABASE_ANON_KEY : "placeholder";

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,     // 새로고침해도 로그인 유지
    autoRefreshToken: true,
    detectSessionInUrl: true, // 구글 로그인 리다이렉트 처리
  },
});
