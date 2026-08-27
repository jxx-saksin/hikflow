// =============================================================================
// 데이터 계층 (store) — 화면 코드(app.js)는 이 함수들만 호출합니다.
// 프로토타입의 메모리 배열/함수를 그대로 대체하는 자리입니다.
// 활동 로그는 DB 트리거가 자동 기록하므로 여기서 log()를 부르지 않습니다.
// =============================================================================
import { supabase } from "./supabase.js";
import { ALLOWED_DOMAIN } from "./config.js";

// 현재 로그인한 사용자 프로필 { id, email, name }
export let currentUser = null;

// ---------- 인증 ----------------------------------------------------------
export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // 회사 도메인 계정만 계정 선택창에 뜨도록 유도(+ 서버측은 RLS가 최종 차단)
      queryParams: { hd: ALLOWED_DOMAIN.replace(/^@/, ""), prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
}

// 세션을 확인하고, 허용 명단에 없으면 즉시 로그아웃.
// 반환: { status: 'in' | 'out' | 'not-allowed', email? }
//
// 명단 검사는 DB의 is_allowed_member() 함수로 합니다. 화면에서만 막는 게 아니라
// 모든 테이블의 RLS가 같은 함수를 쓰기 때문에, 이 검사를 우회해도 데이터는
// 한 줄도 못 가져갑니다.
export async function resolveSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { currentUser = null; return { status: "out" }; }

  const email = session.user.email || "";

  const { data: allowed, error } = await supabase.rpc("is_allowed_member");
  if (error || !allowed) {
    await supabase.auth.signOut();
    currentUser = null;
    return { status: "not-allowed", email };
  }

  // profiles 는 로그인 시 트리거로 생성되지만, 타이밍상 지연될 수 있어 보정 조회.
  let profile = await loadProfile(session.user.id);
  currentUser = profile || { id: session.user.id, email, name: email.split("@")[0] };
  return { status: "in" };
}

async function loadProfile(id) {
  const { data } = await supabase.from("profiles").select("id,email,name").eq("id", id).maybeSingle();
  return data;
}

// 로그인/로그아웃 이벤트를 화면에 알림
export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") cb(event);
  });
}

// ---------- 조회 ----------------------------------------------------------

// 프로젝트 목록 + 진행률 계산용 업무 상태
export async function fetchProjects() {
  const { data: projects, error } = await supabase
    .from("projects").select("id,name,description,status,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const { data: taskRows, error: e2 } = await supabase
    .from("tasks").select("project_id,state");
  if (e2) throw e2;

  // 프로젝트별 { total, done } 집계
  const stats = {};
  for (const t of taskRows) {
    const s = (stats[t.project_id] ||= { total: 0, done: 0 });
    s.total++;
    if (t.state === "done") s.done++;
  }
  return projects.map((p) => ({ ...p, stats: stats[p.id] || { total: 0, done: 0 } }));
}

export async function fetchProject(id) {
  const { data, error } = await supabase
    .from("projects").select("id,name,description,status").eq("id", id).single();
  if (error) throw error;
  return data;
}

// 한 프로젝트의 업무들 (앱 이름 · 담당자 이름 조인)
export async function fetchTasks(projectId) {
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      id, title, due_date, link, state, project_id, application_id,
      app:applications(name),
      assignee:profiles!tasks_assignee_id_fkey(id,name),
      comments:task_comments(count)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return data.map((t) => ({
    id: t.id,
    title: t.title,
    due: t.due_date,
    link: t.link,
    state: t.state,
    app: t.app?.name || "",
    assigneeId: t.assignee?.id || null,
    assignee: t.assignee?.name || "",
    commentCount: t.comments?.[0]?.count || 0,
  }));
}

// 팀원(담당자 후보) — 로그인한 적 있는 사용자
export async function fetchTeam() {
  const { data, error } = await supabase.from("profiles").select("id,name,email").order("name");
  if (error) throw error;
  return data;
}

// 활동 로그 (최신순)
export async function fetchLogs(limit = 200) {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, verb, meta, created_at, actor:profiles(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((l) => ({
    id: l.id,
    verb: l.verb,
    meta: l.meta || {},
    who: l.actor?.name || "알 수 없음",
    time: l.created_at,
  }));
}

// ---------- 생성 / 수정 ---------------------------------------------------

export async function createProject(name, description) {
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, description: description || null, created_by: currentUser?.id, status: "active" })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

// 프로젝트 내 애플리케이션을 이름으로 찾고 없으면 생성 (3단 계층 유지)
async function getOrCreateApplication(projectId, name) {
  const clean = (name || "").trim();
  if (!clean) return null;

  const found = await supabase
    .from("applications").select("id")
    .eq("project_id", projectId).eq("name", clean).maybeSingle();
  if (found.data) return found.data.id;

  const created = await supabase
    .from("applications").insert({ project_id: projectId, name: clean }).select("id").single();
  if (!created.error) return created.data.id;

  // 동시 생성 등으로 unique 충돌 시 재조회
  const retry = await supabase
    .from("applications").select("id")
    .eq("project_id", projectId).eq("name", clean).maybeSingle();
  return retry.data?.id || null;
}

export async function createTask({ projectId, appName, title, assigneeId, due, link, state }) {
  const application_id = await getOrCreateApplication(projectId, appName);
  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    application_id,
    title,
    assignee_id: assigneeId || null,
    due_date: due || null,
    link: (link || "").trim() || null,
    state: state || "wait",
    created_by: currentUser?.id,
  });
  if (error) throw error;
}

export async function moveTask(taskId, newState) {
  const { error } = await supabase.from("tasks").update({ state: newState }).eq("id", taskId);
  if (error) throw error;
}

export async function updateTask(taskId, { projectId, appName, title, assigneeId, due, link, state }) {
  const application_id = await getOrCreateApplication(projectId, appName);
  const { error } = await supabase.from("tasks").update({
    application_id,
    title,
    assignee_id: assigneeId || null,
    due_date: due || null,
    link: (link || "").trim() || null,
    state,
  }).eq("id", taskId);
  if (error) throw error;
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function updateProject(id, { name, description, status }) {
  const { error } = await supabase.from("projects")
    .update({ name, description: description || null, status }).eq("id", id);
  if (error) throw error;
}

// 프로젝트를 지우면 하위 애플리케이션·업무도 함께 사라집니다(DB cascade).
export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ---------- 코멘트 --------------------------------------------------------

export async function fetchComments(taskId) {
  const { data, error } = await supabase
    .from("task_comments")
    .select("id, body, created_at, author_id, author:profiles(name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    body: c.body,
    who: c.author?.name || "알 수 없음",
    authorId: c.author_id,
    time: c.created_at,
    mine: c.author_id === currentUser?.id,
  }));
}

export async function addComment(taskId, body) {
  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId, author_id: currentUser?.id, body: body.trim(),
  });
  if (error) throw error;
}

// 본인이 쓴 코멘트만 지워집니다(RLS가 강제).
export async function deleteComment(commentId) {
  const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
  if (error) throw error;
}

// ---------- 실시간 --------------------------------------------------------
// 프로젝트/업무/로그가 바뀌면(누가 바꾸든) cb를 호출 → 화면 새로고침.
let channel = null;
export function subscribeRealtime(cb) {
  if (channel) return;
  channel = supabase
    .channel("hikflow-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, cb)
    .subscribe();
}
