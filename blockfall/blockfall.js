/* ============================================================
 * BLOCKFALL · 游戏逻辑
 * 10 × 20 的棋盘，消满一行得一行；
 * 分数 = 经典计分（40 / 100 / 300 / 1200）× 等级；
 * 每消 10 行升一级，下落越来越快；
 * 游戏结束后可以把分数传到全服排行榜（/blockfall/score）。
 * ============================================================ */

(function () {
  "use strict";

  var COLS = 10;
  var ROWS = 20;
  var SCORE_TABLE = [0, 40, 100, 300, 1200];
  var BEST_KEY = "blockfall-best";
  var CLEAR_MS = 170;

  var SHAPES = [
    { id: 1, cells: [[1, 1, 1], [0, 1, 0]] }, // T
    { id: 2, cells: [[2, 2], [2, 2]] },       // O
    { id: 3, cells: [[3, 0, 0], [3, 3, 3]] }, // J
    { id: 4, cells: [[0, 0, 4], [4, 4, 4]] }, // L
    { id: 5, cells: [[5, 5, 5, 5]] },         // I
    { id: 6, cells: [[0, 6, 6], [6, 6, 0]] }, // S
    { id: 7, cells: [[7, 7, 0], [0, 7, 7]] }  // Z
  ];

  // 同一套色系，深色模式整体提亮一档。
  var PALETTE = {
    light: { 1: "#9C8FD4", 2: "#E8B85C", 3: "#2E75B6", 4: "#D98C5F", 5: "#5B9BD5", 6: "#6FAF8F", 7: "#E06C5A" },
    dark: { 1: "#B3A6E6", 2: "#F0C674", 3: "#6FA9DD", 4: "#E8A57A", 5: "#7FB2E5", 6: "#8FC7A8", 7: "#F08A78" }
  };

  var $ = function (sel) { return document.querySelector(sel); };

  var canvas = $("[data-canvas]");
  var ctx = canvas.getContext("2d");
  var nextCanvas = $("[data-next]");
  var nextCtx = nextCanvas.getContext("2d");

  var ui = {
    score: $("[data-score]"),
    level: $("[data-level]"),
    lines: $("[data-lines]"),
    best: $("[data-best]"),
    status: $("[data-status]"),
    overlay: $("[data-overlay]"),
    overlayTitle: $("[data-overlay-title]"),
    overlayScore: $("[data-overlay-score]"),
    overlayBtn: $("[data-overlay-btn]"),
    overlayNote: $("[data-overlay-note]"),
    pause: $("[data-pause]"),
    restart: $("[data-restart]"),
    modal: $("[data-modal]"),
    modalTitle: $("[data-modal-title]"),
    finalScore: $("[data-final-score]"),
    modalBest: $("[data-modal-best]"),
    form: $("[data-submit-form]"),
    name: $("#bf-name"),
    formMsg: $("[data-form-msg]"),
    again: $("[data-again]"),
    closeModal: $("[data-close-modal]")
  };

  var state = {
    phase: "menu", // menu | playing | paused | clearing | over
    board: emptyBoard(),
    piece: null,
    next: null,
    bag: [],
    score: 0,
    level: 1,
    lines: 0,
    best: Number(Arcade.read(BEST_KEY)) || 0,
    dropInterval: 1000,
    dropTimer: 0,
    clearRows: [],
    clearTimer: 0,
    elapsed: 0,
    lastTime: 0,
    rafId: 0,
    submitted: false
  };

  var palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;
  var cell = 30;
  // 棋盘在画布里的左上角偏移：格子大小按画布「宽高都能装下」来算，
  // 剩下的余量两边均分，网格线和方块共用同一套坐标，永远不会错位。
  var originX = 0;
  var originY = 0;
  var pixelRatio = 1;

  /* ---------- 基础逻辑 ---------- */

  function emptyBoard() {
    var rows = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) row.push(0);
      rows.push(row);
    }
    return rows;
  }

  function cloneShape(shape) {
    return shape.map(function (row) { return row.slice(); });
  }

  // 7-bag：每七个方块里各出现一次，避免长时间不来长条。
  function nextFromBag() {
    if (!state.bag.length) {
      var ids = SHAPES.map(function (item, index) { return index; });
      for (var i = ids.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = ids[i];
        ids[i] = ids[j];
        ids[j] = temp;
      }
      state.bag = ids;
    }
    var shape = SHAPES[state.bag.pop()];
    return { id: shape.id, cells: cloneShape(shape.cells) };
  }

  function spawnPiece() {
    var piece = state.next || nextFromBag();
    state.next = nextFromBag();
    piece.x = Math.floor((COLS - piece.cells[0].length) / 2);
    piece.y = 0;
    state.piece = piece;
    drawNext();
    if (collides(state.piece)) {
      endGame();
    }
  }

  function collides(piece) {
    if (!piece) return false;
    for (var y = 0; y < piece.cells.length; y++) {
      for (var x = 0; x < piece.cells[y].length; x++) {
        if (!piece.cells[y][x]) continue;
        var nx = piece.x + x;
        var ny = piece.y + y;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && state.board[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotateCells(cells) {
    var cols = cells[0].length;
    var out = [];
    for (var x = 0; x < cols; x++) {
      var row = [];
      for (var y = cells.length - 1; y >= 0; y--) row.push(cells[y][x]);
      out.push(row);
    }
    return out;
  }

  function rotate() {
    if (state.phase !== "playing" || !state.piece) return;
    var original = state.piece.cells;
    var rotated = rotateCells(original);
    var originalX = state.piece.x;
    var originalY = state.piece.y;
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      state.piece.cells = rotated;
      state.piece.x = originalX + kicks[i];
      if (!collides(state.piece)) { draw(); return; }
    }
    // 贴地旋转：再试一次往上顶一格。
    state.piece.cells = rotated;
    state.piece.y = originalY - 1;
    if (!collides(state.piece)) { draw(); return; }
    state.piece.cells = original;
    state.piece.x = originalX;
    state.piece.y = originalY;
  }

  function move(dx) {
    if (state.phase !== "playing" || !state.piece) return;
    state.piece.x += dx;
    if (collides(state.piece)) state.piece.x -= dx;
    else draw();
  }

  function step() {
    if (state.phase !== "playing" || !state.piece) return;
    state.piece.y += 1;
    if (collides(state.piece)) {
      state.piece.y -= 1;
      lockPiece();
    }
    draw();
  }

  function softDrop() {
    if (state.phase !== "playing") return;
    step();
    state.dropTimer = 0;
  }

  function hardDrop() {
    if (state.phase !== "playing" || !state.piece) return;
    while (!collides(state.piece)) state.piece.y += 1;
    state.piece.y -= 1;
    lockPiece();
    draw();
  }

  function lockPiece() {
    var piece = state.piece;
    var overflow = false;
    for (var y = 0; y < piece.cells.length; y++) {
      for (var x = 0; x < piece.cells[y].length; x++) {
        if (!piece.cells[y][x]) continue;
        var ny = piece.y + y;
        var nx = piece.x + x;
        if (ny < 0) { overflow = true; continue; }
        state.board[ny][nx] = piece.cells[y][x];
      }
    }
    state.piece = null;
    if (overflow) {
      endGame();
      return;
    }

    var full = [];
    for (var row = 0; row < ROWS; row++) {
      var done = true;
      for (var col = 0; col < COLS; col++) {
        if (!state.board[row][col]) { done = false; break; }
      }
      if (done) full.push(row);
    }

    if (full.length) {
      state.clearRows = full;
      state.clearTimer = 0;
      state.phase = "clearing";
      state.score += SCORE_TABLE[full.length] * state.level;
      state.lines += full.length;
      var level = 1 + Math.floor(state.lines / 10);
      if (level > state.level) state.level = level;
      state.dropInterval = Math.max(90, 1000 * Math.pow(0.85, state.level - 1));
      updateHud();
    } else {
      spawnPiece();
    }
  }

  function finishClear() {
    var rows = state.clearRows.slice().sort(function (a, b) { return a - b; });
    rows.forEach(function (row) { state.board.splice(row, 1); });
    rows.forEach(function () {
      var empty = [];
      for (var x = 0; x < COLS; x++) empty.push(0);
      state.board.unshift(empty);
    });
    state.clearRows = [];
    state.phase = "playing";
    spawnPiece();
    updateHud();
    draw();
  }

  /* ---------- 绘制 ---------- */

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawBlock(g, px, py, size, color, alpha) {
    g.globalAlpha = alpha == null ? 1 : alpha;
    var r = Math.max(2, size * 0.2);
    g.fillStyle = color;
    roundRect(g, px + 0.5, py + 0.5, size - 1, size - 1, r);
    g.fill();
    g.fillStyle = "rgba(255, 255, 255, 0.28)";
    roundRect(g, px + size * 0.16, py + size * 0.15, size * 0.68, size * 0.16, Math.max(1, r * 0.5));
    g.fill();
    g.globalAlpha = 1;
  }

  function drawGhost() {
    var piece = state.piece;
    if (!piece) return;
    var ghostY = piece.y;
    while (true) {
      piece.y += 1;
      if (collides(piece)) { piece.y -= 1; break; }
    }
    var color = palette[piece.id];
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, cell * 0.09);
    for (var y = 0; y < piece.cells.length; y++) {
      for (var x = 0; x < piece.cells[y].length; x++) {
        if (!piece.cells[y][x]) continue;
        var py = piece.y + y;
        if (py < 0) continue;
        var r = Math.max(2, cell * 0.2);
        roundRect(ctx, originX + (piece.x + x) * cell + 1, originY + py * cell + 1, cell - 2, cell - 2, r);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    piece.y = ghostY;
  }

  // 背景格子直接画在画布上（不再依赖 CSS 背景图层），和方块同一套坐标。
  function drawGrid() {
    var w = COLS * cell;
    var h = ROWS * cell;
    var half = pixelRatio <= 1 ? 0.5 : 0;
    ctx.strokeStyle = document.documentElement.dataset.theme === "dark"
      ? "rgba(127, 178, 229, 0.13)"
      : "rgba(31, 47, 64, 0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 1; i < COLS; i++) {
      var gx = originX + i * cell + half;
      ctx.moveTo(gx, originY);
      ctx.lineTo(gx, originY + h);
    }
    for (var j = 1; j < ROWS; j++) {
      var gy = originY + j * cell + half;
      ctx.moveTo(originX, gy);
      ctx.lineTo(originX + w, gy);
    }
    ctx.stroke();
  }

  function draw() {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawGrid();

    var flash = state.phase === "clearing" && Math.floor(state.clearTimer / 55) % 2 === 0;
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var value = state.board[y][x];
        if (!value) continue;
        if (state.clearRows.indexOf(y) !== -1) {
          drawBlock(ctx, originX + x * cell, originY + y * cell, cell, flash ? "#FFFFFF" : palette[value], flash ? 0.9 : 0.5);
        } else {
          drawBlock(ctx, originX + x * cell, originY + y * cell, cell, palette[value] || "#5B9BD5");
        }
      }
    }

    if (state.piece && state.phase !== "clearing") {
      drawGhost();
      var piece = state.piece;
      for (var py = 0; py < piece.cells.length; py++) {
        for (var px = 0; px < piece.cells[py].length; px++) {
          if (!piece.cells[py][px]) continue;
          var by = piece.y + py;
          if (by < 0) continue;
          drawBlock(ctx, originX + (piece.x + px) * cell, originY + by * cell, cell, palette[piece.id] || "#5B9BD5");
        }
      }
    }
  }

  function drawNext() {
    if (!nextCtx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var rect = nextCanvas.getBoundingClientRect();
    var w = Math.max(40, Math.round(rect.width * dpr));
    if (nextCanvas.width !== w) {
      nextCanvas.width = w;
      nextCanvas.height = w;
    }
    var size = nextCanvas.width / dpr;
    nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nextCtx.clearRect(0, 0, size, size);
    if (!state.next) return;
    var cells = state.next.cells;
    var cellSize = size / 4.6;
    var offsetX = (size - cells[0].length * cellSize) / 2;
    var offsetY = (size - cells.length * cellSize) / 2;
    for (var y = 0; y < cells.length; y++) {
      for (var x = 0; x < cells[y].length; x++) {
        if (!cells[y][x]) continue;
        drawBlock(nextCtx, offsetX + x * cellSize, offsetY + y * cellSize, cellSize, palette[state.next.id]);
      }
    }
  }

  function fitCanvas() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    pixelRatio = dpr;
    var w = Math.round(rect.width * dpr);
    var h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 宽、高都塞得下才算格子边长，剩下的余量均分到左右 / 上下。
    cell = Math.min(rect.width / COLS, rect.height / ROWS);
    originX = (rect.width - cell * COLS) / 2;
    originY = (rect.height - cell * ROWS) / 2;
    draw();
    drawNext();
  }

  /* ---------- 界面 ---------- */

  function updateHud() {
    ui.score.textContent = state.score;
    ui.level.textContent = state.level;
    ui.lines.textContent = state.lines;
    ui.best.textContent = Math.max(state.best, state.score);
  }

  function setStatus(text, tone) {
    ui.status.textContent = text;
    ui.status.classList.toggle("is-good", tone === "good");
    ui.status.classList.toggle("is-warn", tone === "warn");
  }

  // 触屏按键只在窄屏 / 触屏设备上出现，提示文案跟着走
  function padVisible() {
    var pad = document.querySelector(".bf-pad");
    return !!pad && getComputedStyle(pad).display !== "none";
  }

  function showOverlay(title, buttonText, note, score) {
    ui.overlay.hidden = false;
    ui.overlayTitle.textContent = title;
    ui.overlayBtn.textContent = buttonText;
    ui.overlayBtn.hidden = false;
    ui.overlayNote.textContent = note || "";
    if (typeof score === "number") {
      ui.overlayScore.textContent = score;
      ui.overlayScore.hidden = false;
    } else {
      ui.overlayScore.hidden = true;
    }
  }

  function hideOverlay() {
    ui.overlay.hidden = true;
  }

  function startGame() {
    state.board = emptyBoard();
    state.piece = null;
    state.next = null;
    state.bag = [];
    state.score = 0;
    state.level = 1;
    state.lines = 0;
    state.dropInterval = 1000;
    state.dropTimer = 0;
    state.clearRows = [];
    state.elapsed = 0;
    state.lastTime = 0;
    state.submitted = false;
    state.phase = "playing";
    ui.pause.disabled = false;
    ui.pause.textContent = "暂停";
    hideOverlay();
    closeModal();
    spawnPiece();
    updateHud();
    setStatus(padVisible()
      ? "右边按键：↑ 旋转、⤓ 落底；也能直接在棋盘上拖动"
      : "方向键移动，↑ 旋转，空格直接落底");
    draw();
    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(loop);
  }

  function endGame() {
    state.phase = "over";
    ui.pause.disabled = true;
    state.isRecord = state.score > state.best;
    if (state.isRecord) {
      state.best = state.score;
      Arcade.write(BEST_KEY, String(state.best));
    }
    updateHud();
    draw();
    if (state.score > 0) {
      setStatus("这一局拿了 " + state.score + " 分");
    } else {
      setStatus("这一局还没得分，再来一局吧");
    }
    setTimeout(function () {
      if (state.phase === "over") openResultModal();
    }, 550);
  }

  function togglePause() {
    if (state.phase === "playing") {
      state.phase = "paused";
      ui.pause.textContent = "继续";
      showOverlay("已暂停", "继续游戏", "按 Esc 也可以继续", state.score);
    } else if (state.phase === "paused") {
      state.phase = "playing";
      ui.pause.textContent = "暂停";
      state.lastTime = 0;
      hideOverlay();
    }
  }

  /* ---------- 结算弹窗 & 排行榜 ---------- */

  var lb = Arcade.createLeaderboard({
    meta: "bf-api",
    idPrefix: "bf",
    idKey: "blockfall-player-id",
    nameKey: "blockfall-player-name",
    path: "/blockfall",
    list: $("[data-leaderboard]"),
    refresh: $("[data-refresh]"),
    formatScore: function (value) { return String(value); }
  });

  function openResultModal() {
    ui.modal.hidden = false;
    ui.finalScore.textContent = state.score;
    ui.modalBest.textContent = "个人最佳 " + Math.max(state.best, state.score) + " 分";
    ui.modalTitle.textContent = state.isRecord ? "新纪录！" : "这一局结束了";
    ui.formMsg.textContent = "";
    ui.formMsg.classList.remove("is-error");
    ui.name.value = lb.name || "";
    var canSubmit = state.score > 0 && !state.submitted;
    ui.form.hidden = !(state.score > 0);
    ui.form.querySelector("button").disabled = !canSubmit;
    ui.name.disabled = !canSubmit;
    if (!state.score) {
      ui.modalBest.textContent = "这一局没有得分，先不上榜。";
    }
  }

  function closeModal() {
    ui.modal.hidden = true;
  }

  function submitScore(event) {
    event.preventDefault();
    if (state.submitted || state.score <= 0) return;
    var name = ui.name.value.trim().replace(/\s+/g, " ").slice(0, 12);
    if (!name) {
      setFormMessage("写个昵称再上榜吧", true);
      return;
    }
    var button = ui.form.querySelector("button");
    button.disabled = true;
    ui.name.disabled = true;
    setFormMessage("正在上传…", false);

    lb.submit(name, state.score)
      .then(function (data) {
        if (data.taken) {
          setFormMessage("这个昵称已经有 " + data.personal_best + " 分的成绩了，换一个昵称吧", true);
          button.disabled = false;
          ui.name.disabled = false;
          return;
        }
        state.submitted = true;
        setFormMessage(typeof data.rank === "number" ? "已上榜 · 全服第 " + data.rank + " 名" : "已上榜。", false);
      })
      .catch(function () {
        setFormMessage("提交失败，可能是网络或排行榜还没接通。", true);
        button.disabled = false;
        ui.name.disabled = false;
      });
  }

  function setFormMessage(text, isError) {
    ui.formMsg.textContent = text;
    ui.formMsg.classList.toggle("is-error", !!isError);
  }

  /* ---------- 输入 ---------- */

  var repeatTimer = null;
  var repeatInterval = null;

  function startRepeat(action, delay, rate) {
    stopRepeat();
    action();
    repeatTimer = setTimeout(function () {
      repeatInterval = setInterval(action, rate);
    }, delay);
  }

  function stopRepeat() {
    clearTimeout(repeatTimer);
    clearInterval(repeatInterval);
    repeatTimer = null;
    repeatInterval = null;
  }

  var KEY_ACTIONS = {
    left: { action: function () { move(-1); }, repeat: true },
    right: { action: function () { move(1); }, repeat: true },
    down: { action: softDrop, repeat: true },
    rotate: { action: rotate, repeat: false },
    drop: { action: hardDrop, repeat: false }
  };

  function bindTouchKeys() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-key]"), function (button) {
      var config = KEY_ACTIONS[button.dataset.key];
      if (!config) return;
      var press = function (event) {
        event.preventDefault();
        button.classList.add("is-down");
        if (config.repeat) {
          startRepeat(config.action, 180, 60);
        } else {
          config.action();
        }
      };
      var release = function () {
        button.classList.remove("is-down");
        stopRepeat();
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    });
  }

  function bindCanvasGestures() {
    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var lastY = 0;
    var startTime = 0;
    var dragging = false;

    canvas.addEventListener("pointerdown", function (event) {
      if (state.phase !== "playing") return;
      dragging = true;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      startTime = Date.now();
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!dragging || state.phase !== "playing") return;
      var dx = event.clientX - lastX;
      if (Math.abs(dx) > cell * 0.8) {
        move(Math.sign(dx));
        lastX = event.clientX;
      }
    });

    var finish = function (event) {
      if (!dragging) return;
      dragging = false;
      if (state.phase !== "playing") return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      var elapsed = Date.now() - startTime;
      if (elapsed < 220 && Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        rotate();
      } else if (dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        if (elapsed < 260) hardDrop();
        else softDrop();
      }
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", function () { dragging = false; });
  }

  function bindKeyboard() {
    document.addEventListener("keydown", function (event) {
      if (event.code === "Escape" || event.code === "KeyP") {
        if (state.phase === "playing" || state.phase === "paused") {
          event.preventDefault();
          togglePause();
        }
        return;
      }
      if (state.phase !== "playing") {
        if (event.code === "Space" || event.code === "Enter") {
          if (!ui.modal.hidden) return;
          if (state.phase === "menu" || state.phase === "over") {
            event.preventDefault();
            startGame();
          }
        }
        return;
      }
      switch (event.code) {
        case "ArrowLeft":
          event.preventDefault();
          if (event.repeat) return;
          startRepeat(function () { move(-1); }, 160, 45);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.repeat) return;
          startRepeat(function () { move(1); }, 160, 45);
          break;
        case "ArrowDown":
          event.preventDefault();
          softDrop();
          break;
        case "ArrowUp":
        case "KeyZ":
        case "KeyX":
          event.preventDefault();
          rotate();
          break;
        case "Space":
          event.preventDefault();
          hardDrop();
          break;
      }
    });

    document.addEventListener("keyup", function (event) {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") stopRepeat();
    });
  }

  /* ---------- 主循环 ---------- */

  function loop(time) {
    var delta = state.lastTime ? Math.min(80, time - state.lastTime) : 16;
    state.lastTime = time;

    if (state.phase === "playing") {
      state.elapsed += delta;
      state.dropTimer += delta;
      if (state.dropTimer >= state.dropInterval) {
        state.dropTimer = 0;
        step();
      }
      draw();
    } else if (state.phase === "clearing") {
      state.clearTimer += delta;
      draw();
      if (state.clearTimer >= CLEAR_MS) finishClear();
    } else if (state.phase === "paused") {
      // 暂停时不做任何事，但窗口重新可见后不要补算时间。
      state.lastTime = time;
    }

    state.rafId = requestAnimationFrame(loop);
  }

  /* ---------- 初始化 ---------- */

  function init() {
    Arcade.initTheme();
    palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;
    updateHud();
    showOverlay("准备好了吗？", "开始游戏", "10 × 20 的棋盘 · 消一行得一行");
    fitCanvas();
    drawNext();
    lb.load();

    ui.overlayBtn.addEventListener("click", function () {
      if (state.phase === "paused") togglePause();
      else startGame();
    });
    ui.pause.addEventListener("click", togglePause);
    ui.restart.addEventListener("click", function () { startGame(); });
    ui.form.addEventListener("submit", submitScore);
    ui.again.addEventListener("click", function () { startGame(); });
    ui.closeModal.addEventListener("click", function () { closeModal(); });
    $("[data-refresh]").addEventListener("click", function () { lb.load(); });

    bindKeyboard();
    bindTouchKeys();
    bindCanvasGestures();

    if (window.ResizeObserver) {
      new ResizeObserver(function () { fitCanvas(); }).observe(canvas);
    } else {
      window.addEventListener("resize", fitCanvas);
    }
    window.addEventListener("resize", fitCanvas);

    document.addEventListener("arcade:theme", function () {
      palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;
      draw();
      drawNext();
    });

    // 切到后台自动暂停，回来不会突然掉一大截。
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && state.phase === "playing") togglePause();
    });
    window.addEventListener("blur", function () {
      if (state.phase === "playing") togglePause();
    });

    if (padVisible()) {
      setStatus("右边按键：↑ 旋转、⤓ 落底；也能直接在棋盘上拖动");
      $("[data-key-hint]").textContent = "屏幕按钮";
    }

    state.rafId = requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
