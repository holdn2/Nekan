// QUADS, the date helpers, clampText, normalizeTasks and the layout ratios all
// come from shared/core.js, loaded as a plain script just before this one.

let tasks = [];
let mode = "expanded";
let activeTab = "matrix";
let historyQuery = "";
let trashQuery = "";
let theme = "light";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function save() {
  window.api.save(tasks);
}

/* --------------------------------------------------------- day rollover */

/**
 * Every due-date label is relative to *today*, but this widget is meant to sit
 * on screen for days. Without a rollover, an item added yesterday keeps its
 * orange "오늘" chip until some unrelated click happens to re-render.
 */
let dayTimer = null;
let renderedDay = startOfToday().getTime();

function refreshIfDayChanged() {
  const today = startOfToday().getTime();
  if (today === renderedDay) return;
  renderedDay = today;
  render();
}

function scheduleDayRollover() {
  clearTimeout(dayTimer);
  // +1s of slack so a timer that fires a hair early doesn't re-render the
  // day that is still ending and then wait another 24h.
  const wait = startOfTomorrow().getTime() - Date.now() + 1000;
  dayTimer = setTimeout(() => {
    refreshIfDayChanged();
    scheduleDayRollover();
  }, Math.max(1000, wait));
}

function calendarIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  const box = document.createElementNS(ns, "rect");
  box.setAttribute("x", "2.2");
  box.setAttribute("y", "3.4");
  box.setAttribute("width", "11.6");
  box.setAttribute("height", "10.4");
  box.setAttribute("rx", "1.6");
  box.setAttribute("fill", "none");
  box.setAttribute("stroke", "currentColor");
  box.setAttribute("stroke-width", "1.3");
  const lines = document.createElementNS(ns, "path");
  lines.setAttribute("d", "M2.2 6.6h11.6M5.6 2v2.6M10.4 2v2.6");
  lines.setAttribute("stroke", "currentColor");
  lines.setAttribute("stroke-width", "1.3");
  lines.setAttribute("stroke-linecap", "round");
  svg.append(box, lines);
  return svg;
}

/**
 * Editable due-date chip: a native date input stretched invisibly over a
 * compact face, so a click anywhere opens the OS date picker.
 */
function dueChip(value, onChange) {
  const box = document.createElement("span");
  const chip = document.createElement("span");
  chip.className = "due";

  const input = document.createElement("input");
  input.type = "date";
  input.setAttribute("aria-label", "마감일");

  const face = document.createElement("span");
  face.className = "face";
  chip.append(input, face);

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "due-clear";
  clear.textContent = "×";
  clear.title = "날짜 지우기";
  clear.setAttribute("aria-label", "마감일 지우기");

  box.append(chip, clear);
  box.draggable = false;

  const apply = (next) => {
    input.value = next || "";
    const info = dueInfo(next);
    box.className = info ? `duebox set ${info.state}` : "duebox";
    face.replaceChildren();
    if (info) {
      face.textContent = info.text;
      chip.title = `마감 ${info.text} · ${info.hint}`;
    } else {
      face.append(calendarIcon());
      chip.title = "마감일 지정";
    }
  };

  input.addEventListener("change", () => {
    apply(input.value);
    onChange(input.value || null);
  });
  clear.addEventListener("click", (e) => {
    e.stopPropagation();
    apply("");
    onChange(null);
  });

  apply(value);
  box.input = input;
  box.apply = apply;
  return box;
}

/** Read-only version, for history / trash rows. */
function dueBadge(value) {
  const info = dueInfo(value);
  if (!info) return null;
  const box = document.createElement("span");
  box.className = `duebox set ${info.state} static`;
  const chip = document.createElement("span");
  chip.className = "due";
  chip.title = `마감 ${info.text} · ${info.hint}`;
  const face = document.createElement("span");
  face.className = "face";
  face.textContent = info.text;
  chip.append(face);
  box.append(chip);
  return box;
}

/* ------------------------------------------------------------------ data */

function makeTask(quadrant, text, dueDate) {
  return {
    id: uid(),
    text,
    quadrant,
    dueDate: dueDate || null,
    memo: null,
    createdAt: Date.now(),
    completedAt: null,
    deletedAt: null,
  };
}

function addTask(quadrant, text, dueDate) {
  const trimmed = clampText(text);
  if (!trimmed) return;
  tasks.push(makeTask(quadrant, trimmed, dueDate));
  save();
  render();
}

/**
 * Bulk add for a pasted brain dump. One save and one render for the whole
 * batch — going through addTask per line would rebuild the DOM for every line
 * of the paste.
 */
function addTasks(quadrant, texts) {
  if (!texts.length) return;
  texts.forEach((text) => tasks.push(makeTask(quadrant, text, null)));
  save();
  render();
}

function completeTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completedAt = Date.now();
  save();
  render();
}

function restoreTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completedAt = null;
  save();
  render();
}

