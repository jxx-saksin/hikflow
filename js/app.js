// =============================================================================
// 화면(UI) 계층 — store.js 의 함수만 호출합니다. 렌더 로직은 프로토타입과 동일한
// 구조를 유지하되, 데이터가 Supabase에서 비동기로 오므로 async/await 로 바꿨습니다.
// =============================================================================
import { CONFIGURED } from "./supabase.js";

// Supabase 키가 있으면 진짜 DB(store.js), 없으면 샘플 데이터(mock-store.js).
// 두 파일은 함수 이름·모양이 같아서 화면 코드는 어느 쪽이든 그대로 동작합니다.
const store = CONFIGURED
  ? await import("./store.js")
  : await import("./mock-store.js");

const STATE_LABEL = { wait: "To Do", doing: "In Progress", done: "Done" };
const $ = (id) => document.getElementById(id);

let currentProjectId = null;
let currentView = "projects";
let teamCache = [];          // 담당자 후보
let currentTasks = [];       // 현재 보드의 업무(앱 datalist 계산용)

// ---------- 부팅 / 인증 흐름 ----------------------------------------------
async function boot() {
  // 프로토타입 모드 표시
  // Prototype-mode banner
  if (!CONFIGURED) {
    document.querySelectorAll(".proto-only").forEach((el) => (el.style.display = "block"));
    // 미리보기: ?preview=denied 로 접속하면 "접근 권한 없음" 화면을 볼 수 있습니다.
    if (new URLSearchParams(location.search).get("preview") === "denied") {
      return showDenied();
    }
  }
  showLoading(true);
  let res;
  try {
    res = await store.resolveSession();
  } catch (e) {
    console.error('[Hikflow]', e);
    showLoading(false);
    return showGate("Couldn’t connect. Check the keys in js/config.js.");
  }
  showLoading(false);

  // 허용 명단에 없는 계정 → 로고 + 안내만 띄우고 끝
  if (res.status === "not-allowed") return showDenied();
  if (res.status === "out") return showGate("");

  // 로그인 완료
  enterApp();
}

// 명단 밖 계정. 이미 로그아웃된 상태라 새로고침하면 로그인 화면으로 돌아갑니다.
function showDenied() {
  $("app").classList.remove("on");
  $("gate").style.display = "none";
  $("denied").style.display = "flex";
}

function showGate(errorMsg) {
  $("app").classList.remove("on");
  $("denied").style.display = "none";
  $("gate").style.display = "flex";
  $("gate-err").textContent = errorMsg || "";
  const btn = $("googleBtn");
  if (btn) btn.disabled = false;
}

function enterApp() {
  $("gate").style.display = "none";
  $("denied").style.display = "none";
  $("app").classList.add("on");
  const u = store.currentUser;
  $("whoName").textContent = u?.name || "";
  $("whoAv").textContent = initials(u?.name || "?");

  store.subscribeRealtime(onRealtime);
  // 팀 목록 미리 로드(담당자 드롭다운용)
  store.fetchTeam().then((t) => (teamCache = t)).catch(() => {});
  switchTab("projects");
}

// 실시간 변경 → 현재 보고 있는 화면만 다시 그림 (짧게 디바운스)
let rtTimer = null;
function onRealtime() {
  clearTimeout(rtTimer);
  rtTimer = setTimeout(() => {
    if (currentView === "projects" && !currentProjectId) renderProjects();
    else if (currentProjectId) renderBoard();
    else if (currentView === "activity") renderLog();
  }, 250);
}

// ---------- 인증 버튼 ------------------------------------------------------
async function signIn() {
  $("googleBtn").disabled = true;
  $("gate-err").textContent = "";
  try {
    await store.signInWithGoogle(); // 구글로 리다이렉트됨
  } catch (e) {
    console.error('[Hikflow]', e);
    $("googleBtn").disabled = false;
    $("gate-err").textContent = "Couldn’t start sign-in. Please check your setup.";
  }
}
async function logout() {
  await store.signOut();
  currentProjectId = null;
  showGate("");
}

