/* Love Story 约会助手：和管理页共用登录态（同一个 sessionStorage key），
 * 只把表单和现有档案交给 /v1/ai/plan-date，前端不保存任何模型密钥。
 */
(function () {
  "use strict";

  var SESSION_KEY = "love-admin-session-v1";
  var PERSON_NAMES = { jmj: "鸡毛鸡", bxb: "白小白" };

  var state = {
    token: "",
    person: "",
    expiresAt: "",
    busy: false
  };

  var root = document.documentElement;
  var loginView = document.querySelector("[data-login-view]");
  var appView = document.querySelector("[data-app-view]");
  var loginForm = document.querySelector("[data-login-form]");
  var loginError = document.querySelector("[data-login-error]");
  var loginSubmit = document.querySelector("[data-login-submit]");
  var logoutButton = document.querySelector("[data-logout]");
  var appMeta = document.querySelector("[data-app-meta]");
  var planForm = document.querySelector("[data-plan-form]");
  var planError = document.querySelector("[data-plan-error]");
  var planMessage = document.querySelector("[data-plan-message]");
  var planSubmit = document.querySelector("[data-plan-submit]");
  var planResult = document.querySelector("[data-plan-result]");
  var planTitle = document.querySelector("[data-plan-title]");
  var planSummary = document.querySelector("[data-plan-summary]");
  var planBody = document.querySelector("[data-plan-body]");
  var planClear = document.querySelector("[data-plan-clear]");
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
    if (appMeta) appMeta.textContent = "以" + who + "的身份看这份档案" + until;
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
    hidePlan();
    showLogin("");
  }

  /* ---------- 约会方案 ---------- */

  function setBusy(busy) {
    state.busy = busy;
    if (planSubmit) {
      planSubmit.disabled = busy;
      planSubmit.textContent = busy ? "正在查最近的展览和好去处…" : "找几个地方";
    }
  }

  function collectPlan() {
    var fields = ["city", "from", "budget", "duration", "scene", "date", "notes"];
    var input = {};
    for (var i = 0; i < fields.length; i += 1) {
      var node = named(planForm, fields[i]);
      input[fields[i]] = node ? String(node.value || "").trim() : "";
    }
    if (!input.city) {
      setError(planError, "先填一下目的地城市。");
      var target = named(planForm, "city");
      if (target) { try { target.focus(); } catch (e) { /* ignore */ } }
      return null;
    }
    setError(planError, "");
    return input;
  }

  function hidePlan() {
    if (planResult) planResult.hidden = true;
    if (planMessage) {
      planMessage.textContent = "";
      planMessage.hidden = true;
    }
  }

  function showMessage(message) {
    if (!planMessage) return;
    planMessage.textContent = message || "";
    planMessage.hidden = !message;
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
      if (item.source) {
        var source = document.createElement("a");
        source.className = "lp-source";
        source.href = item.source;
        source.target = "_blank";
        source.rel = "noopener noreferrer nofollow";
        source.textContent = "来源";
        foot.appendChild(source);
      }
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
      if (plan.picks && plan.picks.length) planBody.appendChild(section("推荐去的地方", picksNode(plan.picks)));
      if (plan.transport && plan.transport.length) planBody.appendChild(section("怎么去", transportNode(plan.transport)));
      if (plan.topics && plan.topics.length) planBody.appendChild(section("可以聊的", topicsNode(plan.topics)));
      if (plan.budget || plan.backup) planBody.appendChild(metaNode(plan));
    }
    planResult.hidden = false;
    try { planResult.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* ignore */ }
  }

  function submitPlan(event) {
    event.preventDefault();
    if (state.busy) return;
    var input = collectPlan();
    if (!input) return;
    hidePlan();
    setBusy(true);
    var slowTimer = window.setTimeout(function () {
      if (state.busy && planSubmit) planSubmit.textContent = "还在整理搜索结果…";
    }, 9000);
    api("/v1/ai/plan-date", { method: "POST", body: input })
      .then(function (payload) {
        if (payload && payload.redline) {
          showMessage(payload.message || "有些事情，可以亲口跟小狗说噢。");
          return;
        }
        if (!payload || !payload.plan) throw new Error("AI 没有返回可用的推荐，请再生成一次。");
        renderPlan(payload.plan, payload.search);
      })
      .catch(function (error) {
        if (error.status === 401) {
          clearSession();
          showLogin("登录已失效，请重新输入密钥。");
          return;
        }
        if (!error.status) {
          setError(planError, "连不上 Love API，检查一下网络或稍后再试。");
          return;
        }
        setError(planError, error.message || "没有找到合适的推荐，请再试一次。");
      })
      .then(function () {
        window.clearTimeout(slowTimer);
        setBusy(false);
      });
  }

  /* ---------- 启动 ---------- */

  function boot() {
    if (loginForm) loginForm.addEventListener("submit", handleLogin);
    if (planForm) planForm.addEventListener("submit", submitPlan);
    if (logoutButton) logoutButton.addEventListener("click", logout);
    if (planClear) planClear.addEventListener("click", hidePlan);

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