function setDue(id, value) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.dueDate = value || null;
  save();
  render();
}

/** Soft delete — the task moves to the trash tab and stays restorable. */
function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.deletedAt = Date.now();
  save();
  render();
}

function untrashTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.deletedAt = null;
  save();
  render();
}

/** Permanent removal — only reachable from the trash tab. */
function purgeTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  save();
  render();
}

function editTask(id, text) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  // Inline editing is contentEditable, so the add form's maxlength does not
  // apply — a pasted wall of text would be stored as-is.
  const trimmed = clampText(text);
  if (!trimmed) {
    deleteTask(id);
    return;
  }
  task.text = trimmed;
  save();
}

/** Move `id` into `quadrant`, placed right before `beforeId` (or last). */
function moveTask(id, quadrant, beforeId) {
  const from = tasks.findIndex((t) => t.id === id);
  if (from === -1 || id === beforeId) return;
  const [task] = tasks.splice(from, 1);
  task.quadrant = quadrant;
  const to = beforeId ? tasks.findIndex((t) => t.id === beforeId) : -1;
  if (to === -1) tasks.push(task);
  else tasks.splice(to, 0, task);
  save();
  render();
}

const activeOf = (q) =>
  tasks.filter((t) => !t.deletedAt && !t.completedAt && t.quadrant === q);
/** Written down but not classified yet — same filter, fifth place. */
const inboxTasks = () => activeOf(INBOX);
const doneTasks = () =>
  tasks
    .filter((t) => !t.deletedAt && t.completedAt)
    .sort((a, b) => b.completedAt - a.completedAt);
const trashedTasks = () =>
  tasks.filter((t) => t.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

/* -------------------------------------------------------------- rendering */

function numEl(index) {
  const el = document.createElement("span");
  el.className = "num";
  el.textContent = `${index + 1}.`;
  return el;
}

function itemEl(task, index) {
  const li = document.createElement("li");
  li.className = task.id === selectedId ? "item selected" : "item";
  li.dataset.id = task.id;
  li.draggable = true;

  const check = document.createElement("button");
  check.className = "check";
  check.title = "완료 (히스토리로 이동)";
  // Icon-only buttons: without this a screen reader announces "button".
  check.setAttribute("aria-label", `완료: ${task.text}`);
  check.addEventListener("click", () => {
    li.classList.add("removing");
    setTimeout(() => completeTask(task.id), 160);
  });

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = task.text;
  text.title = "클릭하여 메모 · 더블클릭하여 수정";
  text.addEventListener("dblclick", () => startEdit(li, text, task));

  const due = dueChip(task.dueDate, (value) => setDue(task.id, value));

  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "×";
  del.title = "삭제 (휴지통으로 이동)";
  del.setAttribute("aria-label", `삭제: ${task.text}`);
  del.addEventListener("click", () => {
    li.classList.add("removing");
    setTimeout(() => deleteTask(task.id), 160);
  });

  li.append(numEl(index), check, text);
  if (task.memo) li.append(memoMark(task.memo));
  li.append(due, del);

  // Click selects for the memo panel, double-click still edits the text — so a
  // single click has to wait out the double-click window before it acts.
  // Without the wait, a double-click would toggle the selection twice and the
  // window would grow and shrink under the cursor.
  li.addEventListener("click", (e) => {
    if (e.detail > 1) return;
    if (e.target.closest("button, .duebox")) return;
    if (text.isContentEditable) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(
      () => setSelected(task.id === selectedId ? null : task.id),
      CLICK_DELAY,
    );
  });
  li.addEventListener("dblclick", () => clearTimeout(clickTimer));

  return li;
}

function startEdit(li, textEl, task) {
  const original = task.text;
  li.draggable = false;
  textEl.contentEditable = "true";
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = (commit) => {
    textEl.contentEditable = "false";
    li.draggable = true;
    textEl.removeEventListener("keydown", onKey);
    textEl.removeEventListener("blur", onBlur);
    if (commit) editTask(task.id, textEl.textContent);
    else textEl.textContent = original;
    render();
  };
  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  };
  const onBlur = () => finish(true);

  textEl.addEventListener("keydown", onKey);
  textEl.addEventListener("blur", onBlur);
}

function renderMatrix() {
  QUADS.forEach((q) => {
    const list = $(`[data-list="${q}"]`);
    const items = activeOf(q);
    list.replaceChildren(...items.map((task, i) => itemEl(task, i)));
    $(`[data-count="${q}"]`).textContent = String(items.length);
  });
}

/**
 * An inbox row deliberately carries less than a quadrant row: no due chip, no
 * check, no memo. Sorting out *what* a task is comes after getting it out of
 * your head, and those controls only start to mean something once it has a
 * quadrant. The text still edits on double-click, and × still soft-deletes.
 */
