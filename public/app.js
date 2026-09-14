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
let subjects = [];
let selectedSubjectId = null;
let ddlSelectedSubjectId = null;
let activeFilters = new Set();
let tags = [];
let tagSuggestions = {};
let activeTagFilters = new Set();
let selectedTagIds = new Set();
let ddlSelectedTagIds = new Set();
let eventTagPickerExpanded = false;
let deadlineTagPickerExpanded = false;
let deadlineFormPrepared = false;
let newModalPrefillIso = null;
let eventsByDate = new Map();
let deadlinesByDate = new Map();
let coursesByDate = new Map();
let newModalTab = "event";
let ddlSelectedCat = null;
let ddlPriority = "default";
let refreshTimer = null;
let clockTimer = null;
let refreshInFlight = false;
let pendingRefresh = false;
let lastRangeKey = "";
// Fingerprint of the data currently painted, so a background poll that finds
// nothing new can skip the (expensive) full grid rebuild.
let lastDataSignature = "";
let animationUntil = 0;
let deferredRenderTimer = null;
// Each entry caches BOTH events and deadlines for a range: { events, deadlines }.
// Wider limit so prefetched neighbours (±2 months) aren't evicted before use.
const rangeCache = new Map();
const RANGE_CACHE_LIMIT = 16;
let pendingDelete = null;
let pendingDeadlineAction = null;
let repeatIdempotencyKey = null;
let repeatWeekdayTouched = false;
let toastTimer = null;
let notificationTimer = null;
let notificationInFlight = false;
let notificationBaselineReady = false;
let notificationSessionStartedAt = 0;
let notificationUnreadCount = 0;
const seenNotificationIds = new Set();
let notificationItems = [];
let detailContext = null;

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  bindTooltips();
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
    fTagPicker: document.getElementById("fTagPicker"),
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
    dTimeError: document.getElementById("dTimeError"),
    dAllday: document.getElementById("dAllday"),
    dCatSwatches: document.getElementById("dCatSwatches"),
    dTagPicker: document.getElementById("dTagPicker"),
    priSeg: document.getElementById("priSeg"),
    createDdlButton: document.getElementById("createDdlButton"),
    formValidationScrim: document.getElementById("formValidationScrim"),
    formValidationMessage: document.getElementById("formValidationMessage"),
    formValidationClose: document.getElementById("formValidationClose"),
    confirmScrim: document.getElementById("confirmScrim"),
    deleteModalTitle: document.getElementById("deleteModalTitle"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmText: document.querySelector("#confirmScrim .confirm-text"),
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
    subscriptionsButton: document.getElementById("subscriptionsButton"),
    subscriptionsScrim: document.getElementById("subscriptionsScrim"),
    subscriptionsList: document.getElementById("subscriptionsList"),
    notificationBadge: document.getElementById("notificationBadge"),
    notificationsScrim: document.getElementById("notificationsScrim"),
    notificationsList: document.getElementById("notificationsList"),
    notifReadAll: document.getElementById("notifReadAll"),
    notificationDelivery: document.getElementById("notificationDelivery"),
    notificationDeliveryText: document.getElementById("notificationDeliveryText"),
    notificationPermissionButton: document.getElementById("notificationPermissionButton"),
    detailScrim: document.getElementById("detailScrim"),
    detailCatDot: document.getElementById("detailCatDot"),
    detailTitle: document.getElementById("detailTitle"),
    detailBody: document.getElementById("detailBody"),
    detailActions: document.getElementById("detailActions"),
  });
}

function bindEvents() {
  document.querySelector("[data-action='navigate'][data-dir='-1']").addEventListener("click", () => navigate(-1));
  document.querySelector("[data-action='navigate'][data-dir='1']").addEventListener("click", () => navigate(1));
  document.querySelector("[data-action='today']").addEventListener("click", goToday);
  document.querySelector("[data-action='open-event']").addEventListener("click", () => openModal());
  document.querySelectorAll("[data-action='close-event']").forEach((button) => button.addEventListener("click", closeModal));
  document.querySelector("[data-action='close-notifications']").addEventListener("click", closeNotifications);
  document.querySelector("[data-action='close-subscriptions']").addEventListener("click", closeSubscriptions);
  els.notificationsButton.addEventListener("click", openNotifications);
  els.subscriptionsButton.addEventListener("click", openSubscriptions);
  els.notifReadAll.addEventListener("click", markAllNotificationsRead);
  els.notificationPermissionButton.addEventListener("click", requestBrowserNotificationPermission);
  document.querySelector("[data-action='close-confirm']").addEventListener("click", closeConfirm);
  document.querySelector("[data-action='close-complete']").addEventListener("click", closeComplete);
  document.querySelector("[data-action='close-reopen']").addEventListener("click", closeReopen);
  els.formValidationClose.addEventListener("click", closeFormValidation);
  els.confirmDeleteButton.addEventListener("click", () => confirmDelete("event"));
  els.deleteThisButton.addEventListener("click", () => confirmDelete("event"));
  els.deleteSeriesButton.addEventListener("click", () => confirmDelete("series"));
  els.confirmCompleteButton.addEventListener("click", confirmComplete);
  els.confirmReopenButton.addEventListener("click", confirmReopen);
  els.detailScrim.addEventListener("click", (event) => {
    if (event.target === els.detailScrim) closeDetail();
    if (event.target.closest("[data-action='close-detail']")) closeDetail();
  });

  els.ntEvent.addEventListener("click", () => setNewTab("event"));
  els.ntDdl.addEventListener("click", () => setNewTab("ddl"));
  els.ddlForm.addEventListener("submit", submitDeadline);
  els.dAllday.addEventListener("change", toggleDdlAllDay);
  els.dTime.addEventListener("input", validateDeadlineTime);
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
  els.fStart.addEventListener("input", previewTimeOrder);
  els.fEnd.addEventListener("input", previewTimeOrder);
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
  els.formValidationScrim.addEventListener("click", (event) => {
    if (event.target === els.formValidationScrim) closeFormValidation();
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
  els.subscriptionsScrim.addEventListener("click", (event) => {
    if (event.target === els.subscriptionsScrim) closeSubscriptions();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });

  // Polling a hidden tab burns battery and leaves a backlog of work to run the
  // moment it comes back. Catch up with one forced refresh instead.
  document.addEventListener("visibilitychange", () => {
    if (!els.body.classList.contains("is-authenticated")) return;
    if (document.hidden) {
      stopAutoRefresh();
      stopClockRefresh();
    } else {
      startAutoRefresh();
      startClockRefresh();
      refreshVisibleData({ silent: true, force: true });
    }
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
  // Tags are optional form metadata. Load them in the background so the
  // calendar's primary data is not held behind two extra API requests.
  const tagsReady = loadTags()
    .then(() => {
      if (els.body.classList.contains("is-authenticated")) render();
    })
    .catch(() => {});
  await loadCategories();
  render();
  await refreshVisibleData({ silent: false, force: true });
  void tagsReady;
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
  const [categoryJson, subjectJson] = await Promise.all([
    apiFetch("/api/categories"),
    apiFetch("/api/subjects"),
  ]);
  const rows = Array.isArray(categoryJson.data) ? categoryJson.data : [];
  categories = rows.length ? rows : [FALLBACK_CATEGORY];
  subjects = Array.isArray(subjectJson.data) ? subjectJson.data : [];

  // 侧栏筛选的粒度：普通分类按分类，Academics 按科目（外加「无科目」一项）。
  const validKeys = new Set(filterEntries().map((entry) => entry.key));
  activeFilters = new Set([...activeFilters].filter((key) => validKeys.has(key)));
  if (activeFilters.size === 0) activeFilters = new Set(validKeys);

  const validNames = new Set(categories.map((cat) => cat.name));
  if (!selectedCat || !validNames.has(selectedCat)) selectedCat = categories[0]?.name || FALLBACK_CATEGORY.name;
  if (!isAcademicsCategory(selectedCat)) selectedSubjectId = null;
  if (!isAcademicsCategory(ddlSelectedCat)) ddlSelectedSubjectId = null;
}

// Academics 是唯一带 Subject 子类的特殊分类，由服务端的 kind 字段标记。
function academicsCategory() {
  return categories.find((category) => category.kind === "academics") || null;
}

function isAcademicsCategory(name) {
  return Boolean(name) && academicsCategory()?.name === name;
}

function getSubject(id) {
  return subjects.find((subject) => subject.id === id) || null;
}

// 筛选键：学业项按科目区分，其余按分类名。
function filterKeyOf(categoryName, subjectId) {
  return subjectId ? `subject:${subjectId}` : `cat:${categoryName}`;
}

// 一个筛选键连带影响的全部键。普通分类只影响自己；academics 父级连带它的
// 全部科目子级 —— 隐藏 Academics 时科目还留着，不符合层级的直觉。
function filterGroupOf(key) {
  const academics = academicsCategory();
  if (!academics || key !== filterKeyOf(academics.name, null)) return [key];
  return [key, ...subjects.map((subject) => filterKeyOf(academics.name, subject.id))];
}

function filterEntries() {
  const entries = [];
  for (const category of categories) {
    const key = filterKeyOf(category.name, null);
    entries.push({
      key,
      // 父级点亮与否看整组：只要还有一个科目在显示，父级就不算关掉。
      groupKeys: filterGroupOf(key),
      label: category.name,
      color: category.color,
      nested: false,
    });
    if (category.kind !== "academics") continue;
    for (const subject of subjects) {
      const subjectKey = filterKeyOf(category.name, subject.id);
      entries.push({
        key: subjectKey,
        groupKeys: [subjectKey],
        label: subject.name,
        color: subject.color,
        nested: true,
      });
    }
  }
  return entries;
}

async function loadTags() {
  const [tagJson, suggestionJson] = await Promise.all([
    apiFetch("/api/tags"),
    apiFetch("/api/category-tag-suggestions"),
  ]);
  tags = Array.isArray(tagJson.data) ? tagJson.data : [];
  tagSuggestions = suggestionJson.data && typeof suggestionJson.data === "object" ? suggestionJson.data : {};
  const validIds = new Set(tags.map((tag) => tag.id));
  activeTagFilters = new Set([...activeTagFilters].filter((id) => validIds.has(id)));
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
  notificationSessionStartedAt = Date.now();
  pollNotifications();
  notificationTimer = setInterval(pollNotifications, 45_000);
}

function stopNotificationPolling() {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = null;
  notificationInFlight = false;
  notificationBaselineReady = false;
  notificationSessionStartedAt = 0;
  notificationUnreadCount = 0;
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
    const retainedReadItems = notificationItems.filter((item) => item.read_at && !items.some((fresh) => fresh.id === item.id));
    notificationItems = [...items, ...retainedReadItems]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 50);
    updateNotificationBadge(response.data?.unread_count || 0);
    const firstPoll = !notificationBaselineReady;
    const newestByTarget = new Map();
    items.slice().reverse().forEach((item) => {
      const createdAt = Date.parse(item.created_at);
      const arrivedThisSession = Number.isFinite(createdAt) && createdAt >= notificationSessionStartedAt - 5_000;
      if ((!firstPoll && !seenNotificationIds.has(item.id)) || (firstPoll && arrivedThisSession)) {
        newestByTarget.set(`${item.target_type}:${item.target_id}`, item);
      }
      seenNotificationIds.add(item.id);
    });
    notificationBaselineReady = true;
    newestByTarget.forEach((item) => {
      showToast(`${item.title}: ${item.message}`);
      showBrowserNotification(item);
    });
    if (els.notificationsScrim.classList.contains("open")) renderNotifications();
  } catch (err) {
    // Notification polling is optional and must not interrupt the calendar.
  } finally {
    notificationInFlight = false;
  }
}

function updateNotificationBadge(count) {
  notificationUnreadCount = Math.max(0, Number(count) || 0);
  els.notificationBadge.hidden = !notificationUnreadCount;
  els.notificationBadge.textContent = notificationUnreadCount > 99 ? "99+" : String(notificationUnreadCount);
}

async function openNotifications() {
  try {
    const response = await apiFetch("/api/notifications?include_read=true&limit=50");
    notificationItems = response.data?.items || [];
    notificationItems.forEach((item) => seenNotificationIds.add(item.id));
    notificationBaselineReady = true;
    updateNotificationBadge(response.data?.unread_count || 0);
  } catch (err) {
    showToast("Failed to load notifications.");
  }
  syncNotificationDelivery();
  renderNotifications();
  els.notificationsScrim.classList.add("open");
}

function closeNotifications() {
  els.notificationsScrim.classList.remove("open");
}

async function openSubscriptions() {
  els.subscriptionsScrim.classList.add("open");
  els.subscriptionsList.innerHTML = '<div class="notifications-empty">Loading subscriptions…</div>';
  try {
    const json = await apiFetch("/api/subscriptions");
    const data = json.data || {};
    // 分类 feed 里已经排除了 academics 那个「总的」，学业按科目逐条列出。
    const feeds = [
      { name: "All events", color: "#0071e3", url: data.all },
      ...(Array.isArray(data.subjects) ? data.subjects.map((subject) => ({ ...subject, url: subject.url })) : []),
      ...(Array.isArray(data.categories) ? data.categories.map((category) => ({ ...category, name: category.name, url: category.url })) : []),
    ].filter((feed) => feed.url);
    if (!feeds.length) throw new Error("No subscription links are available.");
    els.subscriptionsList.innerHTML = feeds.map((feed) => `<div class="subscription-row">
      <span class="subscription-dot" style="background:${escapeAttr(feed.color || "#8E8E93")}"></span>
      <div class="subscription-main"><strong>${escapeHtml(feed.name)}</strong><input class="subscription-url" value="${escapeAttr(feed.url)}" readonly aria-label="${escapeAttr(feed.name)} subscription URL" /></div>
      <button type="button" class="subscription-copy" data-subscription-url="${escapeAttr(feed.url)}">Copy</button>
    </div>`).join("");
    els.subscriptionsList.querySelectorAll("[data-subscription-url]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await copyText(button.dataset.subscriptionUrl);
          button.textContent = "Copied";
          setTimeout(() => { button.textContent = "Copy"; }, 1500);
        } catch (_) {
          showToast("Copy failed. Select the link and copy it manually.");
        }
      });
    });
  } catch (err) {
    els.subscriptionsList.innerHTML = `<div class="notifications-empty">${escapeHtml(err.message || "Subscriptions are unavailable.")}</div>`;
  }
}