// ---------- 탭 / 내비게이션 ------------------------------------------------
async function switchTab(view) {
  currentView = view;
  currentProjectId = null;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.view === view));
  $("tabs").style.display = "flex";
  $("view-projects").style.display = view === "projects" ? "block" : "none";
  $("view-activity").style.display = view === "activity" ? "block" : "none";
  $("view-detail").style.display = "none";
  if (view === "projects") await renderProjects();
  if (view === "activity") await renderLog();
}

async function openProject(id) {
  currentProjectId = id;
  $("view-projects").style.display = "none";
  $("view-activity").style.display = "none";
  $("view-detail").style.display = "block";
  $("tabs").style.display = "none";
  try {
    const p = await store.fetchProject(id);
    $("detailTitle").textContent = p.name;
    $("crumbName").textContent = p.name;
  } catch (e) { /* 아래 renderBoard 에서 오류 처리 */ }
  await renderBoard();
}

// ---------- 렌더: 프로젝트 목록 -------------------------------------------
async function renderProjects() {
  const grid = $("projGrid");
  grid.innerHTML = "";
  let projects;
  try {
    projects = await store.fetchProjects();
  } catch (e) {
    console.error('[Hikflow]', e);
    return (grid.innerHTML = errBox("Couldn’t load projects."));
  }

  projects.forEach((p) => {
    const { total, done } = p.stats;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const pillClass = p.status === "active" ? "active" : p.status === "hold" ? "hold" : "closed";
    const pillText = p.status === "active" ? "Active" : p.status === "hold" ? "On hold" : "Closed";
    const el = document.createElement("div");
    el.className = "proj";
    el.onclick = () => openProject(p.id);
    el.innerHTML = `
      <div class="top-row">
        <h3>${esc(p.name)}</h3>
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="pill ${pillClass}">${pillText}</span>
          <button class="edit" title="Edit project">⋯</button>
        </div>
      </div>
      <div class="desc">${esc(p.description || "No description")}</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="foot"><span>${total} ${total === 1 ? "task" : "tasks"}</span><span>${done}/${total} done</span></div>`;
    // 수정 버튼은 카드 열기(상세 이동)와 겹치지 않게 이벤트 전파를 막습니다
    el.querySelector(".edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openProjEdit(p);
    });
    grid.appendChild(el);
  });

  const add = document.createElement("div");
  add.className = "new-proj";
  add.innerHTML = "+ Add project";
  add.onclick = openProjModal;
  grid.appendChild(add);
}

// ---------- 렌더: 칸반 보드 ------------------------------------------------
async function renderBoard() {
  let tasks;
  try {
    tasks = await store.fetchTasks(currentProjectId);
  } catch (e) {
    console.error('[Hikflow]', e);
    ["wait", "doing", "done"].forEach((s) => ($("col-" + s).innerHTML = ""));
    $("col-wait").innerHTML = errBox("Couldn’t load tasks.");
    return;
  }
  currentTasks = tasks;

  ["wait", "doing", "done"].forEach((state) => {
    const body = $("col-" + state);
    body.innerHTML = "";
    const list = tasks.filter((t) => t.state === state);
    $("cnt-" + state).textContent = list.length;
    list.forEach((t) => body.appendChild(taskCard(t)));
  });

  const apps = [...new Set(tasks.map((t) => t.app).filter(Boolean))];
  $("appList").innerHTML = apps.map((a) => `<option value="${esc(a)}">`).join("");
}

const STATE_ORDER = ["wait", "doing", "done"];