function inboxItemEl(task, index) {
  const li = document.createElement("li");
  li.className = "item inbox-item";
  li.dataset.id = task.id;
  li.draggable = true;

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = task.text;
  text.title = "더블클릭하여 수정 · 분면으로 끌어다 놓아 분류";
  text.addEventListener("dblclick", () => startEdit(li, text, task));

  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "×";
  del.title = "삭제 (휴지통으로 이동)";
  del.setAttribute("aria-label", `삭제: ${task.text}`);
  del.addEventListener("click", () => {
    li.classList.add("removing");
    setTimeout(() => deleteTask(task.id), 160);
  });

  li.append(numEl(index), text, del);
  return li;
}

function renderInbox() {
  const items = inboxTasks();
  $("#inboxList").replaceChildren(...items.map((t, i) => inboxItemEl(t, i)));
  $("#inboxCount").textContent = String(items.length);
}

function renderCounts() {
  QUADS.forEach((q, i) => {
    $(`#c${i + 1}`).textContent = String(activeOf(q).length);
  });
  // The bar chip stays out of the way until there is something unclassified, so
  // seeing it at all is the signal.
  const waiting = inboxTasks().length;
  $("#cInbox").textContent = String(waiting);
  $("#inboxChip").classList.toggle("hidden", waiting === 0);
  $("#doneCount").textContent = String(doneTasks().length);
  $("#trashCount").textContent = String(trashedTasks().length);
}

const QUAD_LABEL = {
  inbox: "미분류",
  q1: "Urgent·Important",
  q2: "Important",
  q3: "Urgent",
  q4: "기타",
};

const dayLabel = (ts) =>
  new Date(ts).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

const timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Shared renderer for the history and trash lists: rows grouped by day,
 * numbered from 1 within each day.
 */
function renderArchive({
  list,
  empty,
  items,
  query,
  stamp,
  emptyText,
  actions,
}) {
  list.replaceChildren();
  let lastDay = "";
  let index = 0;

  items.forEach((task) => {
    const day = dayLabel(stamp(task));
    if (day !== lastDay) {
      lastDay = day;
      index = 0;
      const head = document.createElement("li");
      head.className = "day";
      head.textContent = day;
      list.append(head);
    }

    const li = document.createElement("li");
    li.className = "hitem";

    const dot = document.createElement("span");
    dot.className = `dot ${task.quadrant}`;
    dot.title = QUAD_LABEL[task.quadrant] || "";

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = task.text;

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = timeLabel(stamp(task));

    // Title and memo share one column, so the memo lines up under the title
    // and stops where the date column starts instead of running alongside it.
    const main = document.createElement("div");
    main.className = "hmain";
    main.append(text);
    if (task.memo) {
      main.append(memoLine(task.memo));
      li.classList.add("has-memo");
    }

    li.append(numEl(index), dot, main);
    const due = dueBadge(task.dueDate);
    if (due) li.append(due);
    li.append(time);
    actions(task).forEach((btn) => li.append(btn));
    list.append(li);
    index += 1;
  });

  // Measured after insertion: only a memo that is actually cut off gets the
  // pointer and the expand hint.
  $$(".hmemo", list).forEach((box) => {
    const text = $(".hmemo-text", box);
    const clamped = text.scrollHeight > text.clientHeight + 1;
    box.classList.toggle("clamped", clamped);
    if (clamped) box.title = "전체 보기";
  });

  empty.classList.toggle("hidden", items.length > 0);
  empty.textContent = query.trim() ? "검색 결과가 없습니다." : emptyText;
}

function actionBtn(label, onClick, danger = false) {
  const btn = document.createElement("button");
  btn.className = danger ? "act danger" : "act";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

const matches = (task, query) => {
  const q = query.trim().toLowerCase();
  return !q || task.text.toLowerCase().includes(q);
};

function renderHistory() {
  renderArchive({
    list: $("#historyList"),
    empty: $("#historyEmpty"),
    items: doneTasks().filter((t) => matches(t, historyQuery)),
    query: historyQuery,
    stamp: (t) => t.completedAt,
    emptyText: "완료한 항목이 아직 없습니다.",
    actions: (task) => [
      actionBtn("되돌리기", () => restoreTask(task.id)),
      actionBtn("삭제", () => deleteTask(task.id), true),
    ],
  });
}

function renderTrash() {
  renderArchive({
    list: $("#trashList"),
    empty: $("#trashEmpty"),
    items: trashedTasks().filter((t) => matches(t, trashQuery)),
    query: trashQuery,
    stamp: (t) => t.deletedAt,
    emptyText: "휴지통이 비어 있습니다.",
    actions: (task) => [
      actionBtn("복원", () => untrashTask(task.id)),
      actionBtn("영구 삭제", () => purgeTask(task.id), true),
    ],
  });
}

/* ------------------------------------------------------------------- memo */

/**
 * One memo per task, shown in a panel under the matrix. Opening it grows the
 * window (main.js) rather than taking height from the quadrants, so the ratios
 * the user dragged stay exactly where they were.
 */
let selectedId = null;
/** Whether the textarea is up. A task with no memo yet always starts there. */
let memoEditing = false;
/** Long enough for the second click of a double-click to arrive first. */
const CLICK_DELAY = 220;
let clickTimer = null;

function noteIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  svg.setAttribute("aria-hidden", "true");
  const page = document.createElementNS(ns, "path");
  page.setAttribute("d", "M3.4 2.2h9.2v11.6H3.4z");
  page.setAttribute("fill", "none");
  page.setAttribute("stroke", "currentColor");
  page.setAttribute("stroke-width", "1.3");
  page.setAttribute("stroke-linejoin", "round");
  const lines = document.createElementNS(ns, "path");
  lines.setAttribute("d", "M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3");
  lines.setAttribute("stroke", "currentColor");
  lines.setAttribute("stroke-width", "1.3");
  lines.setAttribute("stroke-linecap", "round");
  svg.append(page, lines);
  return svg;
}

