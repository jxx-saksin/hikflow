// =============================================================================
// 화면(UI) 계층 — store.js 의 함수만 호출합니다. 렌더 로직은 프로토타입과 동일한
// 구조를 유지하되, 데이터가 Supabase에서 비동기로 오므로 async/await 로 바꿨습니다.
// =============================================================================
import { CONFIGURED } from "./supabase.js";

// Supabase 키가 있으면 진짜 DB(store.js), 없으면 샘플 데이터(mock-store.js).
// 두 파일은 함수 이름·모양이 같아서 화면 코드는 어느 쪽이든 그대로 동작합니다.
//
// 로컬에서 ?mock=1 을 붙이면 로그인 없이 샘플 데이터로 화면을 확인할 수 있습니다.
// (배포된 사이트에서는 동작하지 않도록 localhost 로 제한)
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const forceMock = isLocal && new URLSearchParams(location.search).get("mock") === "1";

const store = CONFIGURED && !forceMock
  ? await import("./store.js")
  : await import("./mock-store.js");

const STATE_LABEL = { wait: "To Do", doing: "In Progress", done: "Done" };
const $ = (id) => document.getElementById(id);

let currentProjectId = null;
let currentView = "projects";
// 프로젝트 목록 보기 방식: "cards" | "list". 브라우저에 기억해 둡니다.
let projLayout = (() => {
  try { return localStorage.getItem("hikflow.projLayout") === "list" ? "list" : "cards"; }
  catch { return "cards"; }
})();
let teamCache = [];          // 담당자 후보
let currentTasks = [];       // 현재 보드의 업무(앱 datalist 계산용)