function taskCard(t) {
  const el = document.createElement("div");
  el.className = "task"; el.draggable = true; el.id = t.id;
  el.addEventListener("dragstart", (e) => { el.classList.add("dragging"); e.dataTransfer.setData("id", t.id); });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  const i = STATE_ORDER.indexOf(t.state);
  el.innerHTML = `
    ${t.app ? `<div class="app-tag">${esc(t.app)}</div>` : ""}
    <div class="title">${esc(t.title)}${t.link ? ` <a href="${esc(t.link)}" target="_blank" rel="noopener">↗</a>` : ""}</div>
    <div class="meta">
      <span class="assignee">${t.assignee ? `<span class="mini-av">${initials(t.assignee)}</span>${esc(t.assignee)}` : `<span style="color:var(--ink-dim)">Unassigned</span>`}</span>
      <span style="display:flex;align-items:center;gap:7px;">
        ${t.commentCount ? `<span class="cmt-count">💬 ${t.commentCount}</span>` : ""}
        ${dueBadge(t.due)}
      </span>
    </div>
    <div class="task-move">
      <button data-dir="-1" ${i <= 0 ? "disabled" : ""}>← ${STATE_LABEL[STATE_ORDER[i - 1]] || ""}</button>
      <button data-dir="1"  ${i >= 2 ? "disabled" : ""}>${STATE_LABEL[STATE_ORDER[i + 1]] || ""} →</button>
    </div>`;

  // 카드를 누르면 상세(코멘트) 열기 — 링크·이동버튼 클릭은 제외
  el.addEventListener("click", (e) => {
    if (e.target.closest("a") || e.target.closest(".task-move")) return;
    openDetail(t.id);
  });

  // 터치 기기용 상태 이동 버튼
  el.querySelectorAll(".task-move button").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = STATE_ORDER[STATE_ORDER.indexOf(t.state) + Number(b.dataset.dir)];
      if (next) changeState(t.id, next);
    });
  });
  return el;
}

// 상태 변경 (드래그·버튼·모달 공통 경로). 낙관적 갱신 후 실패하면 되돌림.
async function changeState(taskId, newState) {
  const t = currentTasks.find((x) => x.id === taskId);
  if (!t || t.state === newState) return;
  const prev = t.state;
  t.state = newState;
  renderBoard();
  try {
    await store.moveTask(taskId, newState);
  } catch (err) {
    t.state = prev;
    renderBoard();
    toast("Couldn’t move the task. Please try again.", true);
  }
}

// "YYYY-MM-DD" 를 (UTC가 아닌) 로컬 날짜로 해석. 이렇게 안 하면 한국 시간대에서
// 하루 차이가 나서 "마감 지난 업무"가 "오늘 마감"처럼 보입니다.
function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dueBadge(due) {
  if (!due) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((parseDate(due) - today) / 864e5);
  let cls = "", txt = fmtDue(due);
  if (diff < 0) { cls = "over"; txt = `${fmtDue(due)} (overdue)`; }
  else if (diff === 0) { cls = "soon"; txt = `${fmtDue(due)} (today)`; }
  else if (diff <= 3) { cls = "soon"; txt = `${fmtDue(due)} (D-${diff})`; }
  return `<span class="due ${cls}">${txt}</span>`;
}
function fmtDue(d) { const x = parseDate(d); return `${x.getMonth() + 1}/${x.getDate()}`; }

// ---------- 드래그 앤 드롭 -------------------------------------------------
function allowDrop(e, col) { e.preventDefault(); col.classList.add("drop"); }
function leaveDrop(col) { col.classList.remove("drop"); }
async function drop(e, state) {
  e.preventDefault();
  document.querySelectorAll(".col").forEach((c) => c.classList.remove("drop"));
  await changeState(e.dataTransfer.getData("id"), state); // 로그는 DB 트리거가 기록
}

// ---------- 업무 추가 모달 -------------------------------------------------
// ---------- 업무 상세 + 코멘트 ---------------------------------------------
let detailTaskId = null;

// 카드를 눌렀을 때 열리는 화면. 내용을 보고 코멘트를 주고받는 곳.
// (수정은 여기 '수정' 버튼을 눌러 별도 모달에서)
async function openDetail(id) {
  const t = currentTasks.find((x) => x.id === id);
  if (!t) return;
  detailTaskId = id;

  $("d-app").textContent = t.app || "";
  $("d-title").textContent = t.title;
  $("d-meta").innerHTML = [
    `<span class="chip state-${t.state}">${STATE_LABEL[t.state]}</span>`,
    `<span class="chip">${t.assignee ? `<span class="mini-av">${initials(t.assignee)}</span>${esc(t.assignee)}` : "Unassigned"}</span>`,
    t.due ? `<span class="chip">Due ${fmtDue(t.due)}</span>` : "",
    t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">Open link ↗</a>` : "",
  ].join("");

  resetCommentInput();
  $("d-comments").innerHTML = `<div class="cmt-empty">Loading…</div>`;
  $("detailModal").classList.add("on");
  await renderComments();
}

