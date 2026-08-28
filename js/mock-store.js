// =============================================================================
// 프로토타입 모드용 가짜 데이터 계층.
// store.js 와 "완전히 같은 함수 이름/모양"을 제공합니다.
// config.js 에 Supabase 키를 넣기 전까지 이 파일이 대신 쓰입니다.
//   → 화면을 실제처럼 클릭하며 다듬어볼 수 있고,
//     키를 넣는 순간 store.js(진짜 DB)로 그대로 갈아끼워집니다.
// 데이터는 메모리에만 있으므로 새로고침하면 샘플로 초기화됩니다.
// =============================================================================

export const IS_MOCK = true;

export let currentUser = null;

// ---------- 샘플 데이터 ----------------------------------------------------
const TEAM = [
  { id: "u1", name: "Sarah Kim", email: "sarah@example.com" },
  { id: "u2", name: "Daniel Lee", email: "daniel@example.com" },
  { id: "u3", name: "Mina Park", email: "mina@example.com" },
  { id: "u4", name: "Alex Jung", email: "alex@example.com" },
  { id: "u5", name: "Grace Choi", email: "grace@example.com" },
];

const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const uid = () => Math.random().toString(36).slice(2, 9);

let projects = [
  { id: "p1", name: "Booking System Revamp", description: "Rebuild the meeting room and equipment booking service", status: "active",
    key_points: ["Must ship before the Q4 office move", "Legal sign-off needed for the data migration"] },
  { id: "p2", name: "Customer Dashboard v2", description: "New usage analytics and reporting screens", status: "active", key_points: [] },
  { id: "p3", name: "Legacy API Cleanup", description: "Document old endpoints, then deprecate them in phases", status: "hold",
    key_points: ["Do not remove v1 until the mobile app is updated"] },
];

let tasks = [
  { id: "t1", projectId: "p1", title: "Drag-to-select calendar", description: "Let people drag across time slots to pick a range. Must work with touch too.", assigneeIds: ["u1","u2"], due: isoIn(3), link: "", state: "doing" },
  { id: "t2", projectId: "p1", title: "Prevent double-booking", description: "Reject overlapping reservations for the same room.", assigneeIds: ["u2"], due: isoIn(-1), link: "", state: "doing" },
  { id: "t3", projectId: "p1", title: "Confirmation email", description: "", assigneeIds: [], due: isoIn(6), link: "", state: "wait" },
  { id: "t4", projectId: "p1", title: "Equipment list CRUD", description: "Admin screens to add, edit and retire equipment.", assigneeIds: ["u4","u5","u1"], due: isoIn(-3), link: "", state: "done" },
  { id: "t5", projectId: "p2", title: "Daily aggregation query", description: "", assigneeIds: ["u5"], due: isoIn(5), link: "", state: "doing" },
  { id: "t6", projectId: "p2", title: "Retention graph", description: "Cohort retention chart for the dashboard.", assigneeIds: ["u1"], due: isoIn(9), link: "", state: "wait" },
];

let logs = [];

// 샘플 코멘트 (상세 화면이 비어 보이지 않도록)
let comments = [
  { id: "c1", taskId: "t1", authorId: "u2", body: "Please make sure drag-select works on mobile too — worth checking the touch events.", at: -2 },
  { id: "c2", taskId: "t1", authorId: "u1", body: "Agreed, touch support is included in what I'm working on.", at: -1 },
  { id: "c3", taskId: "t2", authorId: "u4", body: "Added test cases for concurrent bookings. Could you take a look?", at: -1 },
];

// 실제 DB에선 트리거가 하는 일을 여기선 흉내만 냅니다.
function addLog(verb, meta, projectId) {
  logs.unshift({ id: uid(), verb, meta, who: currentUser?.name || "?", time: new Date().toISOString(), projectId });
}

const sleep = (ms = 120) => new Promise((r) => setTimeout(r, ms)); // 네트워크 지연 흉내

// ---------- 인증 (프로토타입: 그냥 첫 번째 팀원으로 입장) --------------------
let authCb = null;

export async function signInWithGoogle() {
  await sleep(200);
  currentUser = TEAM[0];
  if (authCb) authCb("SIGNED_IN");
}

export async function signOut() {
  currentUser = null;
  if (authCb) authCb("SIGNED_OUT");
}

// 프로토타입 모드에선 새로고침 시 항상 로그아웃 상태로 시작
export async function resolveSession() {
  return currentUser ? { status: "in" } : { status: "out" };
}

export function onAuthChange(cb) { authCb = cb; }

// 프로토타입 모드에선 실시간 동기화 없음(혼자 보는 화면이므로)
export function subscribeRealtime() {}

// ---------- 조회 ----------------------------------------------------------
export async function fetchProjects() {
  await sleep();
  return projects.map((p) => {
    const pt = tasks.filter((t) => t.projectId === p.id);
    return { ...p, stats: { total: pt.length, done: pt.filter((t) => t.state === "done").length } };
  });
}

