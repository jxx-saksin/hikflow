// =============================================================================
// Hikflow 설정 — 여기 세 줄만 채우면 됩니다.
//
//  1) Supabase 콘솔 > Project Settings > API 에서 값을 복사하세요.
//     - SUPABASE_URL      : "Project URL"
//     - SUPABASE_ANON_KEY : "anon public" 키 (이 키는 공개돼도 안전합니다.
//                            실제 접근 제어는 DB의 RLS + 허용 명단이 담당해요.)
//  2) 누가 들어올 수 있는지는 코드가 아니라 Supabase의 허용 명단
//     (allowed_members 표)이 정합니다. 도메인 제한은 두지 않습니다.
//
//  ⚠ 이 파일은 GitHub Pages가 그대로 서빙합니다(브라우저에 노출됨). anon 키만 넣고,
//     service_role 키 같은 비밀 키는 절대 여기에 넣지 마세요.
// =============================================================================

export const SUPABASE_URL      = "https://piopfvegjkfikpibvctg.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_DXYguBkXkdr8lLG3qZUR-g_CC4dXMue";

// 접근 허용은 Supabase의 allowed_members 표에서 관리합니다.
// 회사 도메인이 아닌 사람(외부 협력자 등)도 명단에 넣으면 들어올 수 있습니다.
//   추가/제외: Supabase → Table Editor → allowed_members