/** The "has a memo" marker; the memo itself rides along as the tooltip. */
function memoMark(memo) {
  const el = document.createElement("span");
  el.className = "memo-mark";
  el.title = `메모: ${memo}`;
  el.setAttribute("aria-label", "메모 있음");
  el.append(noteIcon());
  return el;
}

/**
 * Read-only memo block for history / trash rows. These tabs deliberately have
 * no edit path — the panel that edits a memo only ever opens on the matrix —
 * so this is display only: no dblclick, no contentEditable, no save.
 * Long memos are clamped to three lines and expand on click.
 */
function memoLine(memo) {
  const box = document.createElement("div");
  box.className = "hmemo";

  const icon = document.createElement("span");
  icon.className = "memo-mark";
  icon.setAttribute("aria-hidden", "true");
  icon.append(noteIcon());

  const text = document.createElement("p");
  text.className = "hmemo-text";
  text.textContent = memo;

  box.append(icon, text);
  box.addEventListener("click", () => {
    // Let a click that was really a text selection stand.
    if (window.getSelection()?.toString()) return;
    if (!box.classList.contains("clamped")) return;
    box.title = box.classList.toggle("open") ? "접기" : "전체 보기";
  });
  return box;
}

/** Panel height comes from CSS so main.js and the stylesheet cannot drift. */
const memoPanelHeight = () =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--memo-h"),
  ) || 0;

/**
 * The selected task, or null once it has left the matrix. Being dragged up to
 * the inbox counts as leaving: those rows have no memo, so the panel closes
 * itself rather than pointing at something the list no longer shows.
 */
function selectedTask() {
  if (!selectedId) return null;
  const task = tasks.find((t) => t.id === selectedId);
  if (!task || task.completedAt || task.deletedAt) return null;
  return task.quadrant === INBOX ? null : task;
}

/** Only the open/closed transition resizes; swapping tasks keeps the height. */
function setSelected(id) {
  if (id === selectedId) return;
  const wasOpen = selectedId !== null;
  selectedId = id;
  memoEditing = false;
  if (wasOpen !== (id !== null)) {
    window.api.setMemoPanel(id !== null, memoPanelHeight());
  }
  render();
}

/**
 * Rule for the save button: a new memo needs text, an edit needs text *and* a
 * change. `clampMemo` trims the same way the save path does, so what the button
 * compares is what would be written.
 */
function memoSaveState() {
  const task = selectedTask();
  if (!task) return { value: null, original: null, canSave: false };
  const value = clampMemo($("#memoInput").value);
  const original = task.memo || null;
  return { value, original, canSave: Boolean(value) && value !== original };
}

function syncMemoSave() {
  $("#memoSave").disabled = !memoSaveState().canSave;
}

function renderMemo() {
  const panel = $("#memoPanel");
  const task = selectedTask();
  if (!task) {
    panel.classList.add("hidden");
    panel.dataset.key = "";
    return;
  }
  panel.classList.remove("hidden");

  const memo = task.memo || "";
  const editing = memoEditing || !memo;

  $("#memoTitle").textContent = task.text;
  $("#memoTitle").title = task.text;
  $("#memoDot").className = `dot ${task.quadrant}`;
  $("#memoText").textContent = memo;

  // Only reseed the textarea when the panel actually changes what it is
  // showing; an unrelated re-render must not wipe what is being typed.
  const key = `${task.id}:${editing}`;
  const input = $("#memoInput");
  if (panel.dataset.key !== key) {
    panel.dataset.key = key;
    if (editing) {
      input.value = memo;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  input.classList.toggle("hidden", !editing);
  $("#memoText").classList.toggle("hidden", editing);
  $("#memoSave").classList.toggle("hidden", !editing);
  $("#memoCancel").classList.toggle("hidden", !editing || !memo);
  $("#memoDelete").classList.toggle("hidden", editing || !memo);
  $("#memoHint").textContent = editing
    ? "Ctrl+Enter 저장 · Esc 취소"
    : "더블클릭하여 수정";
  syncMemoSave();
}

function saveMemo() {
  const task = selectedTask();
  const { value, canSave } = memoSaveState();
  if (!task || !canSave) return;
  task.memo = value;
  memoEditing = false;
  save();
  render();
}

function cancelMemoEdit() {
  // Nothing to fall back to when the memo is new — close the panel instead.
  if (!selectedTask()?.memo) {
    setSelected(null);
    return;
  }
  memoEditing = false;
  renderMemo();
}

function deleteMemo() {
  const task = selectedTask();
  if (!task || !task.memo) return;
  if (!window.confirm("이 메모를 삭제할까요? 되돌릴 수 없습니다.")) return;
  task.memo = null;
  memoEditing = false;
  save();
  render();
}

function wireMemo() {
  const input = $("#memoInput");
  input.addEventListener("input", syncMemoSave);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelMemoEdit();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      saveMemo();
    }
  });

  $("#memoText").addEventListener("dblclick", () => {
    memoEditing = true;
    renderMemo();
  });

  $("#memoSave").addEventListener("click", saveMemo);
  $("#memoCancel").addEventListener("click", cancelMemoEdit);
  $("#memoDelete").addEventListener("click", deleteMemo);
  $("#memoClose").addEventListener("click", () => setSelected(null));
}