function closeSubscriptions() {
  els.subscriptionsScrim.classList.remove("open");
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy failed");
}

function syncReadAllButton() {
  const hasUnread = notificationItems.some((item) => !item.read_at);
  els.notifReadAll.disabled = !hasUnread;
}

function syncNotificationDelivery() {
  if (!("Notification" in window)) {
    els.notificationDeliveryText.textContent = "Not supported by this browser.";
    els.notificationPermissionButton.hidden = true;
    return;
  }
  const permission = Notification.permission;
  els.notificationPermissionButton.hidden = permission === "granted";
  els.notificationPermissionButton.disabled = permission === "denied";
  els.notificationPermissionButton.textContent = permission === "denied" ? "Blocked" : "Enable";
  els.notificationDeliveryText.textContent = permission === "granted"
    ? "Enabled while this calendar page is open."
    : permission === "denied"
      ? "Blocked in browser settings. In-app notifications still work."
      : "Optional alerts while this calendar page is open.";
}

async function requestBrowserNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  els.notificationPermissionButton.disabled = true;
  await Notification.requestPermission().catch(() => null);
  syncNotificationDelivery();
}

function showBrowserNotification(item) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const browserNotification = new Notification(item.title, {
      body: item.message,
      tag: `${item.target_type}:${item.target_id}`,
    });
    browserNotification.onclick = () => {
      window.focus();
      browserNotification.close();
      void activateNotification(item);
    };
  } catch (_) {
    // Browser alerts are an optional delivery channel; the in-app item remains available.
  }
}

async function markAllNotificationsRead() {
  if (!notificationItems.some((item) => !item.read_at)) return;
  els.notifReadAll.disabled = true;
  try {
    await apiFetch("/api/notifications/read-all", { method: "POST" });
    const readAt = new Date().toISOString();
    notificationItems = notificationItems.map((item) => item.read_at ? item : { ...item, read_at: readAt });
    updateNotificationBadge(0);
    renderNotifications();
  } catch (err) {
    showToast("Failed to mark all read.");
    syncReadAllButton();
  }
}

function renderNotifications() {
  syncReadAllButton();
  if (!notificationItems.length) {
    els.notificationsList.innerHTML = '<div class="notifications-empty">No notifications yet.</div>';
    return;
  }
  els.notificationsList.innerHTML = notificationItems.map((item) => `<button type="button" class="notification-item ${item.read_at ? "" : "unread"}" data-notification-id="${escapeAttr(item.id)}">
    <div class="notification-title-row"><div class="notification-title">${escapeHtml(item.title)}</div><span class="notification-kind">${item.target_type === "deadline" ? "Deadline" : "Event"}</span></div>
    <div class="notification-message">${escapeHtml(item.message)}</div>
    <div class="notification-time">Reminder time · ${new Date(item.scheduled_at || item.created_at).toLocaleString()}</div>
  </button>`).join("");
  els.notificationsList.querySelectorAll("[data-notification-id]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.notificationId;
    const item = notificationItems.find((candidate) => candidate.id === id);
    if (item) await activateNotification(item);
  }));
}

async function markNotificationRead(item) {
  if (item.read_at) return;
  try {
    await apiFetch(`/api/notifications/${encodeURIComponent(item.id)}`, { method: "PATCH" });
    const readAt = new Date().toISOString();
    notificationItems = notificationItems.map((candidate) => candidate.id === item.id ? { ...candidate, read_at: readAt } : candidate);
    updateNotificationBadge(notificationUnreadCount - 1);
  } catch (err) {
    showToast("Could not mark this notification as read.");
  }
}

async function activateNotification(item) {
  await markNotificationRead(item);
  closeNotifications();
  const kind = item.target_type === "deadline" ? "deadline" : "event";
  await openDetail(kind, item.target_id, { focusDate: true });
}

