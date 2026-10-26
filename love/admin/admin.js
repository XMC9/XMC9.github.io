/* Love Story 管理页：只跟 love-api 打交道，不在前端保存任何密钥。
 * 登录后拿到 2 小时有效的 token，放在 sessionStorage（关掉标签页就没了）。
 */
(function () {
  "use strict";

  var SESSION_KEY = "love-admin-session-v1";
  var SESSION_TTL_FALLBACK = 2 * 60 * 60 * 1000;
  var TZ = "Asia/Shanghai";

  var KIND_LABELS = {
    birthday: "生日",
    anniversary: "纪念日",
    valentine: "情人节",
    qixi: "七夕",
    meeting: "见面",
    custom: "自定义"
  };
  var REPEAT_LABELS = {
    yearly: "每年",
    none: "仅一次",
    dates: "指定日期"
  };
  var ACTION_LABELS = {
    create: "新增",
    update: "修改",
    archive: "归档",
    restore: "恢复"
  };
  var ENTITY_LABELS = {
    event: "日子",
    bucket: "清单",
    person: "成员",
    room: "文案"
  };
  var FIELD_LABELS = {
    title: "标题",
    date: "日期",
    repeat: "重复方式",
    kind: "类型",
    icon: "图标",
    note: "备注",
    person: "成员",
    highlight: "高亮",
    home: "首页",
    pin: "置顶",
    lunar: "农历",
    dates: "日期列表",
    name: "名字",
    birthday: "生日",
    emoji: "图标",
    archived: "状态",
    category: "分类",
    done: "完成",
    doneAt: "完成日期",
    eyebrow: "顶部小字",
    subtitle: "副标题",
    togetherSince: "起始日",
    timezone: "时区",
    readOnlyNote: "底部小字",
    footerNote: "页脚备注",
    postcardNote: "明信片文案"
  };

  var state = {
    token: "",
    person: "",
    expiresAt: "",
    data: null,
    editingEvent: null,
    editingBucket: null
  };

  var root = document.documentElement;
  var loginView = document.querySelector("[data-login-view]");
  var appView = document.querySelector("[data-app-view]");
  var loginForm = document.querySelector("[data-login-form]");
  var loginError = document.querySelector("[data-login-error]");
  var loginSubmit = document.querySelector("[data-login-submit]");
  var logoutButton = document.querySelector("[data-logout]");
  var appTitle = document.querySelector("[data-app-title]");
  var appMeta = document.querySelector("[data-app-meta]");
  var roomForm = document.querySelector("[data-room-form]");
  var roomUpdated = document.querySelector("[data-room-updated]");
  var peopleList = document.querySelector("[data-people-list]");
  var eventList = document.querySelector("[data-event-list]");
  var bucketList = document.querySelector("[data-bucket-list]");
  var auditList = document.querySelector("[data-audit-list]");
  var eventsArchived = document.querySelector("[data-events-archived]");
  var bucketArchived = document.querySelector("[data-bucket-archived]");
  var eventAdd = document.querySelector("[data-event-add]");
  var bucketAdd = document.querySelector("[data-bucket-add]");

  var modal = document.querySelector("[data-modal]");
  var modalTitle = document.querySelector("[data-modal-title]");
  var eventForm = document.querySelector("[data-event-form]");
  var bucketForm = document.querySelector("[data-bucket-form]");
  var eventError = document.querySelector("[data-event-error]");
  var bucketError = document.querySelector("[data-bucket-error]");
  var evIdField = document.querySelector("[data-ev-id-field]");
  var evDateField = document.querySelector("[data-ev-date-field]");
  var evDatesField = document.querySelector("[data-ev-dates-field]");
  var evLunarField = document.querySelector("[data-ev-lunar-field]");

  var confirmBox = document.querySelector("[data-confirm]");
  var confirmTitle = document.querySelector("[data-confirm-title]");
  var confirmMessage = document.querySelector("[data-confirm-message]");
  var confirmOk = document.querySelector("[data-confirm-ok]");
  var confirmResolve = null;

  var toastEl = document.querySelector("[data-toast]");
  var toastTimer = 0;

  /* ---------- 小工具 ---------- */

  var $ = function (selector, scope) {
    return (scope || document).querySelector(selector);
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function named(form, name) {
    return form.elements[name];
  }

  function valueOf(form, name) {
    var field = named(form, name);
    return field ? String(field.value || "").trim() : "";
  }

  function isChecked(form, name) {
    var field = named(form, name);
    return !!(field && field.checked);
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
      if (map.year && map.month && map.day) return map.year + "-" + map.month + "-" + map.day;
    } catch (e) { /* 本地日期兜底 */ }
    var now = new Date();
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }

  function personLabel(id) {
    if (id === "jmj") return "鸡毛鸡";
    if (id === "bxb") return "白小白";
    return id || "";
  }

  function shortValue(value) {
    var text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    if (!text) return "空";
    return text.length > 18 ? text.slice(0, 18) + "…" : text;
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

  function toast(message, isError) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", !!isError);
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.hidden = true;
    }, 3800);
  }

  /* ---------- 主题 ---------- */

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

  /* ---------- 接口 ---------- */

  var apiBaseCache = "";

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

    // 网络错误，或同源入口被 Pages 接走（404/405/5xx）时，才值得换备用地址；
    // 401（密钥错）、429（锁定）这类业务错误必须原样交给页面。
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
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function showLogin(message) {
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    setError(loginError, message || "");
    var keyInput = loginForm ? named(loginForm, "key") : null;
    if (keyInput) {
      keyInput.value = "";
      try { keyInput.focus(); } catch (e) { /* ignore */ }
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
    var left = expires - Date.now();
    var minutes = Math.ceil(left / 60000);
    var leftText = minutes >= 60
      ? Math.floor(minutes / 60) + " 小时 " + (minutes % 60) + " 分"
      : minutes + " 分钟";
    appMeta.textContent = "以 " + personLabel(state.person) + " 的身份整理 · 登录还剩 " + leftText;
  }

  /* ---------- 数据加载 ---------- */

  function loadAdmin() {
    return api("/v1/admin").then(function (payload) {
      if (!payload || !payload.data) throw new Error("后端返回的数据不完整");
      state.data = payload.data;
      var room = state.data.room || {};
      if (appTitle && room.title) appTitle.textContent = room.title;
      render();
      showApp();
      updateMeta();
    });
  }

  function reload() {
    return loadAdmin().catch(function (error) {
      fail(error, "刷新数据没有成功。");
    });
  }

  /* ---------- 渲染：文案 / 两个人 ---------- */

  function fillRoomForm() {
    if (!roomForm || !state.data) return;
    var room = state.data.room || {};
    ["title", "eyebrow", "subtitle", "togetherSince", "readOnlyNote", "footerNote", "postcardNote"].forEach(function (key) {
      var field = named(roomForm, key);
      if (field) field.value = room[key] || "";
    });
    if (roomUpdated) {
      roomUpdated.textContent = room.updatedAt ? "更新于 " + room.updatedAt.replace(/-/g, ".") : "还没有更新时间";
    }
  }

  function personCard(person) {
    var card = el("form", "la-person-card");
    card.setAttribute("data-person-form", person.id);

    var head = el("div", "la-person-head");
    head.appendChild(el("span", "la-person-emoji", person.emoji || "♡"));
    head.appendChild(el("strong", "", person.name || person.id));
    head.appendChild(el("span", "la-person-id", person.id));
    card.appendChild(head);

    var grid = el("div", "la-grid");
    [
      { name: "name", label: "名字", value: person.name, max: 20 },
      { name: "birthday", label: "生日（MM-DD）", value: person.birthday, max: 5, placeholder: "10-15" },
      { name: "emoji", label: "图标", value: person.emoji, max: 16, placeholder: "🐥" }
    ].forEach(function (field) {
      var label = el("label", "la-field");
      label.appendChild(el("span", "", field.label));
      var input = el("input");
      input.type = "text";
      input.name = field.name;
      input.maxLength = field.max;
      input.value = field.value || "";
      if (field.placeholder) input.placeholder = field.placeholder;
      label.appendChild(input);
      grid.appendChild(label);
    });
    card.appendChild(grid);

    var error = el("p", "la-form-error");
    error.hidden = true;
    card.appendChild(error);

    var actions = el("div", "la-form-actions");
    var save = el("button", "la-ghost", "保存");
    save.type = "submit";
    actions.appendChild(save);
    card.appendChild(actions);

    card.addEventListener("submit", function (evt) {
      evt.preventDefault();
      setError(error, "");
      setBusy(save, true);
      api("/v1/people/" + encodeURIComponent(person.id), {
        method: "PUT",
        body: {
          name: valueOf(card, "name"),
          birthday: valueOf(card, "birthday"),
          emoji: valueOf(card, "emoji")
        }
      }).then(function (payload) {
        if (payload && payload.changed) {
          toast("已经保存。");
          return reload();
        }
        toast("没有改动。");
      }).catch(function (err) {
        setError(error, err.message || "保存没有成功。");
      }).then(function () {
        setBusy(save, false);
      });
    });

    return card;
  }

  function renderPeople() {
    if (!peopleList || !state.data) return;
    peopleList.innerHTML = "";
    (state.data.people || []).forEach(function (person) {
      peopleList.appendChild(personCard(person));
    });
  }

  /* ---------- 渲染：日子 ---------- */

  function eventDateText(event) {
    if (event.repeat === "dates") {
      var count = Array.isArray(event.dates) ? event.dates.length : 0;
      return (event.lunar ? "农历 " + event.lunar + " · " : "") + count + " 个日期";
    }
    return event.date || "日期待定";
  }

  function eventRow(event) {
    var row = el("article", "la-row" + (event.archived ? " is-archived" : ""));
    row.appendChild(el("span", "la-row-icon", event.icon || "✦"));

    var body = el("div", "la-row-body");
    var title = el("div", "la-row-title");
    title.appendChild(el("strong", "", event.title || "重要日子"));
    if (event.archived) title.appendChild(el("span", "la-chip is-archived", "归档"));
    if (event.highlight) title.appendChild(el("span", "la-chip", "高亮"));
    if (event.home) title.appendChild(el("span", "la-chip is-home", "首页"));
    if (event.pin) title.appendChild(el("span", "la-chip is-pin", "置顶"));
    body.appendChild(title);

    var metaParts = [KIND_LABELS[event.kind] || "重要日子"];
    if (REPEAT_LABELS[event.repeat]) metaParts.push(REPEAT_LABELS[event.repeat]);
    metaParts.push(eventDateText(event));
    if (event.person) metaParts.push(personLabel(event.person));
    body.appendChild(el("p", "la-row-meta", metaParts.join(" · ")));
    if (event.note) body.appendChild(el("p", "la-row-note", event.note));
    row.appendChild(body);

    var actions = el("div", "la-row-actions");
    actions.appendChild(button("编辑", "", function () { openEventModal(event); }));
    if (event.archived) {
      actions.appendChild(button("恢复", "", function () { restoreEvent(event); }));
    } else {
      actions.appendChild(button("归档", "is-danger", function () { archiveEvent(event); }));
    }
    row.appendChild(actions);
    return row;
  }

  function button(label, extraClass, handler) {
    var btn = el("button", "la-small" + (extraClass ? " " + extraClass : ""), label);
    btn.type = "button";
    btn.addEventListener("click", handler);
    return btn;
  }

  function renderEvents() {
    if (!eventList || !state.data) return;
    eventList.innerHTML = "";
    var showArchived = !!(eventsArchived && eventsArchived.checked);
    var rows = (state.data.events || []).filter(function (event) {
      return showArchived || !event.archived;
    });
    rows.sort(function (a, b) {
      if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });

    if (!rows.length) {
      eventList.appendChild(el("p", "la-empty", showArchived ? "还没有日子。" : "没有正在显示的日子。勾选「显示归档」可以看归档过的。"));
      return;
    }
    rows.forEach(function (event) {
      eventList.appendChild(eventRow(event));
    });
  }

  function archiveEvent(event) {
    askConfirm({
      title: "归档这个日子？",
      message: "「" + (event.title || "这个日子") + "」会从公开页和首页隐藏，历史记录保留，之后可以恢复。双方邮箱会收到一条简短通知。",
      okLabel: "确认归档"
    }).then(function (ok) {
      if (!ok) return;
      api("/v1/events/" + encodeURIComponent(event.id) + "/archive", { method: "POST" })
        .then(function (payload) {
          toast(payload && payload.changed ? "已经归档，双方会收到一条简短邮件。" : "这个日子本来就已经归档了。");
          return reload();
        })
        .catch(function (error) { fail(error, "归档没有成功。"); });
    });
  }

  function restoreEvent(event) {
    api("/v1/events/" + encodeURIComponent(event.id) + "/restore", { method: "POST" })
      .then(function () {
        toast("已经恢复到公开页。");
        return reload();
      })
      .catch(function (error) { fail(error, "恢复没有成功。"); });
  }

  /* ---------- 渲染：清单 ---------- */

  function bucketRow(item) {
    var row = el("article", "la-row" + (item.archived ? " is-archived" : "") + (item.done ? " is-done" : ""));
    row.appendChild(el("span", "la-row-check", item.done ? "✓" : ""));

    var body = el("div", "la-row-body");
    var title = el("div", "la-row-title");
    title.appendChild(el("strong", "", item.title || "想一起做的事"));
    if (item.archived) title.appendChild(el("span", "la-chip is-archived", "归档"));
    if (item.done) title.appendChild(el("span", "la-chip", "完成"));
    body.appendChild(title);

    var metaParts = [];
    if (item.category) metaParts.push(item.category);
    metaParts.push(item.done && item.doneAt ? item.doneAt + " 完成" : "待完成");
    body.appendChild(el("p", "la-row-meta", metaParts.join(" · ")));
    if (item.note) body.appendChild(el("p", "la-row-note", item.note));
    row.appendChild(body);

    var actions = el("div", "la-row-actions");
    actions.appendChild(button("编辑", "", function () { openBucketModal(item); }));
    if (!item.archived) {
      actions.appendChild(button(item.done ? "撤销完成" : "完成", "", function () {
        toggleBucket(item);
      }));
      actions.appendChild(button("归档", "is-danger", function () { archiveBucket(item); }));
    } else {
      actions.appendChild(button("恢复", "", function () { restoreBucket(item); }));
    }
    row.appendChild(actions);
    return row;
  }

  function renderBuckets() {
    if (!bucketList || !state.data) return;
    bucketList.innerHTML = "";
    var showArchived = !!(bucketArchived && bucketArchived.checked);
    var rows = (state.data.bucketList || []).filter(function (item) {
      return showArchived || !item.archived;
    });
    rows.sort(function (a, b) {
      if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });

    if (!rows.length) {
      bucketList.appendChild(el("p", "la-empty", showArchived ? "清单还是空的。" : "没有待完成的事项。勾选「显示归档」可以看归档过的。"));
      return;
    }
    rows.forEach(function (item) {
      bucketList.appendChild(bucketRow(item));
    });
  }

  function bucketPayload(item, done) {
    return {
      title: item.title || "",
      category: item.category || "",
      done: !!done,
      doneAt: done ? (item.doneAt || todayISO()) : "",
      note: item.note || ""
    };
  }

  function toggleBucket(item) {
    var nextDone = !item.done;
    api("/v1/bucket/" + encodeURIComponent(item.id), {
      method: "PUT",
      body: bucketPayload(item, nextDone)
    }).then(function () {
      toast(nextDone ? "标记为完成了。" : "已改回未完成。");
      return reload();
    }).catch(function (error) { fail(error, "更新没有成功。"); });
  }

  function archiveBucket(item) {
    askConfirm({
      title: "归档这个事项？",
      message: "「" + (item.title || "这个事项") + "」会从公开页隐藏，历史记录保留，之后可以恢复。双方邮箱会收到一条简短通知。",
      okLabel: "确认归档"
    }).then(function (ok) {
      if (!ok) return;
      api("/v1/bucket/" + encodeURIComponent(item.id) + "/archive", { method: "POST" })
        .then(function (payload) {
          toast(payload && payload.changed ? "已经归档，双方会收到一条简短邮件。" : "这个事项本来就已经归档了。");
          return reload();
        })
        .catch(function (error) { fail(error, "归档没有成功。"); });
    });
  }

  function restoreBucket(item) {
    api("/v1/bucket/" + encodeURIComponent(item.id) + "/restore", { method: "POST" })
      .then(function () {
        toast("已经恢复到公开页。");
        return reload();
      })
      .catch(function (error) { fail(error, "恢复没有成功。"); });
  }

  /* ---------- 渲染：改动记录 ---------- */

  function auditTarget(row) {
    if (!state.data) return row.entityId || "";
    if (row.entity === "room") return (state.data.room && state.data.room.title) || "信息墙";
    var pool = row.entity === "event" ? state.data.events
      : row.entity === "bucket" ? state.data.bucketList
        : row.entity === "person" ? state.data.people
          : [];
    var found = (pool || []).filter(function (item) { return item.id === row.entityId; })[0];
    if (found) return found.title || found.name || row.entityId;
    return row.entityId || "";
  }

  function renderAudit() {
    if (!auditList || !state.data) return;
    auditList.innerHTML = "";
    var rows = state.data.audit || [];
    if (!rows.length) {
      auditList.appendChild(el("li", "la-empty", "还没有改动记录。"));
      return;
    }
    rows.forEach(function (row) {
      var li = el("li");
      li.appendChild(el("time", "", formatAuditTime(row.at)));

      var copy = el("span");
      copy.appendChild(el("b", "", personLabel(row.actor) || row.actor || "有人"));
      var text = " " + (ACTION_LABELS[row.action] || row.action)
        + " " + (ENTITY_LABELS[row.entity] || row.entity)
        + "「" + auditTarget(row) + "」";
      if (row.field && row.action !== "archive" && row.action !== "restore") {
        text += " · " + (FIELD_LABELS[row.field] || row.field);
        if (row.action === "update" && row.oldValue != null && row.newValue != null) {
          text += "：" + shortValue(row.oldValue) + " → " + shortValue(row.newValue);
        }
      }
      copy.appendChild(document.createTextNode(text));
      li.appendChild(copy);
      auditList.appendChild(li);
    });
  }

  function render() {
    fillRoomForm();
    renderPeople();
    renderEvents();
    renderBuckets();
    renderAudit();
    updateMeta();
  }

  /* ---------- 弹层 ---------- */

  function modalOpen() {
    return modal && !modal.hidden;
  }

  function syncBodyLock() {
    var locked = modalOpen() || (confirmBox && !confirmBox.hidden);
    document.body.classList.toggle("has-modal", locked);
  }

  function openModal(title) {
    if (!modal) return;
    if (modalTitle) modalTitle.textContent = title;
    modal.hidden = false;
    syncBodyLock();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    if (eventForm) eventForm.hidden = true;
    if (bucketForm) bucketForm.hidden = true;
    setError(eventError, "");
    setError(bucketError, "");
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

  /* ---------- 日子表单 ---------- */

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

    if (evIdField) evIdField.hidden = !!event;
    var idInput = named(eventForm, "id");
    if (idInput) {
      idInput.disabled = !!event;
      idInput.value = item.id || "";
    }

    named(eventForm, "title").value = item.title || "";
    named(eventForm, "repeat").value = item.repeat || "yearly";
    named(eventForm, "kind").value = item.kind || "custom";
    named(eventForm, "date").value = item.repeat === "dates" ? "" : (item.date || "");
    named(eventForm, "dates").value = Array.isArray(item.dates) ? item.dates.join("\n") : "";
    named(eventForm, "lunar").value = item.lunar || "";
    named(eventForm, "icon").value = item.icon || "";
    named(eventForm, "note").value = item.note || "";
    named(eventForm, "person").value = item.person || "";
    named(eventForm, "highlight").checked = !!item.highlight;
    named(eventForm, "home").checked = !!item.home;
    named(eventForm, "pin").checked = !!item.pin;

    setError(eventError, "");
    syncEventRepeatFields();
  }

  function openEventModal(event) {
    if (!eventForm || !bucketForm) return;
    eventForm.hidden = false;
    bucketForm.hidden = true;
    openModal(event ? "编辑日子" : "新增日子");
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
    var payload = {
      title: valueOf(eventForm, "title"),
      date: repeat === "dates" ? "" : valueOf(eventForm, "date"),
      repeat: repeat,
      kind: valueOf(eventForm, "kind") || "custom",
      icon: valueOf(eventForm, "icon"),
      note: valueOf(eventForm, "note"),
      person: valueOf(eventForm, "person"),
      highlight: isChecked(eventForm, "highlight"),
      home: isChecked(eventForm, "home"),
      pin: isChecked(eventForm, "pin"),
      lunar: repeat === "dates" ? valueOf(eventForm, "lunar") : "",
      dates: repeat === "dates" ? parseDateLines(valueOf(eventForm, "dates")) : []
    };
    if (!state.editingEvent) {
      var id = valueOf(eventForm, "id");
      if (id) payload.id = id;
    }
    return payload;
  }

  function submitEvent(evt) {
    evt.preventDefault();
    if (!eventForm) return;
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
    setBusy(submit, true);
    var request = editing
      ? api("/v1/events/" + encodeURIComponent(editing.id), { method: "PUT", body: payload })
      : api("/v1/events", { method: "POST", body: payload });

    request.then(function (result) {
      closeModal();
      toast(editing ? "已经保存。" : "新的日子已经加上了。");
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
      setBusy(submit, false);
    });
  }

  /* ---------- 清单表单 ---------- */

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
    if (!eventForm || !bucketForm) return;
    bucketForm.hidden = false;
    eventForm.hidden = true;
    openModal(item ? "编辑事项" : "新增事项");
    fillBucketForm(item);
    var focusField = named(bucketForm, "title");
    if (focusField) {
      try { focusField.focus(); } catch (e) { /* ignore */ }
    }
  }

  function submitBucket(evt) {
    evt.preventDefault();
    if (!bucketForm) return;
    setError(bucketError, "");

    var done = isChecked(bucketForm, "done");
    var doneAt = valueOf(bucketForm, "doneAt");
    if (done && !doneAt) {
      doneAt = todayISO();
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
      setBusy(submit, false);
    });
  }

  /* ---------- 信息墙表单 ---------- */

  function submitRoom(evt) {
    evt.preventDefault();
    if (!roomForm) return;
    var submit = $('[type="submit"]', roomForm);
    setBusy(submit, true);
    api("/v1/room", {
      method: "PUT",
      body: {
        title: valueOf(roomForm, "title"),
        eyebrow: valueOf(roomForm, "eyebrow"),
        subtitle: valueOf(roomForm, "subtitle"),
        togetherSince: valueOf(roomForm, "togetherSince"),
        timezone: TZ,
        readOnlyNote: valueOf(roomForm, "readOnlyNote"),
        footerNote: valueOf(roomForm, "footerNote"),
        postcardNote: valueOf(roomForm, "postcardNote")
      }
    }).then(function (payload) {
      toast(payload && payload.changed ? "文案已经保存。" : "没有改动。");
      return reload();
    }).catch(function (error) {
      fail(error, "保存没有成功。");
    }).then(function () {
      setBusy(submit, false);
    });
  }

  /* ---------- 登录 ---------- */

  function loginErrorMessage(error) {
    if (!error) return "登录没有成功。";
    if (!error.status && (error.name === "TypeError" || /fetch|network/i.test(error.message || ""))) {
      return "连不上 Love API（两个入口都没连上）。请确认地址是 https://xm9.asia/love/admin/，换个网络或关掉代理后再试。";
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

  function submitLogin(evt) {
    evt.preventDefault();
    if (!loginForm) return;
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
        return loadAdmin();
      })
      .then(function () {
        named(loginForm, "key").value = "";
      })
      .catch(function (error) {
        clearSession();
        setError(loginError, loginErrorMessage(error));
      })
      .then(function () {
        setBusy(loginSubmit, false, "进入管理");
      });
  }

  function logout() {
    clearSession();
    showLogin("");
    toast("已经退出。");
  }

  /* ---------- 启动 ---------- */

  if (themeButton) themeButton.addEventListener("click", toggleTheme);
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

  if (loginForm) loginForm.addEventListener("submit", submitLogin);
  if (logoutButton) logoutButton.addEventListener("click", logout);
  if (roomForm) roomForm.addEventListener("submit", submitRoom);
  if (eventForm) {
    eventForm.addEventListener("submit", submitEvent);
    var repeatField = named(eventForm, "repeat");
    if (repeatField) repeatField.addEventListener("change", syncEventRepeatFields);
    var homeField = named(eventForm, "home");
    var pinField = named(eventForm, "pin");
    if (homeField && pinField) {
      pinField.addEventListener("change", function () {
        if (pinField.checked) homeField.checked = true;
      });
      homeField.addEventListener("change", function () {
        if (!homeField.checked) pinField.checked = false;
      });
    }
  }
  if (bucketForm) bucketForm.addEventListener("submit", submitBucket);
  if (eventAdd) eventAdd.addEventListener("click", function () { openEventModal(null); });
  if (bucketAdd) bucketAdd.addEventListener("click", function () { openBucketModal(null); });
  if (eventsArchived) eventsArchived.addEventListener("change", renderEvents);
  if (bucketArchived) bucketArchived.addEventListener("change", renderBuckets);

  if (bucketForm) {
    var doneField = named(bucketForm, "done");
    var doneAtField = named(bucketForm, "doneAt");
    if (doneField && doneAtField) {
      doneField.addEventListener("change", function () {
        if (doneField.checked && !doneAtField.value) doneAtField.value = todayISO();
      });
    }
  }

  document.querySelectorAll("[data-modal-close]").forEach(function (node) {
    node.addEventListener("click", closeModal);
  });
  document.querySelectorAll("[data-confirm-cancel]").forEach(function (node) {
    node.addEventListener("click", function () { closeConfirm(false); });
  });
  if (confirmOk) confirmOk.addEventListener("click", function () { closeConfirm(true); });

  document.addEventListener("keydown", function (evt) {
    if (evt.key !== "Escape") return;
    if (confirmBox && !confirmBox.hidden) {
      closeConfirm(false);
      return;
    }
    if (modalOpen()) closeModal();
  });

  var saved = readSession();
  if (saved && saved.token && saved.expiresAt && new Date(saved.expiresAt).getTime() > Date.now()) {
    state.token = saved.token;
    state.person = saved.person || "";
    state.expiresAt = saved.expiresAt;
    api("/v1/me").then(function () {
      return loadAdmin();
    }).catch(function (error) {
      clearSession();
      showLogin(error && error.status === 401
        ? "登录已失效，请重新输入密钥。"
        : "暂时连不上后端，请稍后再试。");
    });
  } else {
    clearSession();
    showLogin("");
  }

  window.setInterval(function () {
    if (state.token) updateMeta();
  }, 30000);
})();