/* -------------------------------------------------------------- rendering */

function render() {
  // Completing, trashing or purging the selected task takes the panel with it.
  if (selectedId && !selectedTask()) {
    selectedId = null;
    memoEditing = false;
    window.api.setMemoPanel(false, 0);
  }
  renderCounts();
  if (mode === "collapsed") return;
  if (activeTab === "matrix") {
    renderInbox();
    renderMatrix();
  } else if (activeTab === "history") renderHistory();
  else if (activeTab === "trash") renderTrash();
  // the guide tab is static markup — nothing to render
  renderMemo();
}

/* ------------------------------------------------------------------- tabs */

function setTab(tab) {
  // The panel belongs to the matrix; leaving the tab closes it (and gives the
  // window its height back) rather than leaving it pointing at a hidden row.
  if (tab !== "matrix") setSelected(null);
  activeTab = tab;
  $$(".tab").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab),
  );
  // The inbox belongs to the matrix, so it travels with it rather than sitting
  // above the history or trash lists.
  $("#inboxPanel").classList.toggle("hidden", tab !== "matrix");
  $("#matrixView").classList.toggle("hidden", tab !== "matrix");
  $("#historyView").classList.toggle("hidden", tab !== "history");
  $("#trashView").classList.toggle("hidden", tab !== "trash");
  $("#guideView").classList.toggle("hidden", tab !== "guide");
  render();
}

/* ------------------------------------------------------------------ inbox */

/**
 * "다 꺼내기" — write everything down first, sort it into quadrants after.
 *
 * Folded by default, and unlike the memo panel it does *not* grow the window:
 * it takes its height from the matrix. That is why the list is capped in CSS
 * (`--inbox-max-h`) and scrolls past it — an unbounded staging list would push
 * the quadrants off the bottom of a small window.
 */
let inboxOpen = false;

function applyInboxOpen(open, persist = true) {
  inboxOpen = Boolean(open);
  $("#inboxPanel").classList.toggle("open", inboxOpen);
  $("#inboxToggle").setAttribute("aria-expanded", String(inboxOpen));
  if (persist) window.api.setInboxOpen(inboxOpen);
}

function focusInbox() {
  applyInboxOpen(true);
  $("#inboxInput").focus();
}

function wireInbox() {
  const input = $("#inboxInput");

  $("#inboxToggle").addEventListener("click", () => {
    applyInboxOpen(!inboxOpen);
    if (inboxOpen) input.focus();
  });

  $("#inboxAdd").addEventListener("submit", (e) => {
    e.preventDefault();
    addTask(INBOX, input.value, null);
    input.value = "";
    input.focus();
  });

  // Most brain dumps are already written down somewhere else. Pasting a block
  // of lines should give one item per line, not a single item with newlines
  // flattened into it.
  input.addEventListener("paste", (e) => {
    const raw = e.clipboardData?.getData("text") ?? "";
    if (!raw.includes("\n")) return;
    e.preventDefault();
    // Splice the paste into whatever is already typed before cutting on
    // newlines, so a half-finished line in the box becomes the first item
    // instead of being silently dropped.
    const merged =
      input.value.slice(0, input.selectionStart) +
      raw +
      input.value.slice(input.selectionEnd);
    addTasks(INBOX, splitBulkText(merged));
    input.value = "";
  });
}

/* ----------------------------------------------------------------- toast */

let toastTimer = null;

/**
 * Brief confirmation for things that happen outside the window (a file written
 * to disk), where nothing on screen would otherwise change. `action` adds one
 * button; it is cleared on every call so an old one cannot linger.
 */