// Fetch a range's calendar items and independent course projection together.
async function fetchRangeData(range, { store = true } = {}) {
  const rangeKey = rangeKeyFor(range);
  const eventsUrl = `/api/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const deadlineFrom = addDateKey(range.from.slice(0, 10), -3);
  const deadlineTo = addDateKey(range.to.slice(0, 10), 3);
  const deadlineUrl = `/api/deadlines?from=${encodeURIComponent(deadlineFrom)}&to=${encodeURIComponent(deadlineTo)}&include_completed=true`;
  const courseUrl = `/api/course-schedule?from=${encodeURIComponent(range.from.slice(0, 10))}&to=${encodeURIComponent(range.to.slice(0, 10))}`;
  const [json, deadlineJson, courseJson] = await Promise.all([
    apiFetch(eventsUrl),
    apiFetch(deadlineUrl),
    apiFetch(courseUrl).catch(() => ({ data: [] })),
  ]);
  const payload = { events: json.data || [], deadlines: deadlineJson.data || [], courses: courseJson.data || [] };
  if (store) {
    rangeCache.set(rangeKey, payload);
    trimRangeCache();
  }
  return payload;
}

function rangeKeyFor(range) {
  return `${range.from}|${range.to}`;
}

function dataSignature(payload) {
  return JSON.stringify(payload);
}

// Instant paint: if we prefetched this period, load it (events AND deadlines)
// into the in-memory maps right away. Returns true when the caller still needs
// to render.
function applyCachedRange() {
  const rangeKey = rangeKeyFor(getVisibleRange());
  if (rangeKey === lastRangeKey) return false;
  const cached = rangeCache.get(rangeKey);
  if (!cached) return false;
  applyEvents(cached.events);
  applyDeadlines(cached.deadlines);
  applyCourses(cached.courses || []);
  lastRangeKey = rangeKey;
  lastDataSignature = dataSignature(cached);
  return true;
}

async function refreshVisibleData({ silent = true, force = false } = {}) {
  // Don't drop the request: navigating during an in-flight poll used to leave
  // the new period unfetched until the next timer tick.
  if (refreshInFlight) { pendingRefresh = true; return; }
  const range = getVisibleRange();
  const rangeKey = rangeKeyFor(range);
  if (!force && rangeKey === lastRangeKey && !silent) return;

  if (applyCachedRange()) render();

  refreshInFlight = true;
  try {
    const payload = await fetchRangeData(range, { store: true });
    // The user may have navigated while this was in flight. The payload stays
    // cached for when they come back, but painting it now would show the
    // wrong period.
    if (rangeKeyFor(getVisibleRange()) === rangeKey) {
      const signature = dataSignature(payload);
      const changed = signature !== lastDataSignature || rangeKey !== lastRangeKey;
      applyEvents(payload.events);
      applyDeadlines(payload.deadlines);
      applyCourses(payload.courses || []);
      lastRangeKey = rangeKey;
      lastDataSignature = signature;
      // Rebuilding the grid every 10s is what makes swipes and sheets stutter
      // once a month holds a few hundred items. Only repaint on real changes.
      if (changed) render();
    }
    prefetchAdjacentRanges();
  } catch (err) {
    if (err.message !== "Authentication required" && silent) showToast("Sync failed. Keeping current calendar.");
    if (!silent && err.message !== "Authentication required") showToast(err.message || "Failed to load events.");
  } finally {
    refreshInFlight = false;
  }

  if (pendingRefresh) {
    pendingRefresh = false;
    refreshVisibleData({ silent: true, force: true });
  }
}

function trimRangeCache() {
  while (rangeCache.size > RANGE_CACHE_LIMIT) {
    const oldestKey = rangeCache.keys().next().value;
    rangeCache.delete(oldestKey);
  }
}

// Warm the cache for the periods the user is one or two gestures away from,
// so navigating shows data instantly instead of after a network round-trip.
async function prefetchAdjacentRanges() {
  const portraitMode = isPortrait();
  const view = currentView;
  const dates = [];
  if (portraitMode || view === "month") {
    for (const step of [-2, -1, 1, 2]) dates.push(addMonths(viewDate, step));
  } else if (view === "week") {
    for (const step of [-1, 1]) dates.push(addDays(viewDate, step * 7));
  } else {
    for (const step of [-2, -1, 1, 2]) dates.push(addDays(viewDate, step));
  }
  await Promise.all(dates.map((date) => {
    const range = computeRange(date, view, portraitMode);
    if (rangeCache.has(rangeKeyFor(range))) return null;
    return fetchRangeData(range, { store: true }).catch(() => null);
  }));
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

function applyCourses(rows) {
  const next = new Map();
  for (const row of rows) {
    if (!row?.id || !row.date || !row.start_time) continue;
    const course = {
      id: row.id,
      slotId: row.course_slot_id,
      title: row.title || "Course",
      teacher: row.teacher || "",
      room: row.room || "",
      subjectName: row.subject_name || "Other",
      color: row.color || "#655f58",
      start: row.start_time.slice(11, 16),
      end: row.end_time.slice(11, 16),
      dateKey: row.date,
    };
    if (!next.has(course.dateKey)) next.set(course.dateKey, []);
    next.get(course.dateKey).push(course);
  }
  for (const list of next.values()) list.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  coursesByDate = next;
}

function getCoursesFor(date) {
  return coursesByDate.get(isoKey(date)) || [];
}

// 颜色优先级：事项显式颜色 > 科目颜色 > 分类颜色。
// "default" / 空值都表示「跟随分类或科目」，不是一个具体颜色。
function resolveItemColor(row, categoryName) {
  const explicit = row.color && String(row.color).toLowerCase() !== "default" ? row.color : null;
  if (explicit) return explicit;
  const subject = row.subject_id ? getSubject(row.subject_id) : null;
  if (subject?.color) return subject.color;
  return getCategory(categoryName).color || FALLBACK_CATEGORY.color;
}

function adaptDeadline(row) {
  if (!row || !row.id || !row.due_time) return null;
  const dateKey = row.due_time.slice(0, 10);
  const categoryName = row.category || FALLBACK_CATEGORY.name;
  const color = resolveItemColor(row, categoryName);
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
    subjectId: row.subject_id || null,
    filterKey: filterKeyOf(categoryName, row.subject_id || null),
    color,
    bg: colorToSoftBg(color),
    priority: row.priority || "default",
    status: row.status || (row.completed_at ? "completed" : row.is_overdue ? "overdue" : "open"),
    completedAt: row.completed_at || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

function adaptEvent(row) {
  if (!row || !row.id || !row.start_time) return null;
  const dateKey = row.start_time.slice(0, 10);
  const start = row.all_day ? "00:00" : timeFromIso(row.start_time, "00:00");
  const end = row.all_day ? "23:59" : timeFromIso(row.end_time, start);
  const categoryName = row.category || FALLBACK_CATEGORY.name;
  const color = resolveItemColor(row, categoryName);
  return {
    id: row.id,
    title: row.title || "Untitled",
    description: row.description || "",
    cat: categoryName,
    subjectId: row.subject_id || null,
    filterKey: filterKeyOf(categoryName, row.subject_id || null),
    color,
    bg: colorToSoftBg(color),
    start,
    end,
    allDay: Boolean(row.all_day),
    dateKey,
    source: row.source || "web",
    seriesId: row.series_id || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

// The visible from/to range for any date + view (used for both the current
// view and prefetching neighbours).
function computeRange(date, view, portraitMode) {
  if (portraitMode || view === "month") {
    const { start, end } = getMonthGridRange(date);
    return { from: toLocalIso(start, "00:00"), to: toLocalIso(end, "23:59") };
  }
  if (view === "week") {
    const start = startOfWeek(date);
    return { from: toLocalIso(start, "00:00"), to: toLocalIso(addDays(start, 6), "23:59") };
  }
  return { from: toLocalIso(date, "00:00"), to: toLocalIso(date, "23:59") };
}

function getVisibleRange() {
  return computeRange(viewDate, currentView, isPortrait());
}

function switchView(view) {
  if (!["month", "week", "day"].includes(view)) return;
  currentView = view;
  updateViewToggle();
  applyCachedRange();
  render();
  refreshVisibleData({ silent: false, force: true });
}

function navigate(dir) {
  if (isPortrait() || currentView === "month") viewDate = addMonths(viewDate, dir);
  else if (currentView === "week") viewDate = addDays(viewDate, dir * 7);
  else viewDate = addDays(viewDate, dir);
  // Load the prefetched period before painting, so this is the only rebuild:
  // rendering first and then again on cache hit meant two full grids per step.
  applyCachedRange();
  render();
  refreshVisibleData({ silent: false, force: true });
}

function goToday() {
  viewDate = startOfDay(new Date());
  selectedDate = startOfDay(new Date());
  applyCachedRange();
  render();
  refreshVisibleData({ silent: false, force: true });
}

function renderEmptyShell() {
  updateViewToggle();
  render();
}

// The FX layer marks the window in which a swipe or sheet spring is running.
// A full grid rebuild mid-flight drops frames, so renders wait it out.
function holdRenders(ms) {
  animationUntil = Math.max(animationUntil, performance.now() + ms);
}

function render() {
  const wait = animationUntil - performance.now();
  if (wait > 0) {
    if (!deferredRenderTimer) {
      deferredRenderTimer = setTimeout(() => { deferredRenderTimer = null; render(); }, wait + 16);
    }
    return;
  }
  if (deferredRenderTimer) { clearTimeout(deferredRenderTimer); deferredRenderTimer = null; }
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
    // 课程属于低优先级的背景层：不占用 Event / Deadline 的圆点位，单独用一排
    // 更细更淡的色条表示「这天有课」，避免与事项的圆点抢注意力。
    const courseTicks = getCoursesFor(date).slice(0, 6).map((course) => `<i style="background:${course.color}"></i>`).join("");
    const marks = `<div class="pm-dots">${events.slice(0, 3).map((event) => `<div class="pm-dot" style="background:${event.color}"></div>`).join("")}${deadlines.slice(0, 2).map((deadline) => `<div class="pm-dot pm-ddl-dot" style="background:${deadlineColor(deadline)}"></div>`).join("")}</div>
      <div class="pm-courses">${courseTicks}</div>`;
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
         ${courseAgendaHTML(date)}
       </div>`;
  }
  bindInspectorActions(els.inspector);
}

// Upper bound on the chips that can fit in one month cell at the current size,
// measured from the grid already on screen. Building the ones that cannot fit
// only for trimMonthCells to hide them is pure layout cost, and layout is what
// dominates a render once a month holds a few hundred items.
function measureChipCapacity() {
  const cell = els.calCol.querySelector(".month-grid .cell");
  if (!cell) return 0;
  let chipHeight = Infinity;
  for (const chip of els.calCol.querySelectorAll(".month-grid .event-chip, .month-grid .ddl-chip")) {
    const height = chip.offsetHeight;
    if (height > 0 && height < chipHeight) chipHeight = height;
  }
  if (!Number.isFinite(chipHeight)) return 0;
  const top = cell.querySelector(".cell-top");
  const styles = getComputedStyle(cell);
  const available = cell.clientHeight - (top?.offsetHeight || 0) - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom) - 4;
  // Deliberately generous (smallest chip height, rounded up, plus one) so the
  // cap never drops a chip that would have fit — trimMonthCells still does the
  // exact per-cell fit on what we build.
  return Math.max(1, Math.ceil(available / (chipHeight + 3)) + 1);
}