// ---------- 부팅 / 인증 흐름 ----------------------------------------------
async function boot() {
  // 프로토타입(샘플 데이터) 모드 표시
  if (!CONFIGURED || forceMock) {
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

// 지금 열려 있는 화면을 다시 그립니다(저장·삭제·이동 후 공통으로 사용).
async function refreshView() {
  if (currentProjectId) return renderBoard();
  if (currentView === "mytasks") return renderMyTasks();
  if (currentView === "activity") return renderLog();
  return renderProjects();
}

// 실시간 변경 → 현재 보고 있는 화면만 다시 그림 (짧게 디바운스)
let rtTimer = null;
function onRealtime() {
  clearTimeout(rtTimer);
  rtTimer = setTimeout(refreshView, 250);
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
  document.querySelectorAll("[data-view]").forEach((t) => t.classList.toggle("on", t.dataset.view === view));
  $("tabbar").style.display = "flex";
  $("view-projects").style.display = view === "projects" ? "block" : "none";
  $("view-mytasks").style.display  = view === "mytasks"  ? "block" : "none";
  $("view-activity").style.display = view === "activity" ? "block" : "none";
  $("view-detail").style.display = "none";
  if (view === "projects") await renderProjects();
  if (view === "mytasks")  await renderMyTasks();
  if (view === "activity") await renderLog();
}

async function openProject(id) {
  currentProjectId = id;
  $("view-projects").style.display = "none";
  $("view-mytasks").style.display = "none";
  $("view-activity").style.display = "none";
  $("view-detail").style.display = "block";
  $("tabbar").style.display = "none";
  try {
    const p = await store.fetchProject(id);
    $("detailTitle").textContent = p.name;
    $("crumbName").textContent = p.name;

    // 설명은 제목 아래에, 키포인트는 그 아래 강조색 점과 함께
    const desc = $("detailDesc");
    desc.textContent = p.description || "";
    desc.style.display = p.description ? "block" : "none";

    const keys = p.key_points || [];
    $("detailKeys").innerHTML = keys
      .map((k) => `<li><span class="kp-dot"></span>${esc(k)}</li>`).join("");
  } catch (e) { /* 아래 renderBoard 에서 오류 처리 */ }
  await renderBoard();
}

// ---------- 렌더: 프로젝트 목록 -------------------------------------------
// 카드 보기와 리스트 보기 두 가지. 프로젝트가 많아지면 리스트가 훑어보기 편합니다.
function projMeta(p) {
  const { total, done } = p.stats;
  return {
    total, done,
    pct: total ? Math.round((done / total) * 100) : 0,
    pillClass: p.status === "active" ? "active" : p.status === "hold" ? "hold" : "closed",
    pillText: p.status === "active" ? "Active" : p.status === "hold" ? "On hold" : "Closed",
  };
}

async function renderProjects() {
  const grid = $("projGrid");
  grid.innerHTML = "";
  grid.className = projLayout === "list" ? "proj-list" : "grid";
  document.querySelectorAll("#viewToggle .vt")
    .forEach((b) => b.classList.toggle("on", b.dataset.mode === projLayout));

  let projects;
  try {
    projects = await store.fetchProjects();
  } catch (e) {
    console.error('[Hikflow]', e);
    return (grid.innerHTML = errBox("Couldn’t load projects."));
  }

  if (!projects.length) {
    grid.className = "";
    grid.innerHTML = `<div class="empty">
      <span class="disp">No projects yet</span>
      Use “+ Add project” at the top right to create the first one.</div>`;
    return;
  }

  projects.forEach((p) => {
    const m = projMeta(p);
    const el = document.createElement("div");

    if (projLayout === "list") {
      el.className = "proj-row";
      el.innerHTML = `
        <div class="pr-main">
          <h3>${esc(p.name)}</h3>
          ${p.description ? `<span class="pr-desc">${esc(p.description)}</span>` : ""}
        </div>
        <span class="pill ${m.pillClass}">${m.pillText}</span>
        <div class="pr-bar"><div class="bar"><span style="width:${m.pct}%"></span></div></div>
        <span class="pr-count">${m.done}/${m.total} done</span>
        <button class="edit" title="Edit project">⋯</button>`;
    } else {
      el.className = "proj";
      el.innerHTML = `
        <div class="top-row">
          <h3>${esc(p.name)}</h3>
          <div style="display:flex;align-items:center;gap:4px;">
            <span class="pill ${m.pillClass}">${m.pillText}</span>
            <button class="edit" title="Edit project">⋯</button>
          </div>
        </div>
        ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ""}
        <div class="bar"><span style="width:${m.pct}%"></span></div>
        <div class="foot"><span>${m.total} ${m.total === 1 ? "task" : "tasks"}</span><span>${m.done}/${m.total} done</span></div>`;
    }

    el.onclick = () => openProject(p.id);
    // 수정 버튼은 카드 열기와 겹치지 않게 이벤트 전파를 막습니다
    el.querySelector(".edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openProjEdit(p);
    });
    grid.appendChild(el);
  });
}

// ---------- 렌더: My tasks ------------------------------------------------
// 모든 프로젝트를 가로질러 내가 담당인 업무만.
// To Do → In Progress → Done 순서로 묶어서 보여줍니다.
async function renderMyTasks() {
  const wrap = $("myTasks");
  wrap.innerHTML = "";
  let list;
  try {
    list = await store.fetchMyTasks();
  } catch (e) {
    console.error('[Hikflow]', e);
    return (wrap.innerHTML = errBox("Couldn’t load your tasks."));
  }

  if (!list.length) {
    wrap.innerHTML = `<div class="empty">
      <span class="disp">Nothing on your plate</span>
      Go enjoy a coffee — or a glass of wine. ☕️🍷</div>`;
    return;
  }

  // 상세 모달이 이 목록에서 업무를 찾을 수 있게 공유
  currentTasks = list;

  // 마감일 빠른 순, 없는 건 뒤로
  const byDue = (a, b) => ((a.due || "9999-12-31") < (b.due || "9999-12-31") ? -1 : 1);

  STATE_ORDER.forEach((state) => {
    const group = list.filter((t) => t.state === state).sort(byDue);
    if (!group.length) return;   // 비어 있는 구간은 건너뜀

    const sec = document.createElement("div");
    sec.className = "mt-group";
    sec.innerHTML = `
      <div class="mt-group-head">
        <span class="dot-state ${state}"></span>
        <h3>${STATE_LABEL[state]}</h3>
        <span class="count">${group.length}</span>
      </div>
      <div class="mt-list"></div>`;

    const listEl = sec.querySelector(".mt-list");
    group.forEach((t) => {
      const row = document.createElement("div");
      row.className = "mytask" + (t.state === "done" ? " is-done" : "");
      row.innerHTML = `
        <div class="mt-body">
          <div class="mt-top">
            <span class="mt-proj">${esc(t.projectName)}</span>
          </div>
          <div class="mt-title">${esc(t.title)}</div>
        </div>
        <div class="mt-right">
          ${t.commentCount ? `<span class="cmt-count">💬 ${t.commentCount}</span>` : ""}
          ${dueBadge(t.due)}
        </div>`;
      row.addEventListener("click", () => openDetail(t.id));
      listEl.appendChild(row);
    });

    wrap.appendChild(sec);
  });
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
}

const STATE_ORDER = ["wait", "doing", "done"];

function taskCard(t) {
  const el = document.createElement("div");
  el.className = "task"; el.draggable = true; el.id = t.id;
  el.addEventListener("dragstart", (e) => { el.classList.add("dragging"); e.dataTransfer.setData("id", t.id); });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  const i = STATE_ORDER.indexOf(t.state);
  el.innerHTML = `
    <div class="title">${esc(t.title)}${t.link ? ` <a href="${esc(t.link)}" target="_blank" rel="noopener">↗</a>` : ""}</div>
    ${t.description ? `<div class="desc">${esc(t.description)}</div>` : ""}
    <div class="meta">
      <span class="assignee">${avatarGroup(t.assignees)}</span>
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

// 업무가 해당 칸으로 들어왔을 때 컬럼 점을 1.5초간 반짝이게 합니다.
// (컬럼 헤더는 다시 그려지지 않으므로 보드 갱신과 무관하게 유지됩니다)
function flashColumnDot(state) {
  const dot = document.querySelector(`.col[data-state="${state}"] .col-head .swatch`);
  if (!dot) return;
  dot.classList.remove("flash");
  void dot.offsetWidth;              // 애니메이션 재시작을 위한 리플로우
  dot.classList.add("flash");
  setTimeout(() => dot.classList.remove("flash"), 1500);
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
    if (newState === "doing" || newState === "done") flashColumnDot(newState);
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

// 담당자 아바타 묶음. 3명까지 보여주고 나머지는 +N 으로.
function avatarGroup(list) {
  const people = list || [];
  if (!people.length) return `<span style="color:var(--ink-dim)">Unassigned</span>`;
  if (people.length === 1) {
    return `<span class="mini-av">${initials(people[0].name)}</span>${esc(people[0].name)}`;
  }
  const shown = people.slice(0, 3);
  const rest = people.length - shown.length;
  return `<span class="av-stack" title="${esc(people.map((p) => p.name).join(", "))}">` +
    shown.map((p) => `<span class="mini-av">${initials(p.name)}</span>`).join("") +
    (rest > 0 ? `<span class="mini-av more">+${rest}</span>` : "") +
    `</span>`;
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

  $("d-title").textContent = t.title;
  $("d-desc").textContent = t.description || "";
  $("d-desc").style.display = t.description ? "block" : "none";
  $("d-meta").innerHTML = [
    `<span class="chip state-${t.state}">${STATE_LABEL[t.state]}</span>`,
    ...(t.assignees?.length
      ? t.assignees.map((a) => `<span class="chip"><span class="mini-av">${initials(a.name)}</span>${esc(a.name)}</span>`)
      : [`<span class="chip">Unassigned</span>`]),
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
    await refreshView();   // 카드의 코멘트 개수 갱신
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
    await refreshView();
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

// 모달에서 편집 중인 담당자 id 목록
let editingAssignees = [];

// 담당자 칩 목록과 "+ 추가" 드롭다운을 다시 그립니다.
function renderAssignees() {
  const box = $("m-assignees");
  box.innerHTML = editingAssignees.length
    ? editingAssignees.map((id) => {
        const u = teamCache.find((x) => x.id === id);
        if (!u) return "";
        return `<span class="who-chip">
          <span class="mini-av">${initials(u.name)}</span>${esc(u.name)}
          <button class="chip-x" data-id="${u.id}" title="Remove" aria-label="Remove ${esc(u.name)}">−</button>
        </span>`;
      }).join("")
    : `<span class="who-none">Unassigned</span>`;

  box.querySelectorAll(".chip-x").forEach((b) =>
    b.addEventListener("click", () => {
      editingAssignees = editingAssignees.filter((x) => x !== b.dataset.id);
      renderAssignees();
    }));

  // 아직 지정되지 않은 사람만 추가 후보로
  const rest = teamCache.filter((u) => !editingAssignees.includes(u.id));
  const sel = $("m-assignee-add");
  sel.innerHTML = `<option value="">+ Add person</option>` +
    rest.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("");
  sel.disabled = rest.length === 0;
  sel.value = "";
}

function fillAssignees(ids) {
  // 새 업무면 기본으로 나를 담당자로
  const me = store.currentUser?.id;
  editingAssignees = ids !== undefined
    ? [...ids]
    : (me && teamCache.some((u) => u.id === me) ? [me] : []);
  renderAssignees();
}

function openTaskModal(state) {
  editingTaskId = null;
  $("taskModalTitle").textContent = "Add task";
  $("saveTaskBtn").textContent = "Add";
  $("delTaskBtn").style.display = "none";
  $("m-title").value = ""; $("m-desc").value = ""; $("m-link").value = "";
  setDue(""); closeDatePicker();
  $("m-state").value = state || "wait";
  fillAssignees(undefined);
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
  $("m-title").value = t.title || "";
  $("m-desc").value = t.description || "";
  $("m-link").value = t.link || "";
  setDue(t.due || ""); closeDatePicker();
  $("m-state").value = t.state;
  fillAssignees((t.assignees || []).map((a) => a.id));
  $("taskModal").classList.add("on");
}

function closeTaskModal() { $("taskModal").classList.remove("on"); }

async function saveTask() {
  const title = $("m-title").value.trim();
  if (!title) { alert("Please enter the task."); return; }
  const btn = $("saveTaskBtn"); btn.disabled = true;
  // 상태가 바뀌었는지 확인해 두었다가, 저장 후 해당 칸의 점을 반짝입니다.
  const prevState = editingTaskId
    ? currentTasks.find((t) => t.id === editingTaskId)?.state
    : null;
  const payload = {
    projectId: currentProjectId,
    title,
    description: $("m-desc").value,
    assigneeIds: editingAssignees,
    due: $("m-due").value,
    link: $("m-link").value,
    state: $("m-state").value,
  };
  try {
    if (editingTaskId) await store.updateTask(editingTaskId, payload);
    else await store.createTask(payload);
    const newState = payload.state;
    closeTaskModal();
    await refreshView();
    if (newState !== prevState && (newState === "doing" || newState === "done")) {
      flashColumnDot(newState);
    }
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
    await refreshView();
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
let editingKeys = [];   // 모달에서 편집 중인 키포인트

// 키포인트 목록을 다시 그립니다(각 줄에 삭제 버튼).
function renderKeys() {
  const box = $("p-keys");
  box.innerHTML = editingKeys.length
    ? editingKeys.map((k, i) => `<div class="key-row">
        <span class="kp-dot"></span>
        <span class="key-text">${esc(k)}</span>
        <button type="button" class="chip-x" data-i="${i}" title="Remove">−</button>
      </div>`).join("")
    : `<span class="who-none">No key points</span>`;

  box.querySelectorAll(".chip-x").forEach((b) =>
    b.addEventListener("click", () => {
      editingKeys.splice(Number(b.dataset.i), 1);
      renderKeys();
    }));
}

// 입력칸의 내용을 키포인트로 추가
function addKeyPoint() {
  const input = $("p-key-input");
  const v = input.value.trim();
  if (!v) return;
  editingKeys.push(v);
  input.value = "";
  renderKeys();
  syncKeyBtn();
  input.focus();
}

// 내용이 없으면 Add 버튼을 흐리게(누를 수 없게) 합니다.
function syncKeyBtn() {
  $("p-key-btn").disabled = !$("p-key-input").value.trim();
}

function openProjModal() {
  editingProjectId = null;
  $("projModalTitle").textContent = "Add project";
  $("saveProjBtn").textContent = "Create";
  $("delProjBtn").style.display = "none";
  $("p-status-wrap").style.display = "none";
  $("p-name").value = ""; $("p-desc").value = ""; $("p-key-input").value = "";
  editingKeys = [];
  renderKeys(); syncKeyBtn();
  $("projModal").classList.add("on");
}

function openProjEdit(p) {
  editingProjectId = p.id;
  $("projModalTitle").textContent = "Edit project";
  $("saveProjBtn").textContent = "Save";
  $("delProjBtn").style.display = "inline-block";
  $("p-status-wrap").style.display = "block";
  $("p-name").value = p.name || "";
  $("p-desc").value = p.description || "";
  $("p-key-input").value = "";
  editingKeys = [...(p.key_points || [])];
  renderKeys(); syncKeyBtn();
  $("p-status").value = p.status || "active";
  $("projModal").classList.add("on");
}

function closeProjModal() { $("projModal").classList.remove("on"); }

async function saveProject() {
  const name = $("p-name").value.trim();
  if (!name) { alert("Please enter a project name."); return; }
  const btn = $("saveProjBtn"); btn.disabled = true;
  try {
    // 입력칸에 쓰다 만 키포인트가 있으면 그것도 함께 저장
    const pending = $("p-key-input").value.trim();
    const keyPoints = pending ? [...editingKeys, pending] : [...editingKeys];

    if (editingProjectId) {
      await store.updateProject(editingProjectId, {
        name, description: $("p-desc").value, status: $("p-status").value, keyPoints,
      });
    } else {
      await store.createProject({ name, description: $("p-desc").value, keyPoints });
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

// ---------- 날짜 선택기 (직접 구현) ---------------------------------------
// 브라우저 기본 달력은 크기·색을 바꿀 수 없어 직접 만들었습니다.
// 실제 값은 숨은 input#m-due 에 "YYYY-MM-DD" 로 보관하고, 미정이면 빈 문자열입니다.
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let dpView = null;   // 현재 보고 있는 달 {y, m}

function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// 날짜 값을 설정하고 버튼 라벨을 갱신합니다(모달 열 때도 사용).
function setDue(value) {
  $("m-due").value = value || "";
  const btn = $("dp-trigger");
  const label = $("dp-label");
  if (value) {
    const d = parseDate(value);
    label.textContent = MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    btn.classList.remove("is-empty");
  } else {
    label.textContent = "Not set";
    btn.classList.add("is-empty");
  }
}

function closeDatePicker() {
  $("dp-panel").hidden = true;
  $("dp-trigger").setAttribute("aria-expanded", "false");
}

function toggleDatePicker() {
  const panel = $("dp-panel");
  if (!panel.hidden) return closeDatePicker();

  const cur = $("m-due").value ? parseDate($("m-due").value) : new Date();
  dpView = { y: cur.getFullYear(), m: cur.getMonth() };
  renderCalendar();
  panel.hidden = false;
  $("dp-trigger").setAttribute("aria-expanded", "true");
}

function renderCalendar() {
  $("dp-month").textContent = MONTHS[dpView.m] + " " + dpView.y;

  const first = new Date(dpView.y, dpView.m, 1);
  const lead = (first.getDay() + 6) % 7;          // 월요일 시작
  const start = new Date(dpView.y, dpView.m, 1 - lead);

  const todayISO = toISO(new Date());
  const selISO = $("m-due").value;

  const grid = $("dp-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISO(d);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dp-day"
      + (d.getMonth() !== dpView.m ? " other" : "")
      + (iso === todayISO ? " today" : "")
      + (iso === selISO ? " sel" : "");
    b.textContent = d.getDate();
    b.addEventListener("click", () => { setDue(iso); closeDatePicker(); });
    grid.appendChild(b);
  }
}

$("dp-trigger").addEventListener("click", toggleDatePicker);
$("dp-prev").addEventListener("click", () => {
  dpView.m--; if (dpView.m < 0) { dpView.m = 11; dpView.y--; }
  renderCalendar();
});
$("dp-next").addEventListener("click", () => {
  dpView.m++; if (dpView.m > 11) { dpView.m = 0; dpView.y++; }
  renderCalendar();
});
$("dp-clear").addEventListener("click", () => { setDue(""); closeDatePicker(); });
$("dp-today").addEventListener("click", () => { setDue(toISO(new Date())); closeDatePicker(); });

// 키포인트 추가 (버튼 또는 Enter)
$("p-key-btn").addEventListener("click", addKeyPoint);
$("p-key-input").addEventListener("input", syncKeyBtn);
$("p-key-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addKeyPoint(); }
});

// 프로젝트 목록 보기 전환 (카드 / 리스트)
document.querySelectorAll("#viewToggle .vt").forEach((b) =>
  b.addEventListener("click", () => {
    projLayout = b.dataset.mode;
    try { localStorage.setItem("hikflow.projLayout", projLayout); } catch {}
    renderProjects();
  }));

// 담당자 "+ Add person" 선택 시 목록에 추가
$("m-assignee-add").addEventListener("change", (e) => {
  const id = e.target.value;
  if (!id) return;
  if (!editingAssignees.includes(id)) editingAssignees.push(id);
  renderAssignees();
});

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
