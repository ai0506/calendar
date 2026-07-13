const REFRESH_MS = 10_000;
const CLOCK_REFRESH_MS = 60_000;
const PORTRAIT_MAX_RATIO = 1.35;
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 23;
const HOUR_PX = 56;
const FALLBACK_CATEGORY = {
  id: "cat-other",
  name: "Tech",
  color: "#8E8E93",
  sort_order: 999,
};

let viewDate = startOfDay(new Date());
let selectedDate = startOfDay(new Date());
let currentView = "month";
let selectedCat = null;
let portraitTab = "preview";
let categories = [];
let activeFilters = new Set();
let eventsByDate = new Map();
let deadlinesByDate = new Map();
let newModalTab = "event";
let ddlSelectedCat = null;
let ddlPriority = "default";
let refreshTimer = null;
let clockTimer = null;
let refreshInFlight = false;
let lastRangeKey = "";
const rangeCache = new Map();
const RANGE_CACHE_LIMIT = 6;
let pendingDelete = null;
let pendingDeadlineAction = null;
let repeatIdempotencyKey = null;
let repeatWeekdayTouched = false;
let toastTimer = null;
let notificationTimer = null;
let notificationInFlight = false;
const seenNotificationIds = new Set();
let notificationItems = [];

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  setLoading(true);
  renderEmptyShell();
  checkAuth();
}

function cacheElements() {
  Object.assign(els, {
    body: document.body,
    topbar: document.getElementById("topbar"),
    bodySplit: document.getElementById("bodySplit"),
    calCol: document.getElementById("calCol"),
    inspector: document.getElementById("inspector"),
    navTitle: document.getElementById("navTitle"),
    viewToggle: document.getElementById("viewToggle"),
    authScreen: document.getElementById("authScreen"),
    loadingScreen: document.getElementById("loadingScreen"),
    loginForm: document.getElementById("loginForm"),
    passwordInput: document.getElementById("passwordInput"),
    loginError: document.getElementById("loginError"),
    loginButton: document.getElementById("loginButton"),
    eventScrim: document.getElementById("eventScrim"),
    eventForm: document.getElementById("eventForm"),
    ddlForm: document.getElementById("ddlForm"),
    ntEvent: document.getElementById("ntEvent"),
    ntDdl: document.getElementById("ntDdl"),
    createButton: document.getElementById("createButton"),
    fTitle: document.getElementById("fTitle"),
    fDate: document.getElementById("fDate"),
    fAllday: document.getElementById("fAllday"),
    fStart: document.getElementById("fStart"),
    fEnd: document.getElementById("fEnd"),
    timeFields: document.getElementById("timeFields"),
    timeError: document.getElementById("timeError"),
    reminderFields: document.getElementById("reminderFields"),
    fReminderOne: document.getElementById("fReminderOne"),
    fReminderTwo: document.getElementById("fReminderTwo"),
    catSwatches: document.getElementById("catSwatches"),
    fRepeat: document.getElementById("fRepeat"),
    repeatPanel: document.getElementById("repeatPanel"),
    repeatWeeklyFields: document.getElementById("repeatWeeklyFields"),
    repeatWeekdays: document.getElementById("repeatWeekdays"),
    repeatRuleNote: document.getElementById("repeatRuleNote"),
    fRepeatEnd: document.getElementById("fRepeatEnd"),
    fRepeatEndDate: document.getElementById("fRepeatEndDate"),
    fRepeatCount: document.getElementById("fRepeatCount"),
    repeatPreview: document.getElementById("repeatPreview"),
    repeatError: document.getElementById("repeatError"),
    dTitle: document.getElementById("dTitle"),
    dDate: document.getElementById("dDate"),
    dTime: document.getElementById("dTime"),
    dTimeField: document.getElementById("dTimeField"),
    dAllday: document.getElementById("dAllday"),
    dCatSwatches: document.getElementById("dCatSwatches"),
    priSeg: document.getElementById("priSeg"),
    createDdlButton: document.getElementById("createDdlButton"),
    confirmScrim: document.getElementById("confirmScrim"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmDeleteButton: document.getElementById("confirmDeleteButton"),
    seriesDeleteActions: document.getElementById("seriesDeleteActions"),
    deleteThisButton: document.getElementById("deleteThisButton"),
    deleteSeriesButton: document.getElementById("deleteSeriesButton"),
    completeScrim: document.getElementById("completeScrim"),
    completeTitle: document.getElementById("completeTitle"),
    confirmCompleteButton: document.getElementById("confirmCompleteButton"),
    reopenScrim: document.getElementById("reopenScrim"),
    reopenTitle: document.getElementById("reopenTitle"),
    confirmReopenButton: document.getElementById("confirmReopenButton"),
    toast: document.getElementById("toast"),
    notificationsButton: document.getElementById("notificationsButton"),
    notificationBadge: document.getElementById("notificationBadge"),
    notificationsScrim: document.getElementById("notificationsScrim"),
    notificationsList: document.getElementById("notificationsList"),
  });
}

function bindEvents() {
  document.querySelector("[data-action='navigate'][data-dir='-1']").addEventListener("click", () => navigate(-1));
  document.querySelector("[data-action='navigate'][data-dir='1']").addEventListener("click", () => navigate(1));
  document.querySelector("[data-action='today']").addEventListener("click", goToday);
  document.querySelector("[data-action='open-event']").addEventListener("click", () => openModal());
  document.querySelectorAll("[data-action='close-event']").forEach((button) => button.addEventListener("click", closeModal));
  document.querySelector("[data-action='close-notifications']").addEventListener("click", closeNotifications);
  els.notificationsButton.addEventListener("click", openNotifications);
  document.querySelector("[data-action='close-confirm']").addEventListener("click", closeConfirm);
  document.querySelector("[data-action='close-complete']").addEventListener("click", closeComplete);
  document.querySelector("[data-action='close-reopen']").addEventListener("click", closeReopen);
  els.confirmDeleteButton.addEventListener("click", () => confirmDelete("event"));
  els.deleteThisButton.addEventListener("click", () => confirmDelete("event"));
  els.deleteSeriesButton.addEventListener("click", () => confirmDelete("series"));
  els.confirmCompleteButton.addEventListener("click", confirmComplete);
  els.confirmReopenButton.addEventListener("click", confirmReopen);

  els.ntEvent.addEventListener("click", () => setNewTab("event"));
  els.ntDdl.addEventListener("click", () => setNewTab("ddl"));
  els.ddlForm.addEventListener("submit", submitDeadline);
  els.dAllday.addEventListener("change", toggleDdlAllDay);
  els.priSeg.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-priority]");
    if (button) selectDdlPriority(button.dataset.priority);
  });

  els.viewToggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (button) switchView(button.dataset.view);
  });

  els.loginForm.addEventListener("submit", submitLogin);
  els.eventForm.addEventListener("submit", submitEvent);
  els.fAllday.addEventListener("change", toggleAllDayFields);
  els.fStart.addEventListener("input", validateTimes);
  els.fEnd.addEventListener("input", validateTimes);
  els.fRepeat.addEventListener("change", () => syncRepeatUI(true));
  els.fRepeatEnd.addEventListener("change", syncRepeatUI);
  els.fDate.addEventListener("input", () => {
    if (els.fRepeat.value === "weekly" && !repeatWeekdayTouched) setDefaultRepeatWeekday();
    syncRepeatUI();
  });
  els.fRepeatEndDate.addEventListener("input", syncRepeatUI);
  els.fRepeatCount.addEventListener("input", syncRepeatUI);
  els.repeatWeekdays.addEventListener("change", () => {
    repeatWeekdayTouched = true;
    syncRepeatUI();
  });

  els.eventScrim.addEventListener("click", (event) => {
    if (event.target === els.eventScrim) closeModal();
  });
  els.confirmScrim.addEventListener("click", (event) => {
    if (event.target === els.confirmScrim) closeConfirm();
  });
  els.completeScrim.addEventListener("click", (event) => {
    if (event.target === els.completeScrim) closeComplete();
  });
  els.reopenScrim.addEventListener("click", (event) => {
    if (event.target === els.reopenScrim) closeReopen();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });
}

