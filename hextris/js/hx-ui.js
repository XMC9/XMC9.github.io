/* ============================================================
 * HEXTRIS × 秘密基地 · 顶栏 / 帮助 / 全服排行榜
 * 排行榜接口和 COUNT TO 10 共用一个 Worker：
 *   GET  /hextris/leaderboard?limit=20
 *   POST /hextris/score  { id, name, score }
 * 本地调试可在网址后加 ?api=http://127.0.0.1:4003
 * ============================================================ */

(function () {
  "use strict";

  var ID_KEY = "hextris-player-id";
  var NAME_KEY = "hextris-player-name";
  var MAX_SCORE = 1000000;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var els = {
    panel: $("#hxLb"),
    list: $("[data-lb-list]"),
    form: $("[data-lb-form]"),
    name: $("#hx-name"),
    message: $("[data-lb-msg]"),
    hint: $("[data-lb-hint]"),
    score: $("[data-lb-score]"),
    refresh: $("[data-lb-refresh]"),
    submit: $("[data-lb-submit]"),
    theme: $("[data-theme-toggle]")
  };

  var HINT_DEFAULT = els.hint ? els.hint.textContent : "";
  var HINT_ZERO = "这一局还没得分，先不上榜。再玩一局吧。";

  var API_BASE = (function () {
    var meta = $('meta[name="hx-api"]');
    return (meta && meta.content ? meta.content : "").trim().replace(/\/+$/, "");
  })();

  var state = {
    playerId: getPlayerId(),
    score: 0,
    gameOver: false,
    submitted: false,
    open: false,
    round: 0
  };

  /* ---------- 小工具 ---------- */

  function getPlayerId() {
    try {
      var id = localStorage.getItem(ID_KEY);
      if (!id) {
        id = (window.crypto && crypto.randomUUID)
          ? "hx-" + crypto.randomUUID()
          : "hx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(ID_KEY, id);
      }
      return id;
    } catch (e) {
      return "hx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
  }

  function readName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
  }

  function resolveApiBase() {
    try {
      var override = new URLSearchParams(location.search).get("api");
      if (override && /^https?:\/\//i.test(override)) return override.replace(/\/+$/, "");
    } catch (e) { /* 忽略 */ }
    return API_BASE;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController === "undefined") return fetch(url, options);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    var opts = {};
    Object.keys(options || {}).forEach(function (key) { opts[key] = options[key]; });
    opts.signal = controller.signal;
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  /* ---------- 面板开关 ---------- */

  function openPanel() {
    if (!els.panel || state.open) return;
    state.open = true;
    els.panel.hidden = false;
    document.documentElement.classList.add("hx-lb-open");
    if (window.gameState === 1 && typeof window.pause === "function") {
      window.pause();
    }
    if (window.keypress && typeof keypress.stop_listening === "function") {
      keypress.stop_listening();
    }
    syncForm();
    loadLeaderboard();
    if (window.matchMedia && window.matchMedia("(min-width: 700px)").matches) {
      setTimeout(function () { if (state.gameOver) els.name.focus(); }, 80);
    }
  }

  function closePanel() {
    if (!els.panel || !state.open) return;
    state.open = false;
    els.panel.hidden = true;
    document.documentElement.classList.remove("hx-lb-open");
    if (window.keypress && typeof keypress.listen === "function") {
      keypress.listen();
    }
  }

  /* ---------- 排行榜 ---------- */

  function listMessage(text) {
    els.list.innerHTML = "";
    var p = document.createElement("p");
    p.className = "hx-lb-empty";
    p.textContent = text;
    els.list.appendChild(p);
  }

  function renderScores(scores) {
    els.list.innerHTML = "";
    if (!scores || !scores.length) {
      listMessage("还没有人上榜，等你来拿第一。");
      return;
    }
    scores.slice(0, 20).forEach(function (item, index) {
      var row = document.createElement("div");
      row.className = "hx-lb-row" + (item.id === state.playerId ? " is-me" : "");

      var rank = document.createElement("span");
      rank.className = "hx-lb-rank";
      rank.textContent = "#" + (index + 1);

      var name = document.createElement("span");
      name.className = "hx-lb-name";
      name.textContent = item.name || "匿名小狗";

      var score = document.createElement("span");
      score.className = "hx-lb-score";
      score.textContent = String(item.score);

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      els.list.appendChild(row);
    });
  }

  function loadLeaderboard() {
    var base = resolveApiBase();
    if (!base) {
      listMessage("全服排行榜还没接通。");
      return;
    }
    els.refresh.disabled = true;
    fetchWithTimeout(base + "/hextris/leaderboard?limit=20", { cache: "no-store" }, 8000)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error("bad payload");
        renderScores(data.scores || []);
      })
      .catch(function () {
        listMessage("排行榜暂时连不上，本地最高分仍然有效。");
      })
      .finally(function () {
        els.refresh.disabled = false;
      });
  }

  function showMessage(text, isError) {
    els.message.textContent = text;
    els.message.classList.toggle("is-error", !!isError);
  }

  function syncForm() {
    // 0 分没有上榜的意义，服务端也会拒；干脆不显示表单，只留一句提示。
    var hasScore = state.gameOver && state.score > 0;
    var canSubmit = hasScore && !state.submitted;
    if (els.form) els.form.hidden = !hasScore;
    if (els.hint) {
      els.hint.hidden = hasScore;
      els.hint.textContent = state.gameOver && !hasScore ? HINT_ZERO : HINT_DEFAULT;
    }
    if (els.score) {
      els.score.hidden = !state.gameOver;
      if (state.gameOver) {
        els.score.innerHTML = "";
        els.score.appendChild(document.createTextNode("本局得分 "));
        var strong = document.createElement("strong");
        strong.textContent = String(state.score);
        els.score.appendChild(strong);
      }
    }
    if (els.submit) els.submit.disabled = !canSubmit;
    if (els.name) els.name.disabled = !canSubmit;
    if (state.submitted) {
      showMessage("已上榜。再玩一局就能刷新成绩。", false);
    } else if (!state.gameOver) {
      showMessage("", false);
    }
  }

  function submitScore(event) {
    event.preventDefault();
    if (state.submitted || !state.gameOver) return;

    var base = resolveApiBase();
    if (!base) {
      showMessage("排行榜还没接通，等 Worker 部署好就能上榜。", true);
      return;
    }

    var name = els.name.value.trim().replace(/\s+/g, " ").slice(0, 12);
    if (!name) {
      showMessage("写个昵称再上榜吧", true);
      return;
    }

    els.submit.disabled = true;
    els.name.disabled = true;
    showMessage("正在上传…", false);

    fetchWithTimeout(base + "/hextris/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.playerId, name: name, score: state.score })
    }, 10000)
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error : "submit_failed");
          return data;
        });
      })
      .then(function (data) {
        if (data.scores) renderScores(data.scores);
        if (data.taken) {
          showMessage("这个昵称已经有 " + data.personal_best + " 分的成绩了，换一个昵称再提交吧", true);
          els.submit.disabled = false;
          els.name.disabled = false;
          return;
        }
        state.submitted = true;
        try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 忽略隐私模式 */ }
        els.submit.disabled = true;
        els.name.disabled = true;
        showMessage(typeof data.rank === "number" ? "已上榜 · 全服第 " + data.rank + " 名" : "已上榜。", false);
      })
      .catch(function () {
        showMessage("提交失败，可能是网络或排行榜还没接通。", true);
        els.submit.disabled = false;
        els.name.disabled = false;
      });
  }

  /* ---------- 游戏结束钩子 ---------- */

  window.hxGameOver = function (score) {
    state.score = Math.max(0, Math.min(MAX_SCORE, Number(score) || 0));
    state.gameOver = true;
    state.submitted = false;
    var token = ++state.round;
    syncForm();
    if (state.score > 0) {
      setTimeout(function () {
        // 如果这期间已经点了重开，就别再弹排行榜。
        if (state.round === token && state.gameOver) openPanel();
      }, 700);
    }
  };

  function resetRound() {
    state.round += 1;
    state.gameOver = false;
    state.submitted = false;
    state.score = 0;
    syncForm();
  }

  /* ---------- 绑定 ---------- */

  function bind() {
    if (els.name) els.name.value = readName();

    Array.prototype.forEach.call(document.querySelectorAll("[data-lb-open]"), function (button) {
      button.addEventListener("click", openPanel);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lb-close]"), function (button) {
      button.addEventListener("click", closePanel);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-help]"), function (button) {
      button.addEventListener("click", function () {
        if (typeof window.showHelp === "function") window.showHelp();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-help-close]"), function (button) {
      button.addEventListener("click", function () {
        if (typeof window.showHelp === "function") window.showHelp();
      });
    });

    if (els.refresh) els.refresh.addEventListener("click", loadLeaderboard);
    if (els.form) els.form.addEventListener("submit", submitScore);

    ["startBtn", "restart", "restartBtn"].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      button.addEventListener("mousedown", resetRound);
      button.addEventListener("touchstart", resetRound);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) closePanel();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
