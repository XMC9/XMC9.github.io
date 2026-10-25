/* ============================================================
 * CRATES · 推箱子
 * 490 关（Atlas01 → Atlas02 → Atlas03 → Original → Atlas04）。
 * 箱子只能推不能拉，全部推到金色目标点即过关；
 * 分数 = 通关数，过关后自动同步到全服排行榜（/crates/score）。
 * ============================================================ */

(function () {
  "use strict";

  var LEVELS = window.CRATES_LEVELS || [];
  var CURRENT_KEY = "crates-level";
  var CLEARED_KEY = "crates-cleared";
  var BEST_KEY = "crates-best";
  var SUBMIT_GAP = 60000;

  var $ = function (sel) { return document.querySelector(sel); };

  var scrollEl = $("[data-scroll]");
  var canvas = $("[data-canvas]");
  var ctx = canvas.getContext("2d");

  var ui = {
    levelNo: $("[data-level-no]"),
    cleared: $("[data-cleared]"),
    moves: $("[data-moves]"),
    best: $("[data-best]"),
    status: $("[data-status]"),
    cover: $("[data-cover]"),
    coverTitle: $("[data-cover-title]"),
    coverSub: $("[data-cover-sub]"),
    nextLevel: $("[data-next-level]"),
    prev: $("[data-prev]"),
    next: $("[data-next]"),
    goto: $("[data-goto]"),
    undo: $("[data-undo]"),
    restart: $("[data-restart]"),
    name: $("#cr-name"),
    submit: $("[data-submit]"),
    selfMsg: $("[data-self-msg]"),
    gotoModal: $("[data-goto-modal]"),
    gotoForm: $("[data-goto-form]"),
    gotoClose: $("[data-goto-close]")
  };

  var PALETTE = {
    light: {
      wall: "#3A5674", wallLight: "#4C6C8C", wallEdge: "#294257",
      floor: "#F6FAFF", floorEdge: "#E4EFF8",
      goal: "#E8B85C", goalSoft: "rgba(232, 184, 92, 0.24)",
      box: "#C98A4B", boxLight: "#DDA76C", boxEdge: "#A5673F",
      boxOk: "#6FAF8F", boxOkLight: "#8CC5A8", boxOkEdge: "#4F8A6C",
      player: "#2E75B6", playerInk: "#FFFFFF",
      shadow: "rgba(24, 62, 96, 0.18)"
    },
    dark: {
      wall: "#1E3A58", wallLight: "#2A4B6E", wallEdge: "#14273D",
      floor: "#0F2439", floorEdge: "#17314B",
      goal: "#F0C674", goalSoft: "rgba(240, 198, 116, 0.18)",
      box: "#B5814B", boxLight: "#C99A67", boxEdge: "#8A5F3B",
      boxOk: "#4E8A6C", boxOkLight: "#63A382", boxOkEdge: "#3B6E55",
      player: "#5B9BD5", playerInk: "#0B1726",
      shadow: "rgba(0, 0, 0, 0.42)"
    }
  };

  var state = {
    index: Math.max(0, Number(Arcade.read(CURRENT_KEY)) || 0),
    cleared: readCleared(),
    best: Number(Arcade.read(BEST_KEY)) || 0,
    level: null,
    cells: [],
    boxes: [],
    player: { x: 0, y: 0, dir: "down" },
    history: [],
    moves: 0,
    solved: false,
    cell: 32,
    lastSubmit: 0,
    submitting: false
  };
  state.best = Math.max(state.best, state.cleared.length);

  var palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;

  /* ---------- 存档 ---------- */

  function readCleared() {
    try {
      var raw = JSON.parse(Arcade.read(CLEARED_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (n) { return Number.isInteger(n) && n >= 0 && n < LEVELS.length; });
    } catch (e) {
      return [];
    }
  }

  function saveCleared() {
    Arcade.write(CLEARED_KEY, JSON.stringify(state.cleared));
  }

  /* ---------- 关卡解析 ---------- */

  function parseLevel(raw) {
    var width = 0;
    raw.r.forEach(function (row) { width = Math.max(width, row.length); });
    var cells = [];
    var boxes = [];
    var player = null;

    for (var y = 0; y < raw.r.length; y++) {
      var line = raw.r[y];
      var row = [];
      for (var x = 0; x < width; x++) {
        var ch = line.charAt(x) || " ";
        var cell = { wall: false, goal: false, inside: false };
        if (ch === "#") {
          cell.wall = true;
        } else {
          if (ch === "." || ch === "*" || ch === "+") cell.goal = true;
          if (ch === "$" || ch === "*") boxes.push({ x: x, y: y });
          if (ch === "@" || ch === "+") player = { x: x, y: y, dir: "down" };
        }
        row.push(cell);
      }
      cells.push(row);
    }

    if (!player) player = { x: 0, y: 0, dir: "down" };

    // 从玩家出发把所有非墙格子标成「地板」，墙外的空格就不画了。
    var queue = [[player.x, player.y]];
    while (queue.length) {
      var point = queue.pop();
      var px = point[0];
      var py = point[1];
      if (py < 0 || py >= cells.length || px < 0 || px >= width) continue;
      var target = cells[py][px];
      if (target.wall || target.inside) continue;
      target.inside = true;
      queue.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }

    return {
      name: raw.n,
      collection: raw.c,
      cols: width,
      rows: cells.length,
      cells: cells,
      boxes: boxes,
      player: player
    };
  }

  /* ---------- 尺寸与绘制 ---------- */

  function roundRect(g, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + radius, y);
    g.arcTo(x + w, y, x + w, y + h, radius);
    g.arcTo(x + w, y + h, x, y + h, radius);
    g.arcTo(x, y + h, x, y, radius);
    g.arcTo(x, y, x + w, y, radius);
    g.closePath();
  }

  function layout() {
    var level = state.level;
    if (!level) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var padding = 20;
    var viewW = scrollEl.clientWidth - padding;
    var viewH = Math.min(window.innerHeight * 0.62, 620) - padding;
    var size = Math.floor(Math.min(viewW / level.cols, viewH / level.rows));
    size = Math.max(16, Math.min(46, size));
    state.cell = size;

    canvas.style.width = level.cols * size + "px";
    canvas.style.height = level.rows * size + "px";
    canvas.width = Math.round(level.cols * size * dpr);
    canvas.height = Math.round(level.rows * size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function boxAt(x, y) {
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].x === x && state.boxes[i].y === y) return state.boxes[i];
    }
    return null;
  }

  function drawWall(x, y, size, p) {
    var inset = Math.max(1, size * 0.06);
    roundRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.18);
    ctx.fillStyle = p.wall;
    ctx.fill();
    ctx.fillStyle = p.wallLight;
    roundRect(ctx, x + inset * 2, y + inset * 2, size - inset * 4, size * 0.22, size * 0.1);
    ctx.fill();
  }

  function drawFloor(x, y, size, p) {
    var inset = Math.max(0.5, size * 0.04);
    ctx.fillStyle = p.floor;
    ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
  }

  function drawGoal(x, y, size, p) {
    var cx = x + size / 2;
    var cy = y + size / 2;
    var r = size * 0.26;
    ctx.fillStyle = p.goalSoft;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.goal;
    ctx.lineWidth = Math.max(1.2, size * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBox(x, y, size, p, onGoal) {
    var inset = Math.max(1.5, size * 0.12);
    var w = size - inset * 2;
    roundRect(ctx, x + inset, y + inset, w, w, size * 0.18);
    ctx.fillStyle = onGoal ? p.boxOk : p.box;
    ctx.fill();
    ctx.strokeStyle = onGoal ? p.boxOkEdge : p.boxEdge;
    ctx.lineWidth = Math.max(1, size * 0.055);
    ctx.stroke();

    // 木箱的交叉板条
    ctx.strokeStyle = onGoal ? p.boxOkLight : p.boxLight;
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + inset + w * 0.22, y + inset + w * 0.22);
    ctx.lineTo(x + inset + w * 0.78, y + inset + w * 0.78);
    ctx.moveTo(x + inset + w * 0.78, y + inset + w * 0.22);
    ctx.lineTo(x + inset + w * 0.22, y + inset + w * 0.78);
    ctx.stroke();
  }

  function drawPlayer(x, y, size, p) {
    var cx = x + size / 2;
    var cy = y + size / 2;
    var r = size * 0.33;
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.05, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.player;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 方向小箭头，一眼看出朝哪边
    var angles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angles[state.player.dir] || 0);
    ctx.fillStyle = p.playerInk;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, 0);
    ctx.lineTo(-r * 0.26, r * 0.3);
    ctx.lineTo(-r * 0.26, -r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    var level = state.level;
    if (!level || !ctx) return;
    var size = state.cell;
    var p = palette;
    ctx.clearRect(0, 0, level.cols * size, level.rows * size);

    for (var y = 0; y < level.rows; y++) {
      for (var x = 0; x < level.cols; x++) {
        var cell = level.cells[y][x];
        if (cell.wall) {
          drawWall(x * size, y * size, size, p);
        } else if (cell.inside) {
          drawFloor(x * size, y * size, size, p);
          if (cell.goal) drawGoal(x * size, y * size, size, p);
        }
      }
    }

    state.boxes.forEach(function (box) {
      var cell = level.cells[box.y][box.x];
      drawBox(box.x * size, box.y * size, size, p, cell.goal);
    });

    drawPlayer(state.player.x * size, state.player.y * size, size, p);
  }

  /* ---------- 规则 ---------- */

  var DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  function walkable(x, y) {
    var level = state.level;
    if (y < 0 || y >= level.rows || x < 0 || x >= level.cols) return false;
    var cell = level.cells[y][x];
    return cell.inside && !cell.wall;
  }

  function isSolved() {
    return state.boxes.every(function (box) {
      return state.level.cells[box.y][box.x].goal;
    });
  }

  function move(direction) {
    if (state.solved) return;
    var delta = DIRECTIONS[direction];
    if (!delta) return;
    state.player.dir = direction;

    var nx = state.player.x + delta.x;
    var ny = state.player.y + delta.y;
    if (!walkable(nx, ny)) {
      draw();
      return;
    }

    var box = boxAt(nx, ny);
    if (box) {
      var bx = nx + delta.x;
      var by = ny + delta.y;
      if (!walkable(bx, by) || boxAt(bx, by)) {
        draw();
        return;
      }
      pushHistory();
      box.x = bx;
      box.y = by;
    } else {
      pushHistory();
    }

    state.player.x = nx;
    state.player.y = ny;
    state.moves++;
    updateHud();
    draw();
    keepPlayerVisible();

    if (isSolved()) onSolved();
  }

  function pushHistory() {
    state.history.push({
      boxes: state.boxes.map(function (box) { return { x: box.x, y: box.y }; }),
      player: { x: state.player.x, y: state.player.y, dir: state.player.dir },
      moves: state.moves
    });
    if (state.history.length > 800) state.history.shift();
  }

  function undo() {
    if (state.solved) return;
    var snapshot = state.history.pop();
    if (!snapshot) return;
    state.boxes = snapshot.boxes;
    state.player = snapshot.player;
    state.moves = snapshot.moves;
    updateHud();
    draw();
    keepPlayerVisible();
  }

  function restart() {
    if (!state.level) return;
    loadLevel(state.index, true);
  }

  function onSolved() {
    state.solved = true;
    var index = state.index;
    var isNewLevel = state.cleared.indexOf(index) === -1;
    if (isNewLevel) {
      state.cleared.push(index);
      saveCleared();
    }

    var best = Math.max(state.best, state.cleared.length);
    var isBest = best > state.best;
    state.best = best;
    Arcade.write(BEST_KEY, String(best));
    updateHud();

    var total = state.cleared.length;
    ui.coverTitle.textContent = index + 1 >= LEVELS.length ? "490 关全部通关！" : "第 " + (index + 1) + " 关完成";
    ui.coverSub.innerHTML = "用了 <strong>" + state.moves + "</strong> 步 · 已通关 <strong>" + total + "</strong> 关";
    ui.nextLevel.hidden = index + 1 >= LEVELS.length;
    ui.cover.hidden = false;

    if (isBest) autoSubmit();
  }

  function autoSubmit() {
    if (!lb.name) {
      setSelfMessage("过了新的一关：先在上面填个昵称，就能把成绩传上全服榜。", false);
      return;
    }
    if (state.submitting) return;
    if (Date.now() - state.lastSubmit < SUBMIT_GAP) {
      setSelfMessage("成绩已保存在本机，过一会儿会自动同步到全服榜。", false);
      return;
    }
    state.submitting = true;
    state.lastSubmit = Date.now();
    setSelfMessage("正在同步最好成绩…", false);
    lb.submit(lb.name, state.best)
      .then(function (data) {
        if (data.taken) {
          setSelfMessage("这个昵称已经被别人用了，换一个昵称再提交吧。", true);
          return;
        }
        setSelfMessage(typeof data.rank === "number" ? "已同步 · 全服第 " + data.rank + " 名" : "已同步到全服榜。", false);
      })
      .catch(function () {
        setSelfMessage("排行榜暂时连不上，成绩已经存在本机。", true);
      })
      .finally(function () {
        state.submitting = false;
      });
  }

  /* ---------- 界面 ---------- */

  function updateHud() {
    ui.levelNo.textContent = state.index + 1;
    ui.cleared.textContent = state.cleared.length;
    ui.moves.textContent = state.moves;
    ui.best.textContent = state.best;
  }

  function setSelfMessage(text, isError) {
    ui.selfMsg.textContent = text;
    ui.selfMsg.classList.toggle("is-error", !!isError);
  }

  function keepPlayerVisible() {
    var size = state.cell;
    var px = state.player.x * size;
    var py = state.player.y * size;
    var viewW = scrollEl.clientWidth;
    var viewH = scrollEl.clientHeight;
    var pad = size * 2;

    if (px < scrollEl.scrollLeft + pad) {
      scrollEl.scrollLeft = Math.max(0, px - viewW / 2);
    } else if (px + size > scrollEl.scrollLeft + viewW - pad) {
      scrollEl.scrollLeft = px - viewW / 2;
    }
    if (py < scrollEl.scrollTop + pad) {
      scrollEl.scrollTop = Math.max(0, py - viewH / 2);
    } else if (py + size > scrollEl.scrollTop + viewH - pad) {
      scrollEl.scrollTop = py - viewH / 2;
    }
  }

  function loadLevel(index, keepPosition) {
    if (!LEVELS.length) return;
    index = Math.max(0, Math.min(LEVELS.length - 1, index));
    state.index = index;
    Arcade.write(CURRENT_KEY, String(index));
    var level = parseLevel(LEVELS[index]);
    state.level = level;
    state.boxes = level.boxes;
    state.player = level.player;
    state.history = [];
    state.moves = 0;
    state.solved = false;
    ui.cover.hidden = true;
    ui.prev.disabled = index === 0;
    ui.next.disabled = index === LEVELS.length - 1;
    ui.status.textContent = "第 " + (index + 1) + " 关 · " + level.name;
    updateHud();
    layout();
    if (keepPosition) scrollEl.scrollLeft = 0, scrollEl.scrollTop = 0;
    keepPlayerVisible();
  }

  /* ---------- 排行榜 ---------- */

  var lb = Arcade.createLeaderboard({
    meta: "cr-api",
    idPrefix: "cr",
    idKey: "crates-player-id",
    nameKey: "crates-player-name",
    path: "/crates",
    list: $("[data-leaderboard]"),
    refresh: $("[data-refresh]"),
    emptyText: "还没有人上榜，等你来拿第一。",
    formatScore: function (value) { return value + " 关"; }
  });

  /* ---------- 输入 ---------- */

  function bindKeyboard() {
    document.addEventListener("keydown", function (event) {
      if (!ui.gotoModal.hidden && event.code === "Escape") {
        ui.gotoModal.hidden = true;
        return;
      }
      if (event.target && /input|textarea/i.test(event.target.tagName) && event.code !== "Escape") return;
      var handled = true;
      switch (event.code) {
        case "ArrowUp":
        case "KeyW":
          move("up");
          break;
        case "ArrowDown":
        case "KeyS":
          move("down");
          break;
        case "ArrowLeft":
        case "KeyA":
          move("left");
          break;
        case "ArrowRight":
        case "KeyD":
          move("right");
          break;
        case "KeyZ":
        case "KeyU":
        case "Backspace":
          undo();
          break;
        case "KeyR":
          restart();
          break;
        case "Enter":
          if (state.solved && state.index + 1 < LEVELS.length) loadLevel(state.index + 1);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    });
  }

  function bindPad() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-move]"), function (button) {
      button.addEventListener("click", function () { move(button.dataset.move); });
    });

    var swiping = false;
    var startX = 0;
    var startY = 0;
    canvas.addEventListener("pointerdown", function (event) {
      swiping = true;
      startX = event.clientX;
      startY = event.clientY;
    });
    canvas.addEventListener("pointerup", function (event) {
      if (!swiping) return;
      swiping = false;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    });
    canvas.addEventListener("pointercancel", function () { swiping = false; });
  }

  function bindButtons() {
    ui.undo.addEventListener("click", undo);
    ui.restart.addEventListener("click", restart);
    ui.prev.addEventListener("click", function () { loadLevel(state.index - 1); });
    ui.next.addEventListener("click", function () { loadLevel(state.index + 1); });
    ui.nextLevel.addEventListener("click", function () { loadLevel(state.index + 1); });

    ui.goto.addEventListener("click", function () {
      ui.gotoModal.hidden = false;
      var input = ui.gotoForm.querySelector("input");
      input.value = String(state.index + 1);
      input.focus();
      input.select();
    });
    ui.gotoClose.addEventListener("click", function () { ui.gotoModal.hidden = true; });
    ui.gotoForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = parseInt(ui.gotoForm.querySelector("input").value, 10);
      if (!value || value < 1 || value > LEVELS.length) return;
      ui.gotoModal.hidden = true;
      loadLevel(value - 1);
    });

    ui.submit.addEventListener("click", function () {
      var name = ui.name.value.trim().replace(/\s+/g, " ").slice(0, 12);
      if (!name) {
        setSelfMessage("先写个昵称吧。", true);
        return;
      }
      if (!state.best) {
        setSelfMessage("还没通关，先过一关再上榜。", true);
        return;
      }
      ui.submit.disabled = true;
      setSelfMessage("正在上传…", false);
      lb.submit(name, state.best)
        .then(function (data) {
          if (data.taken) {
            setSelfMessage("这个昵称已经有 " + data.personal_best + " 关了，换一个昵称吧。", true);
            return;
          }
          ui.name.value = name;
          state.lastSubmit = Date.now();
          setSelfMessage(typeof data.rank === "number" ? "已上榜 · 全服第 " + data.rank + " 名" : "已上榜。", false);
        })
        .catch(function () {
          setSelfMessage("提交失败，可能是网络或排行榜还没接通。", true);
        })
        .finally(function () {
          ui.submit.disabled = false;
        });
    });

    $("[data-refresh]").addEventListener("click", function () { lb.load(); });
  }

  /* ---------- 初始化 ---------- */

  function init() {
    Arcade.initTheme();
    palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;

    if (!LEVELS.length) {
      ui.status.textContent = "关卡数据没加载出来，刷新页面再试试。";
      return;
    }

    loadLevel(state.index);
    ui.name.value = lb.name || "";
    if (state.cleared.length) {
      setSelfMessage("本机已通关 " + state.cleared.length + " 关，过了新的一关会自动同步。", false);
    }
    lb.load();

    bindKeyboard();
    bindPad();
    bindButtons();

    document.addEventListener("arcade:theme", function () {
      palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;
      draw();
    });

    window.addEventListener("resize", layout);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
