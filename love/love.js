(function () {
  "use strict";

  var SESSION_KEY = "love-admin-session-v1";
  var SESSION_TTL_FALLBACK = 2 * 60 * 60 * 1000;
  var TZ = "Asia/Shanghai";

  var CATEGORY_LABELS = {
    birthday: "生日",
    anniversary: "纪念日",
    valentine: "情人节",
    date: "约会啦",
    milestone: "大事记"
  };
  var EVENT_KIND_LABELS = {
    birthday: "生日",
    anniversary: "纪念日",
    valentine: "情人节",
    qixi: "七夕",
    meeting: "见面",
    custom: "自定义"
  };
  var ENTITY_LABELS = {
    event: "重要日子",
    bucket: "共同清单",
    timeline: "约会 / 大事记",
    person: "两个人",
    room: "信息墙文案",
    profile: "偏好档案"
  };
  var ACTION_LABELS = {
    create: "新增",
    update: "修改",
    archive: "归档",
    restore: "恢复"
  };
  var MOODS = {
    happy: { emoji: "😄", label: "开心" },
    calm: { emoji: "🙂", label: "平静" },
    okay: { emoji: "😐", label: "一般" },
    tired: { emoji: "😪", label: "有点累" },
    tension: { emoji: "🥲", label: "有点小矛盾" },
    sad: { emoji: "😢", label: "难过" }
  };
  var GAP_DAYS = 30;
  var GAP_DISMISS_KEY = "love-gap-dismissed-v1";
  var TABS = [
    { key: "all", label: "全部" },
    { key: "birthday", label: "生日" },
    { key: "anniversary", label: "纪念日" },
    { key: "valentine", label: "情人节" },
    { key: "date", label: "约会啦" },
    { key: "milestone", label: "大事记" }
  ];

  var state = {
    token: "",
    person: "",
    expiresAt: "",
    data: null,
    dayFilter: "all",
    editingEvent: null,
    editingTimeline: null,
    editingBucket: null,
    aiPlan: null,
    aiBusy: false,
    eventBusy: false,
    timelineBusy: false,
    bucketBusy: false,
    moodBusy: false,
    moodDate: "",
    drawBusy: false,
    drawIdea: null,
    drawRecent: [],
    drawRequestSeq: 0,
    drawTimer: 0,
    giftWishLoaded: false,
    giftWishOpen: false,
    giftWishBusy: false,
    giftPlan: null,
    giftPlanOccasion: "",
    giftPlanBusy: false,
    giftHintBusy: false,
    periodEditing: null,
    periodBusy: false,
    periodTipCache: {},
    periodTipTried: {},
    periodTipLoading: ""
  };

  var data = {
    room: {}, people: [], events: [], bucketList: [], timeline: [], moods: [],
    period: { logs: [], summaries: {} }
  };
  var today = "";
  var cal = { y: 0, m: 1, selected: "" };
  var apiBaseCache = "";
  var toastTimer = 0;
  var confirmResolve = null;

  /* ---------- 小工具 ---------- */

  var $ = function (selector, scope) {
    return (scope || document).querySelector(selector);
  };
  var $$ = function (selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function named(form, name) {
    return form ? form.elements[name] : null;
  }

  function valueOf(form, name) {
    var field = named(form, name);
    return field ? String(field.value || "").trim() : "";
  }

  function isChecked(form, name) {
    var field = named(form, name);
    return !!(field && field.checked);
  }

  function setText(selector, value) {
    var node = $(selector);
    if (node) node.textContent = value == null ? "" : String(value);
  }

  function setError(node, message) {
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = !!busy;
    if (label) button.textContent = label;
  }

  function personLabel(id) {
    if (id === "jmj") return "鸡毛鸡";
    if (id === "bxb") return "白小白";
    return id || "";
  }

  // 心情按天、按人记。服务端只会返回「我自己的」和「对方公开的」，
  // 所以对方没公开和没记录在这里长得一模一样，都是查不到这一行。
  function moodRowOf(iso, person) {
    for (var i = 0; i < data.moods.length; i++) {
      var row = data.moods[i];
      if (row && row.date === iso && row.person === person) return row;
    }
    return null;
  }

  function moodMetaOf(row) {
    if (!row || typeof row.mood !== "string") return null;
    return MOODS[row.mood] || null;
  }

  function isMyMood(row) {
    return !!row && row.person === state.person;
  }

  function moodSlotText(row) {
    var meta = moodMetaOf(row);
    if (!meta) return "";
    var text = meta.emoji + " " + meta.label;
    if (isMyMood(row) && row.shared === false) text += " · 只我可见";
    return text;
  }

  function moodPersonName(personId) {
    for (var i = 0; i < data.people.length; i++) {
      var person = data.people[i];
      if (person && person.id === personId && person.name) return person.name;
    }
    return personLabel(personId);
  }

  function toast(message, isError) {
    var box = $("[data-toast]");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("is-error", !!isError);
    box.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      box.hidden = true;
    }, 3800);
  }

  function formatAuditTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return String(iso || "").slice(0, 16).replace("T", " ");
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(date);
      var map = {};
      parts.forEach(function (part) { map[part.type] = part.value; });
      if (map.month && map.day) {
        return Number(map.month) + "月" + Number(map.day) + "日 " + (map.hour || "00") + ":" + (map.minute || "00");
      }
    } catch (e) { /* 兜底 */ }
    return String(iso || "").slice(5, 16).replace("T", " ");
  }

  /* ---------- 主题 ---------- */

  var root = document.documentElement;
  var themeButton = $("[data-theme-toggle]");

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (themeButton) {
      themeButton.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1726" : "#E8F1F8");
  }

  function toggleTheme() {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      var stored = JSON.parse(localStorage.getItem("REDEFINE-THEME-STATUS") || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem("REDEFINE-THEME-STATUS", JSON.stringify(stored));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------- 日期：全部按 Asia/Shanghai 的日历日算 ---------- */

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function todayISO() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (part) { map[part.type] = part.value; });
      if (map.year && map.month && map.day) {
        return map.year + "-" + map.month + "-" + map.day;
      }
    } catch (e) { /* 老浏览器走本地日期兜底 */ }
    var now = new Date();
    return formatISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function formatISO(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function splitISO(iso) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!matched) return null;
    var year = Number(matched[1]);
    var month = Number(matched[2]);
    var day = Number(matched[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year
      || check.getUTCMonth() !== month - 1
      || check.getUTCDate() !== day) return null;
    return { y: year, m: month, d: day };
  }

  function dayNumber(iso) {
    var parts = splitISO(iso);
    if (!parts) return NaN;
    return Math.floor(Date.UTC(parts.y, parts.m - 1, parts.d) / 86400000);
  }

  function diffDays(fromISO, toISO) {
    var from = dayNumber(fromISO);
    var to = dayNumber(toISO);
    if (!isFinite(from) || !isFinite(to)) return NaN;
    return Math.round(to - from);
  }

  function addDays(iso, amount) {
    var parts = splitISO(iso);
    if (!parts) return iso;
    var date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + amount));
    return formatISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function weekdayOf(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function formatDateCN(iso, withWeekday) {
    var parts = splitISO(iso);
    if (!parts) return "";
    var text = parts.y + "年" + parts.m + "月" + parts.d + "日";
    if (withWeekday) text += " · 周" + "日一二三四五六".charAt(weekdayOf(parts.y, parts.m, parts.d));
    return text;
  }

  function formatShort(iso) {
    var parts = splitISO(iso);
    return parts ? pad2(parts.m) + "." + pad2(parts.d) : "";
  }

  function monthDay(value) {
    var matched = /^(\d{2})-(\d{2})$/.exec(String(value || ""));
    return matched ? Number(matched[1]) + "." + matched[2] : "";
  }

  function dateDot(value) {
    return String(value || "").replace(/-/g, ".");
  }

  function sortedBirthdayPeople() {
    return data.people.slice().sort(function (a, b) {
      return String(a.birthday || "").localeCompare(String(b.birthday || ""));
    });
  }

  /* ---------- 事件展开 ---------- */

  function yearlySeed(event, year) {
    var date = String(event.date || "");
    var seed = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) seed = date.slice(5);
    else if (/^\d{2}-\d{2}$/.test(date)) seed = date;
    if (!seed) return [];
    if (seed === "02-29" && !isLeapYear(year)) return [];
    var iso = year + "-" + seed;
    return splitISO(iso) ? [iso] : [];
  }

  function occurrencesInYear(event, year) {
    if (!event) return [];
    if (event.repeat === "dates") {
      return (Array.isArray(event.dates) ? event.dates : [])
        .filter(function (date) { return splitISO(date) && Number(date.slice(0, 4)) === year; })
        .sort();
    }
    if (event.repeat === "yearly") return yearlySeed(event, year);
    if (event.repeat === "none") {
      return splitISO(event.date) && Number(event.date.slice(0, 4)) === year ? [event.date] : [];
    }
    return [];
  }

  function nextOccurrence(event, fromISO) {
    if (!event) return null;
    if (event.repeat === "dates") {
      var dates = (Array.isArray(event.dates) ? event.dates : [])
        .filter(function (date) { return splitISO(date); })
        .sort();
      for (var i = 0; i < dates.length; i++) {
        if (dates[i] >= fromISO) return dates[i];
      }
      return null;
    }
    if (event.repeat === "none") {
      return splitISO(event.date) && event.date >= fromISO ? event.date : null;
    }
    if (event.repeat === "yearly") {
      var startYear = Number(fromISO.slice(0, 4)) || new Date().getFullYear();
      for (var year = startYear; year <= startYear + 8; year++) {
        var list = occurrencesInYear(event, year);
        for (var j = 0; j < list.length; j++) {
          if (list[j] >= fromISO) return list[j];
        }
      }
    }
    return null;
  }

  function recentOccurrence(event, fromISO) {
    if (!event) return null;
    if (event.repeat === "dates") {
      var dates = (Array.isArray(event.dates) ? event.dates : [])
        .filter(function (date) { return splitISO(date) && date <= fromISO; })
        .sort();
      return dates.length ? dates[dates.length - 1] : null;
    }
    if (event.repeat === "none") {
      return splitISO(event.date) && event.date <= fromISO ? event.date : null;
    }
    if (event.repeat === "yearly") {
      var startYear = Number(fromISO.slice(0, 4));
      for (var year = startYear; year >= startYear - 2; year--) {
        var list = occurrencesInYear(event, year).filter(function (date) { return date <= fromISO; });
        if (list.length) return list[list.length - 1];
      }
    }
    return null;
  }

  function eventsOnDate(iso) {
    var year = Number(String(iso).slice(0, 4));
    return data.events.filter(function (event) {
      return !event.archived && occurrencesInYear(event, year).indexOf(iso) !== -1;
    });
  }

  function timelineOnDate(iso) {
    return data.timeline.filter(function (item) {
      return !item.archived && item.date === iso;
    });
  }

  function repeatLabel(event) {
    if (!event) return "";
    if (event.repeat === "yearly") return "每年";
    if (event.repeat === "none") return "仅一次";
    if (event.repeat === "dates") return "指定日期";
    return "";
  }

  function shortCountdown(iso, fromISO) {
    var days = diffDays(fromISO, iso);
    if (!isFinite(days)) return "待定";
    if (days === 0) return "今天";
    if (days === 1) return "明天";
    if (days > 1) return days + " 天后";
    return "已过 " + Math.abs(days) + " 天";
  }

  function countdownParts(iso, fromISO) {
    var days = diffDays(fromISO, iso);
    if (!isFinite(days)) return { value: "--", unit: "" };
    if (days === 0) return { value: "今天", unit: "就是今天", word: true };
    if (days === 1) return { value: "1", unit: "明天" };
    if (days > 1) return { value: String(days), unit: "天后" };
    return { value: String(Math.abs(days)), unit: "已过", past: true };
  }

  /* ---------- 合并分类 ---------- */

  function isImportantEvent(event) {
    return !!event && (event.kind === "birthday" || event.kind === "anniversary"
      || event.kind === "valentine" || event.kind === "qixi");
  }

  function categoryOf(entry) {
    if (entry.source === "timeline") {
      return entry.item.kind === "milestone" ? "milestone" : "date";
    }
    var kind = entry.item.kind;
    if (kind === "birthday") return "birthday";
    if (kind === "valentine" || kind === "qixi") return "valentine";
    if (kind === "meeting") return "date";
    return "anniversary";
  }

  function toneOf(entry) {
    if (entry.source === "timeline") {
      return entry.item.kind === "milestone" ? "milestone" : "date";
    }
    return entry.item.kind || "custom";
  }

  function categoryLabel(entry) {
    return CATEGORY_LABELS[categoryOf(entry)] || "重要日子";
  }

  function entryMeta(entry) {
    if (entry.source === "timeline") return categoryLabel(entry);
    var repeat = repeatLabel(entry.item);
    return repeat ? EVENT_KIND_LABELS[entry.item.kind] + " · " + repeat : (EVENT_KIND_LABELS[entry.item.kind] || "重要日子");
  }

  function entryTitle(entry) {
    return entry.item.title || (entry.source === "timeline" ? "约会记录" : "重要日子");
  }

  function buildEntries() {
    var list = [];

    data.events.forEach(function (event) {
      if (!event || event.archived) return;
      var next = nextOccurrence(event, today);
      var date = next || recentOccurrence(event, today) || "";
      list.push({
        source: "event",
        id: event.id,
        item: event,
        date: date,
        past: !!date && date < today,
        hasDate: !!date
      });
    });

    data.timeline.forEach(function (item) {
      if (!item || item.archived) return;
      var date = splitISO(item.date) ? item.date : "";
      list.push({
        source: "timeline",
        id: item.id,
        item: item,
        date: date,
        past: !!date && date < today,
        hasDate: !!date
      });
    });

    list.forEach(function (entry) {
      entry.category = categoryOf(entry);
      entry.tone = toneOf(entry);
    });

    list.sort(function (a, b) {
      if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
      if (!a.hasDate) return String(entryTitle(a)).localeCompare(String(entryTitle(b)), "zh");
      var aFuture = a.date >= today;
      var bFuture = b.date >= today;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      if (a.date !== b.date) {
        if (aFuture) return a.date < b.date ? -1 : 1;
        return a.date > b.date ? -1 : 1;
      }
      return String(entryTitle(a)).localeCompare(String(entryTitle(b)), "zh");
    });

    return list;
  }

  function findNextImportant(fromISO) {
    var candidates = [];
    data.events.forEach(function (event) {
      if (!event || event.archived || !isImportantEvent(event)) return;
      var iso = nextOccurrence(event, fromISO);
      if (iso) candidates.push({ event: event, iso: iso });
    });
    candidates.sort(function (a, b) {
      if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
      return String(a.event.title || "").localeCompare(String(b.event.title || ""), "zh");
    });
    return candidates[0] || null;
  }

  /* ---------- 渲染：登录前后的壳 ---------- */

  var loginView = $("[data-login-view]");
  var appView = $("[data-app-view]");
  var loginForm = $("[data-login-form]");
  var loginError = $("[data-login-error]");
  var loginSubmit = $("[data-login-submit]");
  var logoutButton = $("[data-logout]");
  var appMeta = $("[data-app-meta]");

  function showLogin(message) {
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    setError(loginError, message || "");
    if (loginForm) {
      var keyInput = named(loginForm, "key");
      if (keyInput) {
        keyInput.value = "";
        try { keyInput.focus(); } catch (e) { /* ignore */ }
      }
    }
  }

  function showApp() {
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
  }

  function updateMeta() {
    if (!appMeta) return;
    if (!state.token) {
      appMeta.textContent = "";
      return;
    }
    var expires = new Date(state.expiresAt).getTime();
    if (!isFinite(expires) || expires <= Date.now()) {
      clearSession();
      showLogin("登录已过期，请重新输入密钥。");
      return;
    }
    var minutes = Math.ceil((expires - Date.now()) / 60000);
    var leftText = minutes >= 60
      ? Math.floor(minutes / 60) + " 小时 " + (minutes % 60) + " 分"
      : minutes + " 分钟";
    appMeta.textContent = "以 " + personLabel(state.person) + " 的身份查看 · 登录还剩 " + leftText;
  }

  /* ---------- 登录状态 ---------- */

  function saveSession() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: state.token,
        person: state.person,
        expiresAt: state.expiresAt
      }));
    } catch (e) { /* 隐私模式就不记住，不影响本次使用 */ }
  }

  function readSession() {
    try {
      var raw = window.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      return saved && saved.token ? saved : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    state.token = "";
    state.person = "";
    state.expiresAt = "";
    state.data = null;
    state.giftWishLoaded = false;
    state.giftPlan = null;
    state.giftPlanOccasion = "";
    state.periodEditing = null;
    state.periodTipCache = {};
    state.periodTipTried = {};
    state.periodTipLoading = "";
    var wishForm = $("[data-gift-wish-form]");
    if (wishForm) wishForm.reset();
    setGiftWishOpen(false);
    var wishStatus = $("[data-gift-wish-status]");
    if (wishStatus) wishStatus.textContent = "";
    clearGiftPlanResult();
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function loginErrorMessage(error) {
    if (!error) return "登录没有成功。";
    if (!error.status && (error.name === "TypeError" || /fetch|network/i.test(error.message || ""))) {
      return "连不上 Love API（两个入口都没连上）。请确认地址是 https://xm9.asia/love/，换个网络或关掉代理后再试。";
    }
    if (error.status === 429) {
      var until = error.payload && error.payload.until;
      if (until) {
        var time = formatAuditTime(until);
        if (time) return "错误次数太多，已经锁定到 " + time + "。";
      }
      return "错误次数太多，请过一会儿再试。";
    }
    if (error.status === 401) return "密钥不对，再想想。";
    return error.message || "登录没有成功。";
  }

  /* ---------- API ---------- */

  function apiBases() {
    if (typeof window.LOVE_API_BASE === "string" && window.LOVE_API_BASE) {
      return [String(window.LOVE_API_BASE).replace(/\/+$/, "")];
    }
    var host = window.location.hostname;
    if (host === "xm9.asia" || host === "www.xm9.asia") {
      return ["https://xm9.asia/love-api", "https://love-api.xm9.asia"];
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
      return ["http://127.0.0.1:8787"];
    }
    return ["https://love-api.xm9.asia", "https://xm9.asia/love-api"];
  }

  function orderedApiBases() {
    var bases = apiBases();
    if (apiBaseCache && bases.indexOf(apiBaseCache) !== -1) {
      return [apiBaseCache].concat(bases.filter(function (item) { return item !== apiBaseCache; }));
    }
    return bases;
  }

  function api(path, options) {
    var opts = options || {};
    var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    var body = opts.body;
    if (body !== undefined && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    if (state.token) headers.Authorization = "Bearer " + state.token;

    var bases = orderedApiBases();
    // 只在安全请求上自动换备用地址：GET 和登录。写操作不重试，避免网络抖动导致重复提交。
    var allowFallback = (opts.method || "GET") === "GET" || path === "/v1/session";

    function canFallback(error) {
      if (!error) return true;
      if (!error.status) return true;
      return error.status === 404 || error.status === 405 || error.status >= 500;
    }

    function requestAt(index) {
      var base = bases[index];
      return window.fetch(base + path, {
        method: opts.method || "GET",
        headers: headers,
        body: body,
        mode: "cors",
        credentials: "omit",
        cache: "no-store"
      }).then(function (response) {
        return response.text().then(function (text) {
          var payload = null;
          try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
          if (!response.ok) {
            var error = new Error((payload && payload.message) || ("请求失败（" + response.status + "）"));
            error.status = response.status;
            error.payload = payload;
            throw error;
          }
          apiBaseCache = base;
          return payload;
        });
      }).catch(function (error) {
        if (allowFallback && canFallback(error) && index + 1 < bases.length) {
          return requestAt(index + 1);
        }
        throw error;
      });
    }

    return requestAt(0);
  }

  function fail(error, fallback) {
    if (error && error.status === 401) {
      clearSession();
      showLogin("登录已失效，请重新输入密钥。");
      return;
    }
    toast((error && error.message) || fallback || "操作没有成功，请再试一次。", true);
  }

  /* ---------- 渲染：信息墙 ---------- */

  function renderHero() {
    var room = data.room || {};
    var pageTitle = room.title || "鸡毛鸡和白小白";
    var titleNode = $("[data-love-title]");
    if (titleNode) {
      titleNode.innerHTML = "";
      var titleParts = String(pageTitle).split("和");
      var left = titleParts[0] || pageTitle;
      var right = titleParts.length > 1 ? titleParts.slice(1).join("和") : "";
      var leftSpan = document.createElement("span");
      leftSpan.textContent = left;
      titleNode.appendChild(leftSpan);
      if (right) {
        var andNode = document.createElement("em");
        andNode.textContent = "和";
        titleNode.appendChild(andNode);
        var rightSpan = document.createElement("span");
        rightSpan.textContent = right;
        titleNode.appendChild(rightSpan);
      }
    }

    setText("[data-love-eyebrow]", room.eyebrow || "OUR LITTLE UNIVERSE");
    setText("[data-love-subtitle]", room.subtitle || "把重要的日子，都放在这里。");
    setText("[data-love-since]", dateDot(room.togetherSince || "2024-12-25"));
    setText("[data-love-postcard-note]", room.postcardNote || "把普通的日子，过成值得记住的日子。");
    setText("[data-love-note]", room.readOnlyNote || "这里记录我们两个人的小事。");
    setText("[data-love-footer-title]", pageTitle);
    setText("[data-love-footer-updated]", dateDot(room.updatedAt || "") || "—");
    setText("[data-love-footer-note]", room.footerNote ? " · " + room.footerNote : "");
    document.title = pageTitle + " · 秘密基地";
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", pageTitle + "的小小信息墙：重要日子、日历和共同清单。");

    var peopleNode = $("[data-love-people]");
    if (peopleNode) {
      peopleNode.innerHTML = "";
      data.people.forEach(function (person) {
        var chip = el("span", "l-person");
        var emoji = el("span", "l-person-emoji", person.emoji || "♡");
        emoji.setAttribute("aria-hidden", "true");
        var copy = el("span", "l-person-copy");
        copy.appendChild(el("strong", "", person.name || ""));
        copy.appendChild(el("small", "", monthDay(person.birthday)));
        chip.appendChild(emoji);
        chip.appendChild(copy);
        peopleNode.appendChild(chip);
      });
    }

    var stampNode = $("[data-love-stamp]");
    if (stampNode) {
      stampNode.innerHTML = "";
      sortedBirthdayPeople().forEach(function (person) {
        if (!person.birthday) return;
        stampNode.appendChild(el("b", "", monthDay(person.birthday)));
      });
      stampNode.hidden = !stampNode.childNodes.length;
    }
  }

  function renderTogether() {
    var target = $("[data-love-together-days]");
    if (!target) return;
    var since = splitISO(data.room.togetherSince) ? data.room.togetherSince : "2024-12-25";
    var elapsed = diffDays(since, today);
    target.textContent = String(isFinite(elapsed) && elapsed >= 0 ? elapsed + 1 : 0);
  }

  function renderNext() {
    var titleNode = $("[data-love-next-title]");
    var dateNode = $("[data-love-next-date]");
    var daysNode = $("[data-love-next-days]");
    var unitNode = $("[data-love-next-unit]");
    var noteNode = $("[data-love-next-note]");
    var jump = $("[data-love-next-jump]");
    if (!titleNode || !dateNode || !daysNode || !unitNode || !noteNode) return;

    var next = findNextImportant(today);

    if (!next) {
      titleNode.textContent = "还没有新的日子";
      dateNode.textContent = "下去添一个生日或纪念日吧";
      daysNode.textContent = "--";
      daysNode.classList.remove("is-word", "is-past");
      unitNode.textContent = "";
      noteNode.textContent = "";
      if (jump) jump.hidden = true;
      return;
    }

    var parts = countdownParts(next.iso, today);
    titleNode.textContent = next.event.title || "下一个重要日子";
    dateNode.textContent = formatDateCN(next.iso, true) + " · " + (EVENT_KIND_LABELS[next.event.kind] || "重要日子");
    daysNode.textContent = parts.value;
    daysNode.classList.toggle("is-word", !!parts.word);
    daysNode.classList.toggle("is-past", !!parts.past);
    unitNode.textContent = parts.unit;
    noteNode.textContent = next.event.note || "这一天，记得留一点时间给我们。";
    if (jump) {
      jump.hidden = false;
      jump.setAttribute("data-date", next.iso);
    }
  }

  /* ---------- 纪念日空窗期提示 ---------- */

  function hasPlansWithin(days) {
    var last = addDays(today, days);
    var hasEvent = data.events.some(function (event) {
      if (!event || event.archived) return false;
      var iso = nextOccurrence(event, today);
      return !!iso && iso <= last;
    });
    if (hasEvent) return true;
    return data.timeline.some(function (item) {
      return !!item && !item.archived && splitISO(item.date)
        && item.date >= today && item.date <= last;
    });
  }

  function nearestWeekend(iso) {
    var parts = splitISO(iso);
    if (!parts) return "";
    var weekday = weekdayOf(parts.y, parts.m, parts.d);
    if (weekday === 0 || weekday === 6) return iso;
    return addDays(iso, 6 - weekday);
  }

  function readGapDismissed() {
    try {
      var saved = JSON.parse(localStorage.getItem(GAP_DISMISS_KEY) || "null");
      return saved && saved.weekend ? String(saved.weekend) : "";
    } catch (e) {
      return "";
    }
  }

  function dismissGap(weekend) {
    if (!weekend) return;
    try {
      localStorage.setItem(GAP_DISMISS_KEY, JSON.stringify({ weekend: weekend }));
    } catch (e) { /* 隐私模式就不记，下次刷新还会出现 */ }
  }

  function renderGapHint() {
    var box = $("[data-gap-hint]");
    if (!box) return;
    var parts = splitISO(today);
    var weekday = parts ? weekdayOf(parts.y, parts.m, parts.d) : -1;
    // 只在周三到周六提周末的事，其他日子不弹，免得天天看到。
    if (weekday < 3 || weekday > 6) {
      box.hidden = true;
      return;
    }
    if (hasPlansWithin(GAP_DAYS)) {
      box.hidden = true;
      return;
    }
    var weekend = nearestWeekend(today);
    if (!weekend || readGapDismissed() === weekend) {
      box.hidden = true;
      return;
    }
    setText("[data-gap-title]", "接下来 " + GAP_DAYS + " 天还没有安排。");
    setText("[data-gap-copy]", formatDateCN(weekend, true) + " 还空着，要不要来一次约会？");
    box.setAttribute("data-weekend", weekend);
    box.hidden = false;
  }

  // 已经记录的生理期日子：开始到结束；只填了开始日的，最多往后留 9 天，避免一直标下去。
  function periodMarkSet() {
    var marks = {};
    var logs = data.period && Array.isArray(data.period.logs) ? data.period.logs : [];
    logs.forEach(function (log) {
      if (!log || !splitISO(log.start)) return;
      var end = log.end && log.end >= log.start ? log.end : addDays(log.start, 9);
      if (!log.end && end > today) end = today;
      var cursor = log.start;
      var guard = 0;
      while (cursor && cursor <= end && guard < 40) {
        marks[cursor] = true;
        cursor = addDays(cursor, 1);
        guard += 1;
      }
    });
    return marks;
  }

  function renderCalendar() {
    var calGrid = $("[data-cal-grid]");
    var calMonth = $("[data-cal-month]");
    if (!calGrid || !calMonth) return;
    calMonth.textContent = cal.y + "年" + cal.m + "月";
    calGrid.innerHTML = "";
    var periodMarks = periodMarkSet();

    var firstWeekday = weekdayOf(cal.y, cal.m, 1);
    var total = daysInMonth(cal.y, cal.m);
    var cellCount = Math.ceil((firstWeekday + total) / 7) * 7;
    if (cellCount < 35) cellCount = 35;

    for (var i = 0; i < cellCount; i++) {
      var offset = i - firstWeekday + 1;
      var date = new Date(Date.UTC(cal.y, cal.m - 1, offset));
      var iso = formatISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      var outside = date.getUTCMonth() !== cal.m - 1 || date.getUTCFullYear() !== cal.y;
      var dayEvents = eventsOnDate(iso);
      var dayTimeline = timelineOnDate(iso);

      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "l-cal-cell";
      if (outside) cell.classList.add("is-outside");
      if (iso === today) cell.classList.add("is-today");
      if (iso === cal.selected) cell.classList.add("is-selected");
      cell.setAttribute("data-date", iso);
      cell.setAttribute("aria-pressed", iso === cal.selected ? "true" : "false");
      var names = dayEvents.map(function (event) { return event.title; })
        .concat(dayTimeline.map(function (item) { return item.title; }));
      var moodNotes = ["jmj", "bxb"].map(function (personId) {
        var meta = moodMetaOf(moodRowOf(iso, personId));
        return meta ? moodPersonName(personId) + meta.label : "";
      }).filter(Boolean);
      cell.setAttribute("aria-label", formatDateCN(iso, true)
        + (names.length ? "，" + names.join("、") : "，没有安排")
        + (moodNotes.length ? "；心情：" + moodNotes.join("、") : ""));

      cell.appendChild(el("span", "l-cal-num", String(date.getUTCDate())));

      // 心情放在固定高度的两列里：左鸡毛、右小白，左右对称，数字位置不会跳。
      var marks = el("span", "l-cal-marks");
      marks.setAttribute("aria-hidden", "true");
      ["jmj", "bxb"].forEach(function (personId) {
        var row = moodRowOf(iso, personId);
        var meta = moodMetaOf(row);
        var node = el("span", "l-cal-mood is-" + personId, meta ? meta.emoji : "");
        if (meta) {
          node.title = moodPersonName(personId) + "：" + meta.label
            + (isMyMood(row) && row.shared === false ? "（只我可见）" : "");
        }
        marks.appendChild(node);
      });
      cell.appendChild(marks);
      // 生理期用格子右上角的小圆点，不占心情的位置。
      var periodDot = el("span", "l-cal-period");
      if (periodMarks[iso]) periodDot.classList.add("is-on");
      periodDot.setAttribute("aria-hidden", "true");
      cell.appendChild(periodDot);

      var dots = el("span", "l-cal-dots");
      var seen = {};
      var tones = dayEvents.map(function (event) { return event.kind || "custom"; })
        .concat(dayTimeline.map(function (item) { return item.kind === "milestone" ? "milestone" : "date"; }));
      tones.slice(0, 4).forEach(function (tone) {
        if (seen[tone]) return;
        seen[tone] = true;
        dots.appendChild(el("i", "l-dot is-" + tone));
      });
      cell.appendChild(dots);

      calGrid.appendChild(cell);
    }
  }

  function renderDay(iso) {
    var dayLabel = $("[data-love-day-label]");
    var dayDate = $("[data-love-day-date]");
    var dayEvents = $("[data-love-day-events]");
    var dayEmpty = $("[data-love-day-empty]");
    if (!dayLabel || !dayDate || !dayEvents || !dayEmpty) return;

    var label = "选中日期";
    if (iso === today) label = "今天";
    else if (iso === addDays(today, 1)) label = "明天";
    dayLabel.textContent = label;
    dayDate.textContent = formatDateCN(iso, true);

    var events = eventsOnDate(iso);
    var timeline = timelineOnDate(iso);
    dayEvents.innerHTML = "";
    dayEmpty.hidden = events.length + timeline.length > 0;

    events.forEach(function (event) {
      var item = el("article", "l-day-event");
      var title = el("div", "l-day-event-title");
      var icon = el("span", "", event.icon || "✦");
      icon.setAttribute("aria-hidden", "true");
      title.appendChild(icon);
      title.appendChild(document.createTextNode(event.title || "重要日子"));
      item.appendChild(title);
      var repeat = repeatLabel(event);
      item.appendChild(el("div", "l-day-event-meta",
        EVENT_KIND_LABELS[event.kind] + (repeat ? " · " + repeat : "")));
      if (event.note) item.appendChild(el("p", "l-day-event-note", event.note));
      dayEvents.appendChild(item);
    });

    timeline.forEach(function (entry) {
      var item = el("article", "l-day-event");
      var title = el("div", "l-day-event-title");
      var icon = el("span", "", entry.kind === "milestone" ? "★" : "♡");
      icon.setAttribute("aria-hidden", "true");
      title.appendChild(icon);
      title.appendChild(document.createTextNode(entry.title || "约会记录"));
      item.appendChild(title);
      // 时间线只露标题和分类，备注留在编辑里，不在信息墙展开。
      item.appendChild(el("div", "l-day-event-meta",
        entry.kind === "milestone" ? "大事记" : "约会啦"));
      dayEvents.appendChild(item);
    });

    renderDayMoods(iso);
  }

  // 心情：左边固定鸡毛，右边固定小白。没记录、对方没公开都显示「—」。
  function renderDayMoods(iso) {
    var peopleById = {};
    data.people.forEach(function (person) {
      if (person && person.id) peopleById[person.id] = person;
    });

    ["jmj", "bxb"].forEach(function (personId) {
      var slot = $('[data-mood-slot="' + personId + '"]');
      var valueNode = $('[data-mood-value="' + personId + '"]');
      var whoNode = $('[data-mood-who="' + personId + '"]');
      if (!slot || !valueNode) return;

      if (whoNode) {
        var person = peopleById[personId];
        if (person && person.name) {
          whoNode.textContent = (person.emoji ? person.emoji + " " : "") + person.name;
        }
      }

      var row = moodRowOf(iso, personId);
      var meta = moodMetaOf(row);
      slot.classList.toggle("has-mood", !!meta);
      slot.classList.toggle("is-mine", personId === state.person);
      slot.classList.toggle("is-private", !!meta && isMyMood(row) && row.shared === false);
      if (meta) {
        valueNode.textContent = moodSlotText(row);
        valueNode.setAttribute("aria-label", personId === state.person
          ? "我的心情：" + meta.label
          : "对方的心情：" + meta.label);
      } else {
        valueNode.textContent = "—";
        valueNode.removeAttribute("aria-label");
      }
    });

    var editButton = $("[data-mood-edit]");
    if (editButton) {
      editButton.textContent = moodRowOf(iso, state.person) ? "改我的心情" : "记录我的心情";
    }
  }

  function renderTabs(entries) {
    var tabsNode = $("[data-day-tabs]");
    if (!tabsNode) return;
    var counts = { all: entries.length };
    TABS.forEach(function (tab) {
      if (tab.key === "all") return;
      counts[tab.key] = entries.filter(function (entry) { return entry.category === tab.key; }).length;
    });
    tabsNode.innerHTML = "";
    TABS.forEach(function (tab) {
      var button = el("button", "l-tab" + (state.dayFilter === tab.key ? " is-active" : ""));
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", state.dayFilter === tab.key ? "true" : "false");
      button.setAttribute("data-day-filter", tab.key);
      button.appendChild(document.createTextNode(tab.label));
      button.appendChild(el("b", "", String(counts[tab.key] || 0)));
      tabsNode.appendChild(button);
    });
  }

  function renderRowActions(entry) {
    var actions = el("span", "l-day-actions");
    var edit = el("button", "l-row-action", "编辑");
    edit.type = "button";
    edit.setAttribute("data-edit-entry", entry.source + ":" + entry.id);
    var archive = el("button", "l-row-action is-danger", "归档");
    archive.type = "button";
    archive.setAttribute("data-archive-entry", entry.source + ":" + entry.id);
    actions.appendChild(edit);
    actions.appendChild(archive);
    return actions;
  }

  function renderEventList() {
    var listNode = $("[data-love-event-list]");
    if (!listNode) return;

    var entries = buildEntries();
    renderTabs(entries);

    var filtered = entries.filter(function (entry) {
      return state.dayFilter === "all" || entry.category === state.dayFilter;
    });

    listNode.innerHTML = "";
    if (!filtered.length) {
      listNode.appendChild(el("p", "l-empty", "这一类还没有记录，点上面的按钮加一个吧。"));
      return;
    }

    filtered.forEach(function (entry) {
      var row = el("article", "l-day-row" + (entry.past ? " is-past" : ""));

      var open = el("button", "l-event-row l-day-open");
      open.type = "button";
      open.setAttribute("data-jump-date", entry.date || "");
      open.setAttribute("aria-label", entryTitle(entry) + "，" + (entry.date ? formatDateCN(entry.date, true) : "日期待定"));

      var dateBox = el("span", "l-event-date");
      dateBox.appendChild(el("b", "", entry.date ? formatShort(entry.date) : "--.--"));
      dateBox.appendChild(el("small", "", entry.date ? entry.date.slice(0, 4) : "待定"));
      open.appendChild(dateBox);

      var body = el("span", "l-event-body");
      body.appendChild(el("span", "l-event-title", entryTitle(entry)));
      var meta = el("span", "l-event-meta");
      meta.appendChild(el("span", "l-event-tag is-" + entry.tone, categoryLabel(entry)));
      if (entry.source !== "timeline") {
        // 时间线只显示标题和分类，不显示备注。
        var repeat = repeatLabel(entry.item);
        if (repeat) meta.appendChild(el("span", "l-event-note", repeat));
        if (entry.item.note) meta.appendChild(el("span", "l-event-note", entry.item.note));
      }
      body.appendChild(meta);
      open.appendChild(body);

      var days = el("span", "l-event-days");
      if (entry.date) days.textContent = shortCountdown(entry.date, today);
      else days.textContent = "待定";
      open.appendChild(days);

      row.appendChild(open);
      row.appendChild(renderRowActions(entry));
      listNode.appendChild(row);
    });
  }

  var DRAW_LOADING_LINES = [
    "翻翻你们的小本本…",
    "把两个人的喜好放在一起想…",
    "挑一件最近就能做的小事…"
  ];

  function stopDrawTimer() {
    if (state.drawTimer) {
      clearInterval(state.drawTimer);
      state.drawTimer = 0;
    }
    state.drawBusy = false;
    var box = $("[data-love-draw]");
    if (box) box.classList.remove("is-drawing");
  }

  function setDrawButtonsDisabled(disabled) {
    $$("[data-draw-again], [data-draw-add]").forEach(function (node) {
      node.disabled = disabled;
    });
  }

  function setDrawError(message) {
    var node = $("[data-draw-error]");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function renderDrawAvailability() {
    var box = $("[data-love-draw]");
    var hint = $("[data-draw-hint]");
    var button = $("[data-draw-open]");
    if (!box || !hint || !button) return;
    var all = data.bucketList.filter(function (item) { return item && !item.archived; });
    var candidates = all.filter(function (item) { return !item.done; });
    if (!all.length) {
      hint.textContent = "清单还空着——不如让 AI 想一件小事，把「一起做点什么」提上日程。";
    } else if (!candidates.length) {
      hint.textContent = "清单都完成啦，厉害。再想一件新的，继续一起打卡。";
    } else {
      hint.textContent = "让 AI 想一件清单外的小事。";
    }
    button.disabled = false;
    box.classList.remove("is-empty");
  }

  function markDrawAdded() {
    var result = $("[data-draw-result]");
    if (result) result.setAttribute("data-draw-added", "true");
    var add = $("[data-draw-add]");
    if (add) {
      add.disabled = true;
      add.textContent = "已加入清单";
    }
  }

  function settleDraw(idea) {
    stopDrawTimer();
    state.drawIdea = idea;
    var box = $("[data-love-draw]");
    var result = $("[data-draw-result]");
    var button = $("[data-draw-open]");
    if (result) {
      result.hidden = false;
      result.removeAttribute("data-draw-added");
    }
    if (box) box.classList.add("is-open");
    if (button) button.setAttribute("aria-expanded", "true");
    setText("[data-draw-title]", idea.title || "想一起做的事");
    var meta = [];
    if (idea.category) meta.push(idea.category);
    if (idea.note) meta.push(idea.note);
    setText("[data-draw-meta]", meta.length ? meta.join(" · ") : "还没写备注");
    setDrawError("");
    setDrawButtonsDisabled(false);
    var add = $("[data-draw-add]");
    if (add) add.textContent = "加入清单";
  }

  function drawNewIdea() {
    var box = $("[data-love-draw]");
    var result = $("[data-draw-result]");
    if (!box || !result || state.drawBusy) return;
    stopDrawTimer();
    state.drawBusy = true;
    state.drawIdea = null;
    setDrawButtonsDisabled(true);
    setDrawError("");
    result.hidden = false;
    result.removeAttribute("data-draw-added");
    box.classList.add("is-open", "is-drawing");
    var button = $("[data-draw-open]");
    if (button) button.setAttribute("aria-expanded", "true");
    setText("[data-draw-title]", "正在想一件清单外的小事…");
    setText("[data-draw-meta]", DRAW_LOADING_LINES[0]);
    var add = $("[data-draw-add]");
    if (add) add.textContent = "加入清单";

    var tick = 0;
    state.drawTimer = setInterval(function () {
      tick = (tick + 1) % DRAW_LOADING_LINES.length;
      setText("[data-draw-meta]", DRAW_LOADING_LINES[tick]);
    }, 700);

    var seq = (state.drawRequestSeq || 0) + 1;
    state.drawRequestSeq = seq;
    var exclude = state.drawRecent.slice(-3);
    api("/v1/ai/draw-idea", { method: "POST", body: { exclude: exclude } })
      .then(function (payload) {
        if (seq !== state.drawRequestSeq) return;
        var idea = payload && payload.idea;
        if (!idea || !idea.title) throw new Error("AI 没有给出点子，请再想一次。");
        state.drawRecent.push(idea.title);
        if (state.drawRecent.length > 3) state.drawRecent = state.drawRecent.slice(-3);
        settleDraw(idea);
      })
      .catch(function (error) {
        if (seq !== state.drawRequestSeq) return;
        stopDrawTimer();
        state.drawIdea = null;
        result.hidden = false;
        box.classList.remove("is-drawing");
        box.classList.add("is-open");
        setText("[data-draw-title]", "这次没想出来");
        setText("[data-draw-meta]", "");
        setDrawError((error && error.message) || "这次没有想出来，再试一次。");
        setDrawButtonsDisabled(false);
        if (error && error.status === 401) fail(error);
      });
  }

  function addDrawIdea() {
    var idea = state.drawIdea;
    var result = $("[data-draw-result]");
    if (!idea || state.drawBusy || !result) return;
    if (result.getAttribute("data-draw-added") === "true") return;

    var key = String(idea.title || "").trim().toLowerCase();
    var duplicate = data.bucketList.filter(function (item) {
      return item && !item.archived && String(item.title || "").trim().toLowerCase() === key;
    })[0];
    if (duplicate) {
      markDrawAdded();
      toast("清单里已经有「" + duplicate.title + "」了。");
      return;
    }

    setDrawButtonsDisabled(true);
    setDrawError("");
    api("/v1/bucket", {
      method: "POST",
      body: {
        title: idea.title,
        category: idea.category || "",
        done: false,
        note: idea.note || ""
      }
    }).then(function () {
      markDrawAdded();
      toast("已经加到共同清单。");
      return reload();
    }).catch(function (error) {
      setDrawButtonsDisabled(false);
      setDrawError((error && error.message) || "加入清单没有成功。");
      if (error && error.status === 401) fail(error);
    });
  }

  function renderBucket() {
    var listNode = $("[data-love-bucket-list]");
    var countNode = $("[data-love-bucket-count]");
    var bar = $("[data-love-bucket-bar]");
    if (!listNode) return;

    var items = data.bucketList.filter(function (item) { return item && !item.archived; });
    var done = items.filter(function (item) { return item.done; }).length;
    if (countNode) countNode.textContent = done + " / " + items.length;
    if (bar) bar.style.width = items.length ? (done / items.length * 100) + "%" : "0%";

    var ordered = items.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (a.done && b.done) return String(b.doneAt || "").localeCompare(String(a.doneAt || ""));
      return 0;
    });

    listNode.innerHTML = "";
    ordered.forEach(function (item) {
      var row = el("div", "l-bucket-item" + (item.done ? " is-done" : ""));
      row.setAttribute("data-bucket-row", item.id);

      var check = el("button", "l-bucket-check", item.done ? "✓" : "");
      check.type = "button";
      check.setAttribute("data-bucket-toggle", item.id);
      check.setAttribute("aria-label", item.done ? "标记为未完成" : "标记为已完成");
      check.setAttribute("aria-pressed", item.done ? "true" : "false");
      row.appendChild(check);

      var body = el("span", "l-bucket-body");
      body.appendChild(el("span", "l-bucket-title", item.title || "想一起做的事"));
      var meta = el("span", "l-bucket-meta");
      if (item.category) meta.appendChild(el("span", "l-bucket-cat", item.category));
      if (item.note) meta.appendChild(el("span", "", item.note));
      if (meta.childNodes.length) body.appendChild(meta);
      row.appendChild(body);

      var side = el("span", "l-bucket-side");
      side.appendChild(el("span", "l-bucket-date",
        item.done && item.doneAt ? formatShort(item.doneAt) + " 完成" : "待完成"));
      var actions = el("span", "l-bucket-actions");
      var edit = el("button", "l-row-action", "编辑");
      edit.type = "button";
      edit.setAttribute("data-edit-bucket", item.id);
      var archive = el("button", "l-row-action is-danger", "归档");
      archive.type = "button";
      archive.setAttribute("data-archive-bucket", item.id);
      actions.appendChild(edit);
      actions.appendChild(archive);
      side.appendChild(actions);
      row.appendChild(side);

      listNode.appendChild(row);
    });
    renderDrawAvailability();
  }

  /* ---------- 私密心愿单 ---------- */

  var giftWish = $("[data-gift-wish]");
  var giftWishForm = $("[data-gift-wish-form]");
  var giftWishError = $("[data-gift-wish-error]");
  var giftWishSubmit = $("[data-gift-wish-submit]");
  var giftWishStatus = $("[data-gift-wish-status]");
  var giftWishToggle = $("[data-gift-wish-toggle]");
  var giftWishToggleLabel = $("[data-gift-wish-toggle-label]");
  var giftWishPreview = $("[data-gift-wish-preview]");
  var giftWishCollapse = $("[data-gift-wish-collapse]");

  function setGiftWishOpen(open) {
    state.giftWishOpen = !!open;
    if (giftWish) giftWish.classList.toggle("is-open", state.giftWishOpen);
    if (giftWishToggle) giftWishToggle.setAttribute("aria-expanded", state.giftWishOpen ? "true" : "false");
    if (giftWishToggleLabel) giftWishToggleLabel.textContent = state.giftWishOpen ? "收起" : "展开";
    if (giftWishPreview) {
      giftWishPreview.setAttribute("aria-hidden", state.giftWishOpen ? "true" : "false");
      if (state.giftWishOpen) giftWishPreview.setAttribute("inert", "");
      else giftWishPreview.removeAttribute("inert");
    }
    if (giftWishCollapse) {
      giftWishCollapse.setAttribute("aria-hidden", state.giftWishOpen ? "false" : "true");
      if (state.giftWishOpen) giftWishCollapse.removeAttribute("inert");
      else giftWishCollapse.setAttribute("inert", "");
    }
    if (state.giftWishOpen && !state.giftWishLoaded) loadGiftWish();
  }

  function wishField() {
    return giftWishForm ? named(giftWishForm, "content") : null;
  }

  function loadGiftWish() {
    if (!giftWishForm || state.giftWishBusy) return;
    state.giftWishLoaded = true;
    setError(giftWishError, "");
    if (giftWishStatus) giftWishStatus.textContent = "正在读取…";
    api("/v1/gift/wish").then(function (payload) {
      var value = payload && payload.data ? payload.data : {};
      var field = wishField();
      if (field) field.value = value.content || "";
      if (giftWishStatus) {
        giftWishStatus.textContent = value.content
          ? "已载入。只有你自己能看到。"
          : "还是空的。只有你自己能看到。";
      }
    }).catch(function (error) {
      state.giftWishLoaded = false;
      if (giftWishStatus) giftWishStatus.textContent = "";
      if (error && error.status === 401) {
        fail(error);
        return;
      }
      setError(giftWishError, (error && error.message) || "心愿单没有载入，展开重试一次。");
    });
  }

  function submitGiftWish(evt) {
    evt.preventDefault();
    if (!giftWishForm || state.giftWishBusy) return;
    setError(giftWishError, "");
    state.giftWishBusy = true;
    setBusy(giftWishSubmit, true, "保存中…");
    api("/v1/gift/wish", {
      method: "PUT",
      body: { content: valueOf(giftWishForm, "content") }
    }).then(function (payload) {
      var value = payload && payload.data ? payload.data : {};
      var field = wishField();
      if (field) field.value = value.content || "";
      if (giftWishStatus) giftWishStatus.textContent = "已保存。只有你自己能看到。";
      toast("心愿单已经保存。");
    }).catch(function (error) {
      if (error && error.status === 401) {
        fail(error);
        return;
      }
      setError(giftWishError, (error && error.message) || "保存没有成功。");
    }).then(function () {
      state.giftWishBusy = false;
      setBusy(giftWishSubmit, false, "保存心愿单");
    });
  }

  /* ---------- 送礼参谋部 ---------- */

  var giftPlanForm = $("[data-gift-plan-form]");
  var giftPlanError = $("[data-gift-plan-error]");
  var giftPlanSubmit = $("[data-gift-plan-submit]");
  var giftPlanResult = $("[data-gift-plan-result]");
  var giftPlanSummary = $("[data-gift-plan-summary]");
  var giftPlanClue = $("[data-gift-plan-clue]");
  var giftPlanClueText = $("[data-gift-plan-clue-text]");
  var giftPlanGifts = $("[data-gift-plan-gifts]");
  var giftPlanAvoid = $("[data-gift-plan-avoid]");
  var giftHintOpen = $("[data-gift-hint-open]");
  var giftHintStatus = $("[data-gift-hint-status]");

  function clearGiftPlanResult() {
    state.giftPlan = null;
    state.giftPlanOccasion = "";
    setError(giftPlanError, "");
    if (giftPlanResult) giftPlanResult.hidden = true;
    if (giftPlanSummary) giftPlanSummary.textContent = "";
    if (giftPlanClue) giftPlanClue.hidden = true;
    if (giftPlanClueText) giftPlanClueText.textContent = "";
    if (giftPlanGifts) giftPlanGifts.textContent = "";
    if (giftPlanAvoid) {
      giftPlanAvoid.textContent = "";
      giftPlanAvoid.hidden = true;
    }
    if (giftHintStatus) giftHintStatus.textContent = "";
    if (giftHintOpen) {
      giftHintOpen.disabled = false;
      giftHintOpen.textContent = "写邮件暗示";
    }
  }

  function renderGiftPlan(plan, occasion) {
    if (!giftPlanResult || !plan) return;
    state.giftPlan = plan;
    state.giftPlanOccasion = occasion || "";
    if (giftPlanSummary) {
      giftPlanSummary.textContent = plan.summary || "AI 给了三个方向，看看哪个更合适。";
    }
    if (giftPlanClue && giftPlanClueText) {
      var clue = String(plan.clue || "").trim();
      giftPlanClueText.textContent = clue;
      giftPlanClue.hidden = !clue;
    }
    if (giftPlanGifts) {
      giftPlanGifts.textContent = "";
      (plan.gifts || []).forEach(function (item, index) {
        var li = el("li", "l-gift-item");
        var head = el("div", "l-gift-item-head");
        head.appendChild(el("span", "l-gift-index", String(index + 1)));
        head.appendChild(el("strong", "l-gift-item-title", item.title || "一个方向"));
        if (item.budget) head.appendChild(el("span", "l-gift-budget", item.budget));
        li.appendChild(head);
        if (item.why) li.appendChild(el("p", "l-gift-why", item.why));
        if (item.how) li.appendChild(el("p", "l-gift-how", item.how));
        giftPlanGifts.appendChild(li);
      });
    }
    if (giftPlanAvoid) {
      giftPlanAvoid.textContent = plan.avoid || "";
      giftPlanAvoid.hidden = !plan.avoid;
    }
    if (giftHintStatus) giftHintStatus.textContent = "";
    giftPlanResult.hidden = false;
  }

  function submitGiftPlan(evt) {
    evt.preventDefault();
    if (!giftPlanForm || state.giftPlanBusy) return;
    var occasion = valueOf(giftPlanForm, "occasion");
    if (!occasion) {
      setError(giftPlanError, "先写一句场合，比如生日、纪念日，或者就是想送。");
      return;
    }
    setError(giftPlanError, "");
    state.giftPlanBusy = true;
    setBusy(giftPlanSubmit, true, "AI 正在想…");
    clearGiftPlanResult();
    api("/v1/ai/gift-plan", {
      method: "POST",
      body: {
        occasion: occasion,
        budget: valueOf(giftPlanForm, "budget"),
        notes: valueOf(giftPlanForm, "notes")
      }
    }).then(function (payload) {
      if (!payload || !payload.plan) throw new Error("AI 这次没有给出完整方案。");
      renderGiftPlan(payload.plan, occasion);
    }).catch(function (error) {
      if (error && error.status === 401) {
        fail(error);
        return;
      }
      setError(giftPlanError, (error && error.message) || "AI 这次没有给出方案，请再试一次。");
    }).then(function () {
      state.giftPlanBusy = false;
      setBusy(giftPlanSubmit, false, "生成方案");
    });
  }

  /* ---------- 邮件暗示 ---------- */

  var giftHintForm = $("[data-gift-hint-form]");
  var giftHintError = $("[data-gift-hint-error]");
  var giftHintSend = $("[data-gift-hint-send]");
  var giftHintTo = $("[data-gift-hint-to]");

  function hintedPerson() {
    return state.person === "jmj" ? "bxb" : "jmj";
  }

  function buildGiftHintMessage() {
    var targetName = personLabel(hintedPerson());
    var actorName = personLabel(state.person);
    var occasion = state.giftPlanOccasion || (giftPlanForm ? valueOf(giftPlanForm, "occasion") : "");
    var plan = state.giftPlan || {};
    var gifts = Array.isArray(plan.gifts) ? plan.gifts.filter(function (item) { return item && item.title; }) : [];
    var lines = [targetName + "，打扰一下。", ""];
    if (occasion) {
      lines.push(actorName + "最近在为「" + occasion + "」挑礼物，怕猜错，想悄悄问一句：");
    } else {
      lines.push(actorName + "最近在挑一份礼物，怕猜错，想悄悄问一句：");
    }
    lines.push("最近有没有什么想要的，或者明确不想要的？");
    if (gifts.length) {
      lines.push("", "军师给的方向是：" + gifts.map(function (item) { return item.title; }).join("、") + "。");
      lines.push("但这些都只是猜，还是想听你自己说。");
    }
    lines.push("", "不用回这封邮件。看到后直接跟 " + actorName + " 说，或者登录 Love Story 写进自己的私密心愿单：");
    lines.push("https://xm9.asia/love/");
    lines.push("", "—— " + actorName + " 悄悄问的");
    return lines.join("\n");
  }

  function openGiftHintModal() {
    if (!giftHintForm) return;
    prepareModalForm(giftHintForm);
    openModal("发一封邮件问问 ta");
    if (giftHintTo) {
      giftHintTo.textContent = "这封会发给" + personLabel(hintedPerson())
        + "。内容可以先改，确认后再发；一小时只能发一封。";
    }
    var field = named(giftHintForm, "message");
    if (field) {
      field.value = buildGiftHintMessage();
      // 打开时从第一行开始看，不要一上来就停在正文末尾。
      field.scrollTop = 0;
    }
    setError(giftHintError, "");
  }

  function submitGiftHint(evt) {
    evt.preventDefault();
    if (!giftHintForm || state.giftHintBusy) return;
    var message = valueOf(giftHintForm, "message");
    if (!message) {
      setError(giftHintError, "邮件内容不能为空。");
      return;
    }
    setError(giftHintError, "");
    state.giftHintBusy = true;
    setBusy(giftHintSend, true, "正在发…");
    api("/v1/gift/hint", {
      method: "POST",
      body: {
        occasion: state.giftPlanOccasion || (giftPlanForm ? valueOf(giftPlanForm, "occasion") : ""),
        message: message
      }
    }).then(function (payload) {
      closeModal();
      var to = payload && payload.to ? payload.to : personLabel(hintedPerson());
      if (giftHintStatus) giftHintStatus.textContent = "邮件已经发给" + to + "。";
      if (giftHintOpen) {
        giftHintOpen.disabled = true;
        giftHintOpen.textContent = "已经发过一封";
      }
      toast("邮件已经发出。");
    }).catch(function (error) {
      if (error && error.status === 401) {
        closeModal();
        fail(error);
        return;
      }
      if (giftHintStatus) giftHintStatus.textContent = (error && error.message) || "邮件没有发出去。";
      setError(giftHintError, (error && error.message) || "邮件没有发出去，请稍后再试。");
    }).then(function () {
      state.giftHintBusy = false;
      setBusy(giftHintSend, false, "发出邮件");
    });
  }

  /* ---------- 生理周期 ---------- */

  var periodRing = $("[data-period-ring]");
  var periodSegs = $$("[data-period-seg]");
  var periodMarker = $("[data-period-marker]");
  var periodLegend = $("[data-period-legend]");
  var periodDay = $("[data-period-day]");
  var periodPhase = $("[data-period-phase]");
  var periodNext = $("[data-period-next]");
  var periodOvulation = $("[data-period-ovulation]");
  var periodTip = $("[data-period-tip]");
  var periodTipLabel = $("[data-period-tip-label]");
  var periodSubtitle = $("[data-period-subtitle]");
  var periodList = $("[data-period-list]");
  var periodAddButton = $("[data-period-add]");
  var periodForm = $("[data-period-form]");
  var periodError = $("[data-period-error]");
  var periodSubmitButton = $("[data-period-submit]");
  var RING_LENGTH = 2 * Math.PI * 52;

  // 生理期只属于白小白；鸡毛登录时只看，不出现录入和切换。
  function periodIsOwner() {
    return state.person === "bxb";
  }

  function periodLogs() {
    return (data.period && Array.isArray(data.period.logs) ? data.period.logs : [])
      .filter(function (log) { return log && log.person === "bxb"; });
  }

  function renderPeriodRing(summary) {
    if (!periodRing) return;
    var hasData = !!(summary && summary.hasData);
    periodRing.className = "l-period-ring" + (hasData ? " has-data" : "")
      + (hasData && summary.phase ? " is-" + summary.phase : "");

    if (!periodSegs.length) return;
    periodSegs.forEach(function (seg) {
      seg.removeAttribute("stroke-dasharray");
      seg.removeAttribute("stroke-dashoffset");
      seg.classList.remove("is-active");
    });
    if (periodMarker) periodMarker.style.opacity = hasData ? "1" : "0";
    if (periodLegend) periodLegend.hidden = !hasData;
    if (!hasData) return;

    var cycle = Math.max(1, Number(summary.averageCycle) || 28);
    var lastStart = summary.lastStart;
    var periodDays = summary.lastEnd
      ? Math.max(1, diffDays(lastStart, summary.lastEnd) + 1)
      : (Number(summary.averagePeriod) || 5);
    periodDays = Math.min(cycle, Math.max(1, periodDays));

    var fertileStartDay = diffDays(lastStart, summary.fertileStart) + 1;
    var fertileEndDay = diffDays(lastStart, summary.fertileEnd) + 1;
    var ovStart = Math.max(periodDays + 1, Math.min(cycle, fertileStartDay));
    var ovEnd = Math.max(ovStart, Math.min(cycle, fertileEndDay));
    var segments = {
      period: [1, periodDays],
      follicular: [periodDays + 1, ovStart - 1],
      ovulation: [ovStart, ovEnd],
      luteal: [ovEnd + 1, cycle]
    };
    var activePhase = summary.phase === "late" ? "luteal" : summary.phase;
    var gap = 0.006;

    periodSegs.forEach(function (seg) {
      var phase = seg.getAttribute("data-period-seg");
      var range = segments[phase];
      if (!range || range[0] > range[1]) return;
      var from = (range[0] - 1) / cycle + gap / 2;
      var to = range[1] / cycle - gap / 2;
      if (to <= from) return;
      var dash = (to - from) * RING_LENGTH;
      seg.setAttribute("stroke-dasharray", dash.toFixed(2) + " " + (RING_LENGTH - dash).toFixed(2));
      seg.setAttribute("stroke-dashoffset", (-from * RING_LENGTH).toFixed(2));
      seg.classList.toggle("is-active", phase === activePhase);
    });

    if (periodLegend) {
      Array.prototype.forEach.call(periodLegend.querySelectorAll("[data-period-legend-item]"), function (item) {
        item.classList.toggle("is-active", item.getAttribute("data-period-legend-item") === activePhase);
      });
    }

    if (periodMarker) {
      var fraction = Math.max(0, Math.min(0.995, ((Number(summary.cycleDay) || 1) - 0.5) / cycle));
      var angle = fraction * Math.PI * 2;
      periodMarker.setAttribute("cx", (60 + 52 * Math.cos(angle)).toFixed(2));
      periodMarker.setAttribute("cy", (60 + 52 * Math.sin(angle)).toFixed(2));
    }
  }

  var PERIOD_FALLBACK_TIPS = {
    period: "这几天多休息，注意保暖，别硬撑。",
    follicular: "精力通常在回升，适合把想做的事排上日程。",
    ovulation: "状态一般不错，记得按时吃饭，别熬夜。",
    luteal: "临近下一次，情绪和胃口可能会有点波动，对自己宽容一点。",
    late: "这次比预测晚了些；如果差得久或身体不舒服，去看医生更稳妥。"
  };

  function shortCN(iso) {
    var parts = splitISO(iso);
    return parts ? parts.m + "月" + parts.d + "日" : "";
  }

  function periodTipKey(person) {
    return person + ":" + today;
  }

  function periodTipText(summary) {
    return PERIOD_FALLBACK_TIPS[summary.phase] || "按自己的节奏来，不舒服就多休息。";
  }

  function loadPeriodTip(summary, personId) {
    if (!summary || !summary.hasData || !personId) return;
    var key = periodTipKey(personId);
    if (state.periodTipCache[key] || state.periodTipTried[key]) return;
    state.periodTipTried[key] = true;
    state.periodTipLoading = key;
    api("/v1/ai/period-tip", {
      method: "POST",
      body: { person: personId }
    }).then(function (payload) {
      var tip = payload && payload.tip ? String(payload.tip).trim() : "";
      if (!tip) return;
      state.periodTipCache[key] = tip;
      var current = data.period && data.period.summaries ? data.period.summaries[personId] : null;
      if (current && periodTip) {
        periodTip.textContent = tip;
        if (periodTipLabel) periodTipLabel.textContent = "健康提示 · AI";
      }
    }).catch(function (error) {
      if (error && error.status === 401) fail(error);
      // AI 没有接上时保留本地兜底提示，不打扰用户。
    }).then(function () {
      if (state.periodTipLoading === key) state.periodTipLoading = "";
    });
  }

  function renderPeriod() {
    var summaries = data.period && data.period.summaries ? data.period.summaries : {};
    var person = "bxb";
    var summary = summaries[person] || null;
    var hasData = !!(summary && summary.hasData);

    if (periodAddButton) periodAddButton.hidden = !periodIsOwner();

    renderPeriodRing(summary);
    if (periodDay) periodDay.textContent = hasData ? "第 " + summary.cycleDay + " 天" : "—";
    if (periodPhase) periodPhase.textContent = hasData ? (summary.phaseLabel || "周期中") : "还没有记录";

    if (periodSubtitle) {
      if (!hasData) {
        periodSubtitle.textContent = "这里只记录白小白的周期；鸡毛登录时只能查看。";
      } else if (summary.predicted) {
        periodSubtitle.textContent = "白小白的周期，按最近 " + summary.sampleCount + " 次间隔估算，会随记录越来越准。";
      } else {
        periodSubtitle.textContent = "白小白的周期，先按默认 28 天估算，多记几次会更准。";
      }
    }

    if (periodNext) {
      if (!hasData) {
        periodNext.textContent = "记录一次开始和结束日期，这里会出现大概的下一次时间。";
      } else {
        var left = diffDays(today, summary.nextStart);
        if (summary.lateDays > 0) {
          periodNext.textContent = "比预测晚了 " + summary.lateDays + " 天（原预计 " + shortCN(summary.nextStart) + "）。";
        } else if (left <= 0) {
          periodNext.textContent = "下一次大概就是今天（" + shortCN(summary.nextStart) + "）。";
        } else {
          periodNext.textContent = "下一次月经大概在 " + shortCN(summary.nextStart) + "，还有 " + left + " 天。";
        }
      }
    }

    if (periodOvulation) {
      if (hasData) {
        periodOvulation.textContent = "排卵期大约在 " + shortCN(summary.fertileStart) + " – " + shortCN(summary.fertileEnd) + "（预测）";
        periodOvulation.hidden = false;
      } else {
        periodOvulation.textContent = "";
        periodOvulation.hidden = true;
      }
    }

    if (periodTip) {
      var key = periodTipKey(person);
      var cached = state.periodTipCache[key];
      if (!hasData) {
        periodTip.textContent = "记录之后，这里会出现一句健康提示。";
        if (periodTipLabel) periodTipLabel.textContent = "健康提示";
      } else if (cached) {
        periodTip.textContent = cached;
        if (periodTipLabel) periodTipLabel.textContent = "健康提示 · AI";
      } else {
        periodTip.textContent = periodTipText(summary);
        if (periodTipLabel) periodTipLabel.textContent = "健康提示";
      }
    }

    if (periodList) {
      periodList.innerHTML = "";
      var logs = periodLogs().slice();
      logs.sort(function (a, b) { return String(b.start || "").localeCompare(String(a.start || "")); });
      if (!logs.length) {
        periodList.appendChild(el(
          "p",
          "l-period-empty",
          periodIsOwner()
            ? "还没有记录。点上面的「+ 记录小白的生理期」记一次。"
            : "白小白还没有记录生理期。"
        ));
      }
      logs.forEach(function (log) {
        var item = el("div", "l-period-item");
        var main = el("div", "l-period-item-main");
        var range = shortCN(log.start) + (log.end ? " – " + shortCN(log.end) : " 开始");
        main.appendChild(el("strong", "", "白小白 · " + range));
        var meta = [];
        if (log.end) meta.push("共 " + (diffDays(log.start, log.end) + 1) + " 天");
        if (log.note) meta.push(log.note);
        if (meta.length) main.appendChild(el("span", "", meta.join(" · ")));
        item.appendChild(main);
        if (periodIsOwner()) {
          var actions = el("div", "l-period-item-actions");
          var edit = el("button", "l-row-action", "编辑");
          edit.type = "button";
          edit.setAttribute("data-period-edit", log.id);
          var archive = el("button", "l-row-action is-danger", "归档");
          archive.type = "button";
          archive.setAttribute("data-period-archive", log.id);
          actions.appendChild(edit);
          actions.appendChild(archive);
          item.appendChild(actions);
        }
        periodList.appendChild(item);
      });
    }

    if (hasData) loadPeriodTip(summary, person);
  }

  function openPeriodModal(log) {
    if (!periodForm || !periodIsOwner()) return;
    prepareModalForm(periodForm);
    openModal(log ? "编辑生理期记录" : "录入生理期");
    state.periodEditing = log ? log.id : null;
    named(periodForm, "start").value = log ? log.start || "" : today;
    named(periodForm, "end").value = log ? log.end || "" : "";
    named(periodForm, "note").value = log ? log.note || "" : "";
    setError(periodError, "");
    var focusField = named(periodForm, "start");
    if (focusField) {
      try { focusField.focus(); } catch (e) { /* ignore */ }
    }
  }

  function submitPeriod(evt) {
    evt.preventDefault();
    if (!periodForm || state.periodBusy) return;
    setError(periodError, "");
    var start = valueOf(periodForm, "start");
    var end = valueOf(periodForm, "end");
    if (!start) {
      setError(periodError, "先选一个开始日期。");
      return;
    }
    if (end && end < start) {
      setError(periodError, "结束日期不能早于开始日期。");
      return;
    }
    var editing = state.periodEditing;
    state.periodBusy = true;
    setBusy(periodSubmitButton, true, "保存中…");
    var request = editing
      ? api("/v1/period/" + encodeURIComponent(editing), {
        method: "PUT",
        body: { start: start, end: end, note: valueOf(periodForm, "note") }
      })
      : api("/v1/period", {
        method: "POST",
        body: { start: start, end: end, note: valueOf(periodForm, "note") }
      });
    request.then(function () {
      closeModal();
      state.periodTipCache = {};
      state.periodTipTried = {};
      toast(editing ? "记录已经更新。" : "已经记下这次。");
      return reload();
    }).catch(function (error) {
      if (error && error.status === 401) {
        closeModal();
        fail(error);
        return;
      }
      setError(periodError, (error && error.message) || "保存没有成功。");
    }).then(function () {
      state.periodBusy = false;
      setBusy(periodSubmitButton, false, "保存");
    });
  }

  function archivePeriod(id) {
    var log = periodLogs().filter(function (row) { return row.id === id; })[0];
    if (!log || !periodIsOwner()) return;
    askConfirm({
      title: "确认归档这条记录？",
      message: "「" + shortCN(log.start) + "」这条生理期记录会从页面隐藏，不会真正删除。",
      okLabel: "确认归档"
    }).then(function (ok) {
      if (!ok) return;
      api("/v1/period/" + encodeURIComponent(id) + "/archive", {
        method: "POST",
        body: {}
      }).then(function () {
        state.periodTipCache = {};
        state.periodTipTried = {};
        toast("记录已经归档。");
        return reload();
      }).catch(function (error) {
        fail(error, "归档没有成功。");
      });
    });
  }

  function renderAll() {
    renderHero();
    renderTogether();
    renderNext();
    renderGapHint();
    renderCalendar();
    renderDay(cal.selected);
    renderEventList();
    renderBucket();
    renderPeriod();
    updateMeta();
  }

  function selectDate(iso, shouldScroll) {
    if (!splitISO(iso)) return;
    cal.selected = iso;
    var parts = splitISO(iso);
    cal.y = parts.y;
    cal.m = parts.m;
    renderCalendar();
    renderDay(iso);
    if (shouldScroll) scrollToCalendar();
  }

  function scrollToCalendar() {
    var panel = $(".l-calendar-panel");
    if (!panel) return;
    var top = panel.getBoundingClientRect().top + window.pageYOffset - 82;
    try {
      window.scrollTo({
        top: top,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    } catch (e) {
      window.scrollTo(0, top);
    }
  }

  /* ---------- 数据加载 ---------- */

  function applyData(next) {
    var value = next || {};
    data = {
      room: value.room || {},
      people: Array.isArray(value.people) ? value.people : [],
      events: Array.isArray(value.events) ? value.events : [],
      bucketList: Array.isArray(value.bucketList) ? value.bucketList : [],
      timeline: Array.isArray(value.timeline) ? value.timeline : [],
      moods: Array.isArray(value.moods) ? value.moods : [],
      period: {
        logs: value.period && Array.isArray(value.period.logs) ? value.period.logs : [],
        summaries: value.period && value.period.summaries ? value.period.summaries : {}
      }
    };
    TZ = data.room.timezone || "Asia/Shanghai";
    today = todayISO();
    var parts = splitISO(today) || { y: new Date().getFullYear(), m: 1, d: 1 };
    cal = { y: parts.y, m: parts.m, selected: cal.selected && splitISO(cal.selected) ? cal.selected : today };
  }

  function loadLove() {
    return api("/v1/love").then(function (payload) {
      if (!payload || !payload.data) throw new Error("后端返回的数据不完整");
      if (payload.data.version && payload.data.version !== 2) throw new Error("后端版本不匹配，请刷新页面再试");
      state.data = payload.data;
      applyData(payload.data);
      renderAll();
      showApp();
    });
  }

  function reload() {
    return loadLove().catch(function (error) {
      fail(error, "刷新数据没有成功。");
    });
  }

  /* ---------- 弹层 ---------- */

  var modal = $("[data-modal]");
  var modalTitle = $("[data-modal-title]");
  var eventForm = $("[data-event-form]");
  var timelineForm = $("[data-timeline-form]");
  var bucketForm = $("[data-bucket-form]");
  var moodForm = $("[data-mood-form]");
  var moodDateLabel = $("[data-mood-date]");
  var eventError = $("[data-event-error]");
  var timelineError = $("[data-timeline-error]");
  var bucketError = $("[data-bucket-error]");
  var moodError = $("[data-mood-error]");
  var evDateField = $("[data-ev-date-field]");
  var evDatesField = $("[data-ev-dates-field]");
  var evLunarField = $("[data-ev-lunar-field]");
  var confirmBox = $("[data-confirm]");
  var confirmTitle = $("[data-confirm-title]");
  var confirmMessage = $("[data-confirm-message]");
  var confirmOk = $("[data-confirm-ok]");

  function modalOpen() {
    return modal ? !modal.hidden : false;
  }

  function syncBodyLock() {
    document.body.classList.toggle("has-modal", modalOpen() || (confirmBox && !confirmBox.hidden));
  }

  function openModal(title) {
    if (!modal) return;
    if (modalTitle) modalTitle.textContent = title;
    modal.hidden = false;
    syncBodyLock();
  }

  // 同一个弹层里放着几种表单，打开一种时把其它几张贴回去。
  function prepareModalForm(keep) {
    [eventForm, timelineForm, bucketForm, moodForm, giftHintForm, periodForm].forEach(function (form) {
      if (form && form !== keep) form.hidden = true;
    });
    if (keep) keep.hidden = false;
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    prepareModalForm(null);
    setError(eventError, "");
    setError(timelineError, "");
    setError(bucketError, "");
    setError(moodError, "");
    setError(giftHintError, "");
    setError(periodError, "");
    state.moodDate = "";
    state.periodEditing = null;
    syncBodyLock();
  }

  function askConfirm(options) {
    return new Promise(function (resolve) {
      if (!confirmBox) {
        resolve(window.confirm(options.message || "确认吗？"));
        return;
      }
      confirmResolve = resolve;
      if (confirmTitle) confirmTitle.textContent = options.title || "确认吗？";
      if (confirmMessage) confirmMessage.textContent = options.message || "";
      if (confirmOk) confirmOk.textContent = options.okLabel || "确认";
      confirmBox.hidden = false;
      syncBodyLock();
      if (confirmOk) {
        try { confirmOk.focus(); } catch (e) { /* ignore */ }
      }
    });
  }

  function closeConfirm(result) {
    if (!confirmBox) return;
    confirmBox.hidden = true;
    syncBodyLock();
    var resolve = confirmResolve;
    confirmResolve = null;
    if (resolve) resolve(!!result);
  }

  /* ---------- 重要日子表单 ---------- */

  function syncEventRepeatFields() {
    if (!eventForm) return;
    var repeat = valueOf(eventForm, "repeat") || "yearly";
    var isDates = repeat === "dates";
    if (evDateField) evDateField.hidden = isDates;
    if (evDatesField) evDatesField.hidden = !isDates;
    if (evLunarField) evLunarField.hidden = !isDates;
    var dateInput = named(eventForm, "date");
    if (dateInput) {
      dateInput.required = !isDates;
      dateInput.placeholder = repeat === "yearly" ? "MM-DD 或 YYYY-MM-DD" : "YYYY-MM-DD";
    }
  }

  function fillEventForm(event) {
    if (!eventForm) return;
    var item = event || {};
    state.editingEvent = event || null;
    named(eventForm, "title").value = item.title || "";
    named(eventForm, "repeat").value = item.repeat || "yearly";
    named(eventForm, "kind").value = item.kind || "anniversary";
    named(eventForm, "date").value = item.repeat === "dates" ? "" : (item.date || "");
    named(eventForm, "dates").value = Array.isArray(item.dates) ? item.dates.join("\n") : "";
    named(eventForm, "lunar").value = item.lunar || "";
    named(eventForm, "icon").value = item.icon || "";
    named(eventForm, "note").value = item.note || "";
    named(eventForm, "person").value = item.person || "";
    named(eventForm, "highlight").checked = !!item.highlight;
    setError(eventError, "");
    syncEventRepeatFields();
  }

  function openEventModal(event) {
    if (!eventForm) return;
    prepareModalForm(eventForm);
    openModal(event ? "编辑重要日子" : "新增重要日子");
    fillEventForm(event);
    var focusField = named(eventForm, "title");
    if (focusField) {
      try { focusField.focus(); } catch (e) { /* ignore */ }
    }
  }

  function parseDateLines(text) {
    var seen = {};
    return String(text || "")
      .split(/[\s,，;；]+/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(line) || seen[line]) return false;
        seen[line] = true;
        return true;
      })
      .sort();
  }

  function collectEventPayload() {
    var repeat = valueOf(eventForm, "repeat") || "yearly";
    var editing = state.editingEvent;
    return {
      title: valueOf(eventForm, "title"),
      date: repeat === "dates" ? "" : valueOf(eventForm, "date"),
      repeat: repeat,
      kind: valueOf(eventForm, "kind") || "anniversary",
      icon: valueOf(eventForm, "icon"),
      note: valueOf(eventForm, "note"),
      person: valueOf(eventForm, "person"),
      highlight: isChecked(eventForm, "highlight"),
      // 这两个开关不在信息墙表单里，编辑时保留原值，避免被清掉。
      home: !!(editing && editing.home),
      pin: !!(editing && editing.pin),
      lunar: repeat === "dates" ? valueOf(eventForm, "lunar") : "",
      dates: repeat === "dates" ? parseDateLines(valueOf(eventForm, "dates")) : []
    };
  }

  function submitEvent(evt) {
    evt.preventDefault();
    if (!eventForm || state.eventBusy) return;
    setError(eventError, "");

    var payload = collectEventPayload();
    if (!payload.title) {
      setError(eventError, "标题不能为空。");
      return;
    }
    if (payload.repeat !== "dates" && !payload.date) {
      setError(eventError, "日期不能为空。");
      return;
    }
    if (payload.repeat === "dates" && !payload.dates.length) {
      setError(eventError, "至少写一个 YYYY-MM-DD 的日期。");
      return;
    }

    var editing = state.editingEvent;
    var submit = $("[data-event-submit]", eventForm);
    state.eventBusy = true;
    setBusy(submit, true);
    var request = editing
      ? api("/v1/events/" + encodeURIComponent(editing.id), { method: "PUT", body: payload })
      : api("/v1/events", { method: "POST", body: payload });

    request.then(function (result) {
      closeModal();
      toast(editing ? "已经保存。" : "新的重要日子已经加上了。");
      if (editing && result && result.changed === 0) toast("没有改动。");
      return reload();
    }).catch(function (error) {
      if (error && error.status === 401) {
        closeModal();
        fail(error);
        return;
      }
      setError(eventError, (error && error.message) || "保存没有成功。");
    }).then(function () {
      state.eventBusy = false;
      setBusy(submit, false);
    });
  }

  /* ---------- 时间线表单 ---------- */

  function fillTimelineForm(item) {
    if (!timelineForm) return;
    var value = item || {};
    state.editingTimeline = item || null;
    named(timelineForm, "date").value = value.date || today;
    named(timelineForm, "title").value = value.title || "";
    named(timelineForm, "kind").value = value.kind === "milestone" ? "milestone" : "date";
    named(timelineForm, "person").value = value.person || "";
    named(timelineForm, "note").value = value.note || "";
    setError(timelineError, "");
  }

  function openTimelineModal(item) {
    if (!timelineForm) return;
    prepareModalForm(timelineForm);
    openModal(item ? "编辑约会 / 大事记" : "新增约会 / 大事记");
    fillTimelineForm(item);
    var focusField = named(timelineForm, "title");
    if (focusField) {
      try { focusField.focus(); } catch (e) { /* ignore */ }
    }
  }

  function submitTimeline(evt) {
    evt.preventDefault();
    if (!timelineForm || state.timelineBusy) return;
    setError(timelineError, "");

    var editing = state.editingTimeline;
    var payload = {
      date: valueOf(timelineForm, "date"),
      title: valueOf(timelineForm, "title"),
      kind: valueOf(timelineForm, "kind") || "date",
      person: valueOf(timelineForm, "person"),
      note: valueOf(timelineForm, "note")
    };
    if (!payload.date) {
      setError(timelineError, "日期不能为空。");
      return;
    }
    if (!payload.title) {
      setError(timelineError, "标题不能为空。");
      return;
    }

    var submit = $("[data-timeline-submit]", timelineForm);
    state.timelineBusy = true;
    setBusy(submit, true);
    var request = editing
      ? api("/v1/timeline/" + encodeURIComponent(editing.id), { method: "PUT", body: payload })
      : api("/v1/timeline", { method: "POST", body: payload });

    request.then(function (result) {
      closeModal();
      toast(editing ? "已经保存。" : "已经加进我们的重要日子。");
      if (editing && result && result.changed === 0) toast("没有改动。");
      return reload();
    }).catch(function (error) {
      if (error && error.status === 401) {
        closeModal();
        fail(error);
        return;
      }
      setError(timelineError, (error && error.message) || "保存没有成功。");
    }).then(function () {
      state.timelineBusy = false;
      setBusy(submit, false);
    });
  }

  /* ---------- 心情表单 ---------- */

  function fillMoodForm(iso) {
    if (!moodForm) return;
    state.moodDate = iso;
    var row = moodRowOf(iso, state.person);
    named(moodForm, "mood").value = row && MOODS[row.mood] ? row.mood : "";
    named(moodForm, "shared").value = row && row.shared === false ? "0" : "1";
    if (moodDateLabel) {
      moodDateLabel.textContent = formatDateCN(iso, true) + (iso === today ? " · 今天" : "");
    }
    setError(moodError, "");
  }

  function openMoodModal(iso) {
    if (!moodForm || !splitISO(iso)) return;
    prepareModalForm(moodForm);
    openModal("记录这一天的心情");
    fillMoodForm(iso);
    var focusField = named(moodForm, "mood");
    if (focusField) {
      try { focusField.focus(); } catch (e) { /* ignore */ }
    }
  }

  function submitMood(evt) {
    evt.preventDefault();
    if (!moodForm || state.moodBusy) return;
    setError(moodError, "");
    var iso = state.moodDate;
    if (!splitISO(iso)) {
      setError(moodError, "先选一个日期。");
      return;
    }
    var payload = {
      mood: valueOf(moodForm, "mood"),
      shared: valueOf(moodForm, "shared") !== "0"
    };
    var submit = $("[data-mood-submit]", moodForm);
    state.moodBusy = true;
    setBusy(submit, true, "正在保存…");
    api("/v1/moods/" + encodeURIComponent(iso), { method: "PUT", body: payload })
      .then(function (result) {
        closeModal();
        toast(payload.mood ? "这一天的心情已经记下了。" : "这一天的记录已经清掉了。");
        if (result && result.changed === false) toast("没有改动。");
        return reload();
      })
      .catch(function (error) {
        if (error && error.status === 401) {
          closeModal();
          fail(error);
          return;
        }
        setError(moodError, (error && error.message) || "保存没有成功。");
      })
      .then(function () {
        state.moodBusy = false;
        setBusy(submit, false, "保存");
      });
  }

  /* ---------- 共同清单表单 ---------- */

  function fillBucketForm(item) {
    if (!bucketForm) return;
    var value = item || {};
    state.editingBucket = item || null;
    named(bucketForm, "title").value = value.title || "";
    named(bucketForm, "category").value = value.category || "";
    named(bucketForm, "doneAt").value = value.doneAt || "";
    named(bucketForm, "note").value = value.note || "";
    named(bucketForm, "done").checked = !!value.done;
    setError(bucketError, "");
  }

  function openBucketModal(item) {
    if (!bucketForm) return;
    prepareModalForm(bucketForm);
    openModal(item ? "编辑清单项" : "新增清单项");
    fillBucketForm(item);
    var focusField = named(bucketForm, "title");
    if (focusField) {
      try { focusField.focus(); } catch (e) { /* ignore */ }
    }
  }

  function submitBucket(evt) {
    evt.preventDefault();
    if (!bucketForm || state.bucketBusy) return;
    setError(bucketError, "");

    var done = isChecked(bucketForm, "done");
    var doneAt = valueOf(bucketForm, "doneAt");
    if (done && !doneAt) {
      doneAt = today;
      named(bucketForm, "doneAt").value = doneAt;
    }
    var payload = {
      title: valueOf(bucketForm, "title"),
      category: valueOf(bucketForm, "category"),
      done: done,
      doneAt: done ? doneAt : "",
      note: valueOf(bucketForm, "note")
    };
    if (!payload.title) {
      setError(bucketError, "想一起做的事不能为空。");
      return;
    }

    var editing = state.editingBucket;
    var submit = $("[data-bucket-submit]", bucketForm);
    state.bucketBusy = true;
    setBusy(submit, true);
    var request = editing
      ? api("/v1/bucket/" + encodeURIComponent(editing.id), { method: "PUT", body: payload })
      : api("/v1/bucket", { method: "POST", body: payload });

    request.then(function (result) {
      closeModal();
      toast(editing ? "已经保存。" : "已经加到共同清单。");
      if (editing && result && result.changed === 0) toast("没有改动。");
      return reload();
    }).catch(function (error) {
      if (error && error.status === 401) {
        closeModal();
        fail(error);
        return;
      }
      setError(bucketError, (error && error.message) || "保存没有成功。");
    }).then(function () {
      state.bucketBusy = false;
      setBusy(submit, false);
    });
  }

  function toggleBucket(id) {
    var item = data.bucketList.filter(function (row) { return row.id === id; })[0];
    if (!item) return;
    var nextDone = !item.done;
    api("/v1/bucket/" + encodeURIComponent(id), {
      method: "PUT",
      body: {
        title: item.title,
        category: item.category || "",
        done: nextDone,
        doneAt: nextDone ? today : "",
        note: item.note || ""
      }
    }).then(function () {
      toast(nextDone ? "完成一件，记下来了。" : "已经放回待完成。");
      return reload();
    }).catch(function (error) {
      fail(error, "清单没有保存成功。");
    });
  }

  /* ---------- 归档 ---------- */

  function findEntry(source, id) {
    var list = source === "timeline" ? data.timeline : data.events;
    return list.filter(function (row) { return row.id === id; })[0] || null;
  }

  function archiveEntry(source, id) {
    var item = findEntry(source, id);
    if (!item) return;
    var label = source === "timeline" ? "约会 / 大事记" : "重要日子";
    askConfirm({
      title: "确认归档？",
      message: "「" + (item.title || label) + "」会从信息墙和日历里隐藏，不会真正删除。",
      okLabel: "确认归档"
    }).then(function (ok) {
      if (!ok) return;
      api("/v1/" + (source === "timeline" ? "timeline" : "events") + "/" + encodeURIComponent(id) + "/archive", {
        method: "POST",
        body: {}
      }).then(function () {
        toast("已经归档。");
        return reload();
      }).catch(function (error) {
        fail(error, "归档没有成功。");
      });
    });
  }

  function archiveBucket(id) {
    var item = data.bucketList.filter(function (row) { return row.id === id; })[0];
    if (!item) return;
    askConfirm({
      title: "确认归档？",
      message: "「" + (item.title || "清单项") + "」会从共同清单里隐藏，不会真正删除。",
      okLabel: "确认归档"
    }).then(function (ok) {
      if (!ok) return;
      api("/v1/bucket/" + encodeURIComponent(id) + "/archive", {
        method: "POST",
        body: {}
      }).then(function () {
        toast("已经归档。");
        return reload();
      }).catch(function (error) {
        fail(error, "归档没有成功。");
      });
    });
  }

  /* ---------- 一句话录入 ---------- */

  var aiForm = $("[data-ai-form]");
  var aiError = $("[data-ai-error]");
  var aiMessage = $("[data-ai-message]");
  var aiResult = $("[data-ai-result]");
  var aiSummary = $("[data-ai-summary]");
  var aiClarify = $("[data-ai-clarify]");
  var aiRejected = $("[data-ai-rejected]");
  var aiOps = $("[data-ai-ops]");
  var aiParse = $("[data-ai-parse]");
  var aiApply = $("[data-ai-apply]");

  function clearAiMessage() {
    setError(aiError, "");
    if (aiMessage) {
      aiMessage.textContent = "";
      aiMessage.hidden = true;
    }
  }

  function showAiMessage(message) {
    if (!aiMessage) return;
    aiMessage.textContent = message || "";
    aiMessage.hidden = !message;
  }

  function clearAiPlan() {
    state.aiPlan = null;
    if (aiResult) aiResult.hidden = true;
    if (aiOps) aiOps.innerHTML = "";
    if (aiSummary) aiSummary.textContent = "";
    if (aiClarify) {
      aiClarify.textContent = "";
      aiClarify.hidden = true;
    }
    if (aiRejected) {
      aiRejected.innerHTML = "";
      aiRejected.hidden = true;
    }
  }

  function renderAiPlan(plan) {
    if (!aiResult || !aiOps) return;
    clearAiPlan();
    state.aiPlan = plan;
    aiResult.hidden = false;
    if (aiSummary) aiSummary.textContent = plan.summary || ("整理出 " + plan.operations.length + " 条改动");
    if (aiClarify) {
      var note = plan.clarify || "";
      aiClarify.textContent = note ? "AI 有点不确定：" + note : "";
      aiClarify.hidden = !note;
    }
    if (aiRejected) {
      var rejected = plan.rejected || [];
      aiRejected.innerHTML = "";
      rejected.forEach(function (item) {
        aiRejected.appendChild(el("li", "", "第 " + (item.index + 1) + " 条没有采用：" + item.reason));
      });
      aiRejected.hidden = !rejected.length;
    }
    (plan.operations || []).forEach(function (op) {
      var label = el("label", "l-ai-op");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.value = String(op.index);
      checkbox.setAttribute("data-ai-op", String(op.index));
      label.appendChild(checkbox);
      var body = el("span", "l-ai-op-body");
      body.appendChild(el("strong", "", op.preview || "一条改动"));
      body.appendChild(el("small", "", (ENTITY_LABELS[op.entity] || op.entity) + " · " + (ACTION_LABELS[op.action] || op.action)));
      label.appendChild(body);
      aiOps.appendChild(label);
    });
  }

  function submitAiParse(evt) {
    evt.preventDefault();
    if (!aiForm || state.aiBusy) return;
    clearAiMessage();
    var text = valueOf(aiForm, "text");
    if (!text) {
      setError(aiError, "先说一句想做什么。");
      return;
    }
    state.aiBusy = true;
    clearAiPlan();
    setBusy(aiParse, true, "正在理解…");
    api("/v1/ai/parse", { method: "POST", body: { text: text } })
      .then(function (payload) {
        if (payload && payload.redline) {
          showAiMessage(payload.message || "有些事情，可以亲口跟小狗说噢。");
          return;
        }
        if (payload && payload.plan) {
          renderAiPlan(payload.plan);
          return;
        }
        showAiMessage((payload && payload.clarify) || "这次没有听出要改什么，可以再说具体一点。");
      })
      .catch(function (error) {
        if (error && error.status === 401) {
          fail(error);
          return;
        }
        setError(aiError, (error && error.message) || "AI 暂时没有理解，请再试一次。");
      })
      .then(function () {
        state.aiBusy = false;
        setBusy(aiParse, false, "解析这句话");
      });
  }

  function applyAiPlan() {
    if (!state.aiPlan || !aiOps || state.aiBusy) return;
    clearAiMessage();
    setError(aiError, "");
    var checked = $$("[data-ai-op]", aiOps).filter(function (input) { return input.checked; });
    if (!checked.length) {
      setError(aiError, "至少选一条要写入的改动。");
      return;
    }
    var accepted = checked.map(function (input) { return Number(input.value); });
    state.aiBusy = true;
    setBusy(aiApply, true, "正在写入…");
    api("/v1/ai/apply", { method: "POST", body: { planId: state.aiPlan.id, accepted: accepted } })
      .then(function (payload) {
        var failed = payload && Array.isArray(payload.results)
          ? payload.results.filter(function (item) { return !item.ok; })
          : [];
        var applied = payload && typeof payload.applied === "number" ? payload.applied : accepted.length;
        if (failed.length) {
          toast("写入了 " + applied + " 条，有 " + failed.length + " 条没有成功。", true);
        } else {
          toast("已经写入 " + applied + " 条。");
        }
        clearAiPlan();
        if (aiForm) named(aiForm, "text").value = "";
        return reload();
      })
      .catch(function (error) {
        if (error && error.status === 401) {
          fail(error);
          return;
        }
        if (error && error.status === 409) {
          var message = "有一条刚被改过，请重新解析一下。";
          if (error.payload && error.payload.error === "plan_used") message = "这个预览已经执行过了，请重新解析。";
          setError(aiError, message);
          clearAiPlan();
          return reload();
        }
        if (error && error.status === 410) {
          setError(aiError, "预览过期了，请重新解析。");
          clearAiPlan();
          return reload();
        }
        setError(aiError, (error && error.message) || "写入没有成功。");
      })
      .then(function () {
        state.aiBusy = false;
        setBusy(aiApply, false, "确认写入");
      });
  }

  /* ---------- 导出 .ics ---------- */

  function icsEscape(text) {
    return String(text == null ? "" : text)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function icsDate(iso) {
    return String(iso || "").replace(/-/g, "");
  }

  function icsFold(line) {
    var encoder = new TextEncoder();
    var text = String(line == null ? "" : line);
    if (encoder.encode(text).length <= 75) return text;

    var parts = [];
    var current = "";
    var limit = 75;
    var currentBytes = 0;
    for (var i = 0; i < text.length; i++) {
      var char = text.charAt(i);
      var code = text.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
        var next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          char += text.charAt(i + 1);
          i += 1;
        }
      }
      var charBytes = encoder.encode(char).length;
      if (currentBytes + charBytes > limit) {
        parts.push(current);
        current = char;
        currentBytes = charBytes;
        limit = 74;
      } else {
        current += char;
        currentBytes += charBytes;
      }
    }
    parts.push(current);
    return parts.map(function (part, index) {
      return index === 0 ? part : " " + part;
    }).join("\r\n");
  }

  function icsStamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function pushIcsEvent(lines, stamp, uid, iso, summary, description, recurring) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + icsEscape(uid + "@xm9.asia"));
    lines.push("DTSTAMP:" + stamp);
    lines.push("DTSTART;VALUE=DATE:" + icsDate(iso));
    lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(iso, 1)));
    if (recurring) lines.push("RRULE:FREQ=YEARLY");
    lines.push("SUMMARY:" + icsEscape(summary || "重要日子"));
    lines.push("DESCRIPTION:" + icsEscape(description.join("\n")));
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  function buildCalendar() {
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//xm9.asia//Love Story//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape(data.room.title || "鸡毛鸡和白小白"),
      "X-WR-TIMEZONE:" + icsEscape(TZ),
      "X-WR-CALDESC:" + icsEscape(data.room.subtitle || "")
    ];
    var stamp = icsStamp();
    var todayParts = splitISO(today) || { y: new Date().getFullYear(), m: 1, d: 1 };

    data.events.forEach(function (event) {
      if (!event || event.archived) return;
      var occurrences = [];

      if (event.repeat === "yearly") {
        var date = String(event.date || "");
        var startYear = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : todayParts.y;
        var seeds = yearlySeed(event, startYear);
        while (!seeds.length && startYear < todayParts.y + 8) {
          startYear += 1;
          seeds = yearlySeed(event, startYear);
        }
        if (seeds.length) occurrences.push({ iso: seeds[0], recurring: true });
      } else if (event.repeat === "none") {
        if (splitISO(event.date)) occurrences.push({ iso: event.date, recurring: false });
      } else if (event.repeat === "dates") {
        (Array.isArray(event.dates) ? event.dates : []).forEach(function (date) {
          if (splitISO(date)) occurrences.push({ iso: date, recurring: false });
        });
      }

      occurrences.forEach(function (occurrence) {
        var description = [];
        if (event.note) description.push(event.note);
        description.push("来自 " + (data.room.title || "鸡毛鸡和白小白"));
        pushIcsEvent(lines, stamp,
          String(event.id || "event") + "-" + icsDate(occurrence.iso),
          occurrence.iso, event.title || "重要日子", description, occurrence.recurring);
      });
    });

    data.timeline.forEach(function (item) {
      if (!item || item.archived || !splitISO(item.date)) return;
      var description = [item.kind === "milestone" ? "大事记" : "约会啦"];
      if (item.note) description.push(item.note);
      description.push("来自 " + (data.room.title || "鸡毛鸡和白小白"));
      pushIcsEvent(lines, stamp,
        String(item.id || "timeline") + "-" + icsDate(item.date),
        item.date, item.title || "约会记录", description, false);
    });

    lines.push("END:VCALENDAR");
    return lines.map(icsFold).join("\r\n") + "\r\n";
  }

  function exportCalendar() {
    var hint = $("[data-love-export-hint]");
    function showHint(text) {
      if (!hint) return;
      hint.textContent = text;
      hint.hidden = false;
      window.clearTimeout(showHint.timer);
      showHint.timer = window.setTimeout(function () { hint.hidden = true; }, 3200);
    }
    try {
      var text = buildCalendar();
      var blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "our-days.ics";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      showHint("日历文件已生成，可以导入手机日历了。");
    } catch (e) {
      showHint("导出没有成功，请换一个浏览器再试。");
    }
  }

  /* ---------- 事件绑定 ---------- */

  if (themeButton) themeButton.addEventListener("click", toggleTheme);
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

  if (loginForm) loginForm.addEventListener("submit", function (evt) {
    evt.preventDefault();
    setError(loginError, "");
    var personField = $('input[name="person"]:checked', loginForm);
    var person = personField ? personField.value : "jmj";
    var key = valueOf(loginForm, "key");
    if (!key) {
      setError(loginError, "先输入操作密钥。");
      return;
    }
    setBusy(loginSubmit, true, "正在验证…");
    api("/v1/session", { method: "POST", body: { person: person, key: key } })
      .then(function (payload) {
        if (!payload || !payload.token) throw new Error("登录没有拿到 token");
        state.token = payload.token;
        state.person = payload.person || person;
        state.expiresAt = payload.expiresAt || new Date(Date.now() + SESSION_TTL_FALLBACK).toISOString();
        saveSession();
        return loadLove();
      })
      .then(function () {
        var keyField = named(loginForm, "key");
        if (keyField) keyField.value = "";
      })
      .catch(function (error) {
        clearSession();
        showLogin(loginErrorMessage(error));
      })
      .then(function () {
        setBusy(loginSubmit, false, "进入信息墙");
      });
  });

  if (logoutButton) logoutButton.addEventListener("click", function () {
    clearSession();
    showLogin("");
    toast("已经退出。");
  });

  var calGrid = $("[data-cal-grid]");
  if (calGrid) calGrid.addEventListener("click", function (event) {
    var cell = event.target.closest(".l-cal-cell");
    if (cell && cell.getAttribute("data-date")) selectDate(cell.getAttribute("data-date"), false);
  });

  var prevButton = $("[data-cal-prev]");
  if (prevButton) prevButton.addEventListener("click", function () {
    cal.m -= 1;
    if (cal.m < 1) { cal.m = 12; cal.y -= 1; }
    renderCalendar();
  });

  var nextButton = $("[data-cal-next]");
  if (nextButton) nextButton.addEventListener("click", function () {
    cal.m += 1;
    if (cal.m > 12) { cal.m = 1; cal.y += 1; }
    renderCalendar();
  });

  var todayButton = $("[data-cal-today]");
  if (todayButton) todayButton.addEventListener("click", function () {
    selectDate(today, false);
  });

  var gapDismiss = $("[data-gap-dismiss]");
  if (gapDismiss) gapDismiss.addEventListener("click", function () {
    var box = $("[data-gap-hint]");
    dismissGap(box ? box.getAttribute("data-weekend") : "");
    if (box) box.hidden = true;
  });

  var nextJump = $("[data-love-next-jump]");
  if (nextJump) nextJump.addEventListener("click", function () {
    var iso = nextJump.getAttribute("data-date");
    if (iso) selectDate(iso, true);
  });

  var eventList = $("[data-love-event-list]");
  if (eventList) eventList.addEventListener("click", function (event) {
    var edit = event.target.closest("[data-edit-entry]");
    if (edit) {
      var editKey = edit.getAttribute("data-edit-entry").split(":");
      var editEntry = findEntry(editKey[0], editKey[1]);
      if (editEntry) {
        if (editKey[0] === "timeline") openTimelineModal(editEntry);
        else openEventModal(editEntry);
      }
      return;
    }
    var archive = event.target.closest("[data-archive-entry]");
    if (archive) {
      var archiveKey = archive.getAttribute("data-archive-entry").split(":");
      archiveEntry(archiveKey[0], archiveKey[1]);
      return;
    }
    var open = event.target.closest("[data-jump-date]");
    var iso = open && open.getAttribute("data-jump-date");
    if (iso) selectDate(iso, true);
  });

  var tabsNode = $("[data-day-tabs]");
  if (tabsNode) tabsNode.addEventListener("click", function (event) {
    var tab = event.target.closest("[data-day-filter]");
    if (!tab) return;
    state.dayFilter = tab.getAttribute("data-day-filter");
    renderEventList();
    var listNode = $("[data-love-event-list]");
    if (listNode) listNode.scrollTop = 0;
  });

  var bucketListNode = $("[data-love-bucket-list]");
  if (bucketListNode) bucketListNode.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-bucket-toggle]");
    if (toggle) {
      toggleBucket(toggle.getAttribute("data-bucket-toggle"));
      return;
    }
    var edit = event.target.closest("[data-edit-bucket]");
    if (edit) {
      var item = data.bucketList.filter(function (row) { return row.id === edit.getAttribute("data-edit-bucket"); })[0];
      if (item) openBucketModal(item);
      return;
    }
    var archive = event.target.closest("[data-archive-bucket]");
    if (archive) archiveBucket(archive.getAttribute("data-archive-bucket"));
  });

  var addEvent = $("[data-day-add-event]");
  if (addEvent) addEvent.addEventListener("click", function () { openEventModal(null); });
  var addTimeline = $("[data-day-add-timeline]");
  if (addTimeline) addTimeline.addEventListener("click", function () { openTimelineModal(null); });
  var addBucket = $("[data-bucket-add]");
  if (addBucket) addBucket.addEventListener("click", function () { openBucketModal(null); });
  var drawOpen = $("[data-draw-open]");
  if (drawOpen) drawOpen.addEventListener("click", drawNewIdea);
  var drawAgain = $("[data-draw-again]");
  if (drawAgain) drawAgain.addEventListener("click", drawNewIdea);
  var drawAdd = $("[data-draw-add]");
  if (drawAdd) drawAdd.addEventListener("click", addDrawIdea);
  var moodEdit = $("[data-mood-edit]");
  if (moodEdit) moodEdit.addEventListener("click", function () { openMoodModal(cal.selected); });

  if (giftWishToggle) giftWishToggle.addEventListener("click", function () {
    setGiftWishOpen(!state.giftWishOpen);
  });
  if (giftWishForm) giftWishForm.addEventListener("submit", submitGiftWish);
  if (giftPlanForm) giftPlanForm.addEventListener("submit", submitGiftPlan);
  if (giftHintOpen) giftHintOpen.addEventListener("click", openGiftHintModal);
  if (giftHintForm) giftHintForm.addEventListener("submit", submitGiftHint);

  var periodAdd = $("[data-period-add]");
  if (periodAdd) periodAdd.addEventListener("click", function () { openPeriodModal(null); });
  if (periodForm) periodForm.addEventListener("submit", submitPeriod);
  if (periodList) periodList.addEventListener("click", function (event) {
    var edit = event.target.closest("[data-period-edit]");
    if (edit) {
      var editId = edit.getAttribute("data-period-edit");
      var editLog = periodLogs().filter(function (row) { return row.id === editId; })[0];
      if (editLog) openPeriodModal(editLog);
      return;
    }
    var archive = event.target.closest("[data-period-archive]");
    if (archive) archivePeriod(archive.getAttribute("data-period-archive"));
  });

  $$("[data-modal-close]").forEach(function (node) {
    node.addEventListener("click", closeModal);
  });
  $$("[data-confirm-cancel]").forEach(function (node) {
    node.addEventListener("click", function () { closeConfirm(false); });
  });
  if (confirmOk) confirmOk.addEventListener("click", function () { closeConfirm(true); });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (confirmBox && !confirmBox.hidden) closeConfirm(false);
    else if (modalOpen()) closeModal();
  });

  if (eventForm) eventForm.addEventListener("submit", submitEvent);
  if (timelineForm) timelineForm.addEventListener("submit", submitTimeline);
  if (bucketForm) bucketForm.addEventListener("submit", submitBucket);
  if (moodForm) moodForm.addEventListener("submit", submitMood);
  var repeatField = eventForm ? named(eventForm, "repeat") : null;
  if (repeatField) repeatField.addEventListener("change", syncEventRepeatFields);

  if (aiForm) aiForm.addEventListener("submit", submitAiParse);
  if (aiApply) aiApply.addEventListener("click", applyAiPlan);
  var aiCancel = $("[data-ai-cancel]");
  if (aiCancel) aiCancel.addEventListener("click", function () {
    clearAiPlan();
    clearAiMessage();
  });

  var exportButton = $("[data-love-export]");
  if (exportButton) exportButton.addEventListener("click", exportCalendar);

  /* ---------- 启动 ---------- */

  today = todayISO();
  (function initCalendar() {
    var parts = splitISO(today) || { y: new Date().getFullYear(), m: 1, d: 1 };
    cal = { y: parts.y, m: parts.m, selected: today };
  })();

  var saved = readSession();
  if (saved) {
    state.token = saved.token;
    state.person = saved.person || "";
    state.expiresAt = saved.expiresAt || "";
    var expires = new Date(state.expiresAt).getTime();
    if (!isFinite(expires) || expires <= Date.now()) {
      clearSession();
      showLogin("登录已过期，请重新输入密钥。");
    } else {
      loadLove().catch(function (error) {
        if (error && error.status === 401) {
          clearSession();
          showLogin("登录已失效，请重新输入密钥。");
          return;
        }
        showLogin((error && error.message) || "信息墙没有加载出来，请刷新再试。");
      });
    }
  } else {
    showLogin("");
  }

  // 页面跨过零点时，把「今天」和倒计时一起翻页。
  window.setInterval(function () {
    var current = todayISO();
    if (current !== today) {
      today = current;
      var parts = splitISO(today);
      if (parts) {
        cal.y = parts.y;
        cal.m = parts.m;
        cal.selected = today;
      }
      if (state.data) renderAll();
    }
  }, 60000);
})();