function toast(message, { error = false, action = null, ms = 4000 } = {}) {
  const box = $("#toast");
  const act = $("#toastAct");
  $("#toastText").textContent = message;
  box.classList.toggle("error", error);

  act.classList.toggle("hidden", !action);
  act.onclick = action ? action.onClick : null;
  if (action) act.textContent = action.label;

  box.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add("hidden"), ms);
}

/* ---------------------------------------------------------------- export */

/**
 * The inbox and the four quadrants, written out as PDF, HTML or Markdown. The
 * format comes from the extension picked in the native save dialog, and the
 * document itself is built in the main process from the same task list that was
 * last saved — so there is nothing to collect here beyond the click.
 */
async function exportBoard() {
  const btn = $("#exportBtn");
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const res = await window.api.exportBoard();
    if (res?.ok) {
      toast(`저장했습니다 · ${res.name}`, {
        action: {
          label: "폴더 열기",
          onClick: () => window.api.revealExport(res.path),
        },
      });
    } else if (res?.reason === "empty") {
      toast("내보낼 항목이 없습니다.");
    } else if (res?.reason === "error") {
      toast(`저장하지 못했습니다: ${res.message}`, { error: true, ms: 6000 });
    }
    // 'canceled' is the user closing the dialog — no message for that.
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------ drag & drop */

function afterElement(list, y) {
  const items = $$(".item:not(.dragging)", list);
  return items.find((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
}

/** Every place a task can be dropped: the four quadrants plus the inbox. */
const dropZones = () => [...$$(".quad"), $("#inboxPanel")];

function wireDragAndDrop() {
  let draggingId = null;

  document.addEventListener("dragstart", (e) => {
    const item = e.target.closest?.(".item");
    if (!item) return;
    draggingId = item.dataset.id;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggingId);
  });

  document.addEventListener("dragend", (e) => {
    e.target.closest?.(".item")?.classList.remove("dragging");
    dropZones().forEach((z) => z.classList.remove("drop"));
    draggingId = null;
  });

  dropZones().forEach((zone) => {
    // The inbox zone is the whole section, header included, so a task can be
    // sent back up while the list is folded. afterElement then measures hidden
    // rows as zero-height and finds no insertion point, which lands the task at
    // the end — the right answer for a drop on a collapsed header.
    const list = $(".list, .inbox-list", zone);

    zone.addEventListener("dragover", (e) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("drop");
    });

    zone.addEventListener("dragleave", (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("drop");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drop");
      const id = draggingId || e.dataTransfer.getData("text/plain");
      if (!id) return;
      const before = afterElement(list, e.clientY);
      moveTask(id, zone.dataset.quad, before ? before.dataset.id : null);
    });
  });
}

/* ----------------------------------------------------------- quad sizing */

/**
 * Two ratios drive the whole 2×2 grid: `cols` is q1/q3's share of the width,
 * `rows` is q1/q2's share of the height. Because the tracks are shared, wider
 * q1 means narrower q2, and taller q1 means shorter q3 *and* q4 — which is
 * what makes it read as one matrix instead of four independent boxes.
 */
/** Read from CSS instead of duplicating it — the grid gap is the source. */
const GUTTER =
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--gutter"),
  ) || 10;
/** How far past the gutter the grab zone reaches into each quadrant. */
const EDGE_REACH = 4;
const HIT = GUTTER / 2 + EDGE_REACH;

/** Smallest a quadrant may be dragged to, where the window can afford it. */
const MIN_COL_PX = 180;
const MIN_ROW_PX = 110;

let layout = { ...DEFAULT_LAYOUT };
let layoutTimer = null;

/**
 * Clamp to a pixel minimum while the window is big enough to honour it, and
 * to the plain ratio floor once it is not.
 */
function clampAxis(value, span, minPx) {
  if (!Number.isFinite(value)) return 0.5;
  const floor = span > 0 ? Math.min(minPx / span, 0.5) : MIN_RATIO;
  const low = Math.max(MIN_RATIO, floor);
  return Math.min(1 - low, Math.max(low, value));
}

/**
 * Ratios become grid tracks. The px floor in each minmax() keeps a quadrant
 * usable when the window itself gets small enough to beat the drag clamp.
 */
function applyLayout() {
  const track = (ratio, minPx) =>
    `minmax(${minPx}px, ${(ratio * 100).toFixed(3)}fr) ` +
    `minmax(${minPx}px, ${((1 - ratio) * 100).toFixed(3)}fr)`;

  const grid = $("#matrixView");
  grid.style.gridTemplateColumns = track(layout.cols, MIN_COL_PX);
  grid.style.gridTemplateRows = track(layout.rows, MIN_ROW_PX);
}

function saveLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => window.api.setLayout(layout), 150);
}

/**
 * Content box of the grid plus the centre line of each divider, read straight
 * off the corner quadrants so no padding math is needed.
 */