function closeDetail() { $("detailModal").classList.remove("on"); detailTaskId = null; }

// 입력창을 비우고 높이·버튼 상태를 처음으로 되돌립니다
function resetCommentInput() {
  const el = $("d-input");
  el.value = "";
  el.style.height = "";
  $("d-post").disabled = true;
}

async function renderComments() {
  const wrap = $("d-comments");
  let list;
  try {
    list = await store.fetchComments(detailTaskId);
  } catch (e) {
    console.error('[Hikflow]', e);
    wrap.innerHTML = `<div class="cmt-empty">Couldn’t load comments.</div>`;
    return;
  }
  $("d-count").textContent = list.length;
  if (!list.length) {
    wrap.innerHTML = `<div class="cmt-empty">No comments yet — be the first to leave one.</div>`;
    return;
  }
  wrap.innerHTML = list.map((c) => `
    <div class="cmt">
      <span class="mini-av">${initials(c.who)}</span>
      <div class="cmt-body">
        <div class="cmt-top">
          <span class="cmt-who">${esc(c.who)}</span>
          <span class="cmt-time">${logTime(c.time)}</span>
        </div>
        <div class="cmt-text">${esc(c.body)}</div>
      </div>
      ${c.mine ? `<button class="cmt-del" data-id="${c.id}" title="Delete">×</button>` : ""}
    </div>`).join("");

  // 내가 쓴 코멘트만 삭제 버튼이 붙습니다
  wrap.querySelectorAll(".cmt-del").forEach((b) =>
    b.addEventListener("click", () => removeComment(b.dataset.id)));
}

async function postComment() {
  const body = $("d-input").value.trim();
  if (!body) return;
  const btn = $("d-post"); btn.disabled = true;
  try {
    await store.addComment(detailTaskId, body);
    resetCommentInput();
    await renderComments();
    await renderBoard();   // 카드의 코멘트 개수 갱신
  } catch (e) {
    console.error('[Hikflow]', e);
    toast("Couldn’t post the comment.", true);
  } finally {
    // 입력창이 비어 있으면 버튼도 비활성 상태로 되돌립니다
    btn.disabled = !$("d-input").value.trim();
  }
}

async function removeComment(id) {
  if (!confirm("Delete this comment?")) return;
  try {
    await store.deleteComment(id);
    await renderComments();
    await renderBoard();
  } catch (e) {
    console.error('[Hikflow]', e);
    toast("Couldn’t delete the comment.", true);
  }
}

// 상세 → 수정 모달로 전환
function editFromDetail() {
  const id = detailTaskId;
  closeDetail();
  openTaskEdit(id);
}

// ---------- 업무 추가 / 수정 모달 -------------------------------------------
let editingTaskId = null;  // null이면 '추가', 값이 있으면 '수정'

function fillAssignees(selectedId) {
  const me = store.currentUser?.id;
  const pick = selectedId !== undefined ? selectedId : me;
  $("m-assignee").innerHTML = `<option value="">Unassigned</option>` +
    teamCache.map((u) => `<option value="${u.id}"${u.id === pick ? " selected" : ""}>${esc(u.name)}</option>`).join("");
}

function openTaskModal(state) {
  editingTaskId = null;
  $("taskModalTitle").textContent = "Add task";
  $("saveTaskBtn").textContent = "Add";
  $("delTaskBtn").style.display = "none";
  $("m-app").value = ""; $("m-title").value = ""; $("m-link").value = ""; $("m-due").value = "";
  $("m-state").value = state || "wait";
  fillAssignees();
  $("taskModal").classList.add("on");
}