export async function fetchProject(id) {
  await sleep(60);
  return projects.find((p) => p.id === id);
}

export async function fetchTasks(projectId) {
  await sleep();
  return tasks
    .filter((t) => t.projectId === projectId)
    .map((t) => ({
      ...t,
      assignees: (t.assigneeIds || []).map((id) => TEAM.find((u) => u.id === id)).filter(Boolean),
      commentCount: comments.filter((c) => c.taskId === t.id).length,
    }));
}

// ---------- 코멘트 --------------------------------------------------------
export async function fetchComments(taskId) {
  await sleep(80);
  return comments
    .filter((c) => c.taskId === taskId)
    .map((c) => ({
      id: c.id,
      body: c.body,
      who: TEAM.find((u) => u.id === c.authorId)?.name || "Unknown",
      authorId: c.authorId,
      // 샘플은 상대시간(at: 며칠 전)으로, 새로 단 건 실제 시각으로 표시
      time: c.time || new Date(Date.now() + (c.at || 0) * 864e5).toISOString(),
      mine: c.authorId === currentUser?.id,
    }));
}

export async function addComment(taskId, body) {
  await sleep();
  const t = tasks.find((x) => x.id === taskId);
  comments.push({
    id: uid(), taskId, authorId: currentUser?.id,
    body: body.trim(), time: new Date().toISOString(),
  });
  addLog("comment_added", { title: t?.title }, t?.projectId);
}

export async function deleteComment(commentId) {
  await sleep(80);
  comments = comments.filter((c) => c.id !== commentId);
}

// 내가 담당인 업무 (프로젝트 구분 없이 전부)
export async function fetchMyTasks() {
  await sleep();
  const me = currentUser?.id;
  return tasks
    .filter((t) => (t.assigneeIds || []).includes(me))
    .map((t) => ({
      ...t,
      projectName: projects.find((p) => p.id === t.projectId)?.name || "",
      assignees: (t.assigneeIds || []).map((id) => TEAM.find((u) => u.id === id)).filter(Boolean),
      commentCount: comments.filter((c) => c.taskId === t.id).length,
    }));
}

export async function fetchTeam() { await sleep(60); return TEAM; }

export async function fetchLogs() { await sleep(); return logs; }

// ---------- 생성 / 수정 ---------------------------------------------------
export async function createProject({ name, description, keyPoints }) {
  await sleep();
  const p = { id: uid(), name, description: (description || "").trim(),
              key_points: keyPoints || [], status: "active" };
  projects.push(p);
  addLog("project_added", { name }, p.id);
  return p.id;
}

export async function createTask({ projectId, title, description, assigneeIds, due, link, state }) {
  await sleep();
  const t = {
    id: uid(), projectId, title, description: (description || "").trim(),
    assigneeIds: [...new Set(assigneeIds || [])], due: due || null, link: (link || "").trim(),
    state: state || "wait",
  };
  tasks.push(t);
  addLog("task_added", { title, to: t.state }, projectId);
}

export async function moveTask(taskId, newState) {
  await sleep(80);
  const t = tasks.find((x) => x.id === taskId);
  if (!t || t.state === newState) return;
  const from = t.state;
  t.state = newState;
  addLog("task_moved", { title: t.title, from, to: newState }, t.projectId);
  if (newState === "done") addLog("task_done", { title: t.title }, t.projectId);
}

export async function updateTask(taskId, { title, description, assigneeIds, due, link, state }) {
  await sleep();
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  const from = t.state;
  Object.assign(t, {
    title, description: (description || "").trim(),
    assigneeIds: [...new Set(assigneeIds || [])], due: due || null, link: (link || "").trim(), state,
  });
  addLog("task_edited", { title }, t.projectId);
  if (from !== state) {
    addLog("task_moved", { title, from, to: state }, t.projectId);
    if (state === "done") addLog("task_done", { title }, t.projectId);
  }
}

export async function deleteTask(taskId) {
  await sleep();
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  tasks = tasks.filter((x) => x.id !== taskId);
  comments = comments.filter((c) => c.taskId !== taskId); // 딸린 코멘트도 함께
  addLog("task_deleted", { title: t.title }, t.projectId);
}

export async function updateProject(id, { name, description, status, keyPoints }) {
  await sleep();
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, { name, description: (description || "").trim(),
                     key_points: keyPoints || [], status });
  addLog("project_edited", { name }, id);
}

export async function deleteProject(id) {
  await sleep();
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  const removed = tasks.filter((t) => t.projectId === id).map((t) => t.id);
  projects = projects.filter((x) => x.id !== id);
  tasks = tasks.filter((t) => t.projectId !== id);
  comments = comments.filter((c) => !removed.includes(c.taskId));
  logs = logs.filter((l) => l.projectId !== id);
  addLog("project_deleted", { name: p.name }, null);
}