function metrics() {
  const a = $('[data-quad="q1"]').getBoundingClientRect();
  const d = $('[data-quad="q4"]').getBoundingClientRect();
  return {
    left: a.left,
    top: a.top,
    width: d.right - a.left,
    height: d.bottom - a.top,
    x: (a.right + d.left) / 2,
    y: (a.bottom + d.top) / 2,
  };
}

/** Which divider the point is on: "col", "row", "both", or null. */
function edgeAt(x, y) {
  const m = metrics();
  if (m.width <= 0 || m.height <= 0) return null;
  if (x < m.left || x > m.left + m.width) return null;
  if (y < m.top || y > m.top + m.height) return null;

  const col = Math.abs(x - m.x) <= HIT;
  const row = Math.abs(y - m.y) <= HIT;
  if (col && row) return "both";
  if (col) return "col";
  if (row) return "row";
  return null;
}

/** Cursor on the grid, accent border on the two quadrants sharing the edge. */
function markEdge(mode) {
  const grid = $("#matrixView");
  grid.classList.toggle("edge-col", mode === "col");
  grid.classList.toggle("edge-row", mode === "row");
  grid.classList.toggle("edge-both", mode === "both");

  const col = mode === "col" || mode === "both";
  const row = mode === "row" || mode === "both";
  QUADS.forEach((q) => {
    const el = $(`[data-quad="${q}"]`);
    el.classList.toggle("edge-r", col && (q === "q1" || q === "q3"));
    el.classList.toggle("edge-l", col && (q === "q2" || q === "q4"));
    el.classList.toggle("edge-b", row && (q === "q1" || q === "q2"));
  });
}

function wireQuadEdges() {
  const grid = $("#matrixView");
  let dragging = null;

  /** Pointer position → the ratios for whichever axes are being dragged. */
  const ratiosAt = (ev) => {
    const m = metrics();
    const next = {};
    if (dragging !== "row") {
      const span = m.width - GUTTER;
      const raw = (ev.clientX - m.left - GUTTER / 2) / span;
      if (span > 0) next.cols = clampAxis(raw, span, MIN_COL_PX);
    }
    if (dragging !== "col") {
      const span = m.height - GUTTER;
      const raw = (ev.clientY - m.top - GUTTER / 2) / span;
      if (span > 0) next.rows = clampAxis(raw, span, MIN_ROW_PX);
    }
    return next;
  };

  grid.addEventListener("pointermove", (e) => {
    if (!dragging) markEdge(edgeAt(e.clientX, e.clientY));
  });

  grid.addEventListener("pointerleave", () => {
    if (!dragging) markEdge(null);
  });

  grid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const mode = edgeAt(e.clientX, e.clientY);
    if (!mode) return;

    e.preventDefault();
    dragging = mode;
    markEdge(mode);
    grid.setPointerCapture(e.pointerId);
    document.body.classList.add(`resizing-${mode}`);

    const onMove = (ev) => {
      Object.assign(layout, ratiosAt(ev));
      applyLayout();
      saveLayout();
    };
    // lostpointercapture is the backstop: however the drag ends — button
    // released off-window, capture stolen — the listeners come off.
    const onUp = (ev) => {
      dragging = null;
      document.body.classList.remove(
        "resizing-col",
        "resizing-row",
        "resizing-both",
      );
      markEdge(ev ? edgeAt(ev.clientX, ev.clientY) : null);
      grid.removeEventListener("pointermove", onMove);
      grid.removeEventListener("pointerup", onUp);
      grid.removeEventListener("pointercancel", onUp);
      grid.removeEventListener("lostpointercapture", onUp);
    };

    grid.addEventListener("pointermove", onMove);
    grid.addEventListener("pointerup", onUp);
    grid.addEventListener("pointercancel", onUp);
    grid.addEventListener("lostpointercapture", onUp);
  });

  // Double-clicking an edge re-centres it; the crossing re-centres both.
  grid.addEventListener("dblclick", (e) => {
    const mode = edgeAt(e.clientX, e.clientY);
    if (!mode) return;
    if (mode !== "row") layout.cols = DEFAULT_LAYOUT.cols;
    if (mode !== "col") layout.rows = DEFAULT_LAYOUT.rows;
    applyLayout();
    saveLayout();
  });
}

/* ------------------------------------------------------------------ theme */