// 기존 값을 채워 수정 모드로 연다 (상세의 '수정' 버튼에서 호출)
function openTaskEdit(id) {
  const t = currentTasks.find((x) => x.id === id);
  if (!t) return;
  editingTaskId = id;
  $("taskModalTitle").textContent = "Edit task";
  $("saveTaskBtn").textContent = "Save";
  $("delTaskBtn").style.display = "inline-block";
  $("m-app").value = t.app || "";
  $("m-title").value = t.title || "";
  $("m-link").value = t.link || "";
  $("m-due").value = t.due || "";
  $("m-state").value = t.state;
  fillAssignees(t.assigneeId);
  $("taskModal").classList.add("on");
}

function closeTaskModal() { $("taskModal").classList.remove("on"); }

async function saveTask() {
  const title = $("m-title").value.trim();
  if (!title) { alert("Please enter the task."); return; }
  const btn = $("saveTaskBtn"); btn.disabled = true;
  const payload = {
    projectId: currentProjectId,
    appName: $("m-app").value,
    title,
    assigneeId: $("m-assignee").value || null,
    due: $("m-due").value,
    link: $("m-link").value,
    state: $("m-state").value,
  };
  try {
    if (editingTaskId) await store.updateTask(editingTaskId, payload);
    else await store.createTask(payload);
    closeTaskModal();
    await renderBoard();
    toast(editingTaskId ? "Task updated." : "Task added.");
  } catch (e) {
    console.error('[Hikflow]', e);
    toast("Couldn’t save. Please try again.", true);
  } finally {
    btn.disabled = false;
  }
}

async function removeTask() {
  const t = currentTasks.find((x) => x.id === editingTaskId);
  if (!t) return;
  if (!confirm(`Delete “${t.title}”?\nThis can’t be undone.`)) return;
  const btn = $("delTaskBtn"); btn.disabled = true;
  try {
    await store.deleteTask(editingTaskId);
    closeTaskModal();
    await renderBoard();
    toast("Task deleted.");
  } catch (e) {
    console.error('[Hikflow]', e);
    toast("Couldn’t delete. Please try again.", true);
  } finally {
    btn.disabled = false;
  }
}

// ---------- 프로젝트 추가 모달 ---------------------------------------------
let editingProjectId = null;

function openProjModal() {
  editingProjectId = null;
  $("projModalTitle").textContent = "Add project";
  $("saveProjBtn").textContent = "Create";
  $("delProjBtn").style.display = "none";
  $("p-status-wrap").style.display = "none";
  $("p-name").value = ""; $("p-desc").value = "";
  $("projModal").classList.add("on");
}

function openProjEdit(p) {
  editingProjectId = p.id;
  $("projModalTitle").textContent = "Edit project";
  $("saveProjBtn").textContent = "Save";
  $("delProjBtn").style.display = "inline-block";
  $("p-status-wrap").style.display = "block";
  $("p-name").value = p.name || "";
  $("p-desc").value = p.description === "No description" ? "" : (p.description || "");
  $("p-status").value = p.status || "active";
  $("projModal").classList.add("on");
}

function closeProjModal() { $("projModal").classList.remove("on"); }

async function saveProject() {
  const name = $("p-name").value.trim();
  if (!name) { alert("Please enter a project name."); return; }
  const btn = $("saveProjBtn"); btn.disabled = true;
  try {
    if (editingProjectId) {
      await store.updateProject(editingProjectId, {
        name, description: $("p-desc").value.trim(), status: $("p-status").value,
      });
    } else {
      await store.createProject(name, $("p-desc").value.trim());
    }
    closeProjModal();
    await renderProjects();
    toast(editingProjectId ? "Project updated." : "Project created.");
  } catch (e) {
    console.error('[Hikflow]', e);
    toast("Couldn’t save. Please try again.", true);
  } finally {
    btn.disabled = false;
  }
}