function renderMonth() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const { start } = getMonthGridRange(viewDate);
  els.navTitle.textContent = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const capacity = measureChipCapacity();
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const iso = isoKey(date);
    const events = sortEvents(getEventsFor(date));
    const deadlines = getDeadlinesFor(date);
    const items = [...deadlines.map((deadline) => ({ type: "deadline", value: deadline })), ...events.map((event) => ({ type: "event", value: event }))];
    // Chips dropped here still get counted into the cell's "+N more".
    const dropped = capacity ? Math.max(0, items.length - capacity) : 0;
    const shown = dropped ? items.slice(0, capacity) : items;
    // 课程条画在 .cell-top 里而不是 .events 里：chip 容量与 trimMonthCells 都是
    // 按「cell 高度减去 cell-top」算的，放这里课程就自动不占 Event chip 名额。
    const courses = getCoursesFor(date);
    const courseTicks = courses.length
      ? `<span class="cell-courses" data-tip="${courses.length} course${courses.length !== 1 ? "s" : ""}">${courses.slice(0, 8).map((course) => `<i style="background:${course.color}"></i>`).join("")}</span>`
      : "";
    cells += `<div class="cell ${date.getMonth() !== month ? "other-month" : ""} ${sameDay(date, today()) ? "is-today" : ""} ${sameDay(date, selectedDate) ? "is-selected" : ""}" data-date="${iso}">
      <div class="cell-top">
        <span class="date-num">${date.getDate()}</span>${courseTicks}
      </div>
      <div class="events" data-dropped="${dropped}">
        ${shown.map((item) => item.type === "deadline"
          ? `<div class="ddl-chip ${item.value.status === "completed" ? "done" : item.value.status}" style="--ddl-color:${deadlineColor(item.value)};--ddl-bg:${item.value.bg}" data-deadline-id="${escapeAttr(item.value.id)}" data-tip="${escapeAttr(item.value.title)}">⚑ ${escapeHtml(item.value.title)}</div>`
          : `<div class="event-chip ${isOngoing(item.value, date) ? "ongoing" : ""}" style="background:${item.value.bg}; color:${inkColor(item.value.color)}" data-open-day="${iso}">${eventTitleHTML(item.value)}</div>`).join("")}
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

// Hide the chips that don't fit and add a "+N more" button. Done in three
// batched passes (write / read / write) instead of per cell: interleaving a
// style write with an offsetHeight read forces a synchronous reflow, and 42 of
// those over a grid holding hundreds of chips is what makes navigation crawl.
function trimMonthCells() {
  const cells = [...els.calCol.querySelectorAll(".month-grid .cell")];
  const entries = [];
  for (const cell of cells) {
    const events = cell.querySelector(".events");
    if (!events) continue;
    const items = [...events.querySelectorAll(".event-chip,.ddl-chip")];
    // Only write when a previous pass actually hid something; a no-op write
    // would still invalidate layout for the read pass below.
    for (const item of items) if (item.style.display) item.style.display = "";
    const dropped = Number(events.dataset.dropped) || 0;
    entries.push({ cell, events, items, dropped, top: cell.querySelector(".cell-top"), show: items.length });
  }
  if (!entries.length) return;

  // Every cell shares the same padding, so resolve it once.
  const styles = getComputedStyle(entries[0].cell);
  const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const moreHeight = 15;
  for (const entry of entries) {
    const available = entry.cell.clientHeight - (entry.top?.offsetHeight || 0) - padding - 4;
    let used = 0;
    for (let i = 0; i < entry.items.length; i += 1) {
      const height = entry.items[i].offsetHeight + 3;
      if (used + height + moreHeight > available) { entry.show = i; break; }
      used += height;
    }
  }

  for (const entry of entries) {
    if (entry.show >= entry.items.length && !entry.dropped) continue;
    const show = Math.max(Math.min(entry.show, entry.items.length), 1);
    for (const item of entry.items.slice(show)) item.style.display = "none";
    const more = document.createElement("button");
    more.type = "button";
    more.className = "more-link";
    more.textContent = `+${entry.items.length - show + entry.dropped} more`;
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      openDayPopover(entry.cell.dataset.date, more);
    });
    entry.events.appendChild(more);
  }
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
      openDetail("event", item.dataset.openEvent);
    });
  });
  root.querySelectorAll("[data-deadline-id]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetail("deadline", item.dataset.deadlineId);
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
    pop.querySelectorAll("[data-deadline-id]").forEach((item) => item.addEventListener("click", () => { closePopover(); openDetail("deadline", item.dataset.deadlineId); }));
  });
}

function dayPopoverHTML(iso) {
  const date = parseDateKey(iso);
  const events = sortEvents(getEventsFor(date));
  const deadlines = getDeadlinesFor(date);
  return `<h4>${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h4>
    <div class="pop-sec">Deadlines · ${deadlines.length}</div>
    ${deadlines.length ? deadlines.map((deadline) => `<div class="pop-row pop-ddl ${deadline.status === "completed" ? "done" : deadline.status}" data-deadline-id="${escapeAttr(deadline.id)}"><span class="pop-dot" style="background:${deadlineColor(deadline)}"></span><span class="pt" data-tip="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</span><span class="pm">${deadline.status === "completed" ? "Reopen" : deadline.allDay ? "All-day" : deadline.time}</span></div>`).join("") : '<div class="pop-empty">None</div>'}
    <div class="pop-sec">Events · ${events.length}</div>
    ${events.length ? events.map((event) => `<div class="pop-row"><span class="pop-dot" style="background:${event.color}"></span><span class="pt">${eventTitleHTML(event)}</span><span class="pm">${isAllDayEvent(event) ? "All-day" : event.start}</span></div>`).join("") : '<div class="pop-empty">None</div>'}`;
}

function openDayPopover(iso, anchor) {
  openPopover(anchor, dayPopoverHTML(iso));
}

function openQuickPopover(anchor) {
  const quick = quickDeadlines();
  const html = `<h4>Due soon · ${quick.length}</h4>${quick.length ? quick.map((deadline) => `<div class="pop-row pop-ddl ${deadline.status === "completed" ? "done" : deadline.status}" data-deadline-id="${escapeAttr(deadline.id)}"><span class="pop-dot" style="background:${deadlineColor(deadline)}"></span><span class="pt" data-tip="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</span><span class="pm">${deadlineDueText(deadline)}</span></div>`).join("") : '<div class="pop-empty">None</div>'}`;
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
    ${courseAgendaHTML(date)}
    <div class="inspector-heading">Categories</div>
    <ul class="cat-list">
      ${filterEntries().map((entry) => `
        <li class="cat-item ${entry.nested ? "cat-item-sub" : ""} ${entry.groupKeys.some((member) => activeFilters.has(member)) ? "" : "off"}" data-category="${escapeAttr(entry.key)}">
          <span class="cat-dot" style="background:${entry.color}"></span>${escapeHtml(entry.label)}
        </li>`).join("")}
    </ul>
    ${tags.length ? `<div class="inspector-heading tag-filter-heading">Tags</div>
    <div class="tag-filter-list">${tags.map((tag) => `<button type="button" class="tag-filter ${activeTagFilters.has(tag.id) ? "selected" : ""}" data-tag-filter="${escapeAttr(tag.id)}">${escapeHtml(tag.name)}</button>`).join("")}</div>` : ""}`;
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
  root.querySelectorAll("[data-detail-id]").forEach((item) => {
    item.addEventListener("click", () => openDetail("event", item.dataset.detailId));
  });
  root.querySelectorAll("[data-course-leave]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      leaveCourse(button.dataset.courseLeave, button.dataset.courseDate, button.dataset.courseSlot || null);
    });
  });
  root.querySelectorAll("[data-open-event]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetail("event", item.dataset.openEvent);
    });
  });
  root.querySelectorAll("[data-category]").forEach((item) => {
    item.addEventListener("click", () => toggleFilter(item.dataset.category));
  });
  root.querySelectorAll("[data-tag-filter]").forEach((item) => {
    item.addEventListener("click", () => toggleTagFilter(item.dataset.tagFilter));
  });
  root.querySelectorAll("[data-deadline-id]").forEach((item) => {
    item.addEventListener("click", () => openDetail("deadline", item.dataset.deadlineId));
  });
  root.querySelectorAll("[data-open-deadline]").forEach((button) => {
    button.addEventListener("click", () => openDeadlineModal());
  });
  root.querySelectorAll("[data-open-quick]").forEach((button) => {
    button.addEventListener("click", () => openQuickPopover(button));
  });
}

function toggleFilter(key) {
  const group = filterGroupOf(key);
  // 整组都开着才算「关掉」，否则一律补齐成全开 —— 父级半开时再点一下会全部亮起。
  const allOn = group.every((member) => activeFilters.has(member));
  for (const member of group) {
    if (allOn) activeFilters.delete(member);
    else activeFilters.add(member);
  }
  render();
}