async function checkAuth() {
  try {
    const json = await apiFetch("/api/auth/status", { authCheck: true });
    if (json.data?.authenticated) {
      await enterAuthenticatedApp();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  } finally {
    setLoading(false);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  setLoginError("");
  els.loginButton.disabled = true;
  try {
    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: els.passwordInput.value }),
      authCheck: true,
    });
    els.passwordInput.value = "";
    await enterAuthenticatedApp();
  } catch (err) {
    setLoginError(err.message || "Invalid password.");
    els.passwordInput.focus();
  } finally {
    els.loginButton.disabled = false;
  }
}

async function enterAuthenticatedApp() {
  hideLogin();
  els.body.classList.add("is-authenticated");
  els.topbar.removeAttribute("aria-hidden");
  els.bodySplit.removeAttribute("aria-hidden");
  await loadCategories();
  render();
  await refreshVisibleData({ silent: false, force: true });
  startAutoRefresh();
  startClockRefresh();
  startNotificationPolling();
}

function showLogin() {
  stopAutoRefresh();
  stopClockRefresh();
  stopNotificationPolling();
  els.body.classList.remove("is-authenticated");
  els.topbar.setAttribute("aria-hidden", "true");
  els.bodySplit.setAttribute("aria-hidden", "true");
  els.authScreen.classList.add("open");
  setTimeout(() => els.passwordInput.focus(), 50);
}

function hideLogin() {
  els.authScreen.classList.remove("open");
  setLoginError("");
}

function setLoginError(message) {
  els.loginError.textContent = message || "Invalid password.";
  els.loginError.classList.toggle("show", Boolean(message));
}

async function loadCategories() {
  const json = await apiFetch("/api/categories");
  const rows = Array.isArray(json.data) ? json.data : [];
  categories = rows.length ? rows : [FALLBACK_CATEGORY];
  const validNames = new Set(categories.map((cat) => cat.name));
  activeFilters = new Set([...activeFilters].filter((name) => validNames.has(name)));
  if (activeFilters.size === 0) activeFilters = new Set(categories.map((cat) => cat.name));
  if (!selectedCat || !validNames.has(selectedCat)) selectedCat = categories[0]?.name || FALLBACK_CATEGORY.name;
}

async function apiFetch(url, options = {}) {
  const { authCheck, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  if (fetchOptions.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    credentials: "same-origin",
    ...fetchOptions,
    headers,
  });

  let json = null;
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    json = await response.json().catch(() => null);
  }

  if (response.status === 401 && !authCheck) {
    showLogin();
    throw new Error("Authentication required");
  }

  if (!response.ok || json?.ok === false) {
    const message = json?.error?.message || response.statusText || "Request failed";
    throw new Error(message);
  }
  return json || { ok: true, data: null };
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => refreshVisibleData({ silent: true }), REFRESH_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

function startClockRefresh() {
  stopClockRefresh();
  clockTimer = setInterval(() => {
    if (els.body.classList.contains("is-authenticated")) render();
  }, CLOCK_REFRESH_MS);
}

function stopClockRefresh() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

function startNotificationPolling() {
  stopNotificationPolling();
  pollNotifications();
  notificationTimer = setInterval(pollNotifications, 45_000);
}

function stopNotificationPolling() {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = null;
  notificationInFlight = false;
  seenNotificationIds.clear();
  notificationItems = [];
  updateNotificationBadge(0);
}

async function pollNotifications() {
  if (notificationInFlight || !els.body.classList.contains("is-authenticated")) return;
  notificationInFlight = true;
  try {
    const response = await apiFetch("/api/notifications?include_read=false&limit=50");
    const items = response.data?.items || [];
    notificationItems = items;
    updateNotificationBadge(response.data?.unread_count || 0);
    const newestByTarget = new Map();
    items.slice().reverse().forEach((item) => newestByTarget.set(`${item.target_type}:${item.target_id}`, item));
    newestByTarget.forEach((item) => {
      if (seenNotificationIds.has(item.id)) return;
      seenNotificationIds.add(item.id);
      showToast(`${item.title}: ${item.message}`);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(item.title, { body: item.message });
      }
    });
  } catch (err) {
    // Notification polling is optional and must not interrupt the calendar.
  } finally {
    notificationInFlight = false;
  }
}

function updateNotificationBadge(count) {
  els.notificationBadge.hidden = !count;
  els.notificationBadge.textContent = count > 99 ? "99+" : String(count || 0);
}

async function openNotifications() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission().catch(() => null);
  }
  try {
    const response = await apiFetch("/api/notifications?include_read=true&limit=50");
    notificationItems = response.data?.items || [];
    updateNotificationBadge(response.data?.unread_count || 0);
  } catch (err) {
    showToast("Failed to load notifications.");
  }
  renderNotifications();
  els.notificationsScrim.classList.add("open");
}

function closeNotifications() {
  els.notificationsScrim.classList.remove("open");
}

function renderNotifications() {
  if (!notificationItems.length) {
    els.notificationsList.innerHTML = '<div class="notifications-empty">No notifications yet.</div>';
    return;
  }
  els.notificationsList.innerHTML = notificationItems.map((item) => `<button type="button" class="notification-item ${item.read_at ? "" : "unread"}" data-notification-id="${escapeAttr(item.id)}">
    <div class="notification-title">${escapeHtml(item.title)}</div>
    <div class="notification-message">${escapeHtml(item.message)}</div>
    <div class="notification-time">${new Date(item.created_at).toLocaleString()}</div>
  </button>`).join("");
  els.notificationsList.querySelectorAll("[data-notification-id]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.notificationId;
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "PATCH" });
      notificationItems = notificationItems.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item);
      updateNotificationBadge(notificationItems.filter((item) => !item.read_at).length);
      renderNotifications();
    } catch (err) { showToast("Failed to mark notification read."); }
  }));
}