async function removeProject() {
  const name = $("p-name").value.trim();
  if (!confirm(`Delete the project “${name}”?\nEvery task inside it will be removed too, and this can’t be undone.`)) return;
  const btn = $("delProjBtn"); btn.disabled = true;
  try {
    await store.deleteProject(editingProjectId);
    closeProjModal();
    await renderProjects();
    toast("Project deleted.");
  } catch (e) {
    console.error('[Hikflow]', e);
    toast("Couldn’t delete. Please try again.", true);
  } finally {
    btn.disabled = false;
  }
}

// ---------- 활동 로그 ------------------------------------------------------
async function renderLog() {
  const wrap = $("logWrap");
  let logs;
  try {
    logs = await store.fetchLogs();
  } catch (e) {
    console.error('[Hikflow]', e);
    return (wrap.innerHTML = errBox("Couldn’t load the activity log."));
  }
  if (!logs.length) {
    wrap.innerHTML = `<div class="empty"><span class="disp">No activity yet</span>Add or move a task and it will show up here.</div>`;
    return;
  }
  wrap.innerHTML = logs.map((l) => {
    const { text, cls } = formatLog(l);
    return `<div class="log-item">
      <span class="t">${logTime(l.time)}</span>
      <span><span class="who-b">${esc(l.who)}</span> <span class="${cls}">${text}</span></span>
    </div>`;
  }).join("");
}

function formatLog(l) {
  const m = l.meta || {};
  const q = (s) => `“${esc(s || "")}”`;
  switch (l.verb) {
    case "project_added":
      return { cls: "verb-add", text: `created the project ${q(m.name)}` };
    case "task_added":
      return { cls: "verb-add", text: `added ${q(m.title)} to ${STATE_LABEL[m.to] || ""}` };
    case "task_moved":
      return { cls: "verb-move", text: `moved ${q(m.title)} from ${STATE_LABEL[m.from] || ""} to ${STATE_LABEL[m.to] || ""}` };
    case "task_done":
      return { cls: "verb-done", text: `completed ${q(m.title)}` };
    case "task_edited":
      return { cls: "verb-move", text: `edited ${q(m.title)}` };
    case "task_deleted":
      return { cls: "verb-del", text: `deleted ${q(m.title)}` };
    case "project_edited":
      return { cls: "verb-move", text: `edited the project ${q(m.name)}` };
    case "project_deleted":
      return { cls: "verb-del", text: `deleted the project ${q(m.name)}` };
    case "comment_added":
      return { cls: "verb-add", text: `commented on ${q(m.title)}` };
    default:
      return { cls: "verb-add", text: esc(l.verb) };
  }
}

// ---------- 유틸 ----------------------------------------------------------
function esc(s) { return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// "Sarah Kim" → "SK", "Sarah" → "S". 한 글자로 된 이름(한글 등)도 그대로 동작.
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function logTime(iso) {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function errBox(msg) { return `<div class="empty"><span class="disp">${esc(msg)}</span>Please try again in a moment.</div>`; }

function showLoading(on) { $("loading").classList.toggle("on", on); }
let toastTimer = null;
function toast(msg, isErr) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("err", !!isErr);
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2400);
}

// 모달 배경 클릭 시 닫기
document.querySelectorAll(".modal-bg").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("on"); }));

// 인라인 onclick 에서 부르는 핸들러를 전역에 노출
// 코멘트 입력창: 창늘이기 손잡이를 없앤 대신 내용에 맞춰 높이가 자동으로 늘어납니다.
function autoGrow() {
  const el = $("d-input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 132) + "px";
  $("d-post").disabled = !el.value.trim();
}
$("d-input").addEventListener("input", autoGrow);

// ⌘/Ctrl + Enter 로 바로 등록
$("d-input").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); postComment(); }
});

// Esc 로 열려 있는 모달 닫기
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal-bg.on").forEach((m) => m.classList.remove("on"));
});

Object.assign(window, {
  signIn, logout, switchTab, openProject, openTaskModal, closeTaskModal,
  saveTask, removeTask, openProjModal, closeProjModal, saveProject, removeProject,
  allowDrop, leaveDrop, drop,
  closeDetail, postComment, editFromDetail,
});

// 로그인 상태가 바뀌면(리다이렉트 복귀 포함) 다시 부팅
store.onAuthChange(() => boot());

boot();
