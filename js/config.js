// =============================================================================
// Hikflow 설정 — 여기 세 줄만 채우면 됩니다.
//
//  1) Supabase 콘솔 > Project Settings > API 에서 값을 복사하세요.
//     - SUPABASE_URL      : "Project URL"
//     - SUPABASE_ANON_KEY : "anon public" 키 (이 키는 공개돼도 안전합니다.
//                            실제 접근 제어는 DB의 RLS + 허용 명단이 담당해요.)
//  2) ALLOWED_DOMAIN 은 보안 장치가 아니라 편의 설정입니다(아래 설명 참고).
//
//  ⚠ 이 파일은 GitHub Pages가 그대로 서빙합니다(브라우저에 노출됨). anon 키만 넣고,
//     service_role 키 같은 비밀 키는 절대 여기에 넣지 마세요.
// =============================================================================

export const SUPABASE_URL      = "여기에_PROJECT_URL_붙여넣기";     // 예: https://abcdxyz.supabase.co
export const SUPABASE_ANON_KEY = "여기에_ANON_PUBLIC_KEY_붙여넣기";

// 회사 지메일 도메인 (@ 포함).
// 구글 로그인 창에서 회사 계정이 먼저 뜨도록 하는 힌트일 뿐입니다.
// ⚠ 실제 접근 제어는 Supabase의 허용 명단(allowed_members 표)이 담당합니다.
//    누가 들어올 수 있는지는 그 표에서 관리하세요.
export const ALLOWED_DOMAIN = "@hxx.kr";
