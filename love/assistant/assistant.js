/* Love Story 约会助手：和管理页、信息墙共用同一个登录态。
 * 对话只发给 /v1/ai/plan-chat，前端不保存任何模型密钥；
 * 只有用户点「写进重要日子」才会调用 /v1/timeline 保存。
 */
(function () {
  "use strict";

  var SESSION_KEY = "love-admin-session-v1";
  var PERSON_NAMES = { jmj: "鸡毛鸡", bxb: "白小白" };
  var FIELD_NAMES = ["city", "from", "budget", "duration", "scene", "date", "notes"];
  var MAX_HISTORY = 12;
  var MAX_HISTORY_CHARS = 3600;

  var state = {
    token: "",
    person: "",
    expiresAt: "",
    busy: false,
    chat: [],
    chatStarted: false,
    save: null,
    saveBusy: false,
    savedId: ""
  };

  var root = document.documentElement;
  var loginView = document.querySelector("[data-login-view]");
  var appView = document.querySelector("[data-app-view]");
  var loginForm = document.querySelector("[data-login-form]");
  var loginError = document.querySelector("[data-login-error]");
  var loginSubmit = document.querySelector("[data-login-submit]");
  var logoutButton = document.querySelector("[data-logout]");
  var appMeta = document.querySelector("[data-app-meta]");
  var chatLog = document.querySelector("[data-chat-log]");
  var chatForm = document.querySelector("[data-chat-form]");
  var chatSend = document.querySelector("[data-chat-send]");
  var chatError = document.querySelector("[data-chat-error]");
  var chatMessage = chatForm ? chatForm.querySelector('[name="message"]') : null;
  var planForm = document.querySelector("[data-plan-form]");
  var planResult = document.querySelector("[data-plan-result]");
  var planTitle = document.querySelector("[data-plan-title]");
  var planSummary = document.querySelector("[data-plan-summary]");
  var planBody = document.querySelector("[data-plan-body]");
  var planClear = document.querySelector("[data-plan-clear]");
  var saveCard = document.querySelector("[data-save-card]");
  var saveTitle = document.querySelector("[data-save-title]");
  var saveDate = document.querySelector("[data-save-date]");
  var saveKind = document.querySelector("[data-save-kind]");
  var saveNote = document.querySelector("[data-save-note]");
  var saveError = document.querySelector("[data-save-error]");
  var saveDone = document.querySelector("[data-save-done]");
  var saveActions = document.querySelector("[data-save-actions]");
  var saveConfirm = document.querySelector("[data-save-confirm]");
  var saveDismiss = document.querySelector("[data-save-dismiss]");
  var toastNode = document.querySelector("[data-toast]");

  /* ---------- 外观 ---------- */

  function applyTheme(theme) {
    root.dataset.theme = theme;
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

  document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
    button.addEventListener("click", toggleTheme);
  });

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

  /* ---------- 小工具 ---------- */

  function named(form, name) {
    return form ? form.querySelector('[name="' + name + '"]') : null;
  }

  function setError(node, message) {
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  var toastTimer = 0;
  function toast(message, isError) {
    if (!toastNode) return;
    toastNode.textContent = message;
    toastNode.hidden = false;
    toastNode.classList.toggle("is-error", !!isError);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastNode.hidden = true;
    }, isError ? 4200 : 2600);
  }

  function formatDay(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
    var date = new Date(iso + "T00:00:00");
    if (Number.isNaN(date.getTime())) return iso;
    var week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
    return date.getFullYear() + " 年 " + (date.getMonth() + 1) + " 月 " + date.getDate() + " 日 " + week;
  }

  /* ---------- 登录状态 ---------- */

  function saveSession() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: state.token,
        person: state.person,
        expiresAt: state.expiresAt
      }));
    } catch (e) { /* 隐私模式就不记住 */ }
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
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function showLogin(message) {
    resetConversation();
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    setError(loginError, message || "");
    var keyInput = named(loginForm, "key");
    if (keyInput) {
      keyInput.value = "";
      try { keyInput.focus(); } catch (e) { /* ignore */ }
    }
  }

  function showApp() {
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
    var who = PERSON_NAMES[state.person] || "我们";
    var until = "";
    if (state.expiresAt) {
      var date = new Date(state.expiresAt);
      if (!Number.isNaN(date.getTime())) {
        until = " · " + date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) + " 前有效";
      }
    }
    if (appMeta) appMeta.textContent = "以" + who + "的身份在聊" + until;
    if (!state.chatStarted) startChat();
  }

  function loginErrorMessage(error) {
    if (!error) return "登录没有成功，请再试一次。";
    if (error.status === 401) return "密钥不对，再试一次。";
    if (error.status === 429) return error.message || "错误次数太多，请稍后再试。";
    if (!error.status) return "连不上 Love API，检查一下网络或稍后再试。";
    return error.message || "登录没有成功，请再试一次。";
  }

  function handleLogin(event) {
    event.preventDefault();
    if (!loginForm) return;
    var person = (loginForm.querySelector('input[name="person"]:checked') || {}).value || "jmj";
    var keyInput = named(loginForm, "key");
    var key = keyInput ? keyInput.value.trim() : "";
    if (!key) {
      setError(loginError, "先输入操作密钥。");
      return;
    }
    setError(loginError, "");
    if (loginSubmit) loginSubmit.disabled = true;
    api("/v1/session", { method: "POST", body: { person: person, key: key } })
      .then(function (payload) {
        if (!payload || !payload.token) throw new Error("登录没有成功，请再试一次。");
        state.token = payload.token;
        state.person = payload.person || person;
        state.expiresAt = payload.expiresAt || "";
        saveSession();
        if (keyInput) keyInput.value = "";
        showApp();
      })
      .catch(function (error) {
        setError(loginError, loginErrorMessage(error));
      })
      .then(function () {
        if (loginSubmit) loginSubmit.disabled = false;
      });
  }

  function logout() {
    clearSession();
    showLogin("");
  }

  function handleApiError(error, target) {
    if (error && error.status === 401) {
      clearSession();
      showLogin("登录已失效，请重新输入密钥。");
      return;
    }
    if (!error || !error.status) {
      setError(target, "连不上 Love API，检查一下网络或稍后再试。");
      return;
    }
    setError(target, error.message || "这次没有拿到结果，请再试一次。");
  }

  /* ---------- 对话窗口 ---------- */

  function scrollChat() {
    if (!chatLog) return;
    try {
      chatLog.scrollTop = chatLog.scrollHeight;
    } catch (e) { /* ignore */ }
  }

  function appendBubble(role, content, questions) {
    if (!chatLog) return null;
    var wrap = document.createElement("div");
    wrap.className = "la-chat-msg la-chat-msg--" + role;

    var who = document.createElement("span");
    who.className = "la-chat-who";
    who.textContent = role === "user" ? "你" : "约会助手";
    wrap.appendChild(who);

    var bubble = document.createElement("div");
    bubble.className = "la-chat-bubble";
    if (content) {
      var text = document.createElement("p");
      text.className = "la-chat-text";
      text.textContent = content;
      bubble.appendChild(text);
    }
    if (questions && questions.length) {
      var ask = document.createElement("div");
      ask.className = "la-chat-questions";
      var label = document.createElement("p");
      label.className = "la-chat-q-label";
      label.textContent = "想先确认";
      ask.appendChild(label);
      var list = document.createElement("ul");
      questions.forEach(function (question) {
        var li = document.createElement("li");
        li.textContent = question;
        list.appendChild(li);
      });
      ask.appendChild(list);
      bubble.appendChild(ask);
    }
    wrap.appendChild(bubble);
    chatLog.appendChild(wrap);
    return wrap;
  }

  function addUser(text) {
    appendBubble("user", text);
    state.chat.push({ role: "user", content: text.slice(0, 600) });
    scrollChat();
  }

  function addAssistant(reply, questions) {
    var filled = questions && questions.length ? questions : [];
    var content = reply || (filled.length ? "想先确认几个事情。" : "");
    if (content) {
      appendBubble("assistant", content, filled);
      state.chat.push({ role: "assistant", content: content.slice(0, 600) });
    }
    scrollChat();
  }

  function addSystem(text) {
    appendBubble("assistant", text);
    scrollChat();
  }

  function showTyping() {
    if (!chatLog) return null;
    var wrap = document.createElement("div");
    wrap.className = "la-chat-msg la-chat-msg--assistant la-chat-typing";
    wrap.setAttribute("data-typing", "");
    var who = document.createElement("span");
    who.className = "la-chat-who";
    who.textContent = "约会助手";
    wrap.appendChild(who);
    var bubble = document.createElement("div");
    bubble.className = "la-chat-bubble";
    var dots = document.createElement("span");
    dots.className = "la-chat-dots";
    dots.innerHTML = "<i></i><i></i><i></i>";
    bubble.appendChild(dots);
    var label = document.createElement("span");
    label.className = "la-chat-typing-label";
    label.textContent = "正在翻搜索结果…";
    bubble.appendChild(label);
    wrap.appendChild(bubble);
    chatLog.appendChild(wrap);
    scrollChat();
    return wrap;
  }

  function removeTyping(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function appendStarters() {
    if (!chatLog) return;
    var wrap = document.createElement("div");
    wrap.className = "la-chat-starters";
    wrap.setAttribute("data-starters", "");
    [
      "这周末，本地逛逛",
      "下周六去杭州，预算 500",
      "想吃点当地小吃，随便走走"
    ].forEach(function (text) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "la-chat-starter";
      button.textContent = text;
      wrap.appendChild(button);
    });
    chatLog.appendChild(wrap);
    scrollChat();
  }

  function removeStarters() {
    if (!chatLog) return;
    var node = chatLog.querySelector("[data-starters]");
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function startChat() {
    state.chatStarted = true;
    state.chat = [];
    if (chatLog) chatLog.textContent = "";
    appendBubble(
      "assistant",
      "想去哪座城市呀？告诉我城市、大概哪天、预算多少，我就开始找。想吃点什么也可以直接说，我会把当地小吃一起排进去。",
      []
    );
    appendStarters();
  }

  function resetConversation() {
    state.chat = [];
    state.chatStarted = false;
    state.save = null;
    state.savedId = "";
    state.saveBusy = false;
    if (chatLog) chatLog.textContent = "";
    hidePlan();
    hideSave();
    setError(chatError, "");
    if (chatMessage) chatMessage.value = "";
  }

  function chatPayload() {
    var rows = state.chat.map(function (item) {
      return { role: item.role, content: String(item.content || "").slice(0, 600) };
    }).slice(-MAX_HISTORY);
    var total = rows.reduce(function (sum, item) { return sum + item.content.length; }, 0);
    while (rows.length > 1 && total > MAX_HISTORY_CHARS) {
      total -= rows[0].content.length;
      rows.shift();
    }
    return rows;
  }

  /* ---------- 表单 ---------- */

  function collectFields() {
    var input = {};
    FIELD_NAMES.forEach(function (key) {
      var node = named(planForm, key);
      input[key] = node ? String(node.value || "").trim() : "";
    });
    return input;
  }

  function hasFields(fields) {
    return FIELD_NAMES.some(function (key) { return !!fields[key]; });
  }

  function durationValue(value) {
    var text = String(value || "").replace(/\s+/g, "");
    if (/^(1天|一天|当天|当日)$/.test(text)) return "一整天";
    if (/^(2天1夜|两天一夜|2天一夜|两天1夜)$/.test(text)) return "两天一夜";
    return String(value || "");
  }

  function syncFields(fields, extracted) {
    if (!fields) return;
    FIELD_NAMES.forEach(function (key) {
      if (!extracted || !extracted[key]) return;
      var node = named(planForm, key);
      if (!node || fields[key] === undefined || fields[key] === null) return;
      var value = key === "duration" ? durationValue(fields[key]) : String(fields[key]);
      if (node.tagName === "SELECT") {
        var exists = false;
        for (var i = 0; i < node.options.length; i += 1) {
          if (node.options[i].value === value) { exists = true; break; }
        }
        if (!exists && value) {
          var option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          option.setAttribute("data-synced", "1");
          node.appendChild(option);
        }
      }
      node.value = value;
    });
  }

  function setBusy(busy) {
    state.busy = busy;
    if (chatSend) {
      chatSend.disabled = busy;
      chatSend.textContent = busy ? "正在查…" : "发送";
    }
  }

  function sendChat(text) {
    if (state.busy) return;
    var fields = collectFields();
    var message = String(text || "").trim();
    if (!message && !hasFields(fields)) {
      setError(chatError, "先说一句，或者填一点表单。全空的话我不知道从哪开始。");
      if (chatMessage) {
        try { chatMessage.focus(); } catch (e) { /* ignore */ }
      }
      return;
    }
    if (!message) message = "按表单里的信息来一版吧。";

    setError(chatError, "");
    removeStarters();
    addUser(message);
    if (chatMessage) chatMessage.value = "";
    setBusy(true);
    var typing = showTyping();
    var slowTimer = window.setTimeout(function () {
      if (state.busy) {
        if (chatSend) chatSend.textContent = "还在查…";
        var label = typing ? typing.querySelector(".la-chat-typing-label") : null;
        if (label) label.textContent = "还在整理搜索结果，马上好…";
      }
    }, 9000);

    api("/v1/ai/plan-chat", {
      method: "POST",
      body: Object.assign({}, fields, { messages: chatPayload() })
    })
      .then(function (payload) {
        if (!payload) throw new Error("AI 没有返回回复，请再试一次。");
        if (payload.redline) {
          addAssistant(payload.message || "有些事情，可以亲口跟小狗说噢。", []);
          return;
        }
        syncFields(payload.fields, payload.extracted);
        addAssistant(payload.reply || "", payload.questions || []);
        if (payload.plan) {
          renderPlan(payload.plan, payload.search);
          if (payload.save) renderSave(payload.save);
          else hideSave();
        } else if (payload.save) {
          renderSave(payload.save);
        }
      })
      .catch(function (error) {
        handleApiError(error, chatError);
      })
      .then(function () {
        window.clearTimeout(slowTimer);
        removeTyping(typing);
        setBusy(false);
        scrollChat();
      });
  }

  function submitChat(event) {
    event.preventDefault();
    if (state.busy) return;
    var text = chatMessage ? chatMessage.value.trim() : "";
    sendChat(text);
  }

  /* ---------- 方案展示 ---------- */

  function hidePlan() {
    if (planResult) planResult.hidden = true;
  }

  function section(title, content) {
    var wrap = document.createElement("section");
    wrap.className = "lp-section";
    var heading = document.createElement("h3");
    heading.textContent = title;
    wrap.appendChild(heading);
    wrap.appendChild(content);
    return wrap;
  }

  function textBlock(className, tagName, value) {
    if (!value) return null;
    var node = document.createElement(tagName || "p");
    node.className = className;
    node.textContent = value;
    return node;
  }

  function sourceLink(url) {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    var source = document.createElement("a");
    source.className = "lp-source";
    source.href = url;
    source.target = "_blank";
    source.rel = "noopener noreferrer nofollow";
    source.textContent = "来源";
    return source;
  }

  function picksNode(items) {
    var list = document.createElement("ol");
    list.className = "lp-picks";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "lp-pick";

      var head = document.createElement("div");
      head.className = "lp-pick-head";
      var name = document.createElement("h4");
      name.className = "lp-pick-name";
      name.textContent = item.name;
      head.appendChild(name);
      if (item.kind) {
        var kind = document.createElement("span");
        kind.className = "lp-kind";
        kind.textContent = item.kind;
        head.appendChild(kind);
      }
      li.appendChild(head);

      var metaBits = [];
      if (item.where) metaBits.push(item.where);
      if (item.when) metaBits.push(item.when);
      if (metaBits.length) {
        var meta = document.createElement("p");
        meta.className = "lp-pick-meta";
        meta.textContent = metaBits.join(" · ");
        li.appendChild(meta);
      }

      var why = textBlock("lp-pick-why", "p", item.why);
      if (why) li.appendChild(why);

      var foot = document.createElement("p");
      foot.className = "lp-pick-foot";
      var cost = textBlock("lp-cost", "span", item.cost);
      if (cost) foot.appendChild(cost);
      var tip = textBlock("lp-tip", "span", item.tip);
      if (tip) foot.appendChild(tip);
      var source = sourceLink(item.source);
      if (source) foot.appendChild(source);
      if (foot.childNodes.length) li.appendChild(foot);

      list.appendChild(li);
    });
    return list;
  }

  function foodNode(items) {
    var list = document.createElement("ol");
    list.className = "lp-picks lp-foods";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "lp-pick lp-food";

      var head = document.createElement("div");
      head.className = "lp-pick-head";
      var name = document.createElement("h4");
      name.className = "lp-pick-name";
      name.textContent = item.name;
      head.appendChild(name);
      var kind = document.createElement("span");
      kind.className = "lp-kind lp-kind--food";
      kind.textContent = "吃";
      head.appendChild(kind);
      li.appendChild(head);

      if (item.where) {
        var where = document.createElement("p");
        where.className = "lp-pick-meta";
        where.textContent = item.where;
        li.appendChild(where);
      }
      var what = textBlock("lp-pick-why", "p", item.what);
      if (what) li.appendChild(what);

      var foot = document.createElement("p");
      foot.className = "lp-pick-foot";
      var cost = textBlock("lp-cost", "span", item.cost);
      if (cost) foot.appendChild(cost);
      var tip = textBlock("lp-tip", "span", item.tip);
      if (tip) foot.appendChild(tip);
      var source = sourceLink(item.source);
      if (source) foot.appendChild(source);
      if (foot.childNodes.length) li.appendChild(foot);

      list.appendChild(li);
    });
    return list;
  }

  function transportNode(items) {
    var list = document.createElement("ul");
    list.className = "lp-transport";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    return list;
  }

  function searchNote(search) {
    if (!search) return null;
    var note = document.createElement("p");
    note.className = "lp-search";
    note.textContent = search.used
      ? "联网查到 " + search.count + " 条结果，下面的事实信息来自这些页面。"
      : "这次没搜到实时信息，推荐可能偏保守，出发前再确认一下。";
    return note;
  }

  function topicsNode(items) {
    var list = document.createElement("ul");
    list.className = "lp-topics";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "lp-chip";
      li.textContent = item;
      list.appendChild(li);
    });
    return list;
  }

  function metaNode(plan) {
    var wrap = document.createElement("div");
    wrap.className = "lp-meta";
    if (plan.budget) {
      var budget = document.createElement("div");
      budget.className = "lp-meta-item";
      var budgetTitle = document.createElement("h4");
      budgetTitle.textContent = "预算";
      var budgetText = document.createElement("p");
      budgetText.textContent = plan.budget;
      budget.appendChild(budgetTitle);
      budget.appendChild(budgetText);
      wrap.appendChild(budget);
    }
    if (plan.backup) {
      var backup = document.createElement("div");
      backup.className = "lp-meta-item";
      var backupTitle = document.createElement("h4");
      backupTitle.textContent = "备选";
      var backupText = document.createElement("p");
      backupText.textContent = plan.backup;
      backup.appendChild(backupTitle);
      backup.appendChild(backupText);
      wrap.appendChild(backup);
    }
    return wrap;
  }

  function renderPlan(plan, search) {
    if (!planResult) return;
    if (planTitle) planTitle.textContent = plan.title || "这次的推荐";
    if (planSummary) planSummary.textContent = plan.summary || "";
    if (planBody) {
      planBody.textContent = "";
      var note = searchNote(search);
      if (note) planBody.appendChild(note);
      if (plan.food && plan.food.length) {
        planBody.appendChild(section("走到哪吃到哪", foodNode(plan.food)));
      }
      if (plan.picks && plan.picks.length) {
        planBody.appendChild(section("可以去的地方", picksNode(plan.picks)));
      }
      if (plan.transport && plan.transport.length) {
        planBody.appendChild(section("怎么去", transportNode(plan.transport)));
      }
      if (plan.topics && plan.topics.length) {
        planBody.appendChild(section("可以聊的", topicsNode(plan.topics)));
      }
      if (plan.budget || plan.backup) planBody.appendChild(metaNode(plan));
    }
    planResult.hidden = false;
    try { planResult.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* ignore */ }
  }

  /* ---------- 写进时间线 ---------- */

  function hideSave() {
    if (saveCard) saveCard.hidden = true;
    setError(saveError, "");
  }

  function planDate() {
    var node = named(planForm, "date");
    return node ? String(node.value || "").trim() : "";
  }

  function canSaveDate(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""));
  }

  function refreshSaveDate() {
    if (!state.save) return;
    var date = planDate();
    state.save.date = date;
    if (saveDate) saveDate.textContent = formatDay(date) || date || "日期待定";
    if (saveConfirm && !state.savedId) {
      saveConfirm.disabled = !canSaveDate(date);
    }
  }

  function renderSave(save) {
    if (!saveCard || !save) return;
    state.save = save;
    state.savedId = "";
    state.saveBusy = false;
    if (saveTitle) saveTitle.textContent = save.title || "这次的约会";
    if (saveDate) saveDate.textContent = formatDay(save.date) || save.date || "日期待定";
    if (saveKind) saveKind.textContent = save.kind === "milestone" ? "大事记" : "约会啦";
    if (saveNote) {
      saveNote.textContent = save.note || "";
      saveNote.hidden = !save.note;
    }
    if (saveDone) {
      saveDone.textContent = "";
      saveDone.hidden = true;
    }
    if (saveActions) saveActions.hidden = false;
    if (saveConfirm) {
      saveConfirm.disabled = !canSaveDate(save.date);
      saveConfirm.textContent = "写进重要日子";
    }
    setError(saveError, "");
    saveCard.hidden = false;
  }

  function saveTimeline() {
    if (!state.save || state.saveBusy || state.savedId) return;
    var date = planDate() || state.save.date;
    if (!canSaveDate(date)) {
      setError(saveError, "还没定日期。先在左边选一个日期，或者直接告诉我哪天去。");
      return;
    }
    state.save.date = date;
    state.saveBusy = true;
    setError(saveError, "");
    if (saveConfirm) {
      saveConfirm.disabled = true;
      saveConfirm.textContent = "正在写…";
    }
    var payload = {
      date: state.save.date,
      title: state.save.title,
      kind: state.save.kind === "milestone" ? "milestone" : "date",
      note: state.save.note || ""
    };
    api("/v1/timeline", { method: "POST", body: payload })
      .then(function (result) {
        if (!result || !result.id) throw new Error("没有写成功，请再试一次。");
        state.savedId = result.id;
        if (saveActions) saveActions.hidden = true;
        if (saveDone) {
          saveDone.textContent = "";
          saveDone.appendChild(document.createTextNode("已经写进「我们的重要日子」，日历上那天会显示去了哪里。 "));
          var link = document.createElement("a");
          link.href = "/love/";
          link.textContent = "去信息墙看看 →";
          saveDone.appendChild(link);
          saveDone.hidden = false;
        }
        toast("已写进重要日子");
      })
      .catch(function (error) {
        handleApiError(error, saveError);
        if (saveConfirm) {
          saveConfirm.disabled = false;
          saveConfirm.textContent = "写进重要日子";
        }
      })
      .then(function () {
        state.saveBusy = false;
        if (saveConfirm && !state.savedId) saveConfirm.disabled = false;
      });
  }

  /* ---------- 启动 ---------- */

  function boot() {
    if (loginForm) loginForm.addEventListener("submit", handleLogin);
    if (chatForm) chatForm.addEventListener("submit", submitChat);
    if (planForm) {
      var onPlanField = function (event) {
        var target = event.target;
        if (!target || target.getAttribute("name") !== "date") return;
        refreshSaveDate();
      };
      planForm.addEventListener("input", onPlanField);
      planForm.addEventListener("change", onPlanField);
    }
    if (logoutButton) logoutButton.addEventListener("click", logout);
    if (planClear) planClear.addEventListener("click", hidePlan);
    if (saveDismiss) saveDismiss.addEventListener("click", hideSave);
    if (saveConfirm) saveConfirm.addEventListener("click", saveTimeline);
    if (chatLog) {
      chatLog.addEventListener("click", function (event) {
        var starter = event.target.closest ? event.target.closest(".la-chat-starter") : null;
        if (!starter || state.busy) return;
        sendChat(starter.textContent || "");
      });
    }

    var saved = readSession();
    if (!saved) {
      showLogin("");
      return;
    }
    state.token = saved.token;
    state.person = saved.person || "";
    state.expiresAt = saved.expiresAt || "";
    api("/v1/me")
      .then(function (payload) {
        if (!payload || !payload.person) throw new Error("登录已失效");
        state.person = payload.person;
        saveSession();
        showApp();
      })
      .catch(function (error) {
        clearSession();
        var message = !error.status || error.status >= 500
          ? "连不上 Love API，检查一下网络或稍后再试。"
          : "登录已失效，请重新输入密钥。";
        showLogin(message);
      });
  }

  boot();
})();
