const REFRESH_MS = 10_000;
const CLOCK_REFRESH_MS = 60_000;
const PORTRAIT_MAX_RATIO = 1.35;
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 23;
const HOUR_PX = 56;
const FALLBACK_CATEGORY = {
  id: "cat-other",
  name: "Other",
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
let refreshTimer = null;
let clockTimer = null;
let refreshInFlight = false;
let lastRangeKey = "";
let pendingDelete = null;
let toastTimer = null;

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
    createButton: document.getElementById("createButton"),
    fTitle: document.getElementById("fTitle"),
    fDate: document.getElementById("fDate"),
    fAllday: document.getElementById("fAllday"),
    fStart: document.getElementById("fStart"),
    fEnd: document.getElementById("fEnd"),
    timeFields: document.getElementById("timeFields"),
    timeError: document.getElementById("timeError"),
    catSwatches: document.getElementById("catSwatches"),
    confirmScrim: document.getElementById("confirmScrim"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmDeleteButton: document.getElementById("confirmDeleteButton"),
    toast: document.getElementById("toast"),
  });
}

function bindEvents() {
  document.querySelector("[data-action='navigate'][data-dir='-1']").addEventListener("click", () => navigate(-1));
  document.querySelector("[data-action='navigate'][data-dir='1']").addEventListener("click", () => navigate(1));
  document.querySelector("[data-action='today']").addEventListener("click", goToday);
  document.querySelector("[data-action='open-event']").addEventListener("click", () => openModal());
  document.querySelector("[data-action='close-event']").addEventListener("click", closeModal);
  document.querySelector("[data-action='close-confirm']").addEventListener("click", closeConfirm);
  els.confirmDeleteButton.addEventListener("click", confirmDelete);

  els.viewToggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (button) switchView(button.dataset.view);
  });

  els.loginForm.addEventListener("submit", submitLogin);
  els.eventForm.addEventListener("submit", submitEvent);
  els.fAllday.addEventListener("change", toggleAllDayFields);
  els.fStart.addEventListener("input", validateTimes);
  els.fEnd.addEventListener("input", validateTimes);

  els.eventScrim.addEventListener("click", (event) => {
    if (event.target === els.eventScrim) closeModal();
  });
  els.confirmScrim.addEventListener("click", (event) => {
    if (event.target === els.confirmScrim) closeConfirm();
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
}

function showLogin() {
  stopAutoRefresh();
  stopClockRefresh();
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

async function refreshVisibleData({ silent = true, force = false } = {}) {
  if (refreshInFlight) return;
  const range = getVisibleRange();
  const rangeKey = `${range.from}|${range.to}`;
  if (!force && rangeKey === lastRangeKey && !silent) return;

  refreshInFlight = true;
  try {
    const url = `/api/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const json = await apiFetch(url);
    applyEvents(json.data || []);
    lastRangeKey = rangeKey;
    render();
  } catch (err) {
    if (err.message !== "Authentication required" && silent) showToast("Sync failed. Keeping current events.");
    if (!silent && err.message !== "Authentication required") showToast(err.message || "Failed to load events.");
  } finally {
    refreshInFlight = false;
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

function adaptEvent(row) {
  if (!row || !row.id || !row.start_time) return null;
  const dateKey = row.start_time.slice(0, 10);
  const start = row.all_day ? "00:00" : timeFromIso(row.start_time, "00:00");
  const end = row.all_day ? "23:59" : timeFromIso(row.end_time, start);
  const categoryName = row.category || FALLBACK_CATEGORY.name;
  const category = getCategory(categoryName);
  const color = row.color || category.color || FALLBACK_CATEGORY.color;
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
    const marks = `<div class="pm-dots">${events.slice(0, 4).map((event) => `<div class="pm-dot" style="background:${event.color}"></div>`).join("")}</div>`;
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
         <button type="button" class="inspector-add" data-open-date="${isoKey(date)}">+ Add event on this day</button>
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
    const shown = events.slice(0, 3);
    const more = events.length - 3;
    cells += `<div class="cell ${date.getMonth() !== month ? "other-month" : ""} ${sameDay(date, today()) ? "is-today" : ""} ${sameDay(date, selectedDate) ? "is-selected" : ""}" data-date="${iso}">
      <div class="cell-top">
        <span class="date-num">${date.getDate()}</span>
        <button type="button" class="cell-add" data-open-date="${iso}">+</button>
      </div>
      <div class="events">
        ${shown.map((event) => `<div class="event-chip ${isOngoing(event, date) ? "ongoing" : ""}" style="background:${event.bg}; color:${event.color}">${escapeHtml(event.title)}</div>`).join("")}
        ${more > 0 ? `<div class="more-link">+${more} more</div>` : ""}
      </div>
    </div>`;
  }
  els.calCol.innerHTML = `
    <div class="weekday-row"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
    <div class="month-grid">${cells}</div>`;
  els.calCol.querySelectorAll(".cell").forEach((cell) => cell.addEventListener("click", () => selectDay(cell.dataset.date)));
  els.calCol.querySelectorAll(".cell-add").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(button.dataset.openDate);
    });
  });
}

function renderInspector() {
  const date = selectedDate;
  const isToday = sameDay(date, today());
  const events = sortEvents(getEventsFor(date));
  els.inspector.innerHTML = `
    <div class="inspector-eyebrow">${isToday ? "Today" : date.toLocaleDateString("en-US", { weekday: "long" })}</div>
    <div class="inspector-title">${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
    <div class="inspector-sub">${events.length} event${events.length !== 1 ? "s" : ""} scheduled</div>
    <button type="button" class="inspector-add" data-open-date="${isoKey(date)}">+ Add event on this day</button>
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
  root.querySelectorAll("[data-open-date]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openDate));
  });
  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setPortraitTab(button.dataset.tab));
  });
  root.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      requestDeleteEvent(button.dataset.deleteId, button.dataset.deleteTitle);
    });
  });
  root.querySelectorAll("[data-category]").forEach((item) => {
    item.addEventListener("click", () => toggleFilter(item.dataset.category));
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
}

function buildAllDayRowHTML(days) {
  const anyAllDay = days.some((date) => getEventsFor(date).some(isAllDayEvent));
  if (!anyAllDay) return "";
  const cells = days.map((date) => {
    const events = getEventsFor(date).filter(isAllDayEvent);
    return `<div class="allday-cell">${events.map((event) => `
      <div class="allday-chip" style="background:${event.bg};color:${event.color}">
        <span class="t">${escapeHtml(event.title)}</span>
        <button type="button" class="allday-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}">x</button>
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
      return `<div class="tl-event ${isOngoing(event, date) ? "ongoing" : ""}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);background:${event.bg};color:${event.color}">
        <span class="t">${escapeHtml(event.title)}</span><span class="tm">${event.start} - ${event.end}${isOngoing(event, date) ? '<span class="now-badge">Now</span>' : ""}</span>
        <button type="button" class="tl-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}">x</button>
      </div>`;
    }).join("");
    const nowLine = sameDay(date, today()) && now >= GRID_START_HOUR * 60 && now <= GRID_END_HOUR * 60
      ? `<div class="now-line" style="top:${now - GRID_START_HOUR * 60}px"></div>`
      : "";
    return `<div class="day-col-body">${blocks}${nowLine}</div>`;
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
      requestDeleteEvent(button.dataset.deleteId, button.dataset.deleteTitle);
    });
  });
}