function toggleTagFilter(id) {
  if (activeTagFilters.has(id)) activeTagFilters.delete(id);
  else activeTagFilters.add(id);
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
      <div class="allday-ddl ${deadline.status === "completed" ? "done" : deadline.status}" style="--ddl-color:${deadlineColor(deadline)};--ddl-bg:${deadline.bg}" data-deadline-id="${escapeAttr(deadline.id)}" data-tip="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</div>`).join("")}${events.map((event) => `
      <div class="allday-chip" data-open-event="${escapeAttr(event.id)}" data-event-date="${isoKey(date)}" style="background:${event.bg};color:${inkColor(event.color)}">
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
    const courses = getCoursesFor(date);
    const courseBlocks = courses.map((course) => {
      const top = timeToMin(course.start) - GRID_START_HOUR * 60;
      const height = Math.max(timeToMin(course.end) - timeToMin(course.start), 24);
      return `<div class="course-block" style="top:${top}px;height:${height}px;--course-color:${course.color}"><span>${escapeHtml(course.title)}</span><small>${course.start}–${course.end}</small></div>`;
    }).join("");
    const events = layoutDayEvents(getEventsFor(date).filter((event) => !isAllDayEvent(event)));
    const blocks = events.map((event) => {
      const top = timeToMin(event.start) - GRID_START_HOUR * 60;
      const height = Math.max(timeToMin(event.end) - timeToMin(event.start), 26);
      const widthPct = 100 / event.cols;
      const leftPct = event.col * widthPct;
      return `<div class="tl-event ${isOngoing(event, date) ? "ongoing" : ""}" data-open-event="${escapeAttr(event.id)}" data-event-date="${isoKey(date)}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);background:${event.bg};color:${inkColor(event.color)}">
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
      return `<div class="tl-ddl-line ${statusClass}" style="top:${mins}px;border-top-color:${deadlineColor(deadline)}"><span class="tl-ddl-label" data-tip="${escapeAttr(deadline.title)} · ${escapeAttr(deadline.time || "")}" style="top:${labelTop}px;z-index:${labelZ};color:${inkColor(deadlineColor(deadline))}" data-deadline-id="${escapeAttr(deadline.id)}">⚑ ${escapeHtml(deadline.title)} · ${deadline.time}${deadline.status === "overdue" ? " ⚠" : ""}</span></div>`;
    }).join("");
    const nowLine = sameDay(date, today()) && now >= GRID_START_HOUR * 60 && now <= GRID_END_HOUR * 60
      ? `<div class="now-line" style="top:${now - GRID_START_HOUR * 60}px"></div>`
      : "";
    return `<div class="day-col-body">${courseBlocks}${blocks}${deadlineLines}${nowLine}</div>`;
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
  return `<div class="agenda-item" data-detail-id="${escapeAttr(event.id)}">
    <div class="agenda-bar" style="background:${event.color}"></div>
    <div class="agenda-body">
      <div class="agenda-title">${eventTitleHTML(event)}</div>
      <div class="agenda-time">${isAllDayEvent(event) ? "All-day" : `${event.start} - ${event.end}`}${eventRelativeLabel(event, date) ? `<span class="event-relative"> · ${eventRelativeLabel(event, date)}</span>` : ""}${isOngoing(event, date) ? '<span class="now-badge">Now</span>' : ""}</div>
      <span class="agenda-cat" style="color:${inkColor(event.color)}">${escapeHtml(agendaCategoryLabel(event))}</span>
    </div>
    <button type="button" class="agenda-delete" data-delete-id="${event.id}" data-delete-title="${escapeAttr(event.title)}" data-series-id="${escapeAttr(event.seriesId || "")}">x</button>
  </div>`;
}

// 课程是排在 Event / Deadline 之后的背景信息：一行一节、定高槽位内滚动，
// 高度不跟课程条数走，免得把下面的 Categories / Tags 顶来顶去（FRONTEND_SPEC §2）。
function courseAgendaHTML(date) {
  const courses = getCoursesFor(date);
  const rows = courses.length ? courses.map((course) => `<div class="course-row" style="--course-color:${course.color}" data-tip="${escapeAttr(`${course.title} · ${course.start}–${course.end}${course.room ? ` · ${course.room}` : ""}${course.teacher ? ` · ${course.teacher}` : ""}`)}">
    <span class="course-row-bar"></span>
    <span class="course-row-time">${escapeHtml(course.start)}</span>
    <span class="course-row-title">${escapeHtml(course.title)}</span>
    <span class="course-row-room">${escapeHtml(course.room || "")}</span>
    <button type="button" class="course-row-leave" data-course-leave="cancel" data-course-slot="${escapeAttr(course.slotId)}" data-course-date="${escapeAttr(course.dateKey)}">Leave</button>
  </div>`).join("") : '<div class="course-empty">No courses on this day.</div>';
  return `<div class="course-agenda">
    <div class="course-agenda-head">
      <span>Courses · ${courses.length}</span>
      ${courses.length ? `<button type="button" class="course-leave-all" data-course-leave="cancel_day" data-course-date="${escapeAttr(isoKey(date))}">Leave all day</button>` : ""}
    </div>
    <div class="course-agenda-body">${rows}</div>
  </div>`;
}

async function leaveCourse(kind, date, slotId) {
  const message = kind === "cancel" ? "Take leave for this class?" : "Take leave for all courses on this day?";
  if (!window.confirm(message)) return;
  try {
    await apiFetch("/api/course-overrides", { method: "POST", body: JSON.stringify({ kind, effective_date: date, ...(slotId ? { course_slot_id: slotId } : {}) }) });
    showToast("Course leave recorded");
    await refreshVisibleData({ silent: false, force: true });
  } catch (err) {
    showToast(err.message || "Could not record course leave.");
  }
}

// agenda 行空间有限：有科目时只显示科目名，没有才显示分类名。
function agendaCategoryLabel(event) {
  const subject = event.subjectId ? getSubject(event.subjectId) : null;
  return subject ? subject.name : event.cat;
}

function eventTitleHTML(event) {
  const marker = event.seriesId
    ? '<span class="repeat-mark" data-tip="Repeating event" aria-label="Repeating event">↻</span>'
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

// 只有 Academics 分类才展开科目行；「无科目」用中性色块表示学业但未指定科目。
function subjectSwatchRowHtml(categoryName, currentSubjectId, attr) {
  if (!isAcademicsCategory(categoryName)) return "";
  const academics = academicsCategory();
  const none = `<button type="button" class="swatch swatch-none ${currentSubjectId ? "" : "selected"}" style="background:${academics.color}" ${attr}="" data-tip="No subject" aria-label="No subject"></button>`;
  const items = subjects.map((subject) => `<button type="button" class="swatch ${subject.id === currentSubjectId ? "selected" : ""}" style="background:${subject.color}" ${attr}="${escapeAttr(subject.id)}" data-tip="${escapeAttr(subject.name)}" aria-label="${escapeAttr(subject.name)}"></button>`).join("");
  return `<div class="subject-swatches">${none}${items}</div>`;
}

function renderSwatches() {
  els.catSwatches.innerHTML = categories.map((cat) => `
    <button type="button" class="swatch ${cat.name === selectedCat ? "selected" : ""}" style="background:${cat.color}" data-cat="${escapeAttr(cat.name)}" data-tip="${escapeAttr(cat.name)}" aria-label="${escapeAttr(cat.name)}"></button>
  `).join("") + subjectSwatchRowHtml(selectedCat, selectedSubjectId, "data-subject");
  els.catSwatches.querySelectorAll("[data-cat]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCat = button.dataset.cat;
      if (!isAcademicsCategory(selectedCat)) selectedSubjectId = null;
      renderSwatches();
      renderEventTagPicker();
    });
  });
  els.catSwatches.querySelectorAll("[data-subject]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSubjectId = button.dataset.subject || null;
      renderSwatches();
      renderEventTagPicker();
    });
  });
}

// Academics 事项显示成「Academics / Math」，普通分类只显示分类名。
function categoryLabel(item) {
  const subject = item.subjectId ? getSubject(item.subjectId) : null;
  return subject ? `${item.cat} / ${subject.name}` : item.cat;
}

function categoryIdForName(name) {
  return categories.find((category) => category.name === name)?.id || null;
}

// 标签建议的归属：Academics 选了科目时按科目，其余按分类。
function suggestionOwnerId(categoryName, subjectId) {
  if (subjectId && isAcademicsCategory(categoryName)) return subjectId;
  return categoryIdForName(categoryName);
}

function orderedTagsForCategory(categoryName, subjectId = null) {
  const suggested = new Set(tagSuggestions[suggestionOwnerId(categoryName, subjectId)] || []);
  return tags.slice()
    .sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function tagPickerHtml(categoryName, selectedIds, expanded, subjectId = null) {
  const suggested = new Set(tagSuggestions[suggestionOwnerId(categoryName, subjectId)] || []);
  const ordered = orderedTagsForCategory(categoryName, subjectId);
  if (!ordered.length) return '<span class="tag-picker-empty">No tags available</span>';
  const visible = expanded ? ordered : ordered.slice(0, 6);
  const chips = visible.map((tag) => {
    const selected = selectedIds.has(tag.id);
    const disabled = !selected && selectedIds.size >= 5;
    return `<button type="button" class="tag-chip ${selected ? "selected" : ""} ${suggested.has(tag.id) ? "suggested" : ""}" data-tag-id="${escapeAttr(tag.id)}" ${disabled ? "disabled" : ""}>${escapeHtml(tag.name)}</button>`;
  }).join("");
  if (ordered.length <= 6) return chips;
  const label = expanded ? "Show less" : `Show more (${ordered.length - 6})`;
  return `${chips}<button type="button" class="tag-picker-toggle" data-tag-picker-toggle>${label}</button>`;
}

function toggleSelectedTag(selectedIds, id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else if (selectedIds.size < 5) selectedIds.add(id);
}

function renderEventTagPicker() {
  els.fTagPicker.innerHTML = tagPickerHtml(selectedCat, selectedTagIds, eventTagPickerExpanded, selectedSubjectId);
  els.fTagPicker.querySelectorAll("[data-tag-id]").forEach((button) => button.addEventListener("click", () => {
    toggleSelectedTag(selectedTagIds, button.dataset.tagId);
    renderEventTagPicker();
  }));
  els.fTagPicker.querySelector("[data-tag-picker-toggle]")?.addEventListener("click", () => {
    eventTagPickerExpanded = !eventTagPickerExpanded;
    renderEventTagPicker();
  });
}

function renderDeadlineTagPicker() {
  els.dTagPicker.innerHTML = tagPickerHtml(ddlSelectedCat, ddlSelectedTagIds, deadlineTagPickerExpanded, ddlSelectedSubjectId);
  els.dTagPicker.querySelectorAll("[data-tag-id]").forEach((button) => button.addEventListener("click", () => {
    toggleSelectedTag(ddlSelectedTagIds, button.dataset.tagId);
    renderDeadlineTagPicker();
  }));
  els.dTagPicker.querySelector("[data-tag-picker-toggle]")?.addEventListener("click", () => {
    deadlineTagPickerExpanded = !deadlineTagPickerExpanded;
    renderDeadlineTagPicker();
  });
}

function openModal(prefillIso, initialTab = "event") {
  newModalPrefillIso = prefillIso || isoKey(selectedDate);
  els.fTitle.value = "";
  els.fDate.value = newModalPrefillIso;
  els.fAllday.checked = false;
  els.fStart.value = "09:00";
  els.fEnd.value = "10:00";
  els.fReminderOne.value = "60";
  els.fReminderTwo.value = "10";
  els.fRepeat.value = "none";
  els.fRepeatEnd.value = "date";
  els.fRepeatEndDate.value = addDateKey(els.fDate.value, 30);
  els.fRepeatCount.value = "10";
  selectedTagIds = new Set();
  eventTagPickerExpanded = false;
  deadlineFormPrepared = false;
  repeatIdempotencyKey = crypto.randomUUID();
  repeatWeekdayTouched = false;
  setDefaultRepeatWeekday();
  if (!selectedCat || !getCategory(selectedCat)) selectedCat = categories[0]?.name || FALLBACK_CATEGORY.name;
  toggleAllDayFields();
  hideTimeError();
  renderSwatches();
  renderEventTagPicker();
  syncRepeatUI();
  els.createButton.disabled = false;
  setNewTab(initialTab);
  els.eventScrim.classList.add("open");
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
  if (!eventActive && !deadlineFormPrepared) prepareDeadlineForm(newModalPrefillIso);
  if (!isPortrait()) setTimeout(() => (eventActive ? els.fTitle : els.dTitle).focus(), 50);
}

function openDeadlineModal(prefillIso) {
  openModal(prefillIso || isoKey(selectedDate), "ddl");
}

function prepareDeadlineForm(prefillIso) {
  deadlineFormPrepared = true;
  els.dTitle.value = "";
  els.dDate.value = prefillIso || isoKey(selectedDate);
  els.dTime.value = "18:00";
  els.dAllday.checked = false;
  ddlSelectedCat = selectedCat || categories[0]?.name || FALLBACK_CATEGORY.name;
  ddlSelectedSubjectId = isAcademicsCategory(ddlSelectedCat) ? selectedSubjectId : null;
  ddlPriority = "default";
  ddlSelectedTagIds = new Set();
  deadlineTagPickerExpanded = false;
  toggleDdlAllDay();
  renderDdlSwatches();
  renderDeadlineTagPicker();
  selectDdlPriority("default");
  els.createDdlButton.disabled = false;
  els.createDdlButton.textContent = "Create";
}

function renderDdlSwatches() {
  els.dCatSwatches.innerHTML = categories.map((category) => `<button type="button" class="swatch ${category.name === ddlSelectedCat ? "selected" : ""}" style="background:${category.color}" data-ddl-cat="${escapeAttr(category.name)}" data-tip="${escapeAttr(category.name)}" aria-label="${escapeAttr(category.name)}"></button>`).join("")
    + subjectSwatchRowHtml(ddlSelectedCat, ddlSelectedSubjectId, "data-ddl-subject");
  els.dCatSwatches.querySelectorAll("[data-ddl-cat]").forEach((button) => button.addEventListener("click", () => {
    ddlSelectedCat = button.dataset.ddlCat;
    if (!isAcademicsCategory(ddlSelectedCat)) ddlSelectedSubjectId = null;
    renderDdlSwatches();
    renderDeadlineTagPicker();
  }));
  els.dCatSwatches.querySelectorAll("[data-ddl-subject]").forEach((button) => button.addEventListener("click", () => {
    ddlSelectedSubjectId = button.dataset.ddlSubject || null;
    renderDdlSwatches();
    renderDeadlineTagPicker();
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
  els.dTime.disabled = disabled;
  validateDeadlineTime();
}

async function submitDeadline(event) {
  event.preventDefault();
  const title = els.dTitle.value.trim();
  if (!title) return showFormValidation("Enter a deadline title.");
  if (!els.dDate.value) return showFormValidation("Choose a due date.");
  if (!validateDeadlineTime()) return showFormValidation("Enter a valid 24-hour due time (00:00–23:59).");
  const allDay = els.dAllday.checked;
  const category = getCategory(ddlSelectedCat);
  const due_time = allDay ? els.dDate.value : toLocalIso(parseDateKey(els.dDate.value), els.dTime.value || "18:00");
  els.createDdlButton.disabled = true;
  try {
    await apiFetch("/api/deadlines", {
      method: "POST",
      body: JSON.stringify({ title, due_time, all_day: allDay, category: category.name, subject_id: ddlSelectedSubjectId, color: "default", priority: ddlPriority, tag_ids: [...ddlSelectedTagIds], source: "web" }),
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
  closeFormValidation();
  els.eventScrim.classList.remove("open");
}

async function submitEvent(event) {
  event.preventDefault();
  const date = els.fDate.value;
  const title = els.fTitle.value.trim();
  if (!title) return showFormValidation("Enter an event title.");
  if (!date) return showFormValidation("Choose an event date.");
  if (!validateTimes()) return showFormValidation(els.timeError.textContent || "Enter valid 24-hour event times.");
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
    subject_id: selectedSubjectId,
    // color 不写具体值：事项跟随分类 / 科目的当前颜色，改配色时旧数据一起变。
    source: "web",
    tag_ids: [...selectedTagIds],
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
  pendingDelete = { id, seriesId: seriesId || null, kind: "event" };
  els.deleteModalTitle.textContent = "Delete Event";
  els.confirmTitle.textContent = title || "this event";
  els.confirmDeleteButton.disabled = false;
  els.seriesDeleteActions.hidden = !pendingDelete.seriesId;
  els.confirmDeleteButton.hidden = Boolean(pendingDelete.seriesId);
  els.deleteThisButton.disabled = false;
  els.deleteSeriesButton.disabled = false;
  els.confirmScrim.classList.add("open");
}

function requestDeleteDeadline(id, title) {
  pendingDelete = { id, seriesId: null, kind: "deadline" };
  els.deleteModalTitle.textContent = "Delete Deadline";
  els.confirmTitle.textContent = title || "this deadline";
  els.confirmDeleteButton.disabled = false;
  els.seriesDeleteActions.hidden = true;
  els.confirmDeleteButton.hidden = false;
  els.confirmScrim.classList.add("open");
}

function closeConfirm() {
  els.confirmScrim.classList.remove("open");
  pendingDelete = null;
}

async function confirmDelete(scope = "event") {
  if (!pendingDelete) return;
  if (pendingDelete.kind === "deadline") {
    els.confirmDeleteButton.disabled = true;
    try {
      await apiFetch(`/api/deadlines/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
      closeConfirm();
      showToast("Deadline deleted");
      await refreshVisibleData({ silent: false, force: true });
    } catch (err) {
      showToast(err.message || "Failed to delete deadline.");
    } finally {
      els.confirmDeleteButton.disabled = false;
    }
    return;
  }
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

// ---- Read-only detail window (Event / Deadline) ----

const REMINDER_LABELS = { 10: "10 min before", 15: "15 min before", 30: "30 min before", 60: "1 hour before", 120: "2 hours before", 1440: "1 day before" };

function reminderLabel(minutes) {
  return REMINDER_LABELS[minutes] || `${minutes} min before`;
}

function detailRow(label, valueHtml, valueClass = "") {
  return `<div class="detail-row"><div class="detail-label">${label}</div><div class="detail-value ${valueClass}">${valueHtml}</div></div>`;
}

function focusCalendarOnTarget(kind, row) {
  const value = kind === "deadline" ? row.due_time : row.start_time;
  const targetKey = String(value || "").slice(0, 10);
  if (!isValidDateKey(targetKey)) return;
  selectedDate = parseDateKey(targetKey);
  viewDate = parseDateKey(targetKey);
  lastRangeKey = "";
  render();
  void refreshVisibleData({ silent: true, force: true });
}

async function openDetail(kind, id, { focusDate = false } = {}) {
  closePopover();
  detailContext = { kind, id };
  els.detailCatDot.style.background = "var(--muted)";
  els.detailTitle.textContent = kind === "deadline" ? "Deadline" : "Event";
  els.detailBody.innerHTML = '<div class="detail-skeleton">Loading…</div>';
  els.detailActions.innerHTML = `<button type="button" class="btn-cancel" data-action="close-detail">Close</button>`;
  els.detailScrim.classList.add("open");
  try {
    const path = kind === "deadline" ? `/api/deadlines/${encodeURIComponent(id)}` : `/api/events/${encodeURIComponent(id)}`;
    const response = await apiFetch(path);
    if (!detailContext || detailContext.id !== id) return; // superseded by another open/close
    const data = response.data || {};
    if (focusDate) focusCalendarOnTarget(kind, data);
    if (kind === "deadline") renderDeadlineDetail(data);
    else renderEventDetail(data);
  } catch (err) {
    if (!detailContext || detailContext.id !== id) return;
    els.detailBody.innerHTML = '<div class="detail-skeleton">Failed to load details.</div>';
  }
}

function closeDetail() {
  els.detailScrim.classList.remove("open");
  detailContext = null;
}

function renderEventDetail(row) {
  const event = adaptEvent(row);
  if (!event) { els.detailBody.innerHTML = '<div class="detail-skeleton">Event not found.</div>'; return; }
  const dateText = parseDateKey(event.dateKey).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeText = isAllDayEvent(event) ? "All-day" : `${event.start} – ${event.end}`;
  const reminders = Array.isArray(row.reminders) ? row.reminders : [];
  els.detailCatDot.style.background = event.color;
  els.detailTitle.textContent = event.title;
  const rows = [
    detailRow("Category", `<span class="detail-cat-dot" style="background:${event.color};display:inline-block;vertical-align:middle;margin-right:6px"></span>${escapeHtml(categoryLabel(event))}`),
    detailRow("Date", escapeHtml(dateText)),
    detailRow("Time", escapeHtml(timeText)),
  ];
  if (event.tags.length) rows.push(detailRow("Tags", event.tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag.name)}</span>`).join(" ")));
  if (event.seriesId) rows.push(detailRow("Repeats", "Part of a repeating series"));
  if (!isAllDayEvent(event)) {
    rows.push(detailRow("Reminders", reminders.length ? reminders.map(reminderLabel).map(escapeHtml).join("<br>") : "No reminders", reminders.length ? "" : "muted"));
  }
  rows.push(detailRow("Notes", event.description ? `<span class="detail-desc">${escapeHtml(event.description)}</span>` : "None", event.description ? "" : "muted"));
  els.detailBody.innerHTML = rows.join("");
  els.detailActions.innerHTML = `
    <button type="button" class="btn-delete detail-actions-left" id="detailDeleteBtn">Delete</button>
    <button type="button" class="btn-cancel" data-action="close-detail">Close</button>`;
  document.getElementById("detailDeleteBtn").addEventListener("click", () => {
    closeDetail();
    requestDeleteEvent(event.id, event.title, event.seriesId || "");
  });
}

function renderDeadlineDetail(row) {
  const deadline = adaptDeadline(row);
  if (!deadline) { els.detailBody.innerHTML = '<div class="detail-skeleton">Deadline not found.</div>'; return; }
  const dueDateText = parseDateKey(deadline.dateKey).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const dueText = deadline.allDay ? `${dueDateText} · End of day` : `${dueDateText} · ${deadline.time}`;
  const statusClass = deadline.status === "completed" ? "completed" : deadline.status === "overdue" ? "overdue" : "open";
  const statusText = deadline.status === "completed" ? "Completed" : deadline.status === "overdue" ? "Overdue" : "Open";
  const description = row.description || "";
  els.detailCatDot.style.background = deadline.color;
  els.detailTitle.textContent = deadline.title;
  const rows = [
    detailRow("Category", `<span class="detail-cat-dot" style="background:${deadline.color};display:inline-block;vertical-align:middle;margin-right:6px"></span>${escapeHtml(categoryLabel(deadline))}`),
    detailRow("Priority", `<span class="pri-tag pri-${deadline.priority}" style="--ddl-color:${deadline.color}">${escapeHtml(deadline.priority)}</span>`),
    detailRow("Due", escapeHtml(dueText)),
    detailRow("Status", `<span class="detail-status ${statusClass}">${statusText}</span>`),
    detailRow("Notes", description ? `<span class="detail-desc">${escapeHtml(description)}</span>` : "None", description ? "" : "muted"),
  ];
  if (deadline.tags.length) rows.splice(3, 0, detailRow("Tags", deadline.tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag.name)}</span>`).join(" ")));
  els.detailBody.innerHTML = rows.join("");
  const toggleLabel = deadline.status === "completed" ? "Reopen" : "Complete";
  els.detailActions.innerHTML = `
    <button type="button" class="btn-delete detail-actions-left" id="detailDeleteBtn">Delete</button>
    <button type="button" class="btn-cancel" data-action="close-detail">Close</button>
    <button type="button" class="btn-create" id="detailToggleBtn">${toggleLabel}</button>`;
  document.getElementById("detailDeleteBtn").addEventListener("click", () => {
    closeDetail();
    requestDeleteDeadline(deadline.id, deadline.title);
  });
  document.getElementById("detailToggleBtn").addEventListener("click", () => {
    closeDetail();
    openDeadlineActionConfirm(deadline.id);
  });
}