/** Title and accessible name always move together on the icon-only buttons. */
function labelBtn(sel, label) {
  const btn = $(sel);
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

function applyTheme(next, persist = true) {
  theme = next === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  labelBtn(
    "#themeBtn",
    theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
  );
  if (persist) window.api.setTheme(theme);
}

function applyPinned(on) {
  $("#pinBtn").classList.toggle("on", on);
  labelBtn("#pinBtn", on ? "항상 위 고정 해제" : "항상 위에 고정");
}

/* -------------------------------------------------------- window controls */

/** Last mode pushed by the main process, which outranks the load snapshot. */
let pushedMode = null;

function applyMode(next) {
  mode = next;
  // collapse() already dropped the panel's height on its way to the bar, so
  // clear the selection here without asking for another resize.
  if (mode === "collapsed") {
    selectedId = null;
    memoEditing = false;
  }
  document.body.classList.toggle("collapsed", mode === "collapsed");
  document.body.classList.toggle("expanded", mode === "expanded");
  labelBtn("#sizeBtn", mode === "collapsed" ? "펼치기" : "바 모드로 축소");
  render();
}

function toggleSize() {
  if (mode === "collapsed") window.api.expand();
  else window.api.collapse();
}

/* ------------------------------------------------------------------- init */

function wireUI() {
  // The inbox form shares the .add class for its styling but not this wiring:
  // it has no `data-add` quadrant and no due-date chip, and wireInbox() binds
  // its own submit. Matching it here would file a task under `undefined` and
  // blank the input before that handler ever ran.
  $$(".add:not(.inbox-add)").forEach((form) => {
    const input = $('input[type="text"]', form);
    const chip = dueChip(null, () => {});
    form.insertBefore(chip, $('button[type="submit"]', form));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addTask(form.dataset.add, input.value, chip.input.value);
      input.value = "";
      chip.apply("");
      input.focus();
    });
  });

  $$(".tab").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.dataset.tab)),
  );

  $("#historySearch").addEventListener("input", (e) => {
    historyQuery = e.target.value;
    renderHistory();
  });

  $("#trashSearch").addEventListener("input", (e) => {
    trashQuery = e.target.value;
    renderTrash();
  });

  $("#clearHistory").addEventListener("click", () => {
    const items = doneTasks();
    if (!items.length) return;
    if (!window.confirm(`완료한 항목 ${items.length}개를 휴지통으로 옮길까요?`))
      return;
    const now = Date.now();
    items.forEach((t) => {
      t.deletedAt = now;
    });
    save();
    render();
  });

  $("#restoreAll").addEventListener("click", () => {
    const items = trashedTasks();
    if (!items.length) return;
    items.forEach((t) => {
      t.deletedAt = null;
    });
    save();
    render();
  });

  $("#emptyTrash").addEventListener("click", () => {
    const count = trashedTasks().length;
    if (!count) return;
    if (
      !window.confirm(
        `휴지통의 ${count}개 항목을 영구 삭제할까요? 되돌릴 수 없습니다.`,
      )
    )
      return;
    tasks = tasks.filter((t) => !t.deletedAt);
    save();
    render();
  });

  $("#themeBtn").addEventListener("click", () =>
    applyTheme(theme === "dark" ? "light" : "dark"),
  );

  $("#exportBtn").addEventListener("click", exportBoard);

  $("#sizeBtn").addEventListener("click", toggleSize);
  $("#minBtn").addEventListener("click", () => window.api.minimize());
  $("#closeBtn").addEventListener("click", () => window.api.close());

  $("#pinBtn").addEventListener("click", async () => {
    applyPinned(await window.api.togglePin());
  });

  $("#barSummary").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip || mode !== "collapsed") return;
    window.api.expand();
    setTab("matrix");
    // The inbox chip is only there when something is waiting in it, so clicking
    // it means "show me those" — unfold on the way out of bar mode. No focus
    // here: the window is still resizing and would swallow it.
    if (chip.dataset.jump === "inbox") applyInboxOpen(true);
  });

  $(".titlebar").addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    toggleSize();
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleSize();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      // Bar mode hides the button; keep the shortcut in step with it.
      if (mode === "collapsed") return;
      exportBoard();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      applyTheme(theme === "dark" ? "light" : "dark");
      return;
    }
    // Ctrl+0 continues the Ctrl+1~4 run: 0 is the "not sorted yet" slot.
    if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      if (mode === "collapsed") return;
      setTab("matrix");
      focusInbox();
      return;
    }
    if (e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      if (mode === "collapsed") return;
      setTab("matrix");
      $(`[data-add="q${e.key}"] input[type="text"]`)?.focus();
    }
  });

  wireInbox();
  wireMemo();

  // Waking from sleep or coming back to the window can also cross midnight,
  // and either may happen while the rollover timer is still pending.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);
}

async function init() {
  // Registered before the first await: the main process sends 'win:mode' from
  // ready-to-show, and a listener attached later would miss it silently.
  window.api.onMode((next) => {
    pushedMode = next;
    applyMode(next);
  });

  const state = await window.api.load();
  tasks = normalizeTasks(state.tasks);
  applyTheme(state.settings?.theme || "light", false);
  applyPinned(state.settings?.alwaysOnTop !== false);
  applyInboxOpen(state.settings?.inboxOpen === true, false);
  layout = sanitizeLayout(state.settings?.layout);
  applyLayout();
  wireUI();
  wireDragAndDrop();
  wireQuadEdges();
  // state.mode is a snapshot from before ready-to-show, so a mode that was
  // pushed in the meantime is the newer truth.
  applyMode(pushedMode || state.mode || "expanded");
  scheduleDayRollover();
}

init();