function agendaItemHTML(event, date) {
  return `<div class="agenda-item">
    <div class="agenda-bar" style="background:${event.color}"></div>
    <div class="agenda-body">
      <div class="agenda-title">${escapeHtml(event.title)}</div>
      <div class="agenda-time">${isAllDayEvent(event) ? "All-day" : `${event.start} - ${event.end}`}${isOngoing(event, date) ? '<span class="now-badge">Now</span>' : ""}</div>
      <span class="agenda-cat" style="color:${event.color}">${escapeHtml(event.cat)}</span>
    </div>
    <button type="button" class="agenda-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}">x</button>
  </div>`;
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
  els.fTitle.value = "";
  els.fDate.value = prefillIso || isoKey(selectedDate);
  els.fAllday.checked = false;
  els.fStart.value = "09:00";
  els.fEnd.value = "10:00";
  if (!selectedCat || !getCategory(selectedCat)) selectedCat = categories[0]?.name || FALLBACK_CATEGORY.name;
  toggleAllDayFields();
  hideTimeError();
  renderSwatches();
  els.createButton.disabled = false;
  els.eventScrim.classList.add("open");
  setTimeout(() => els.fTitle.focus(), 100);
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
  const allDay = els.fAllday.checked;
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
  };

  els.createButton.disabled = true;
  try {
    await apiFetch("/api/events", { method: "POST", body: JSON.stringify(payload) });
    selectedDate = parseDateKey(date);
    viewDate = parseDateKey(date);
    closeModal();
    showToast("Event created");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to create event.");
  } finally {
    els.createButton.disabled = false;
  }
}

function requestDeleteEvent(id, title) {
  pendingDelete = { id };
  els.confirmTitle.textContent = title || "this event";
  els.confirmDeleteButton.disabled = false;
  els.confirmScrim.classList.add("open");
}

function closeConfirm() {
  els.confirmScrim.classList.remove("open");
  pendingDelete = null;
}

async function confirmDelete() {
  if (!pendingDelete) return;
  els.confirmDeleteButton.disabled = true;
  try {
    await apiFetch(`/api/events/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    closeConfirm();
    showToast("Event deleted");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Failed to delete event.");
  } finally {
    els.confirmDeleteButton.disabled = false;
  }
}

function toggleAllDayFields() {
  const isAllDay = els.fAllday.checked;
  els.timeFields.style.opacity = isAllDay ? "0.35" : "1";
  els.timeFields.style.pointerEvents = isAllDay ? "none" : "auto";
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
  els.timeError.classList.add("show");
  els.fEnd.style.borderColor = "#FF3B30";
}

function hideTimeError() {
  els.timeError.classList.remove("show");
  els.fEnd.style.borderColor = "";
}

function getEventsFor(date) {
  return (eventsByDate.get(isoKey(date)) || []).filter((event) => activeFilters.has(event.cat));
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