async function refreshVisibleData({ silent = true, force = false } = {}) {
  if (refreshInFlight) return;
  const range = getVisibleRange();
  const rangeKey = `${range.from}|${range.to}`;
  if (!force && rangeKey === lastRangeKey && !silent) return;

  const cached = rangeCache.get(rangeKey);
  if (cached && rangeKey !== lastRangeKey) {
    applyEvents(cached);
    lastRangeKey = rangeKey;
    render();
  }

  refreshInFlight = true;
  try {
    const url = `/api/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const deadlineFrom = addDateKey(range.from.slice(0, 10), -3);
    const deadlineTo = addDateKey(range.to.slice(0, 10), 3);
    const deadlineUrl = `/api/deadlines?from=${encodeURIComponent(deadlineFrom)}&to=${encodeURIComponent(deadlineTo)}&include_completed=true`;
    const [json, deadlineJson] = await Promise.all([apiFetch(url), apiFetch(deadlineUrl)]);
    const rows = json.data || [];
    const deadlineRows = deadlineJson.data || [];
    rangeCache.set(rangeKey, rows);
    trimRangeCache();
    applyEvents(rows);
    applyDeadlines(deadlineRows);
    lastRangeKey = rangeKey;
    render();
    prefetchAdjacentRanges();
  } catch (err) {
    if (err.message !== "Authentication required" && silent) showToast("Sync failed. Keeping current calendar.");
    if (!silent && err.message !== "Authentication required") showToast(err.message || "Failed to load events.");
  } finally {
    refreshInFlight = false;
  }
}

function trimRangeCache() {
  while (rangeCache.size > RANGE_CACHE_LIMIT) {
    const oldestKey = rangeCache.keys().next().value;
    rangeCache.delete(oldestKey);
  }
}

async function prefetchAdjacentRanges() {
  if (currentView !== "month" && !isPortrait()) return;
  for (const dir of [-1, 1]) {
    const neighborDate = addMonths(viewDate, dir);
    const { start, end } = getMonthGridRange(neighborDate);
    const from = toLocalIso(start, "00:00");
    const to = toLocalIso(end, "23:59");
    const key = `${from}|${to}`;
    if (rangeCache.has(key)) continue;
    try {
      const json = await apiFetch(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      rangeCache.set(key, json.data || []);
      trimRangeCache();
    } catch (err) {
      // best-effort prefetch; ignore failures
    }
  }
}

function applyEvents(rows) {
  const next = new Map();
  for (const row of rows) {
    const event = adaptEvent(row);
    if (!event) continue;
    if (!next.has(event.dateKey)) next.set(event.dateKey, []);
    next.get(event.dateKey).push(event);
  }
  for (const list of next.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }
  eventsByDate = next;
}

function applyDeadlines(rows) {
  const next = new Map();
  for (const row of rows) {
    const deadline = adaptDeadline(row);
    if (!deadline) continue;
    if (!next.has(deadline.dateKey)) next.set(deadline.dateKey, []);
    next.get(deadline.dateKey).push(deadline);
  }
  for (const list of next.values()) list.sort((a, b) => Number(a.allDay) - Number(b.allDay) || a.dueMs - b.dueMs || a.title.localeCompare(b.title));
  deadlinesByDate = next;
}

function adaptDeadline(row) {
  if (!row || !row.id || !row.due_time) return null;
  const dateKey = row.due_time.slice(0, 10);
  const categoryName = row.category || FALLBACK_CATEGORY.name;
  const category = getCategory(categoryName);
  const color = !row.color || String(row.color).toLowerCase() === "default" ? category.color : row.color;
  const allDay = Boolean(row.all_day);
  const time = allDay ? null : row.due_time.slice(11, 16);
  const dueMs = allDay ? new Date(`${dateKey}T23:59:59`).getTime() : Date.parse(row.due_time);
  return {
    id: row.id,
    title: row.title || "Untitled",
    dateKey,
    time,
    allDay,
    dueMs,
    cat: categoryName,
    color,
    bg: colorToSoftBg(color),
    priority: row.priority || "default",
    status: row.status || (row.completed_at ? "completed" : row.is_overdue ? "overdue" : "open"),
    completedAt: row.completed_at || null,
  };
}

function adaptEvent(row) {
  if (!row || !row.id || !row.start_time) return null;
  const dateKey = row.start_time.slice(0, 10);
  const start = row.all_day ? "00:00" : timeFromIso(row.start_time, "00:00");
  const end = row.all_day ? "23:59" : timeFromIso(row.end_time, start);
  const categoryName = row.category || FALLBACK_CATEGORY.name;
  const category = getCategory(categoryName);
  // "default" means the event follows its category color at render time.
  const color = !row.color || (typeof row.color === "string" && row.color.toLowerCase() === "default")
    ? (category.color || FALLBACK_CATEGORY.color)
    : row.color;
  return {
    id: row.id,
    title: row.title || "Untitled",
    description: row.description || "",
    cat: categoryName,
    color,
    bg: colorToSoftBg(color),
    start,
    end,
    allDay: Boolean(row.all_day),
    dateKey,
    source: row.source || "web",
    seriesId: row.series_id || null,
  };
}

function getVisibleRange() {
  if (isPortrait() || currentView === "month") {
    const { start, end } = getMonthGridRange(viewDate);
    return { from: toLocalIso(start, "00:00"), to: toLocalIso(end, "23:59") };
  }
  if (currentView === "week") {
    const start = startOfWeek(viewDate);
    const end = addDays(start, 6);
    return { from: toLocalIso(start, "00:00"), to: toLocalIso(end, "23:59") };
  }
  return { from: toLocalIso(viewDate, "00:00"), to: toLocalIso(viewDate, "23:59") };
}

function switchView(view) {
  if (!["month", "week", "day"].includes(view)) return;
  currentView = view;
  updateViewToggle();
  render();
  refreshVisibleData({ silent: false, force: true });
}

function navigate(dir) {
  if (isPortrait() || currentView === "month") viewDate = addMonths(viewDate, dir);
  else if (currentView === "week") viewDate = addDays(viewDate, dir * 7);
  else viewDate = addDays(viewDate, dir);
  render();
  refreshVisibleData({ silent: false, force: true });
}

function goToday() {
  viewDate = startOfDay(new Date());
  selectedDate = startOfDay(new Date());
  render();
  refreshVisibleData({ silent: false, force: true });
}

function renderEmptyShell() {
  updateViewToggle();
  render();
}

function render() {
  updateViewToggle();
  if (isPortrait()) {
    renderPortrait();
    return;
  }
  els.body.classList.remove("is-portrait");
  els.viewToggle.style.display = "flex";
  if (currentView === "month") {
    els.inspector.style.display = "flex";
    renderMonth();
    renderInspector();
  } else if (currentView === "week") {
    els.inspector.style.display = "none";
    renderWeek();
  } else {
    els.inspector.style.display = "none";
    renderDay();
  }
}

function updateViewToggle() {
  els.viewToggle.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });
}

function selectDay(iso) {
  selectedDate = parseDateKey(iso);
  if (isPortrait()) {
    els.calCol.querySelectorAll(".pm-cell.sel").forEach((cell) => cell.classList.remove("sel"));
    const cell = els.calCol.querySelector(`.pm-cell[data-date="${cssEscape(iso)}"]`);
    if (cell) cell.classList.add("sel");
    renderPortraitDetail();
  } else {
    els.calCol.querySelectorAll(".cell.is-selected").forEach((cell) => cell.classList.remove("is-selected"));
    const cell = els.calCol.querySelector(`.cell[data-date="${cssEscape(iso)}"]`);
    if (cell) cell.classList.add("is-selected");
    renderInspector();
  }
}

function renderPortrait() {
  els.body.classList.add("is-portrait");
  els.viewToggle.style.display = "none";
  els.inspector.style.display = "flex";
  els.navTitle.textContent = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  renderPortraitMonth();
  renderPortraitDetail();
}

function setPortraitTab(tab) {
  portraitTab = tab;
  renderPortraitDetail();
}

function renderPortraitMonth() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const { start } = getMonthGridRange(viewDate);
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const iso = isoKey(date);
    const events = getEventsFor(date);
    const deadlines = getDeadlinesFor(date);
    const marks = `<div class="pm-dots">${events.slice(0, 3).map((event) => `<div class="pm-dot" style="background:${event.color}"></div>`).join("")}${deadlines.slice(0, 2).map((deadline) => `<div class="pm-dot pm-ddl-dot" style="background:${deadlineColor(deadline)}"></div>`).join("")}</div>`;
    cells += `<button type="button" class="pm-cell ${date.getMonth() !== month ? "other" : ""} ${sameDay(date, today()) ? "today" : ""} ${sameDay(date, selectedDate) ? "sel" : ""}" data-date="${iso}">
      <span class="pm-date">${date.getDate()}</span>${marks}
    </button>`;
  }
  els.calCol.innerHTML = `
    <div class="pm-weekrow"><div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div></div>
    <div class="pm-grid">${cells}</div>`;
  els.calCol.querySelectorAll(".pm-cell").forEach((cell) => cell.addEventListener("click", () => selectDay(cell.dataset.date)));
}

function renderPortraitDetail() {
  const date = selectedDate;
  const count = getEventsFor(date).length;
  const head = `<div class="pd-head">
    <div>
      <div class="pd-eyebrow"><span class="pd-dow">${date.toLocaleDateString("en-US", { weekday: "short" })}</span> · ${count} event${count !== 1 ? "s" : ""}</div>
      <div class="pd-title">${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
    </div>
    <div class="pd-tabs">
      <button type="button" class="${portraitTab === "preview" ? "active" : ""}" data-tab="preview">Preview</button>
      <button type="button" class="${portraitTab === "timeline" ? "active" : ""}" data-tab="timeline">Timeline</button>
    </div>
  </div>`;
  if (portraitTab === "timeline") {
    els.inspector.innerHTML = head + `<div class="time-view">${buildAllDayRowHTML([date])}${buildTimeGridHTML([date])}</div>`;
  } else {
    const events = sortEvents(getEventsFor(date));
    els.inspector.innerHTML = head +
      `<div class="pd-scroll">
         ${ddlRailHTML()}
         <div class="agenda-list">
           ${events.length ? events.map((event) => agendaItemHTML(event, date)).join("") : '<div class="inspector-empty">No events on this day.</div>'}
         </div>
       </div>`;
  }
  bindInspectorActions(els.inspector);
}

function renderMonth() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const { start } = getMonthGridRange(viewDate);
  els.navTitle.textContent = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const iso = isoKey(date);
    const events = sortEvents(getEventsFor(date));
    const deadlines = getDeadlinesFor(date);
    const items = [...deadlines.map((deadline) => ({ type: "deadline", value: deadline })), ...events.map((event) => ({ type: "event", value: event }))];
    const shown = items;
    const more = 0;
    cells += `<div class="cell ${date.getMonth() !== month ? "other-month" : ""} ${sameDay(date, today()) ? "is-today" : ""} ${sameDay(date, selectedDate) ? "is-selected" : ""}" data-date="${iso}">
      <div class="cell-top">
        <span class="date-num">${date.getDate()}</span>
      </div>
      <div class="events">
        ${shown.map((item) => item.type === "deadline"
          ? `<div class="ddl-chip ${item.value.status === "completed" ? "done" : item.value.status}" style="--ddl-color:${deadlineColor(item.value)};--ddl-bg:${item.value.bg}" data-deadline-id="${escapeAttr(item.value.id)}" title="${escapeAttr(item.value.title)}">⚑ ${escapeHtml(item.value.title)}</div>`
          : `<div class="event-chip ${isOngoing(item.value, date) ? "ongoing" : ""}" style="background:${item.value.bg}; color:${item.value.color}" data-open-day="${iso}">${eventTitleHTML(item.value)}</div>`).join("")}
        ${more > 0 ? `<div class="more-link">+${more} more</div>` : ""}
      </div>
    </div>`;
  }
  els.calCol.innerHTML = `
    <div class="weekday-row"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
    <div class="month-grid">${cells}</div>`;
  els.calCol.querySelectorAll(".cell").forEach((cell) => cell.addEventListener("click", () => selectDay(cell.dataset.date)));
  bindCalendarDeadlineActions(els.calCol);
  trimMonthCells();
}

function trimMonthCells() {
  els.calCol.querySelectorAll(".month-grid .cell").forEach((cell) => {
    const events = cell.querySelector(".events");
    if (!events) return;
    const items = [...events.querySelectorAll(".event-chip,.ddl-chip")];
    items.forEach((item) => { item.style.display = ""; });
    const top = cell.querySelector(".cell-top");
    const styles = getComputedStyle(cell);
    const available = cell.clientHeight - (top?.offsetHeight || 0) - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom) - 4;
    const moreHeight = 15;
    let used = 0;
    let show = items.length;
    for (let i = 0; i < items.length; i += 1) {
      const height = items[i].offsetHeight + 3;
      if (used + height + moreHeight > available) { show = i; break; }
      used += height;
    }
    if (show >= items.length) return;
    if (show < 1) show = 1;
    items.slice(show).forEach((item) => { item.style.display = "none"; });
    const more = document.createElement("button");
    more.type = "button";
    more.className = "more-link";
    more.textContent = `+${items.length - show} more`;
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      openDayPopover(cell.dataset.date, more);
    });
    events.appendChild(more);
  });
}

function bindCalendarDeadlineActions(root) {
  root.querySelectorAll("[data-open-day]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openDayPopover(item.dataset.openDay, item);
    });
  });
  root.querySelectorAll("[data-open-event]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openEventPopover(item.dataset.openEvent, item.dataset.eventDate, item);
    });
  });
  root.querySelectorAll("[data-deadline-id]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleDeadline(item.dataset.deadlineId);
    });
  });
}

function ensurePopover() {
  if (document.getElementById("calendarPopoverScrim")) return;
  const scrim = document.createElement("div");
  scrim.className = "pop-scrim";
  scrim.id = "calendarPopoverScrim";
  scrim.addEventListener("click", closePopover);
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.id = "calendarPopover";
  pop.addEventListener("click", (event) => event.stopPropagation());
  scrim.appendChild(pop);
  document.body.appendChild(scrim);
}

function closePopover() {
  document.getElementById("calendarPopoverScrim")?.classList.remove("open");
}

function openPopover(anchor, html) {
  ensurePopover();
  const scrim = document.getElementById("calendarPopoverScrim");
  const pop = document.getElementById("calendarPopover");
  pop.innerHTML = html;
  scrim.classList.add("open");
  pop.style.visibility = "hidden";
  const rect = anchor.getBoundingClientRect();
  requestAnimationFrame(() => {
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - pop.offsetWidth - 12);
    const below = rect.bottom + 6;
    const top = below + pop.offsetHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - pop.offsetHeight - 6);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "visible";
    pop.querySelectorAll("[data-deadline-id]").forEach((item) => item.addEventListener("click", () => toggleDeadline(item.dataset.deadlineId)));
  });
}

function dayPopoverHTML(iso) {
  const date = parseDateKey(iso);
  const events = sortEvents(getEventsFor(date));
  const deadlines = getDeadlinesFor(date);
  return `<h4>${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h4>
    <div class="pop-sec">Deadlines · ${deadlines.length}</div>
    ${deadlines.length ? deadlines.map((deadline) => `<div class="pop-row pop-ddl ${deadline.status === "completed" ? "done" : deadline.status}" data-deadline-id="${escapeAttr(deadline.id)}"><span class="pop-dot" style="background:${deadlineColor(deadline)}"></span><span class="pt" title="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</span><span class="pm">${deadline.status === "completed" ? "Reopen" : deadline.allDay ? "All-day" : deadline.time}</span></div>`).join("") : '<div class="pop-empty">None</div>'}
    <div class="pop-sec">Events · ${events.length}</div>
    ${events.length ? events.map((event) => `<div class="pop-row"><span class="pop-dot" style="background:${event.color}"></span><span class="pt">${eventTitleHTML(event)}</span><span class="pm">${isAllDayEvent(event) ? "All-day" : event.start}</span></div>`).join("") : '<div class="pop-empty">None</div>'}`;
}

function openDayPopover(iso, anchor) {
  openPopover(anchor, dayPopoverHTML(iso));
}

function openEventPopover(id, iso, anchor) {
  const event = getEventsFor(parseDateKey(iso)).find((item) => item.id === id);
  if (!event) return;
  openPopover(anchor, `<h4>${eventTitleHTML(event)}</h4><div class="pop-row"><span class="pop-dot" style="background:${event.color}"></span><span class="pt">${escapeHtml(event.cat)}</span></div><div class="pop-row"><span class="pt">${isAllDayEvent(event) ? "All-day" : `${event.start} - ${event.end}`}</span></div>`);
}

function openQuickPopover(anchor) {
  const quick = quickDeadlines();
  const html = `<h4>Due soon · ${quick.length}</h4>${quick.length ? quick.map((deadline) => `<div class="pop-row pop-ddl ${deadline.status === "completed" ? "done" : deadline.status}" data-deadline-id="${escapeAttr(deadline.id)}"><span class="pop-dot" style="background:${deadlineColor(deadline)}"></span><span class="pt" title="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</span><span class="pm">${deadlineDueText(deadline)}</span></div>`).join("") : '<div class="pop-empty">None</div>'}`;
  openPopover(anchor, html);
}

function renderInspector() {
  const date = selectedDate;
  const isToday = sameDay(date, today());
  const events = sortEvents(getEventsFor(date));
  els.inspector.innerHTML = `
    <div class="inspector-eyebrow">${isToday ? "Today" : date.toLocaleDateString("en-US", { weekday: "long" })}</div>
    <div class="inspector-title">${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
    <div class="inspector-sub">${events.length} event${events.length !== 1 ? "s" : ""} on this day</div>
    ${ddlRailHTML()}
    <div class="agenda-list">
      ${events.length ? events.map((event) => agendaItemHTML(event, date)).join("") : '<div class="inspector-empty">No events on this day.</div>'}
    </div>
    <div class="inspector-heading">Categories</div>
    <ul class="cat-list">
      ${categories.map((cat) => `
        <li class="cat-item ${activeFilters.has(cat.name) ? "" : "off"}" data-category="${escapeHtml(cat.name)}">
          <span class="cat-dot" style="background:${cat.color}"></span>${escapeHtml(cat.name)}
        </li>`).join("")}
    </ul>`;
  bindInspectorActions(els.inspector);
}

function bindInspectorActions(root) {
  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setPortraitTab(button.dataset.tab));
  });
  root.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      requestDeleteEvent(button.dataset.deleteId, button.dataset.deleteTitle, button.dataset.seriesId);
    });
  });
  root.querySelectorAll("[data-category]").forEach((item) => {
    item.addEventListener("click", () => toggleFilter(item.dataset.category));
  });
  root.querySelectorAll("[data-deadline-id]").forEach((item) => {
    item.addEventListener("click", () => toggleDeadline(item.dataset.deadlineId));
  });
  root.querySelectorAll("[data-open-deadline]").forEach((button) => {
    button.addEventListener("click", () => openDeadlineModal());
  });
  root.querySelectorAll("[data-open-quick]").forEach((button) => {
    button.addEventListener("click", () => openQuickPopover(button));
  });
}

function toggleFilter(name) {
  if (activeFilters.has(name)) activeFilters.delete(name);
  else activeFilters.add(name);
  render();
}

function renderWeek() {
  const start = startOfWeek(viewDate);
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const end = days[6];
  const sameMonth = start.getMonth() === end.getMonth();
  els.navTitle.textContent = sameMonth
    ? `${start.toLocaleString("en-US", { month: "short" })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`
    : `${start.toLocaleString("en-US", { month: "short" })} ${start.getDate()} - ${end.toLocaleString("en-US", { month: "short" })} ${end.getDate()}, ${end.getFullYear()}`;

  const header = days.map((date) => `<div class="day-col ${sameDay(date, today()) ? "today" : ""}">
    <div class="day-name">${date.toLocaleDateString("en-US", { weekday: "short" })}</div>
    <div class="day-num">${date.getDate()}</div>
  </div>`).join("");

  els.calCol.innerHTML = `
    <div class="time-view">
      <div class="time-header" style="grid-template-columns:52px repeat(7,1fr)"><div></div>${header}</div>
      ${buildAllDayRowHTML(days)}
      ${buildTimeGridHTML(days)}
    </div>`;
  bindTimelineDeletes();
  bindCalendarDeadlineActions(els.calCol);
}

function renderDay() {
  els.navTitle.textContent = viewDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const header = `<div class="day-col ${sameDay(viewDate, today()) ? "today" : ""}">
    <div class="day-name">${viewDate.toLocaleDateString("en-US", { weekday: "short" })}</div>
    <div class="day-num">${viewDate.getDate()}</div>
  </div>`;
  els.calCol.innerHTML = `
    <div class="time-view">
      <div class="time-header" style="grid-template-columns:52px 1fr"><div></div>${header}</div>
      ${buildAllDayRowHTML([viewDate])}
      ${buildTimeGridHTML([viewDate])}
    </div>`;
  bindTimelineDeletes();
  bindCalendarDeadlineActions(els.calCol);
}

function buildAllDayRowHTML(days) {
  const anyAllDay = days.some((date) => getEventsFor(date).some(isAllDayEvent) || getDeadlinesFor(date).some((deadline) => deadline.allDay));
  if (!anyAllDay) return "";
  const cells = days.map((date) => {
    const events = getEventsFor(date).filter(isAllDayEvent);
    const deadlines = getDeadlinesFor(date).filter((deadline) => deadline.allDay);
    return `<div class="allday-cell">${deadlines.map((deadline) => `
      <div class="allday-ddl ${deadline.status === "completed" ? "done" : deadline.status}" style="--ddl-color:${deadlineColor(deadline)};--ddl-bg:${deadline.bg}" data-deadline-id="${escapeAttr(deadline.id)}" title="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</div>`).join("")}${events.map((event) => `
      <div class="allday-chip" data-open-event="${escapeAttr(event.id)}" data-event-date="${isoKey(date)}" style="background:${event.bg};color:${event.color}">
        <span class="t">${eventTitleHTML(event)}</span>
        <button type="button" class="allday-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}" data-series-id="${escapeAttr(event.seriesId || "")}">x</button>
      </div>`).join("")}</div>`;
  }).join("");
  return `<div class="allday-row" style="grid-template-columns:52px repeat(${days.length},1fr)">
    <div class="allday-label">All-day</div>${cells}
  </div>`;
}

function buildTimeGridHTML(days) {
  let gutter = "";
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const label = h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;
    gutter += `<div class="gutter-hour">${label}</div>`;
  }
  const now = currentMinutes();
  const dayCols = days.map((date) => {
    const events = layoutDayEvents(getEventsFor(date).filter((event) => !isAllDayEvent(event)));
    const blocks = events.map((event) => {
      const top = timeToMin(event.start) - GRID_START_HOUR * 60;
      const height = Math.max(timeToMin(event.end) - timeToMin(event.start), 26);
      const widthPct = 100 / event.cols;
      const leftPct = event.col * widthPct;
      return `<div class="tl-event ${isOngoing(event, date) ? "ongoing" : ""}" data-open-event="${escapeAttr(event.id)}" data-event-date="${isoKey(date)}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);background:${event.bg};color:${event.color}">
        <span class="t">${eventTitleHTML(event)}</span><span class="tm">${event.start} - ${event.end}${eventRelativeLabel(event, date) ? ` · <span class="event-relative">${eventRelativeLabel(event, date)}</span>` : ""}${isOngoing(event, date) ? '<span class="now-badge">Now</span>' : ""}</span>
        <button type="button" class="tl-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}" data-series-id="${escapeAttr(event.seriesId || "")}">x</button>
      </div>`;
    }).join("");
    let lastDeadlineMins = -999;
    let deadlineStack = 0;
    const deadlineLines = getDeadlinesFor(date).filter((deadline) => !deadline.allDay).sort((a, b) => a.dueMs - b.dueMs).map((deadline) => {
      const mins = timeToMin(deadline.time) - GRID_START_HOUR * 60;
      if (mins < 0 || mins > (GRID_END_HOUR - GRID_START_HOUR + 1) * 60) return "";
      if (mins - lastDeadlineMins < 16) deadlineStack += 1;
      else deadlineStack = 0;
      lastDeadlineMins = mins;
      const statusClass = deadline.status === "completed" ? "done" : "";
      const labelTop = -9 - deadlineStack * 15;
      const labelZ = 10 + deadlineStack;
      return `<div class="tl-ddl-line ${statusClass}" style="top:${mins}px;border-top-color:${deadlineColor(deadline)}"><span class="tl-ddl-label" title="${escapeAttr(deadline.title)} · ${escapeAttr(deadline.time || "")}" style="top:${labelTop}px;z-index:${labelZ};color:${deadlineColor(deadline)}" data-deadline-id="${escapeAttr(deadline.id)}">⚑ ${escapeHtml(deadline.title)} · ${deadline.time}${deadline.status === "overdue" ? " ⚠" : ""}</span></div>`;
    }).join("");
    const nowLine = sameDay(date, today()) && now >= GRID_START_HOUR * 60 && now <= GRID_END_HOUR * 60
      ? `<div class="now-line" style="top:${now - GRID_START_HOUR * 60}px"></div>`
      : "";
    return `<div class="day-col-body">${blocks}${deadlineLines}${nowLine}</div>`;
  }).join("");

  const totalHeight = (GRID_END_HOUR - GRID_START_HOUR + 1) * HOUR_PX;
  return `
    <div class="time-scroll">
      <div class="time-grid" style="height:${totalHeight}px">
        <div class="gutter-col">${gutter}</div>
        <div class="days-area" style="grid-template-columns:repeat(${days.length},1fr); height:${totalHeight}px">${dayCols}</div>
      </div>
    </div>`;
}

function bindTimelineDeletes() {
  els.calCol.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      requestDeleteEvent(button.dataset.deleteId, button.dataset.deleteTitle, button.dataset.seriesId);
    });
  });
}

function agendaItemHTML(event, date) {
  return `<div class="agenda-item">
    <div class="agenda-bar" style="background:${event.color}"></div>
    <div class="agenda-body">
      <div class="agenda-title">${eventTitleHTML(event)}</div>
      <div class="agenda-time">${isAllDayEvent(event) ? "All-day" : `${event.start} - ${event.end}`}${eventRelativeLabel(event, date) ? `<span class="event-relative"> · ${eventRelativeLabel(event, date)}</span>` : ""}${isOngoing(event, date) ? '<span class="now-badge">Now</span>' : ""}</div>
      <span class="agenda-cat" style="color:${event.color}">${escapeHtml(event.cat)}</span>
    </div>
    <button type="button" class="agenda-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}" data-series-id="${escapeAttr(event.seriesId || "")}">x</button>
  </div>`;
}

function eventTitleHTML(event) {
  const marker = event.seriesId
    ? '<span class="repeat-mark" title="Repeating event" aria-label="Repeating event">↻</span>'
    : "";
  return `${escapeHtml(event.title)}${marker}`;
}

function layoutDayEvents(events) {
  if (events.length <= 1) return events.map((event) => ({ ...event, col: 0, cols: 1 }));
  const withMin = events
    .map((event) => ({ ...event, startMin: timeToMin(event.start), endMin: timeToMin(event.end) }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const colEnds = [];
  const col = withMin.map((event) => {
    let placedCol = colEnds.findIndex((end) => end <= event.startMin);
    if (placedCol === -1) {
      placedCol = colEnds.length;
      colEnds.push(event.endMin);
    } else {
      colEnds[placedCol] = event.endMin;
    }
    return placedCol;
  });
  let clusterId = 0;
  let clusterEnd = -Infinity;
  const cluster = withMin.map((event) => {
    if (event.startMin >= clusterEnd) {
      clusterId++;
      clusterEnd = event.endMin;
    } else {
      clusterEnd = Math.max(clusterEnd, event.endMin);
    }
    return clusterId;
  });
  const clusterMaxCol = {};
  withMin.forEach((event, i) => {
    clusterMaxCol[cluster[i]] = Math.max(clusterMaxCol[cluster[i]] || 0, col[i] + 1);
  });
  return withMin.map((event, i) => ({ ...event, col: col[i], cols: clusterMaxCol[cluster[i]] }));
}

function renderSwatches() {
  els.catSwatches.innerHTML = categories.map((cat) => `
    <button type="button" class="swatch ${cat.name === selectedCat ? "selected" : ""}" style="background:${cat.color}" data-cat="${escapeAttr(cat.name)}" title="${escapeAttr(cat.name)}"></button>
  `).join("");
  els.catSwatches.querySelectorAll(".swatch").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCat = button.dataset.cat;
      renderSwatches();
    });
  });
}

function openModal(prefillIso) {
  setNewTab("event");
  els.fTitle.value = "";
  els.fDate.value = prefillIso || isoKey(selectedDate);
  els.fAllday.checked = false;
  els.fStart.value = "09:00";
  els.fEnd.value = "10:00";
  els.fReminderOne.value = "60";
  els.fReminderTwo.value = "10";
  els.fRepeat.value = "none";
  els.fRepeatEnd.value = "date";
  els.fRepeatEndDate.value = addDateKey(els.fDate.value, 30);
  els.fRepeatCount.value = "10";
  repeatIdempotencyKey = crypto.randomUUID();
  repeatWeekdayTouched = false;
  setDefaultRepeatWeekday();
  if (!selectedCat || !getCategory(selectedCat)) selectedCat = categories[0]?.name || FALLBACK_CATEGORY.name;
  toggleAllDayFields();
  hideTimeError();
  renderSwatches();
  syncRepeatUI();
  els.createButton.disabled = false;
  prepareDeadlineForm(prefillIso);
  els.eventScrim.classList.add("open");
  setTimeout(() => els.fTitle.focus(), 100);
}

function setNewTab(tab) {
  newModalTab = tab === "ddl" ? "ddl" : "event";
  const eventActive = newModalTab === "event";
  els.ntEvent.classList.toggle("active", eventActive);
  els.ntDdl.classList.toggle("active", !eventActive);
  els.ntEvent.setAttribute("aria-selected", String(eventActive));
  els.ntDdl.setAttribute("aria-selected", String(!eventActive));
  els.eventForm.hidden = !eventActive;
  els.ddlForm.hidden = eventActive;
  if (eventActive) setTimeout(() => els.fTitle.focus(), 50);
  else setTimeout(() => els.dTitle.focus(), 50);
}

function openDeadlineModal(prefillIso) {
  openModal(prefillIso || isoKey(selectedDate));
  setNewTab("ddl");
}

function prepareDeadlineForm(prefillIso) {
  els.dTitle.value = "";
  els.dDate.value = prefillIso || isoKey(selectedDate);
  els.dTime.value = "18:00";
  els.dAllday.checked = false;
  ddlSelectedCat = selectedCat || categories[0]?.name || FALLBACK_CATEGORY.name;
  ddlPriority = "default";
  toggleDdlAllDay();
  renderDdlSwatches();
  selectDdlPriority("default");
  els.createDdlButton.disabled = false;
  els.createDdlButton.textContent = "Create";
}

function renderDdlSwatches() {
  els.dCatSwatches.innerHTML = categories.map((category) => `<button type="button" class="swatch ${category.name === ddlSelectedCat ? "selected" : ""}" style="background:${category.color}" data-ddl-cat="${escapeAttr(category.name)}" title="${escapeAttr(category.name)}" aria-label="${escapeAttr(category.name)}"></button>`).join("");
  els.dCatSwatches.querySelectorAll("[data-ddl-cat]").forEach((button) => button.addEventListener("click", () => {
    ddlSelectedCat = button.dataset.ddlCat;
    renderDdlSwatches();
  }));
}

function selectDdlPriority(priority) {
  if (!["high", "default", "low"].includes(priority)) return;
  ddlPriority = priority;
  els.priSeg.querySelectorAll("button[data-priority]").forEach((button) => button.classList.toggle("sel", button.dataset.priority === priority));
}

function toggleDdlAllDay() {
  const disabled = els.dAllday.checked;
  els.dTimeField.style.opacity = disabled ? "0.35" : "1";
  els.dTimeField.style.pointerEvents = disabled ? "none" : "auto";
}

async function submitDeadline(event) {
  event.preventDefault();
  const title = els.dTitle.value.trim();
  if (!title || !els.dDate.value) return;
  const allDay = els.dAllday.checked;
  const category = getCategory(ddlSelectedCat);
  const due_time = allDay ? els.dDate.value : toLocalIso(parseDateKey(els.dDate.value), els.dTime.value || "18:00");
  els.createDdlButton.disabled = true;
  try {
    await apiFetch("/api/deadlines", {
      method: "POST",
      body: JSON.stringify({ title, due_time, all_day: allDay, category: category.name, color: "default", priority: ddlPriority, source: "web" }),
    });
    selectedDate = parseDateKey(els.dDate.value);
    viewDate = parseDateKey(els.dDate.value);
    closeModal();
    showToast("Deadline created");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to create deadline.");
  } finally {
    els.createDdlButton.disabled = false;
  }
}

function closeModal() {
  els.eventScrim.classList.remove("open");
}

async function submitEvent(event) {
  event.preventDefault();
  if (!validateTimes()) return;
  const date = els.fDate.value;
  const title = els.fTitle.value.trim();
  if (!title) return;
  const repeat = getRepeatConfig();
  if (repeat.error) {
    showRepeatError(repeat.error);
    return;
  }
  const allDay = els.fAllday.checked;
  const reminderValues = [els.fReminderOne.value, els.fReminderTwo.value]
    .filter(Boolean).map(Number);
  if (!allDay && new Set(reminderValues).size !== reminderValues.length) {
    showToast("Choose two different reminder times.");
    return;
  }
  const category = getCategory(selectedCat);
  const start = allDay ? "00:00" : (els.fStart.value || "09:00");
  const end = allDay ? "23:59" : (els.fEnd.value || "10:00");
  const payload = {
    title,
    start_time: toLocalIso(parseDateKey(date), start),
    end_time: toLocalIso(parseDateKey(date), end),
    all_day: allDay,
    category: category.name,
    color: category.color,
    source: "web",
    ...(!allDay ? { reminders: reminderValues } : {}),
  };

  const requestPayload = repeat.value ? {
    ...payload,
    frequency: repeat.value.frequency,
    interval: 1,
    weekdays: repeat.value.weekdays,
    monthly_mode: repeat.value.frequency === "monthly" ? "day-of-month" : null,
    monthly_day: repeat.value.frequency === "monthly" ? Number(date.slice(8, 10)) : null,
    start_date: date,
    end_date: repeat.value.end_date,
    occurrence_count: repeat.value.occurrence_count,
    idempotency_key: repeatIdempotencyKey,
  } : payload;

  els.createButton.disabled = true;
  try {
    const response = await apiFetch(repeat.value ? "/api/event-series" : "/api/events", {
      method: "POST",
      body: JSON.stringify(requestPayload),
    });
    selectedDate = parseDateKey(date);
    viewDate = parseDateKey(date);
    closeModal();
    showToast(repeat.value ? `Created ${response.data?.created_count || repeat.value.previewCount} events` : "Event created");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to create event.");
  } finally {
    els.createButton.disabled = false;
  }
}

function requestDeleteEvent(id, title, seriesId = "") {
  pendingDelete = { id, seriesId: seriesId || null };
  els.confirmTitle.textContent = title || "this event";
  els.confirmDeleteButton.disabled = false;
  els.seriesDeleteActions.hidden = !pendingDelete.seriesId;
  els.confirmDeleteButton.hidden = Boolean(pendingDelete.seriesId);
  els.deleteThisButton.disabled = false;
  els.deleteSeriesButton.disabled = false;
  els.confirmScrim.classList.add("open");
}

function closeConfirm() {
  els.confirmScrim.classList.remove("open");
  pendingDelete = null;
}

async function confirmDelete(scope = "event") {
  if (!pendingDelete) return;
  const button = scope === "series" ? els.deleteSeriesButton : scope === "event" && pendingDelete.seriesId ? els.deleteThisButton : els.confirmDeleteButton;
  button.disabled = true;
  try {
    const url = scope === "series"
      ? `/api/event-series/${encodeURIComponent(pendingDelete.seriesId)}`
      : `/api/events/${encodeURIComponent(pendingDelete.id)}`;
    await apiFetch(url, { method: "DELETE" });
    closeConfirm();
    showToast(scope === "series" ? "Series deleted" : "Event deleted");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to delete event.");
  } finally {
    button.disabled = false;
  }
}

function toggleAllDayFields() {
  const isAllDay = els.fAllday.checked;
  els.timeFields.style.opacity = isAllDay ? "0.35" : "1";
  els.timeFields.style.pointerEvents = isAllDay ? "none" : "auto";
  els.reminderFields.hidden = isAllDay;
  validateTimes();
}

function validateTimes() {
  if (els.fAllday.checked) {
    hideTimeError();
    return true;
  }
  const start = timeToMin(els.fStart.value || "00:00");
  const end = timeToMin(els.fEnd.value || "00:00");
  if (end <= start) {
    showTimeError();
    return false;
  }
  hideTimeError();
  return true;
}

function showTimeError() {
  const wasShown = els.timeError.classList.contains("show");
  els.timeError.classList.add("show");
  els.fEnd.style.borderColor = "#FF3B30";
  if (!wasShown) els.timeError.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideTimeError() {
  els.timeError.classList.remove("show");
  els.fEnd.style.borderColor = "";
}

function syncRepeatUI(resetWeekday = false) {
  const frequency = els.fRepeat.value;
  const enabled = frequency !== "none";
  els.repeatPanel.hidden = !enabled;
  els.repeatWeeklyFields.hidden = frequency !== "weekly";
  els.fRepeatEndDate.hidden = els.fRepeatEnd.value !== "date";
  els.fRepeatCount.hidden = els.fRepeatEnd.value !== "count";

  if (resetWeekday && frequency === "weekly") {
    repeatWeekdayTouched = false;
    setDefaultRepeatWeekday();
  }

  if (frequency === "monthly") {
    els.repeatRuleNote.textContent = "Repeats on this date; unavailable month dates are skipped.";
  } else if (frequency === "yearly") {
    els.repeatRuleNote.textContent = "Feb 29 is skipped in non-leap years.";
  } else {
    els.repeatRuleNote.textContent = "";
  }

  if (!enabled) {
    els.createButton.textContent = "Create";
    hideRepeatError();
    els.repeatPreview.textContent = "";
    return;
  }

  const repeat = getRepeatConfig();
  if (repeat.error) {
    showRepeatError(repeat.error);
    els.repeatPreview.textContent = "";
    els.createButton.textContent = "Create";
  } else {
    hideRepeatError();
    els.repeatPreview.textContent = `${repeatDescription(repeat.value)} · Will create ${repeat.value.previewCount} events`;
    els.createButton.textContent = "Create";
  }
}

function setDefaultRepeatWeekday() {
  const weekday = weekdayOfDateKey(els.fDate.value);
  els.repeatWeekdays.querySelectorAll("input").forEach((input) => {
    input.checked = Number(input.value) === weekday;
  });
}

function getRepeatConfig() {
  const frequency = els.fRepeat.value;
  if (frequency === "none") return { value: null, error: null };

  const endDate = els.fRepeatEnd.value === "date" ? els.fRepeatEndDate.value : null;
  const occurrenceCount = els.fRepeatEnd.value === "count" ? Number(els.fRepeatCount.value) : null;
  if (endDate && compareDateKeys(endDate, els.fDate.value) < 0) {
    return { value: null, error: "End date must be on or after the start date." };
  }
  if (els.fRepeatEnd.value === "date" && !isValidDateKey(els.fRepeatEndDate.value)) {
    return { value: null, error: "Choose an end date." };
  }
  if (els.fRepeatEnd.value === "count" && (!Number.isInteger(occurrenceCount) || occurrenceCount < 1 || occurrenceCount > 366)) {
    return { value: null, error: "Occurrences must be between 1 and 366." };
  }

  const weekdays = frequency === "weekly"
    ? [...els.repeatWeekdays.querySelectorAll("input:checked")].map((input) => Number(input.value))
    : null;
  if (frequency === "weekly" && (!weekdays || weekdays.length === 0)) {
    return { value: null, error: "Choose at least one weekday." };
  }

  const previewCount = calculateRepeatPreview({
    frequency,
    startDate: els.fDate.value,
    weekdays,
    endDate,
    occurrenceCount,
  });
  if (previewCount.error) return { value: null, error: previewCount.error };
  return {
    value: { frequency, weekdays, end_date: endDate, occurrence_count: occurrenceCount, previewCount: previewCount.count },
    error: null,
  };
}

function showRepeatError(message) {
  const wasShown = els.repeatError.classList.contains("show");
  els.repeatError.textContent = message;
  els.repeatError.classList.add("show");
  if (!wasShown) els.repeatError.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideRepeatError() {
  els.repeatError.textContent = "";
  els.repeatError.classList.remove("show");
}

function repeatDescription(value) {
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (value.frequency === "daily") return value.end_date ? `Every day until ${value.end_date}` : `Every day, ${value.occurrence_count} times`;
  if (value.frequency === "weekly") {
    const days = value.weekdays.map((day) => labels[day]).join(", ");
    return value.end_date ? `Every ${days} until ${value.end_date}` : `Every ${days}, ${value.occurrence_count} times`;
  }
  if (value.frequency === "monthly") return value.end_date ? `Every month on day ${Number(els.fDate.value.slice(8, 10))} until ${value.end_date}` : `Every month, ${value.occurrence_count} times`;
  return value.end_date ? `Every year on ${els.fDate.value.slice(5)} until ${value.end_date}` : `Every year, ${value.occurrence_count} times`;
}

function calculateRepeatPreview({ frequency, startDate, weekdays, endDate, occurrenceCount }) {
  let count = 0;
  let candidates = 0;
  let cursor = startDate;
  const addCandidate = (candidate, eligible = true) => {
    candidates += 1;
    if (candidates > 10000) return { error: "This rule spans too many calendar periods." };
    if (eligible && (!endDate || compareDateKeys(candidate, endDate) <= 0)) count += 1;
    return null;
  };

  while (candidates <= 10000) {
    let done = false;
    if (frequency === "daily") {
      const error = addCandidate(cursor);
      if (error) return error;
      done = endDate ? cursor === endDate : false;
      cursor = addDateKey(cursor, 1);
    } else if (frequency === "weekly") {
      const error = addCandidate(cursor, weekdays.includes(weekdayOfDateKey(cursor)));
      if (error) return error;
      done = endDate ? cursor === endDate : false;
      cursor = addDateKey(cursor, 1);
    } else if (frequency === "monthly") {
      const parts = parseDateKeyParts(startDate);
      const offset = candidates;
      const month = addMonthParts(parts.year, parts.month, offset);
      const day = parts.day <= daysInMonthKey(month.year, month.month) ? parts.day : null;
      const candidate = day ? formatDateKey(month.year, month.month, day) : null;
      const error = addCandidate(candidate || formatDateKey(month.year, month.month, 1), Boolean(candidate));
      if (error) return error;
      done = endDate && compareDateKeys(formatDateKey(month.year, month.month, daysInMonthKey(month.year, month.month)), endDate) >= 0;
    } else {
      const parts = parseDateKeyParts(startDate);
      const year = parts.year + candidates;
      const candidate = parts.day <= daysInMonthKey(year, parts.month) ? formatDateKey(year, parts.month, parts.day) : null;
      const error = addCandidate(candidate || formatDateKey(year, parts.month, 1), Boolean(candidate));
      if (error) return error;
      done = endDate && compareDateKeys(formatDateKey(year, parts.month, daysInMonthKey(year, parts.month)), endDate) >= 0;
    }
    if (count > 366) return { error: "A maximum of 366 events is allowed." };
    if ((occurrenceCount && count >= occurrenceCount) || done) break;
  }

  if (count === 0) return { error: "This rule produces no events." };
  return { count };
}

function getEventsFor(date) {
  return (eventsByDate.get(isoKey(date)) || []).filter((event) => activeFilters.has(event.cat));
}

function findDeadline(id) {
  for (const list of deadlinesByDate.values()) {
    const found = list.find((deadline) => deadline.id === id);
    if (found) return found;
  }
  return null;
}

function toggleDeadline(id) {
  closePopover();
  const deadline = findDeadline(id);
  if (!deadline) return;
  pendingDeadlineAction = id;
  if (deadline.status === "completed") {
    els.reopenTitle.textContent = deadline.title;
    els.reopenScrim.classList.add("open");
  } else {
    els.completeTitle.textContent = deadline.title;
    els.completeScrim.classList.add("open");
  }
}

function closeComplete() {
  els.completeScrim.classList.remove("open");
  pendingDeadlineAction = null;
}

function closeReopen() {
  els.reopenScrim.classList.remove("open");
  pendingDeadlineAction = null;
}

async function confirmComplete() {
  if (!pendingDeadlineAction) return;
  const id = pendingDeadlineAction;
  els.confirmCompleteButton.disabled = true;
  try {
    await apiFetch(`/api/deadlines/${encodeURIComponent(id)}/complete`, { method: "POST" });
    closeComplete();
    showToast("Deadline completed");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to complete deadline.");
  } finally {
    els.confirmCompleteButton.disabled = false;
  }
}

async function confirmReopen() {
  if (!pendingDeadlineAction) return;
  const id = pendingDeadlineAction;
  els.confirmReopenButton.disabled = true;
  try {
    await apiFetch(`/api/deadlines/${encodeURIComponent(id)}/reopen`, { method: "POST" });
    closeReopen();
    showToast("Deadline reopened");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to reopen deadline.");
  } finally {
    els.confirmReopenButton.disabled = false;
  }
}

function getDeadlinesFor(date) {
  return (deadlinesByDate.get(isoKey(date)) || []).filter((deadline) => activeFilters.has(deadline.cat));
}

function deadlineColor(deadline) {
  return deadline.color || getCategory(deadline.cat).color || FALLBACK_CATEGORY.color;
}

function deadlineDueText(deadline, date = selectedDate) {
  if (deadline.status === "completed") return "Completed";
  const reference = sameDay(date, today()) ? Date.now() : startOfDay(date).getTime();
  const diff = deadline.dueMs - reference;
  const minutes = Math.max(1, Math.round(Math.abs(diff) / 60000));
  const value = minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}` : `${Math.round(minutes / 1440)}d`;
  return diff < 0 ? `⚠ ${value} late` : `In ${value}`;
}

function eventRelativeLabel(event, date) {
  if (isAllDayEvent(event)) return "";
  const diff = new Date(`${isoKey(date)}T${event.start}:00`).getTime() - Date.now();
  if (diff < 60000 || diff > 12 * 60 * 60 * 1000) return "";
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}

function quickDeadlines(date = selectedDate) {
  const windowDays = { high: 3, default: 2, low: 1 };
  const selectedStart = startOfDay(date).getTime();
  return [...deadlinesByDate.values()].flat()
    .filter((deadline) => activeFilters.has(deadline.cat))
    .filter((deadline) => Math.abs((new Date(`${deadline.dateKey}T00:00:00`).getTime() - selectedStart) / 86400000) <= (windowDays[deadline.priority] || 2))
    .sort((a, b) => ({ high: 0, default: 1, low: 2 }[a.priority] - ({ high: 0, default: 1, low: 2 }[b.priority])) || a.dueMs - b.dueMs);
}

function deadlineItemHTML(deadline) {
  const color = deadlineColor(deadline);
  const statusClass = deadline.status === "completed" ? "done" : deadline.status;
  return `<div class="ddl-item ${statusClass}" style="--ddl-color:${color};--ddl-bg:${deadline.bg}" data-deadline-id="${escapeAttr(deadline.id)}">
    <div class="ddl-item-bar"></div>
    <div class="ddl-item-main">
      <div class="ddl-item-title" title="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</div>
      <div class="ddl-item-meta"><span class="ddl-meta-main"><span class="pri-tag pri-${deadline.priority}">${deadline.priority}</span>${deadlineDueText(deadline)}</span><span class="ddl-meta-category" title="${escapeAttr(deadline.cat)}">${escapeHtml(deadline.cat)}</span></div>
    </div>
    <span class="ddl-item-action">${statusClass === "done" ? "Reopen" : "Complete"}</span>
  </div>`;
}

function ddlRailHTML() {
  const quick = quickDeadlines();
  const visible = quick.slice(0, 3);
  const more = quick.length - visible.length;
  return `<div class="ddl-rail"><div class="ddl-rail-head"><span>Due soon</span><span>${sameDay(selectedDate, today()) ? "by priority" : `relative to ${pad2(selectedDate.getMonth() + 1)}.${pad2(selectedDate.getDate())}`}</span></div>
    <div class="ddl-list">${visible.length ? visible.map(deadlineItemHTML).join("") : '<div class="inspector-empty">Nothing due soon.</div>'}</div>
    ${more > 0 ? `<button type="button" class="ddl-more" data-open-quick>+${more} more</button>` : ""}
  </div>`;
}

function sortEvents(events) {
  return events.slice().sort((a, b) => timeToMin(a.start) - timeToMin(b.start) || a.title.localeCompare(b.title));
}

function getCategory(name) {
  return categories.find((cat) => cat.name === name) || FALLBACK_CATEGORY;
}

function isAllDayEvent(event) {
  return event.allDay || (event.start === "00:00" && event.end === "23:59");
}

function isOngoing(event, date) {
  const now = currentMinutes();
  return sameDay(date, today()) && !isAllDayEvent(event) && timeToMin(event.start) <= now && now < timeToMin(event.end);
}

function getMonthGridRange(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return { start, end: addDays(start, 41) };
}

function isPortrait() {
  return (window.innerWidth / window.innerHeight) < PORTRAIT_MAX_RATIO;
}

function today() {
  return startOfDay(new Date());
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDateKeyParts(value) {
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) };
}

function formatDateKey(year, month, day) {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

function isLeapYearKey(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonthKey(year, month) {
  if (month === 2) return isLeapYearKey(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parts = parseDateKeyParts(value);
  return parts.year >= 1 && parts.month >= 1 && parts.month <= 12 && parts.day >= 1 && parts.day <= daysInMonthKey(parts.year, parts.month);
}

function compareDateKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function addDateKey(value, amount) {
  let { year, month, day } = parseDateKeyParts(value);
  let remaining = Math.abs(amount);
  const direction = amount >= 0 ? 1 : -1;
  while (remaining > 0) {
    day += direction;
    if (direction > 0 && day > daysInMonthKey(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    } else if (direction < 0 && day < 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      day = daysInMonthKey(year, month);
    }
    remaining -= 1;
  }
  return formatDateKey(year, month, day);
}

function addMonthParts(year, month, amount) {
  const total = year * 12 + month - 1 + amount;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function weekdayOfDateKey(value) {
  const { year: originalYear, month, day } = parseDateKeyParts(value);
  let year = originalYear;
  const table = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) year -= 1;
  return (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + table[month - 1] + day) % 7;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, n) {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

function addMonths(date, n) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + n);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function timeToMin(time) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function timeFromIso(iso, fallback) {
  if (!iso || typeof iso !== "string" || iso.length < 16) return fallback;
  return iso.slice(11, 16);
}

function toLocalIso(date, time) {
  const [hours, minutes] = time.split(":").map(Number);
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours || 0, minutes || 0, 0, 0);
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  return `${local.getFullYear()}-${pad2(local.getMonth() + 1)}-${pad2(local.getDate())}T${pad2(local.getHours())}:${pad2(local.getMinutes())}:00${offset}`;
}

function colorToSoftBg(color) {
  const rgb = parseHexColor(color);
  if (!rgb) return "#F1F1F3";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.13)`;
}

function parseHexColor(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color || "");
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function setLoading(isLoading) {
  els.loadingScreen.classList.toggle("hidden", !isLoading);
}
