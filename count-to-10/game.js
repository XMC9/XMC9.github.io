/* ============================================================
 * COUNT TO 10 · 游戏逻辑
 * 原生 JS，无依赖。棋盘固定 16 行 × 10 列，拖矩形求和 = 10 消除。
 * ============================================================ */

(function () {
  "use strict";

  var ROWS = 16;
  var COLS = 10;
  var DURATION = 60;
  var TARGET = 10;
  var MAX_SCORE = ROWS * COLS; // 最多消掉 160 个方块
  var BEST_KEY = "ct10-best";
  var ID_KEY = "ct10-player-id";
  var NAME_KEY = "ct10-player-name";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    board: $("[data-board]"),
    cover: $("[data-cover]"),
    score: $("[data-score]"),
    time: $("[data-time]"),
    best: $("[data-best]"),
    status: $("[data-status]"),
    start: $("[data-start]"),
    restart: $("[data-restart]"),
    modal: $("[data-modal]"),
    modalTitle: $("[data-modal-title]"),
    finalScore: $("[data-final-score]"),
    modalBest: $("[data-modal-best]"),
    form: $("[data-submit-form]"),
    nameInput: $("#ct10-name"),
    formMsg: $("[data-form-msg]"),
    again: $("[data-again]"),
    closeModal: $("[data-close-modal]"),
    leaderboard: $("[data-leaderboard]"),
    lbNote: $("[data-lb-note]"),
    refresh: $("[data-refresh]"),
    themeToggle: $("[data-theme-toggle]")
  };

  // 可以写多个地址、用逗号分隔：国内先走自定义域名，workers.dev 留作备用。
  var API_BASES = (function () {
    var meta = $('meta[name="ct10-api"]');
    return (meta && meta.content ? meta.content : "")
      .split(/[\s,]+/)
      .map(function (item) { return item.trim().replace(/\/+$/, ""); })
      .filter(function (item) { return /^https?:\/\//i.test(item); });
  })();

  var workingBase = "";

  var state = {
    phase: "idle", // idle | running | over
    board: [],
    score: 0,
    best: loadNumber(BEST_KEY),
    deadline: 0,
    timerId: null,
    anchor: null,
    focus: null,
    dragging: false,
    locked: false,
    playerId: getPlayerId(),
    submitted: false
  };

  var tiles = [];
  var statusTimer = null;
  var DEFAULT_STATUS = "拖出一块矩形，和等于 10 就能消除";

  /* ---------- 小工具 ---------- */

  function loadNumber(key) {
    try {
      var value = parseInt(localStorage.getItem(key) || "0", 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (e) { return 0; }
  }

  function saveNumber(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* 忽略隐私模式 */ }
  }

  function getPlayerId() {
    try {
      var id = localStorage.getItem(ID_KEY);
      if (!id) {
        id = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(ID_KEY, id);
      }
      return id;
    } catch (e) {
      return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function makeBoard() {
    var board = [];
    for (var attempt = 0; attempt < 40; attempt++) {
      board = [];
      for (var r = 0; r < ROWS; r++) {
        var row = [];
        for (var c = 0; c < COLS; c++) row.push(randInt(1, 9));
        board.push(row);
      }
      // 极少数情况下棋盘会一个 10 都凑不出来，换一块。
      if (hasMove(board)) return board;
    }
    return board;
  }

  function sumRect(board, r1, c1, r2, c2) {
    var top = Math.min(r1, r2), bottom = Math.max(r1, r2);
    var left = Math.min(c1, c2), right = Math.max(c1, c2);
    var sum = 0, count = 0;
    for (var r = top; r <= bottom; r++) {
      for (var c = left; c <= right; c++) {
        var value = board[r][c];
        if (value > 0) { sum += value; count += 1; }
      }
    }
    return { sum: sum, count: count, top: top, bottom: bottom, left: left, right: right };
  }

  // 棋盘上是否还至少存在一个和为 10 的矩形。16×10 最多约 7500 个矩形，很快。
  function hasMove(board) {
    for (var r1 = 0; r1 < ROWS; r1++) {
      for (var r2 = r1; r2 < ROWS; r2++) {
        for (var c1 = 0; c1 < COLS; c1++) {
          for (var c2 = c1; c2 < COLS; c2++) {
            var result = sumRect(board, r1, c1, r2, c2);
            if (result.sum === TARGET && result.count > 0) return true;
            if (result.sum > TARGET) break; // 数字都是正的，再往右只会更大
          }
        }
      }
    }
    return false;
  }

  /* ---------- 棋盘渲染 ---------- */

  function buildTiles() {
    els.board.innerHTML = "";
    var fragment = document.createDocumentFragment();
    for (var r = 0; r < ROWS; r++) {
      tiles[r] = [];
      for (var c = 0; c < COLS; c++) {
        var tile = document.createElement("div");
        tile.className = "ct10-tile";
        tile.dataset.row = String(r);
        tile.dataset.col = String(c);
        tile.setAttribute("role", "gridcell");
        fragment.appendChild(tile);
        tiles[r][c] = tile;
      }
    }
    els.board.appendChild(fragment);
  }

  function paintTile(r, c) {
    var tile = tiles[r][c];
    var value = state.board[r][c];
    tile.textContent = value > 0 ? String(value) : "";
    tile.dataset.empty = value > 0 ? "0" : "1";
  }

  function paintBoard() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) paintTile(r, c);
    }
  }

  function updateHud() {
    els.score.textContent = String(state.score);
    els.best.textContent = String(state.best);
  }

  function updateTime(seconds) {
    els.time.textContent = String(Math.max(0, seconds));
  }

  function setStatus(text, tone) {
    els.status.textContent = text;
    els.status.classList.remove("is-good", "is-warn");
    if (tone) els.status.classList.add(tone === "good" ? "is-good" : "is-warn");
  }

  function flashStatus(text, tone, delay) {
    clearTimeout(statusTimer);
    setStatus(text, tone);
    statusTimer = setTimeout(function () {
      if (state.phase === "running" && !state.dragging) setStatus(DEFAULT_STATUS);
    }, delay || 1500);
  }

  /* ---------- 选择框 ---------- */

  function selectionRect() {
    if (!state.anchor || !state.focus) return null;
    return {
      top: Math.min(state.anchor.r, state.focus.r),
      bottom: Math.max(state.anchor.r, state.focus.r),
      left: Math.min(state.anchor.c, state.focus.c),
      right: Math.max(state.anchor.c, state.focus.c)
    };
  }

  function clearSelectionClasses() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) tiles[r][c].classList.remove("is-selected");
    }
  }

  function paintSelection() {
    var rect = selectionRect();
    clearSelectionClasses();
    if (!rect) return;

    var sum = 0, count = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (r < rect.top || r > rect.bottom || c < rect.left || c > rect.right) continue;
        tiles[r][c].classList.add("is-selected");
        if (state.board[r][c] > 0) {
          sum += state.board[r][c];
          count += 1;
        }
      }
    }

    if (count === 0) {
      setStatus("框里还没有数字");
    } else if (sum === TARGET) {
      setStatus("正好 10 · " + count + " 个方块", "good");
    } else if (sum < TARGET) {
      setStatus("当前 " + sum + "，还差 " + (TARGET - sum));
    } else {
      setStatus("当前 " + sum + "，多了 " + (sum - TARGET), "warn");
    }
  }

  function cellFromPoint(x, y) {
    var rect = els.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

    var styles = getComputedStyle(els.board);
    var gap = parseFloat(styles.columnGap);
    if (!Number.isFinite(gap)) gap = parseFloat(styles.gap) || 0;
    var cellW = (rect.width - gap * (COLS - 1)) / COLS;
    var cellH = (rect.height - gap * (ROWS - 1)) / ROWS;
    var col = Math.floor((x - rect.left) / (cellW + gap));
    var row = Math.floor((y - rect.top) / (cellH + gap));
    col = Math.max(0, Math.min(COLS - 1, col));
    row = Math.max(0, Math.min(ROWS - 1, row));
    return { r: row, c: col };
  }

  function onPointerDown(event) {
    if (state.phase !== "running" || state.locked) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    var tile = event.target.closest(".ct10-tile");
    if (!tile) return;

    state.dragging = true;
    state.anchor = { r: Number(tile.dataset.row), c: Number(tile.dataset.col) };
    state.focus = { r: state.anchor.r, c: state.anchor.c };
    clearTimeout(statusTimer);

    try { els.board.setPointerCapture(event.pointerId); } catch (e) { /* 旧浏览器 */ }
    paintSelection();
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.dragging || state.locked) return;
    var cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    if (state.focus && state.focus.r === cell.r && state.focus.c === cell.c) return;
    state.focus = cell;
    paintSelection();
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (!state.dragging) return;
    state.dragging = false;
    try { els.board.releasePointerCapture(event.pointerId); } catch (e) { /* 忽略 */ }
    commitSelection();
  }

  function onPointerCancel() {
    if (!state.dragging) return;
    state.dragging = false;
    state.anchor = null;
    state.focus = null;
    clearSelectionClasses();
    setStatus(DEFAULT_STATUS);
  }

  function commitSelection() {
    var rect = selectionRect();
    state.anchor = null;
    state.focus = null;
    if (!rect) return;

    var result = sumRect(state.board, rect.top, rect.left, rect.bottom, rect.right);
    if (result.sum === TARGET && result.count > 0) {
      state.score += result.count;
      updateHud();
      clearRect(rect, result.count);
    } else {
      clearSelectionClasses();
      if (result.count === 0) {
        flashStatus("框里还没有数字", "warn");
      } else {
        flashStatus(result.sum + " 不是 10，再试一次", "warn");
      }
    }
  }

  function clearRect(rect, count) {
    state.locked = true;
    for (var r = rect.top; r <= rect.bottom; r++) {
      for (var c = rect.left; c <= rect.right; c++) {
        tiles[r][c].classList.add("is-clearing");
      }
    }

    setTimeout(function () {
      for (var r = rect.top; r <= rect.bottom; r++) {
        for (var c = rect.left; c <= rect.right; c++) {
          state.board[r][c] = 0;
          tiles[r][c].classList.remove("is-clearing", "is-selected");
          paintTile(r, c);
        }
      }
      state.locked = false;

      if (state.phase === "running") {
        if (!hasMove(state.board)) {
          flashStatus("没有能凑成 10 的方块了，点「重新开始」再来一局", "warn", 4000);
        } else {
          flashStatus("+" + count + " 分！继续找 10", "good", 1200);
        }
      }
    }, 240);
  }

  /* ---------- 计时 ---------- */

  function startGame() {
    clearTimeout(statusTimer);
    clearInterval(state.timerId);
    state.phase = "running";
    state.score = 0;
    state.locked = false;
    state.dragging = false;
    state.anchor = null;
    state.focus = null;
    state.submitted = false;
    state.board = makeBoard();

    paintBoard();
    updateHud();
    clearSelectionClasses();
    setStatus(DEFAULT_STATUS);
    els.cover.hidden = true;
    els.restart.hidden = false;
    els.modal.hidden = true;
    els.form.hidden = true;
    els.formMsg.textContent = "";
    els.formMsg.classList.remove("is-error");

    state.deadline = performance.now() + DURATION * 1000;
    updateTime(DURATION);
    state.timerId = setInterval(tick, 100);
  }

  function tick() {
    var left = state.deadline - performance.now();
    updateTime(Math.ceil(Math.max(0, left) / 1000));
    if (left <= 0) endGame();
  }

  function endGame() {
    if (state.phase !== "running") return;
    state.phase = "over";
    clearInterval(state.timerId);
    state.timerId = null;
    state.dragging = false;
    state.anchor = null;
    state.focus = null;
    clearSelectionClasses();
    updateTime(0);

    var score = state.score;
    var record = score > state.best && score > 0;
    if (record) {
      state.best = score;
      saveNumber(BEST_KEY, state.best);
      updateHud();
    }
    showResult(score, record);
  }

  /* ---------- 结算 ---------- */

  function showResult(score, record) {
    els.finalScore.textContent = String(score);
    els.modalTitle.textContent = record ? "恭喜打破纪录！" : "本局结束";
    els.modalBest.textContent = record
      ? "个人最佳刷新为 " + state.best + " 分"
      : "个人最佳 " + state.best + " 分";

    var canSubmit = record && resolveApiBases().length > 0;
    els.form.hidden = !canSubmit;
    els.formMsg.textContent = "";
    els.formMsg.classList.remove("is-error");
    if (canSubmit) {
      els.nameInput.value = readName();
      els.form.querySelector("button[type=submit]").disabled = false;
    } else if (record) {
      els.modalBest.textContent += "（全服排行榜暂未接通，记录已存在本机）";
    }

    els.modal.hidden = false;
    if (canSubmit) setTimeout(function () { els.nameInput.focus(); }, 60);
  }

  function readName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
  }

  /* ---------- 排行榜 ---------- */

  function resolveApiBases() {
    // 本地测试可以加 ?api=http://127.0.0.1:4003，正式环境用 meta 里的地址。
    var bases = [];
    try {
      var override = new URLSearchParams(location.search).get("api");
      if (override && /^https?:\/\//i.test(override)) {
        bases.push(override.replace(/\/+$/, ""));
      }
    } catch (e) { /* 忽略 */ }
    API_BASES.forEach(function (base) {
      if (bases.indexOf(base) === -1) bases.push(base);
    });
    // 上一轮已经连通的地址排到最前面，少一次无谓的等待。
    if (workingBase && bases.indexOf(workingBase) > 0) {
      bases = [workingBase].concat(bases.filter(function (base) { return base !== workingBase; }));
    }
    return bases;
  }

  function renderLeaderboard(scores) {
    els.leaderboard.innerHTML = "";
    if (!scores || !scores.length) {
      var empty = document.createElement("p");
      empty.className = "ct10-lb-empty";
      empty.textContent = "还没有人上榜，等你来拿第一。";
      els.leaderboard.appendChild(empty);
      return;
    }

    scores.slice(0, 20).forEach(function (item, index) {
      var row = document.createElement("div");
      row.className = "ct10-lb-row" + (item.id === state.playerId ? " is-me" : "");

      var rank = document.createElement("span");
      rank.className = "ct10-lb-rank";
      rank.textContent = "#" + (index + 1);

      var name = document.createElement("span");
      name.className = "ct10-lb-name";
      name.textContent = item.name || "匿名小狗";

      var score = document.createElement("span");
      score.className = "ct10-lb-score";
      score.textContent = String(item.score);

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      els.leaderboard.appendChild(row);
    });
  }

  function leaderboardMessage(text) {
    els.leaderboard.innerHTML = "";
    var p = document.createElement("p");
    p.className = "ct10-lb-empty";
    p.textContent = text;
    els.leaderboard.appendChild(p);
  }

  // Worker 还没部署或网络卡住时，别让「正在读取排行榜…」一直转。
  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController === "undefined") return fetch(url, options);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    var opts = {};
    Object.keys(options || {}).forEach(function (key) { opts[key] = options[key]; });
    opts.signal = controller.signal;
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  // 依次尝试候选地址（国内 workers.dev 经常超时），记住第一个通的。
  function apiFetch(path, options, timeoutMs) {
    var bases = resolveApiBases();
    if (!bases.length) return Promise.reject(new Error("no_api"));
    var attempt = function (index) {
      return fetchWithTimeout(bases[index] + path, options, timeoutMs || 6000)
        .then(function (response) {
          if (response.status >= 500) throw new Error("HTTP " + response.status);
          workingBase = bases[index];
          return response;
        })
        .catch(function (error) {
          if (index + 1 >= bases.length) throw error;
          return attempt(index + 1);
        });
    };
    return attempt(0);
  }

  function loadLeaderboard(silent) {
    if (!resolveApiBases().length) {
      leaderboardMessage("全服排行榜还没接通。");
      els.lbNote.textContent = "本地最高分照常记录；等 Worker 部署后，这里会自动出现全服榜。";
      return;
    }
    if (!silent) els.refresh.disabled = true;
    apiFetch("/leaderboard?limit=20", { cache: "no-store" }, 6000)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error("bad payload");
        renderLeaderboard(data.scores || []);
        els.lbNote.textContent = "昵称只用于排行榜展示，不需要注册。";
      })
      .catch(function () {
        leaderboardMessage("排行榜暂时连不上，本地最高分仍然有效。");
        els.lbNote.textContent = "稍后点「刷新」再试；游戏本身不受影响。";
      })
      .finally(function () {
        if (!silent) els.refresh.disabled = false;
      });
  }

  function submitScore(event) {
    event.preventDefault();
    if (!resolveApiBases().length || state.submitted) return;

    var name = els.nameInput.value.trim().slice(0, 12);
    if (!name) {
      showFormMessage("写个昵称再上榜吧", true);
      return;
    }

    var button = els.form.querySelector("button[type=submit]");
    button.disabled = true;
    showFormMessage("正在上传…", false);

    apiFetch("/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.playerId, name: name, score: state.score })
    }, 8000)
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error : "提交失败");
          return data;
        });
      })
      .then(function (data) {
        if (data.taken) {
          if (data.scores) renderLeaderboard(data.scores);
          showFormMessage("这个昵称已经有 " + data.personal_best + " 分的成绩了，换一个昵称再提交吧", true);
          button.disabled = false;
          return;
        }
        state.submitted = true;
        try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 忽略 */ }
        if (data.scores) renderLeaderboard(data.scores);
        if (typeof data.rank === "number") {
          els.modalBest.textContent = "已上榜 · 全服第 " + data.rank + " 名";
        } else if (typeof data.personal_best === "number") {
          els.modalBest.textContent = "你在这台设备上的最高分是 " + data.personal_best + " 分";
        }
        els.form.hidden = true;
      })
      .catch(function () {
        showFormMessage("提交失败，可能是网络或排行榜还没部署好。", true);
        button.disabled = false;
      });
  }

  function showFormMessage(text, isError) {
    els.formMsg.textContent = text;
    els.formMsg.classList.toggle("is-error", !!isError);
  }

  /* ---------- 深浅色 ---------- */

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.themeToggle.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1726" : "#E8F1F8");
  }

  function toggleTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      var stored = JSON.parse(localStorage.getItem("REDEFINE-THEME-STATUS") || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem("REDEFINE-THEME-STATUS", JSON.stringify(stored));
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 初始化 ---------- */

  function init() {
    buildTiles();
    state.board = makeBoard();
    paintBoard();
    updateHud();
    updateTime(DURATION);
    applyTheme(currentTheme());

    els.start.addEventListener("click", startGame);
    els.restart.addEventListener("click", startGame);
    els.again.addEventListener("click", startGame);
    els.closeModal.addEventListener("click", function () { els.modal.hidden = true; });
    els.themeToggle.addEventListener("click", toggleTheme);
    els.refresh.addEventListener("click", function () { loadLeaderboard(false); });
    els.form.addEventListener("submit", submitScore);

    els.board.addEventListener("pointerdown", onPointerDown);
    els.board.addEventListener("pointermove", onPointerMove);
    els.board.addEventListener("pointerup", onPointerUp);
    els.board.addEventListener("pointercancel", onPointerCancel);
    els.board.addEventListener("contextmenu", function (event) { event.preventDefault(); });

    loadLeaderboard(true);
  }

  // 给本地测试和以后排查用的小钩子。
  window.__CT10 = {
    state: state,
    ROWS: ROWS,
    COLS: COLS,
    makeBoard: makeBoard,
    sumRect: sumRect,
    hasMove: hasMove,
    setBoard: function (board) {
      state.board = board.map(function (row) { return row.slice(); });
      paintBoard();
      updateHud();
    },
    setSelection: function (r1, c1, r2, c2) {
      state.anchor = { r: r1, c: c1 };
      state.focus = { r: r2, c: c2 };
      paintSelection();
    },
    commitSelection: commitSelection,
    start: startGame,
    end: endGame,
    maxScore: MAX_SCORE
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