function toggleAllDayFields() {
  const isAllDay = els.fAllday.checked;
  els.timeFields.style.opacity = isAllDay ? "0.35" : "1";
  els.timeFields.style.pointerEvents = isAllDay ? "none" : "auto";
  els.fStart.disabled = isAllDay;
  els.fEnd.disabled = isAllDay;
  els.reminderFields.hidden = isAllDay;
  previewTimeOrder();
}

function validateTimes() {
  if (els.fAllday.checked) {
    hideTimeError();
    return true;
  }
  if (!isValid24HourTime(els.fStart.value) || !isValid24HourTime(els.fEnd.value)) {
    showTimeError("Enter valid 24-hour times (00:00–23:59).");
    return false;
  }
  const start = timeToMin(els.fStart.value || "00:00");
  const end = timeToMin(els.fEnd.value || "00:00");
  if (end <= start) {
    showTimeError("End time must be after start time.");
    return false;
  }
  hideTimeError();
  return true;
}

function previewTimeOrder() {
  if (els.fAllday.checked || !isValid24HourTime(els.fStart.value) || !isValid24HourTime(els.fEnd.value)) {
    hideTimeError();
    return;
  }
  if (timeToMin(els.fEnd.value) <= timeToMin(els.fStart.value)) {
    showTimeError("End time must be after start time.", { scroll: false });
    return;
  }
  hideTimeError();
}

