/* ============================================================
 * 小游戏公共脚本（BLOCKFALL / CRATES / PIXEL HOP 共用）
 *
 * 1. 深浅色：读博客的 REDEFINE-THEME-STATUS，点右上角按钮切换后写回，
 *    并广播 arcade:theme 事件，方便画布类游戏重绘。
 * 2. 全服排行榜：和 COUNT TO 10 / HEXTRIS / 2048 共用一个 Worker，
 *    页面上用 <meta name="xxx-api"> 写地址，可以用逗号写多个，
 *    国内先走 games-api.xm9.asia，workers.dev 留作备用。
 * 3. 玩家身份：localStorage 里存 id 和昵称，昵称只用于榜单展示。
 * ============================================================ */

(function () {
  "use strict";

  var THEME_KEY = "REDEFINE-THEME-STATUS";
  var API_TIMEOUT = 6000;

  /* ---------- 主题 ---------- */

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1726" : "#E8F1F8");
    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    }
    document.dispatchEvent(new CustomEvent("arcade:theme", { detail: { theme: theme } }));
  }

  function toggleTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      var stored = JSON.parse(localStorage.getItem(THEME_KEY) || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem(THEME_KEY, JSON.stringify(stored));
    } catch (e) { /* 隐私模式不记也没关系 */ }
  }

  function initTheme() {
    var button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.addEventListener("click", toggleTheme);
    }
    applyTheme(currentTheme());
    window.addEventListener("storage", function (event) {
      if (event.key !== THEME_KEY) return;
      try {
        var stored = JSON.parse(event.newValue || "{}") || {};
        applyTheme(stored.isDark ? "dark" : "light");
      } catch (e) { /* 忽略 */ }
    });
  }

  /* ---------- localStorage 小工具 ---------- */

  function read(key) {
    try { return localStorage.getItem(key) || ""; } catch (e) { return ""; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 忽略 */ }
  }

  function makeId(prefix) {
    var id;
    if (window.crypto && crypto.randomUUID) {
      id = prefix + "-" + crypto.randomUUID();
    } else {
      id = prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
    return id;
  }

  function playerId(prefix, key) {
    var id = read(key);
    if (!id) {
      id = makeId(prefix);
      write(key, id);
    }
    return id;
  }

  /* ---------- 排行榜地址 ---------- */

  function apiFor(metaName) {
    var meta = document.querySelector('meta[name="' + metaName + '"]');
    var bases = (meta && meta.content ? meta.content : "")
      .split(/[\s,]+/)
      .map(function (item) { return item.trim().replace(/\/+$/, ""); })
      .filter(function (item) { return /^https?:\/\//i.test(item); });
    var workingBase = "";

    function resolve() {
      var list = [];
      try {
        var override = new URLSearchParams(location.search).get("api");
        if (override && /^https?:\/\//i.test(override)) list.push(override.replace(/\/+$/, ""));
      } catch (e) { /* 忽略 */ }
      bases.forEach(function (base) {
        if (list.indexOf(base) === -1) list.push(base);
      });
      if (workingBase && list.indexOf(workingBase) > 0) {
        list = [workingBase].concat(list.filter(function (base) { return base !== workingBase; }));
      }
      return list;
    }

    function fetchWithTimeout(url, options, timeoutMs) {
      if (typeof AbortController === "undefined") return fetch(url, options);
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs || API_TIMEOUT);
      var opts = {};
      Object.keys(options || {}).forEach(function (key) { opts[key] = options[key]; });
      opts.signal = controller.signal;
      return fetch(url, opts).finally(function () { clearTimeout(timer); });
    }

    function fetchPath(path, options, timeoutMs) {
      var list = resolve();
      if (!list.length) return Promise.reject(new Error("no_api"));
      var attempt = function (index) {
        return fetchWithTimeout(list[index] + path, options, timeoutMs || API_TIMEOUT)
          .then(function (response) {
            if (response.status >= 500) throw new Error("HTTP " + response.status);
            workingBase = list[index];
            return response;
          })
          .catch(function (error) {
            if (index + 1 >= list.length) throw error;
            return attempt(index + 1);
          });
      };
      return attempt(0);
    }

    return {
      ready: function () { return resolve().length > 0; },
      get: function (path) {
        return fetchPath(path, { cache: "no-store" }, API_TIMEOUT)
          .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
          });
      },
      post: function (path, body) {
        return fetchPath(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }, 8000)
          .then(function (response) {
            return response.json().then(function (data) {
              if (!response.ok || !data.ok) {
                throw new Error((data && data.error) || "submit_failed");
              }
              return data;
            });
          });
      }
    };
  }

  /* ---------- 排行榜 ---------- */

  function createLeaderboard(options) {
    var opts = options || {};
    var api = apiFor(opts.meta);
    var self = {
      id: playerId(opts.idPrefix || "g", opts.idKey),
      name: read(opts.nameKey),
      scores: [],
      api: api,
      path: (opts.path || "").replace(/\/+$/, "")
    };

    self.render = function (scores) {
      if (!opts.list) return;
      self.scores = scores || [];
      opts.list.innerHTML = "";
      if (!self.scores.length) {
        var empty = document.createElement("p");
        empty.className = "gm-lb-empty";
        empty.textContent = opts.emptyText || "还没有人上榜，等你来拿第一。";
        opts.list.appendChild(empty);
        return;
      }
      self.scores.slice(0, 20).forEach(function (item, index) {
        var row = document.createElement("div");
        row.className = "gm-lb-row" + (item.id === self.id ? " is-me" : "");

        var rank = document.createElement("span");
        rank.className = "gm-lb-rank";
        rank.textContent = "#" + (index + 1);

        var name = document.createElement("span");
        name.className = "gm-lb-name";
        name.textContent = item.name || "匿名玩家";

        var score = document.createElement("span");
        score.className = "gm-lb-score";
        score.textContent = (opts.formatScore ? opts.formatScore(item.score) : String(item.score));

        row.appendChild(rank);
        row.appendChild(name);
        row.appendChild(score);
        opts.list.appendChild(row);
      });
    };

    self.message = function (text) {
      if (!opts.list) return;
      opts.list.innerHTML = "";
      var p = document.createElement("p");
      p.className = "gm-lb-empty";
      p.textContent = text;
      opts.list.appendChild(p);
    };

    self.load = function () {
      if (!api.ready()) {
        self.message("全服排行榜还没接通。");
        return Promise.resolve();
      }
      if (opts.refresh) opts.refresh.disabled = true;
      return api.get(self.path + "/leaderboard?limit=20")
        .then(function (data) {
          if (!data || !data.ok) throw new Error("bad payload");
          self.render(data.scores || []);
        })
        .catch(function () {
          self.message(opts.offlineText || "排行榜暂时连不上，本机最高分仍然有效。");
        })
        .finally(function () {
          if (opts.refresh) opts.refresh.disabled = false;
        });
    };

    self.submit = function (name, score) {
      return api.post(self.path + "/score", {
        id: self.id,
        name: name,
        score: score
      }).then(function (data) {
        if (data.scores) self.render(data.scores);
        if (!data.taken) {
          self.name = name;
          write(opts.nameKey, name);
        }
        return data;
      });
    };

    self.rememberName = function (name) {
      self.name = name;
      write(opts.nameKey, name);
    };

    return self;
  }

  window.Arcade = {
    initTheme: initTheme,
    currentTheme: currentTheme,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    apiFor: apiFor,
    createLeaderboard: createLeaderboard,
    read: read,
    write: write,
    playerId: playerId
  };
})();