function validateDeadlineTime() {
  if (els.dAllday.checked || isValid24HourTime(els.dTime.value)) {
    els.dTime.setCustomValidity("");
    els.dTimeError.classList.remove("show");
    els.dTime.style.borderColor = "";
    return true;
  }
  els.dTime.setCustomValidity("Enter a valid 24-hour time (00:00–23:59).");
  els.dTimeError.classList.add("show");
  els.dTime.style.borderColor = "#FF3B30";
  return false;
}

function showTimeError(message, { scroll = true } = {}) {
  const wasShown = els.timeError.classList.contains("show");
  els.timeError.textContent = message;
  els.timeError.classList.add("show");
  els.fEnd.style.borderColor = "#FF3B30";
  if (scroll && !wasShown) els.timeError.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function showFormValidation(message) {
  els.formValidationMessage.textContent = message;
  els.formValidationScrim.classList.add("open");
  setTimeout(() => els.formValidationClose.focus(), 0);
}

function closeFormValidation() {
  els.formValidationScrim.classList.remove("open");
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
  return (eventsByDate.get(isoKey(date)) || []).filter(matchesFilters);
}

function matchesFilters(item) {
  if (!activeFilters.has(item.filterKey || filterKeyOf(item.cat, item.subjectId || null))) return false;
  return activeTagFilters.size === 0 || (item.tags || []).some((tag) => activeTagFilters.has(tag.id));
}

function findDeadline(id) {
  for (const list of deadlinesByDate.values()) {
    const found = list.find((deadline) => deadline.id === id);
    if (found) return found;
  }
  return null;
}

function openDeadlineActionConfirm(id) {
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
  return (deadlinesByDate.get(isoKey(date)) || []).filter(matchesFilters);
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
    .filter(matchesFilters)
    .filter((deadline) => Math.abs((new Date(`${deadline.dateKey}T00:00:00`).getTime() - selectedStart) / 86400000) <= (windowDays[deadline.priority] || 2))
    .sort((a, b) => ({ high: 0, default: 1, low: 2 }[a.priority] - ({ high: 0, default: 1, low: 2 }[b.priority])) || a.dueMs - b.dueMs);
}

function deadlineItemHTML(deadline) {
  const color = deadlineColor(deadline);
  const statusClass = deadline.status === "completed" ? "done" : deadline.status;
  return `<div class="ddl-item ${statusClass}" style="--ddl-color:${color};--ddl-bg:${deadline.bg}" data-deadline-id="${escapeAttr(deadline.id)}">
    <div class="ddl-item-bar"></div>
    <div class="ddl-item-main">
      <div class="ddl-item-title" data-tip="${escapeAttr(deadline.title)}">⚑ ${escapeHtml(deadline.title)}</div>
      <div class="ddl-item-meta"><span class="ddl-meta-main"><span class="pri-tag pri-${deadline.priority}">${deadline.priority}</span>${deadlineDueText(deadline)}</span><span class="ddl-meta-category" data-tip="${escapeAttr(categoryLabel(deadline))}">${escapeHtml(categoryLabel(deadline))}</span></div>
    </div>
    <span class="ddl-item-action">${statusClass === "done" ? "Reopen" : "Complete"}</span>
  </div>`;
}

function ddlRailHTML() {
  const quick = quickDeadlines();
  const active = quick.filter((deadline) => deadline.status !== "completed");
  const completed = quick.filter((deadline) => deadline.status === "completed");
  const visible = active.slice(0, 3);
  const more = active.length - visible.length;
  return `<div class="ddl-rail"><div class="ddl-rail-head"><span>Due soon</span><span>${sameDay(selectedDate, today()) ? "by priority" : `relative to ${pad2(selectedDate.getMonth() + 1)}.${pad2(selectedDate.getDate())}`}</span></div>
    <div class="ddl-rail-body">
    <div class="ddl-list">${visible.length ? visible.map(deadlineItemHTML).join("") : (completed.length ? "" : '<div class="inspector-empty">Nothing due soon.</div>')}</div>
    ${more > 0 ? `<button type="button" class="ddl-more" data-open-quick>+${more} more</button>` : ""}
    ${completed.length ? `<details class="ddl-completed"><summary>${completed.length} completed</summary><div class="ddl-list">${completed.map(deadlineItemHTML).join("")}</div></details>` : ""}
    </div>
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

function isValid24HourTime(time) {
  return /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(time || ""));
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
  if (!rgb) return "var(--fill)";
  // Blend the category color into a theme-aware base so tinted chips stay
  // legible in both light and dark mode (the base flips with the palette).
  return `color-mix(in srgb, rgb(${rgb.r} ${rgb.g} ${rgb.b}) 17%, var(--chip-base))`;
}

// Foreground text color for colored labels. Category colors are mid-dark
// (Tailwind-600-ish) and read poorly as text on a dark tint, so mix toward
// the theme ink: darker in light mode, lighter in dark mode.
function inkColor(color) {
  const rgb = parseHexColor(color);
  if (!rgb) return "var(--ink)";
  return `color-mix(in srgb, rgb(${rgb.r} ${rgb.g} ${rgb.b}) 74%, var(--chip-ink))`;
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

/* ---- Tooltips ---------------------------------------------------------
   原生 title 要悬停 1 秒以上才弹出、样式不可控，而且会被 overflow:hidden 的
   祖先（月视图格子、chip）连同内容一起裁掉。这里用 [data-tip] + 一个挂在
   body 上的 fixed 层代替：80ms 就出现，位置自己算，永远不会被裁。 */
let tipEl = null;
let tipTimer = null;
let tipTarget = null;

function ensureTipEl() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "tip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  return tipEl;
}

function showTip(target) {
  const text = target.dataset.tip;
  if (!text) return;
  // 正在输入的字段不弹，免得挡住光标。
  if (target === document.activeElement && target.matches("input, textarea, select")) return;
  const tip = ensureTipEl();
  tip.textContent = text;
  tip.classList.add("show");
  const rect = target.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const left = Math.min(Math.max(6, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 6);
  // 上方放不下就翻到下方。
  const above = rect.top - height - 7;
  tip.style.left = `${left}px`;
  tip.style.top = `${above >= 6 ? above : Math.min(rect.bottom + 7, window.innerHeight - height - 6)}px`;
  tipTarget = target;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipTarget = null;
  tipEl?.classList.remove("show");
}

function bindTooltips() {
  // 触屏没有 hover：在手机上 tap 会补发一次 mouseover，气泡会赖着不走，
  // 干脆不绑（原生 title 在触屏上同样不显示）。
  if (window.matchMedia("(hover: none)").matches) return;
  document.addEventListener("mouseover", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-tip]") : null;
    if (!target || target === tipTarget) return;
    hideTip();
    tipTimer = setTimeout(() => showTip(target), 80);
  });
  document.addEventListener("mouseout", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-tip]") : null;
    if (!target) return;
    // 移到自己的子节点上不算离开。
    if (event.relatedTarget instanceof Element && target.contains(event.relatedTarget)) return;
    hideTip();
  });
  // 元素一动（滚动、点击后重绘、按 Esc 关弹窗）就撤掉，避免悬空的气泡。
  document.addEventListener("mousedown", hideTip, true);
  document.addEventListener("scroll", hideTip, true);
  document.addEventListener("keydown", hideTip, true);
  window.addEventListener("blur", hideTip);
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

/* =========================================================================
   AppleFX — the fluid-interaction layer (Apple Preview only)
   -------------------------------------------------------------------------
   Layers spring-based, interruptible, velocity-aware motion on top of the
   shared render logic above, without touching it. It works purely by
   observing the `.open` class the app toggles on each `.scrim`, so the data
   and rendering code stays identical to production.

   Principles applied (from the apple-design skill):
     • Response: press feedback is CSS :active (fires on pointer-down).
     • Direct manipulation: sheets track the finger 1:1 with the grab offset.
     • Interruptibility: every animation starts from the live on-screen value
       and can be grabbed mid-flight; velocity is carried through.
     • Behavior over animation: springs, not fixed-duration keyframes.
     • Velocity handoff + momentum projection on release (scroll-style decay).
     • Rubber-banding at the top edge; symmetric enter/exit paths.
   ========================================================================= */
(function AppleFX() {
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const portrait = () => (typeof isPortrait === "function" ? isPortrait() : window.innerWidth < window.innerHeight);

  function haptic(ms) {
    if (reduce()) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
  }

  // Ask the app to hold off on rebuilding the calendar while a spring runs —
  // a mid-flight rebuild of a busy month costs enough frames to be visible.
  function hold(ms) {
    if (typeof holdRenders === "function") holdRenders(ms);
  }

  // Apple's momentum projection (exponential decay, not v²/2a). Section 6.
  function project(velocity, decel = 0.998) {
    return (velocity / 1000) * decel / (1 - decel);
  }

  // Rubber-banding resistance past a boundary. Section 9.
  function rubberband(overshoot, dimension, c = 0.55) {
    return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
  }

  // Interruptible spring integrator, parameterised by response + bounce
  // (Apple's designer-facing model). bounce 0 → critically damped, no overshoot.
  function makeSpring({ from, to, velocity = 0, response = 0.4, bounce = 0, precision = 0.5, onUpdate, onDone }) {
    let value = from;
    let v = velocity;
    let target = to;
    let raf = null;
    let last = null;
    let dead = false;
    const ratio = clamp(1 - bounce, 0.1, 1);
    const omega = (2 * Math.PI) / response;
    const k = omega * omega;
    const c = 2 * ratio * omega;
    const velEps = Math.max(precision * 8, 0.02);

    function frame(ts) {
      if (dead) return;
      if (last == null) last = ts;
      let dt = (ts - last) / 1000;
      last = ts;
      if (dt > 0.064) dt = 0.064; // clamp after a tab-switch stall
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = -k * (value - target) - c * v;
        v += a * h;
        value += v * h;
      }
      if (Math.abs(value - target) < precision && Math.abs(v) < velEps) {
        value = target;
        onUpdate(value, 0);
        dead = true;
        if (onDone) onDone();
        return;
      }
      onUpdate(value, v);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      setTarget(t) { target = t; },
      retarget(t, keepVel) { target = t; if (!keepVel) v = 0; },
      get value() { return value; },
      get vel() { return v; },
      stop() { dead = true; if (raf) cancelAnimationFrame(raf); raf = null; },
    };
  }

  // ---- Sheet / modal present + dismiss + drag ---------------------------
  class Sheet {
    constructor(scrim) {
      this.scrim = scrim;
      this.modal = scrim.querySelector(".modal");
      this.spring = null;
      this.ty = 0;            // portrait translateY in px
      this.p = 0;             // desktop progress 0..1
      this.sheetHeight = 0;
      this.dragging = false;
      this.history = [];
      this.wasOpen = false;
      // Rest hidden: inline opacity 0 wins over CSS .scrim.open so there's no flash.
      this.scrim.style.opacity = "0";
      this.scrim.style.transition = "none";
      this.modal.style.transition = "none";
      this._observe();
      this._bindDrag();
    }

    _observe() {
      const obs = new MutationObserver(() => {
        const open = this.scrim.classList.contains("open");
        if (open === this.wasOpen) return;
        this.wasOpen = open;
        if (open) this.present();
        else this.dismiss(this._releaseVel || 0);
        this._releaseVel = 0;
      });
      obs.observe(this.scrim, { attributes: true, attributeFilter: ["class"] });
    }

    _measureSheetHeight() {
      this.sheetHeight = this.modal.offsetHeight + 56;
      return this.sheetHeight;
    }

    _applyPortrait() {
      this.modal.style.transform = `translateY(${this.ty}px)`;
      const h = this.sheetHeight || this._measureSheetHeight();
      this.scrim.style.opacity = String(clamp(1 - this.ty / h, 0, 1));
    }
    _applyDesktop() {
      const s = 0.96 + 0.04 * this.p;
      const y = (1 - this.p) * 8;
      this.modal.style.transform = `translateY(${y}px) scale(${s})`;
      this.scrim.style.opacity = String(clamp(this.p, 0, 1));
    }

    present() {
      if (this.spring) this.spring.stop();
      hold(420);
      if (reduce()) { this._fade(1); return; }
      if (portrait()) {
        const h = this._measureSheetHeight();
        this.ty = this.dragging ? this.ty : h;
        this._applyPortrait();
        this.spring = makeSpring({
          from: this.ty, to: 0, velocity: 0, response: 0.22, bounce: 0.04, precision: 0.5,
          onUpdate: (val) => { this.ty = val; this._applyPortrait(); },
          onDone: () => { this.ty = 0; this._applyPortrait(); },
        });
      } else {
        this.p = 0;
        this._applyDesktop();
        this.spring = makeSpring({
          from: 0, to: 1, velocity: 0, response: 0.26, bounce: 0.06, precision: 0.004,
          onUpdate: (val) => { this.p = val; this._applyDesktop(); },
        });
      }
    }

    dismiss(releaseVel) {
      if (this.spring) this.spring.stop();
      hold(420);
      if (reduce()) { this._fade(0); return; }
      if (portrait()) {
        const h = this._measureSheetHeight();
        this.spring = makeSpring({
          from: this.ty, to: h, velocity: releaseVel || 0, response: 0.22, bounce: 0, precision: 0.5,
          onUpdate: (val) => { this.ty = val; this._applyPortrait(); },
          onDone: () => { this._reset(); },
        });
      } else {
        this.spring = makeSpring({
          from: this.p, to: 0, velocity: 0, response: 0.24, bounce: 0, precision: 0.004,
          onUpdate: (val) => { this.p = val; this._applyDesktop(); },
          onDone: () => { this._reset(); },
        });
      }
    }

    // Reduced-motion equivalent: a short opacity cross-fade, no transform.
    _fade(to) {
      this.modal.style.transform = "none";
      this.scrim.style.transition = "opacity .18s ease";
      requestAnimationFrame(() => { this.scrim.style.opacity = String(to); });
      if (to === 0) setTimeout(() => this._reset(), 200);
    }

    _reset() {
      this.scrim.style.opacity = "0";
      this.scrim.style.transition = "none";
      this.modal.style.transform = "";
      this.ty = 0; this.p = 0; this.sheetHeight = 0;
    }

    _vel() {
      const h = this.history;
      if (h.length < 2) return 0;
      const a = h[0], b = h[h.length - 1];
      const dt = (b.t - a.t) / 1000;
      return dt > 0 ? (b.y - a.y) / dt : 0;
    }

    _bindDrag() {
      const ignore = "input,select,textarea,button,[contenteditable],.event-form-body,.ddl-form-body,.detail-body,.notifications-list,.repeat-panel";
      this.modal.addEventListener("pointerdown", (e) => {
        if (!portrait() || reduce()) return;
        const grab = e.target.closest(".sheet-grab");
        if (!grab && e.target.closest(ignore)) return; // let inputs / scroll work
        if (this.spring) this.spring.stop();            // grab mid-flight (interruptible)
        this.dragging = true;
        this.startY = e.clientY;
        this.startTy = this.ty;
        this.history = [{ t: performance.now(), y: e.clientY }];
        this.modal.setPointerCapture(e.pointerId);
      });
      this.modal.addEventListener("pointermove", (e) => {
        if (!this.dragging) return;
        let ty = this.startTy + (e.clientY - this.startY);
        if (ty < 0) ty = rubberband(ty, window.innerHeight); // resist dragging up
        this.ty = ty;
        this._applyPortrait();
        this.history.push({ t: performance.now(), y: e.clientY });
        if (this.history.length > 6) this.history.shift();
      });
      const end = (e) => {
        if (!this.dragging) return;
        this.dragging = false;
        try { this.modal.releasePointerCapture(e.pointerId); } catch (_) {}
        const vel = this._vel();
        const h = this._measureSheetHeight();
        const projected = this.ty + project(vel);
        if (projected > h * 0.32 || vel > 850) {
          // Commit dismiss: remove .open and let the observer animate out from
          // the current position, carrying the release velocity.
          haptic(9);
          this._releaseVel = vel;
          this._close();
        } else {
          this.spring = makeSpring({
            from: this.ty, to: 0, velocity: vel, response: 0.4, bounce: 0.1, precision: 0.5,
            onUpdate: (val) => { this.ty = val; this._applyPortrait(); },
            onDone: () => { this.ty = 0; this._applyPortrait(); },
          });
        }
      };
      this.modal.addEventListener("pointerup", end);
      this.modal.addEventListener("pointercancel", end);
    }

    // Trigger the app's own close path (keeps its state cleanup intact).
    _close() {
      const id = this.scrim.id;
      const map = {
        eventScrim: closeModal, formValidationScrim: closeFormValidation, confirmScrim: closeConfirm, completeScrim: closeComplete,
        reopenScrim: closeReopen, detailScrim: closeDetail, notificationsScrim: closeNotifications,
        subscriptionsScrim: closeSubscriptions,
      };
      const fn = map[id];
      if (fn) fn(); else this.scrim.classList.remove("open");
    }
  }

  // ---- Swipe between periods (month view + portrait) --------------------
  function bindSwipe() {
    const cal = document.getElementById("calCol");
    if (!cal) return;
    let active = false, decided = false, sx = 0, sy = 0, tx = 0, hist = [], w = 0;

    const enabled = () => (typeof currentView === "undefined" ? true : currentView === "month") || portrait();

    cal.addEventListener("pointerdown", (e) => {
      if (!enabled() || e.pointerType === "mouse" && e.button !== 0) return;
      active = true; decided = false; sx = e.clientX; sy = e.clientY; tx = 0;
      w = cal.clientWidth || window.innerWidth;
      hist = [{ t: performance.now(), x: e.clientX }];
    });
    cal.addEventListener("pointermove", (e) => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { active = false; return; } // vertical → let it scroll
        decided = true;
        try { cal.setPointerCapture(e.pointerId); } catch (_) {}
      }
      tx = dx;
      hist.push({ t: performance.now(), x: e.clientX });
      if (hist.length > 6) hist.shift();
      if (reduce()) return;
      cal.style.transform = `translateX(${tx}px)`;
      cal.style.opacity = String(clamp(1 - Math.abs(tx) / (w * 2.2), 0.35, 1));
    });
    const finish = (e) => {
      if (!active) return;
      active = false;
      if (!decided) return;
      try { cal.releasePointerCapture(e.pointerId); } catch (_) {}
      const a = hist[0], b = hist[hist.length - 1];
      const dt = b && a ? (b.t - a.t) / 1000 : 0;
      const vel = dt > 0 ? (b.x - a.x) / dt : 0;
      const projected = tx + project(vel);
      const commit = Math.abs(projected) > w * 0.3 || Math.abs(vel) > 500;
      if (commit && typeof navigate === "function") {
        const dir = (projected < 0) ? 1 : -1; // swipe left → next period
        haptic(8);
        navigate(dir);
        if (reduce()) { cal.style.transform = ""; cal.style.opacity = ""; return; }
        // navigate() has already painted the new period; keep the slide-in
        // clear of the background refresh that follows it.
        hold(600);
        // New content slides in from the swipe direction (symmetric path §7),
        // continuing from where the finger left off, with velocity handoff.
        const startX = dir === 1 ? (w + tx) : (tx - w);
        cal.style.transform = `translateX(${startX}px)`;
        cal.style.opacity = "1";
        const sp = makeSpring({
          from: startX, to: 0, velocity: vel, response: 0.44, bounce: 0.08, precision: 0.5,
          onUpdate: (val) => { cal.style.transform = `translateX(${val}px)`; },
          onDone: () => { cal.style.transform = ""; },
        });
        void sp;
      } else if (reduce()) {
        cal.style.transform = ""; cal.style.opacity = "";
      } else {
        // Cancelled — spring back with the finger's velocity.
        hold(500);
        makeSpring({
          from: tx, to: 0, velocity: vel, response: 0.4, bounce: 0.12, precision: 0.5,
          onUpdate: (val) => { cal.style.transform = `translateX(${val}px)`; cal.style.opacity = String(clamp(1 - Math.abs(val) / (w * 2.2), 0.35, 1)); },
          onDone: () => { cal.style.transform = ""; cal.style.opacity = ""; },
        });
      }
    };
    cal.addEventListener("pointerup", finish);
    cal.addEventListener("pointercancel", finish);
  }

  function start() {
    document.body.classList.add("fx-on");
    document.querySelectorAll(".scrim").forEach((scrim) => new Sheet(scrim));
    bindSwipe();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
