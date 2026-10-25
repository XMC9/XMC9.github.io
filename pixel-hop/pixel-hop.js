/* ============================================================
 * PIXEL HOP · 横版跳跃
 * 一路向右，踩小怪兽、敲门问块、把金币收走，到旗子就算通关。
 * 分数 = 金币 + 踩怪 + 问号块 + 通关时间奖励，结算后可传全服榜。
 * 画面全部用 canvas 画出来，配色跟着博客深浅色走。
 * ============================================================ */

(function () {
  "use strict";

  /* ---------- 常量 ---------- */

  var TILE = 32;
  var LEVEL_W = 200;
  var LEVEL_H = 15;
  var VIEW_H = 480;
  var GROUND_ROW = 13;
  var GOAL_TX = 194;

  var GRAVITY = 0.6;
  var JUMP_FORCE = -14;
  var MOVE_SPEED = 3.2;
  var RUN_SPEED = 5;
  var MAX_FALL = 15;

  var BEST_KEY = "pixel-hop-best";
  var START_TIME = 400;
  var SUBMIT_GAP = 60000;

  var $ = function (sel) { return document.querySelector(sel); };

  var canvas = $("[data-canvas]");
  var ctx = canvas.getContext("2d");

  var ui = {
    score: $("[data-score]"),
    coins: $("[data-coins]"),
    lives: $("[data-lives]"),
    time: $("[data-time]"),
    status: $("[data-status]"),
    cover: $("[data-cover]"),
    coverTitle: $("[data-cover-title]"),
    coverBtn: $("[data-cover-btn]"),
    coverNote: $("[data-cover-note]"),
    pause: $("[data-pause]"),
    restart: $("[data-restart]"),
    modal: $("[data-modal]"),
    modalEyebrow: $("[data-modal-eyebrow]"),
    modalTitle: $("[data-modal-title]"),
    finalScore: $("[data-final-score]"),
    modalBest: $("[data-modal-best]"),
    form: $("[data-submit-form]"),
    name: $("#ph-name"),
    formMsg: $("[data-form-msg]"),
    again: $("[data-again]"),
    closeModal: $("[data-close-modal]")
  };

  /* ---------- 配色 ---------- */

  var PALETTE = {
    light: {
      skyTop: "#EAF3FB", skyBottom: "#F8FCFF",
      hillFar: "#DCEAF7", hillNear: "#C6DDEF",
      cloud: "rgba(255, 255, 255, 0.95)",
      bush: "#9CC4A9", bushDark: "#7FAE90",
      ground: "#3A5674", groundTop: "#5F81A3", groundInk: "#2A435C",
      brick: "#C98A4B", brickEdge: "#A5673F", brickLight: "#DDA76C",
      stone: "#6E89A2", stoneTop: "#8EA6BC",
      question: "#E8B85C", questionEdge: "#B8862F", questionInk: "#FFF6E0",
      questionUsed: "#8798A9",
      player: "#2E75B6", playerDark: "#245D91", playerLight: "#BFDDF2",
      white: "#FFFFFF", eye: "#16304A",
      scarf: "#E8B85C", shoe: "#C98A4B",
      slime: "#6FAF8F", slimeDark: "#4F8A6C",
      beetle: "#C98A4B", beetleDark: "#8A5F3B", beetleRim: "#E8B85C",
      coin: "#E8B85C", coinDark: "#B8862F", coinLight: "#FFF0C6",
      crystal: "#5B9BD5", crystalLight: "#BFDDF2",
      flag: "#E8B85C", pole: "#33506B",
      shadow: "rgba(24, 62, 96, 0.16)"
    },
    dark: {
      skyTop: "#0A1422", skyBottom: "#12233A",
      hillFar: "#152A40", hillNear: "#1B3552",
      cloud: "rgba(140, 175, 210, 0.16)",
      bush: "#2C5A4B", bushDark: "#22483C",
      ground: "#1E3A58", groundTop: "#33597E", groundInk: "#132439",
      brick: "#B5814B", brickEdge: "#8A5F3B", brickLight: "#C99A67",
      stone: "#2C4A68", stoneTop: "#3E6284",
      question: "#F0C674", questionEdge: "#B8862F", questionInk: "#2B1D00",
      questionUsed: "#3B5673",
      player: "#5B9BD5", playerDark: "#2E75B6", playerLight: "#CFE4F7",
      white: "#EAF4FF", eye: "#0B1726",
      scarf: "#F0C674", shoe: "#B5814B",
      slime: "#4E8A6C", slimeDark: "#356B52",
      beetle: "#B5814B", beetleDark: "#7C5434", beetleRim: "#F0C674",
      coin: "#F0C674", coinDark: "#C9982F", coinLight: "#FFF6DC",
      crystal: "#7FB2E5", crystalLight: "#CFE4F7",
      flag: "#F0C674", pole: "#8BA5C0",
      shadow: "rgba(0, 0, 0, 0.42)"
    }
  };

  var palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;

  /* ---------- 画面尺寸 ---------- */

  var view = { w: 1024 };
  var camX = 0;
  var dpr = 1;

  function clampCam(value) {
    return Math.max(0, Math.min(value, LEVEL_W * TILE - view.w));
  }

  function fitView() {
    var next = window.innerWidth <= 760 ? 420 : 1024;
    var nextDpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (next === view.w && nextDpr === dpr && canvas.width) return;
    view.w = next;
    dpr = nextDpr;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(VIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    camX = clampCam(camX);
  }

  /* ---------- 关卡 ---------- */

  var PITS = [[26, 27], [58, 60], [96, 97], [136, 138], [170, 171]];

  var QUESTION_BLOCKS = [
    [16, 9, "coin"],
    [19, 10, "crystal"],
    [32, 10, "coin"],
    [43, 10, "coin"],
    [54, 10, "coin"],
    [70, 10, "crystal"],
    [81, 10, "coin"],
    [86, 6, "coin"],
    [87, 6, "coin"],
    [88, 6, "coin"],
    [103, 10, "coin"],
    [144, 9, "crystal"],
    [155, 10, "coin"]
  ];

  var COIN_SPOTS = [
    [10, 11], [11, 11], [12, 11],
    [20, 7],
    [31, 8],
    [38, 6],
    [45, 8],
    [49, 4],
    [52, 8],
    [58, 10], [59, 9], [60, 10],
    [63, 7], [64, 7],
    [75, 5],
    [82, 8],
    [87, 4], [88, 4],
    [93, 7],
    [101, 8], [104, 8], [105, 8],
    [118, 5], [119, 5],
    [131, 8],
    [137, 7],
    [145, 7], [146, 7],
    [156, 8],
    [161, 5], [162, 5],
    [166, 11], [168, 10],
    [186, 11], [188, 11], [192, 11]
  ];

  var SLIME_SPOTS = [
    [14, 13], [33, 13], [40, 13], [52, 13], [65, 13], [68, 13],
    [81, 10], [83, 13], [90, 13], [101, 13], [108, 13],
    [128, 13], [133, 13], [145, 13], [152, 13], [166, 13], [185, 13]
  ];

  var BEETLE_SPOTS = [
    [45, 13], [73, 9], [86, 13], [99, 13], [120, 7], [147, 13], [157, 13], [164, 13]
  ];

  var BUSH_SPOTS = [8, 37, 62, 95, 125, 149, 175, 191];

  var CHECKPOINTS = [2 * TILE, 100 * TILE, 152 * TILE];

  var grid = [];
  var entities = [];
  var bumping = [];

  function mkTile(type, item) {
    return { type: type, item: item || null, hit: false, bump: 0, anim: (Math.random() * 3) | 0 };
  }

  function inPit(x) {
    for (var i = 0; i < PITS.length; i++) {
      if (x >= PITS[i][0] && x <= PITS[i][1]) return true;
    }
    return false;
  }

  function setTile(tx, ty, type, item) {
    if (tx < 0 || tx >= LEVEL_W || ty < 0 || ty >= LEVEL_H) return;
    grid[ty][tx] = mkTile(type, item);
  }

  function platform(x0, x1, ty, type) {
    for (var x = x0; x <= x1; x++) setTile(x, ty, type);
  }

  function stairs(startX, baseRow, height) {
    for (var i = 0; i < height; i++) {
      for (var j = 0; j <= i; j++) setTile(startX + i, baseRow - j, "stone");
    }
  }

  function buildLevel() {
    grid = [];
    var y;
    var x;
    for (y = 0; y < LEVEL_H; y++) {
      grid.push(new Array(LEVEL_W).fill(null));
    }

    // 地面（坑的位置留空）
    for (x = 0; x < LEVEL_W; x++) {
      if (inPit(x)) continue;
      setTile(x, 13, "ground");
      setTile(x, 14, "ground");
    }

    // 平台
    platform(18, 21, 10, "brick");
    platform(23, 25, 9, "brick");
    platform(30, 34, 10, "brick");
    platform(37, 39, 8, "brick");
    platform(41, 44, 10, "brick");
    platform(46, 47, 9, "brick");
    platform(48, 50, 6, "brick");
    platform(53, 56, 10, "brick");
    platform(62, 66, 9, "brick");
    platform(69, 71, 10, "brick");
    platform(73, 73, 9, "brick");
    platform(74, 76, 7, "brick");
    platform(79, 84, 10, "brick");
    platform(86, 88, 6, "question");
    platform(92, 95, 9, "brick");
    platform(100, 106, 10, "brick");
    stairs(110, 12, 5);
    platform(116, 121, 7, "brick");
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j <= 3 - i; j++) setTile(123 + i, 12 - j, "stone");
    }
    platform(130, 133, 10, "brick");
    setTile(137, 9, "brick");
    platform(142, 148, 9, "brick");
    platform(152, 158, 10, "brick");
    platform(160, 163, 7, "brick");
    stairs(176, 12, 6);

    // 问号块（放在平台上面）
    QUESTION_BLOCKS.forEach(function (spot) {
      setTile(spot[0], spot[1], "question", spot[2]);
    });
  }

  function solidAt(tx, ty) {
    if (ty < 0 || ty >= LEVEL_H || tx < 0 || tx >= LEVEL_W) return false;
    var tile = grid[ty][tx];
    return !!tile && tile.type !== "destroyed";
  }

  /* ---------- 游戏状态 ---------- */

  var keys = { left: false, right: false, jump: false, run: false };

  var player = {
    x: 0, y: 0, w: 26, h: 32,
    vx: 0, vy: 0, dir: 1,
    grounded: false, powered: false,
    invincible: 0, coyote: 0, jumpBuf: 0, cut: false,
    anim: 0, animTimer: 0, step: 0
  };

  var state = {
    mode: "ready",
    score: 0,
    coins: 0,
    lives: 3,
    time: START_TIME,
    timeFrames: 0,
    best: Number(Arcade.read(BEST_KEY)) || 0,
    checkpoint: 0,
    submitted: false,
    isRecord: false,
    bonus: 0,
    ticks: 0,
    raf: 0,
    lastTime: 0,
    acc: 0
  };

  function makeEnemy(kind, tx, ty) {
    var w = kind === "beetle" ? 30 : 28;
    var h = kind === "beetle" ? 30 : 26;
    return {
      kind: kind,
      x: tx * TILE + (TILE - w) / 2,
      y: ty * TILE - h,
      w: w, h: h,
      dir: -1,
      vy: 0,
      grounded: false,
      state: "walk",
      rolling: false,
      timer: 0,
      anim: 0,
      animTimer: 0,
      active: true
    };
  }

  function spawnEntityList() {
    entities = [];
    COIN_SPOTS.forEach(function (spot) {
      entities.push({
        kind: "coin",
        x: spot[0] * TILE + 4,
        y: spot[1] * TILE + 4,
        w: 24, h: 24,
        phase: Math.random() * Math.PI * 2,
        active: true
      });
    });
    SLIME_SPOTS.forEach(function (spot) { entities.push(makeEnemy("slime", spot[0], spot[1])); });
    BEETLE_SPOTS.forEach(function (spot) { entities.push(makeEnemy("beetle", spot[0], spot[1])); });
  }

  function spawnCrystal(tx, ty) {
    entities.push({
      kind: "crystal",
      x: tx * TILE + 3,
      y: ty * TILE + 4,
      w: 26, h: 26,
      vx: 2,
      vy: 0,
      targetY: (ty - 1) * TILE + 4,
      spawning: true,
      active: true
    });
  }

  /* ---------- 碰撞 ---------- */

  function collideX(e) {
    var y0 = Math.floor(e.y / TILE);
    var y1 = Math.floor((e.y + e.h - 1) / TILE);
    var x0 = Math.floor(e.x / TILE);
    var x1 = Math.floor((e.x + e.w - 1) / TILE);
    if (e.vx === 0) return false;
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (!solidAt(tx, ty)) continue;
        if (e.vx > 0) e.x = tx * TILE - e.w;
        else e.x = (tx + 1) * TILE;
        e.vx = 0;
        return true;
      }
    }
    return false;
  }

  function collideY(e, headHit) {
    var x0 = Math.floor(e.x / TILE);
    var x1 = Math.floor((e.x + e.w - 1) / TILE);
    var y0 = Math.floor(e.y / TILE);
    var y1 = Math.floor((e.y + e.h - 1) / TILE);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (!solidAt(tx, ty)) continue;
        if (e.vy > 0) {
          e.y = ty * TILE - e.h;
          e.vy = 0;
          e.grounded = true;
        } else if (e.vy < 0) {
          e.y = (ty + 1) * TILE;
          e.vy = 0;
          if (headHit) headHit(tx, ty);
        }
        return true;
      }
    }
    return false;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ---------- 玩法 ---------- */

  function addScore(points) {
    state.score += points;
    updateHud();
  }

  function bumpBlock(tx, ty) {
    if (ty < 0 || ty >= LEVEL_H || tx < 0 || tx >= LEVEL_W) return;
    var tile = grid[ty][tx];
    if (!tile || tile.type === "destroyed") return;
    tile.bump = 9;
    bumping.push(tile);

    if (tile.type === "question" && !tile.hit) {
      tile.hit = true;
      addScore(50);
      if (tile.item === "crystal") {
        spawnCrystal(tx, ty);
      } else {
        state.coins++;
        addScore(200);
        if (state.coins >= 100) {
          state.coins = 0;
          state.lives++;
          setStatus("金币攒满一百枚，多一条命！");
        }
      }
      updateHud();
    } else if (tile.type === "brick" && player.powered) {
      grid[ty][tx] = null;
      addScore(50);
    }
  }

  function updatePlayer() {
    var speed = keys.run ? RUN_SPEED : MOVE_SPEED;
    if (keys.left) {
      player.vx = -speed;
      player.dir = -1;
    } else if (keys.right) {
      player.vx = speed;
      player.dir = 1;
    } else {
      player.vx *= 0.78;
      if (Math.abs(player.vx) < 0.12) player.vx = 0;
    }

    if (player.jumpBuf > 0) player.jumpBuf--;
    if (player.coyote > 0) player.coyote--;

    if (player.jumpBuf > 0 && (player.grounded || player.coyote > 0)) {
      player.vy = JUMP_FORCE;
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuf = 0;
      player.cut = false;
    }

    // 松开跳跃键就提前收力，短按是小跳
    if (!keys.jump && player.vy < -5 && !player.cut) {
      player.vy *= 0.52;
      player.cut = true;
    }
    if (player.vy >= 0) player.cut = false;

    player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);

    player.x += player.vx;
    collideX(player);

    player.grounded = false;
    player.y += player.vy;
    collideY(player, bumpBlock);
    if (player.grounded) player.coyote = 6;

    if (player.invincible > 0) player.invincible--;

    // 动画
    if (player.grounded && Math.abs(player.vx) > 0.4) {
      player.animTimer++;
      if (player.animTimer > 6) {
        player.anim = (player.anim + 1) % 4;
        player.animTimer = 0;
      }
    } else if (player.grounded) {
      player.anim = 0;
    }

    // 掉出画面
    if (player.y > VIEW_H + 120) {
      loseLife();
      return;
    }

    // 存档点
    for (var i = CHECKPOINTS.length - 1; i >= 0; i--) {
      if (player.x >= CHECKPOINTS[i]) {
        state.checkpoint = i;
        break;
      }
    }

    // 终点
    if (player.x + player.w >= GOAL_TX * TILE + 6) {
      finish("clear");
    }
  }

  function updateEnemy(enemy) {
    if (enemy.state === "crushed") {
      enemy.timer++;
      if (enemy.timer > 30) enemy.active = false;
      return;
    }

    var speed = enemy.state === "shell"
      ? (enemy.rolling ? enemy.dir * 7 : 0)
      : enemy.dir * 0.9;

    enemy.vy = Math.min(enemy.vy + GRAVITY, MAX_FALL);
    enemy.x += speed;
    enemy.vx = speed;
    if (collideX(enemy)) {
      enemy.dir = -enemy.dir;
      enemy.x += enemy.dir * 0.6;
    }

    enemy.grounded = false;
    enemy.y += enemy.vy;
    collideY(enemy, null);

    if (enemy.state === "walk" && enemy.grounded) {
      var probeX = enemy.dir > 0 ? enemy.x + enemy.w + 3 : enemy.x - 3;
      var belowX = Math.floor(probeX / TILE);
      var belowY = Math.floor((enemy.y + enemy.h + 4) / TILE);
      if (!solidAt(belowX, belowY)) enemy.dir = -enemy.dir;
    }

    if (enemy.y > VIEW_H + 240) enemy.active = false;

    enemy.animTimer++;
    if (enemy.animTimer > 14) {
      enemy.anim = (enemy.anim + 1) % 4;
      enemy.animTimer = 0;
    }
  }

  function updateCrystal(crystal) {
    if (crystal.spawning) {
      crystal.y -= 1.4;
      if (crystal.y <= crystal.targetY) {
        crystal.y = crystal.targetY;
        crystal.spawning = false;
      }
      return;
    }
    crystal.vy = Math.min(crystal.vy + GRAVITY, MAX_FALL);
    crystal.x += crystal.vx;
    var crystalDir = crystal.vx;
    if (collideX(crystal)) crystal.vx = -crystalDir;
    crystal.grounded = false;
    crystal.y += crystal.vy;
    collideY(crystal, null);
    if (crystal.y > VIEW_H + 200) crystal.active = false;
  }

  function collectCoin(entity) {
    entity.active = false;
    state.coins++;
    addScore(200);
    updateHud();
    if (state.coins >= 100) {
      state.coins = 0;
      state.lives++;
      updateHud();
      setStatus("金币攒满一百枚，多一条命！");
    }
  }

  function powerUp(entity) {
    entity.active = false;
    player.powered = true;
    player.h = 40;
    player.y -= 8;
    addScore(500);
    setStatus("能量晶石到手！现在能顶碎砖块了。");
  }

  function stomp(enemy) {
    if (enemy.kind === "slime") {
      enemy.state = "crushed";
      enemy.timer = 0;
      addScore(100);
    } else if (enemy.state === "shell") {
      enemy.rolling = !enemy.rolling;
      enemy.dir = player.x + player.w / 2 < enemy.x + enemy.w / 2 ? 1 : -1;
    } else {
      enemy.state = "shell";
      enemy.rolling = false;
      enemy.h = 24;
      enemy.y = enemy.y + 6;
      addScore(100);
    }
    player.vy = -9;
    player.y = enemy.y - player.h;
  }

  function damagePlayer() {
    if (player.invincible > 0 || state.mode !== "playing") return;
    if (player.powered) {
      player.powered = false;
      player.h = 32;
      player.y += 8;
      player.invincible = 120;
      setStatus("能量晶石碎掉了，再挨一下就危险了。");
    } else {
      loseLife();
    }
  }

  function loseLife() {
    if (state.mode !== "playing") return;
    state.lives--;
    updateHud();
    if (state.lives <= 0) {
      finish("over");
      return;
    }
    respawn();
  }

  function respawn() {
    player.x = CHECKPOINTS[state.checkpoint] + 8;
    player.y = 40;
    player.vx = 0;
    player.vy = 0;
    player.powered = false;
    player.h = 32;
    player.invincible = 110;
    player.grounded = false;
    camX = clampCam(player.x - view.w * 0.35);
    setStatus("还有 " + state.lives + " 条命，从这里继续。");
  }

  function checkInteractions() {
    var i;
    var enemy;
    var entity;

    // 滚动的甲壳撞到别的小怪兽
    for (i = 0; i < entities.length; i++) {
      enemy = entities[i];
      if (enemy.kind !== "beetle" || enemy.state !== "shell" || !enemy.rolling) continue;
      for (var j = 0; j < entities.length; j++) {
        var other = entities[j];
        if (other === enemy || other.kind === "coin" || other.kind === "crystal") continue;
        if (!other.active || other.state === "crushed") continue;
        if (overlaps(enemy, other)) {
          other.state = "crushed";
          other.timer = 0;
          addScore(200);
        }
      }
    }

    for (i = 0; i < entities.length; i++) {
      entity = entities[i];
      if (!entity.active) continue;
      if (!overlaps(player, entity)) continue;

      if (entity.kind === "coin") {
        collectCoin(entity);
      } else if (entity.kind === "crystal") {
        if (!entity.spawning) powerUp(entity);
      } else if (entity.state !== "crushed") {
        var fromAbove = player.vy > 0 && player.y + player.h - player.vy <= entity.y + 12;
        if (entity.kind === "beetle" && entity.state === "shell") {
          if (fromAbove) {
            stomp(entity);
          } else if (!entity.rolling) {
            entity.rolling = true;
            entity.dir = player.x + player.w / 2 < entity.x + entity.w / 2 ? 1 : -1;
            addScore(50);
          } else {
            damagePlayer();
          }
          continue;
        }
        if (fromAbove) stomp(entity);
        else damagePlayer();
      }
    }
  }

  function updateCamera() {
    var target = player.x - view.w * 0.35;
    if (target > camX) camX = target;
    camX = clampCam(camX);
  }

  function tick() {
    state.ticks++;

    for (var i = 0; i < bumping.length; i++) {
      var tile = bumping[i];
      if (tile.bump > 0) tile.bump = Math.max(0, tile.bump - 1.5);
    }
    if (state.ticks % 30 === 0) {
      bumping = bumping.filter(function (tile) { return tile.bump > 0; });
    }

    if (state.mode !== "playing") return;

    updatePlayer();
    if (state.mode !== "playing") return;

    for (var j = 0; j < entities.length; j++) {
      var entity = entities[j];
      if (!entity.active) continue;
      if (entity.kind === "coin") continue;
      if (entity.kind === "crystal") updateCrystal(entity);
      else updateEnemy(entity);
    }

    checkInteractions();
    updateCamera();

    state.timeFrames++;
    if (state.timeFrames >= 60) {
      state.timeFrames = 0;
      state.time--;
      updateHud();
      if (state.time <= 0) {
        state.time = START_TIME;
        loseLife();
      }
    }
  }

  /* ---------- 绘制 ---------- */

  function px(baseX, baseY, x, y, w, h, color, s) {
    ctx.fillStyle = color;
    ctx.fillRect(baseX + x * s, baseY + y * s, w * s, h * s);
  }

  function drawHills() {
    var p = palette;
    var baseY = GROUND_ROW * TILE + 10;
    var shift = (camX * 0.22) % 520;
    for (var i = -1; i < Math.ceil(view.w / 520) + 2; i++) {
      var x = i * 520 - shift;
      ctx.fillStyle = p.hillFar;
      ctx.beginPath();
      ctx.arc(x + 170, baseY, 200, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 430, baseY, 140, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = p.hillNear;
      ctx.beginPath();
      ctx.arc(x + 70, baseY, 120, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawCloud(x, y, scale) {
    var p = palette;
    ctx.fillStyle = p.cloud;
    ctx.beginPath();
    ctx.arc(x, y + 10 * scale, 18 * scale, 0, Math.PI * 2);
    ctx.arc(x + 24 * scale, y + 2 * scale, 24 * scale, 0, Math.PI * 2);
    ctx.arc(x + 52 * scale, y + 10 * scale, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds() {
    var span = 360;
    var shift = (camX * 0.45) % span;
    var count = Math.ceil(view.w / span) + 2;
    for (var i = -1; i < count; i++) {
      var x = i * span - shift;
      drawCloud(x + 60, 56 + ((i + 3) % 3) * 52, 1);
    }
  }

  function drawBushes() {
    var p = palette;
    BUSH_SPOTS.forEach(function (tx) {
      var x = tx * TILE - camX;
      if (x < -120 || x > view.w + 120) return;
      var baseY = GROUND_ROW * TILE;
      ctx.fillStyle = p.bushDark;
      ctx.beginPath();
      ctx.arc(x + 14, baseY - 2, 18, Math.PI, 0);
      ctx.arc(x + 38, baseY - 2, 24, Math.PI, 0);
      ctx.arc(x + 62, baseY - 2, 18, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = p.bush;
      ctx.beginPath();
      ctx.arc(x + 20, baseY - 6, 14, Math.PI, 0);
      ctx.arc(x + 40, baseY - 8, 18, Math.PI, 0);
      ctx.fill();
    });
  }

  function drawGround(tile, x, y, aboveSolid) {
    var p = palette;
    ctx.fillStyle = p.ground;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = p.groundInk;
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = p.ground;
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    if (!aboveSolid) {
      ctx.fillStyle = p.groundTop;
      ctx.fillRect(x, y, TILE, 6);
    }
    ctx.fillStyle = p.groundTop;
    var seed = (tile.x || 0) + y;
    ctx.fillRect(x + 8 + (seed % 3) * 4, y + 14 + (seed % 2) * 6, 5, 5);
    ctx.fillRect(x + 20, y + 22 - (seed % 3) * 3, 4, 4);
  }

  function drawBrick(tile, x, y) {
    var p = palette;
    ctx.fillStyle = p.brick;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = p.brickEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.beginPath();
    ctx.moveTo(x, y + TILE / 2);
    ctx.lineTo(x + TILE, y + TILE / 2);
    ctx.moveTo(x + TILE / 2, y);
    ctx.lineTo(x + TILE / 2, y + TILE / 2);
    ctx.moveTo(x + TILE / 4, y + TILE / 2);
    ctx.lineTo(x + TILE / 4, y + TILE);
    ctx.moveTo(x + (TILE * 3) / 4, y + TILE / 2);
    ctx.lineTo(x + (TILE * 3) / 4, y + TILE);
    ctx.stroke();
    ctx.fillStyle = p.brickLight;
    ctx.fillRect(x + 3, y + 3, TILE - 6, 3);
  }

  function drawStone(tile, x, y) {
    var p = palette;
    ctx.fillStyle = p.stone;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = p.stoneTop;
    ctx.fillRect(x, y, TILE, 5);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
  }

  function drawQuestion(tile, x, y) {
    var p = palette;
    if (tile.hit) {
      ctx.fillStyle = p.questionUsed;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(x + 5, y + 5, 4, 4);
      ctx.fillRect(x + TILE - 9, y + 5, 4, 4);
      ctx.fillRect(x + 5, y + TILE - 9, 4, 4);
      ctx.fillRect(x + TILE - 9, y + TILE - 9, 4, 4);
      return;
    }
    var pulse = 0.86 + Math.sin((state.ticks + tile.anim * 20) / 18) * 0.14;
    ctx.fillStyle = p.question;
    ctx.globalAlpha = pulse;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.questionEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);

    // 用方块拼一个问号，避免不同系统字体差异
    ctx.fillStyle = p.questionInk;
    var u = 4;
    ctx.fillRect(x + 10, y + 7, 12, u);
    ctx.fillRect(x + 18, y + 11, u, 6);
    ctx.fillRect(x + 14, y + 17, 6, u);
    ctx.fillRect(x + 14, y + 24, 5, 5);
  }

  function drawTile(tile, tx, ty) {
    var x = tx * TILE;
    var y = ty * TILE - tile.bump;
    tile.x = tx;
    if (tile.type === "ground") drawGround(tile, x, y, solidAt(tx, ty - 1));
    else if (tile.type === "brick") drawBrick(tile, x, y);
    else if (tile.type === "question") drawQuestion(tile, x, y);
    else if (tile.type === "stone") drawStone(tile, x, y);
  }

  function drawTiles() {
    var x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    var x1 = Math.min(LEVEL_W - 1, Math.ceil((camX + view.w) / TILE) + 1);
    for (var ty = 0; ty < LEVEL_H; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var tile = grid[ty][tx];
        if (tile) drawTile(tile, tx, ty);
      }
    }
  }

  function drawFlag() {
    var p = palette;
    var x = GOAL_TX * TILE + 14;
    var top = 8 * TILE;
    var bottom = 13 * TILE;
    ctx.fillStyle = p.pole;
    ctx.fillRect(x, top, 6, bottom - top);
    ctx.fillStyle = p.flag;
    ctx.beginPath();
    ctx.arc(x + 3, top - 4, 7, 0, Math.PI * 2);
    ctx.fill();
    var wave = Math.sin(state.ticks / 16) * 5;
    ctx.beginPath();
    ctx.moveTo(x + 6, top + 6);
    ctx.lineTo(x + 62, top + 22 + wave);
    ctx.lineTo(x + 6, top + 40);
    ctx.closePath();
    ctx.fill();
  }

  function drawCoin(entity) {
    var p = palette;
    var bob = Math.sin((state.ticks + entity.phase * 40) / 16) * 3;
    var cx = entity.x + entity.w / 2;
    var cy = entity.y + entity.h / 2 + bob;
    ctx.fillStyle = p.coin;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.coinDark;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = p.coinLight;
    ctx.fillRect(cx - 4, cy - 5, 3, 10);
  }

  function drawCrystal(entity) {
    var p = palette;
    var cx = entity.x + entity.w / 2;
    var cy = entity.y + entity.h / 2;
    var glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
    glow.addColorStop(0, p.crystalLight);
    glow.addColorStop(1, "rgba(191, 221, 242, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.crystal;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
    ctx.fillStyle = p.crystalLight;
    ctx.fillRect(cx - 6, cy - 6, 4, 4);
  }

  function drawSlime(enemy) {
    var p = palette;
    var s = 2;
    var bx = Math.round(enemy.x);
    var by = Math.round(enemy.y);
    if (enemy.state === "crushed") {
      px(bx, by, 1, 10, 12, 3, p.slimeDark, s);
      px(bx, by, 4, 9, 6, 1, p.slime, s);
      return;
    }
    var squash = Math.sin((state.ticks + enemy.anim * 10) / 14) * 0.5;
    var top = Math.round(2 + squash);
    px(bx, by, 3, top, 8, 1, p.slime, s);
    px(bx, by, 2, top + 1, 10, 7, p.slime, s);
    px(bx, by, 3, top + 8, 8, 1, p.slimeDark, s);
    // 眼睛
    px(bx, by, 4, top + 3, 2, 2, p.white, s);
    px(bx, by, 8, top + 3, 2, 2, p.white, s);
    px(bx, by, 5, top + 4, 1, 1, p.eye, s);
    px(bx, by, 9, top + 4, 1, 1, p.eye, s);
    // 脚
    var step = enemy.anim % 2;
    px(bx, by, 1 + step, 12, 4, 1, p.slimeDark, s);
    px(bx, by, 9, 12, 4, 1, p.slimeDark, s);
  }

  function drawBeetle(enemy) {
    var p = palette;
    var s = 2;
    var bx = Math.round(enemy.x);
    var by = Math.round(enemy.y);
    if (enemy.state === "shell") {
      var baseY = by + (enemy.h - 24);
      px(bx, baseY, 2, 0, 11, 1, p.beetleRim, s);
      px(bx, baseY, 1, 1, 13, 10, p.beetle, s);
      px(bx, baseY, 3, 3, 9, 6, p.beetleDark, s);
      px(bx, baseY, 5, 4, 2, 2, p.beetleRim, s);
      px(bx, baseY, 9, 7, 2, 2, p.beetleRim, s);
      px(bx, baseY, 2, 11, 4, 1, p.beetleDark, s);
      px(bx, baseY, 9, 11, 4, 1, p.beetleDark, s);
      return;
    }
    px(bx, by, 3, 0, 9, 1, p.beetleRim, s);
    px(bx, by, 2, 1, 11, 10, p.beetle, s);
    px(bx, by, 4, 3, 7, 6, p.beetleDark, s);
    px(bx, by, 5, 4, 2, 2, p.beetleRim, s);
    px(bx, by, 9, 7, 2, 2, p.beetleRim, s);
    // 头
    px(bx, by, 1, 9, 3, 3, p.beetle, s);
    px(bx, by, 1, 10, 1, 1, p.white, s);
    // 脚
    var step = enemy.anim % 2;
    px(bx, by, 1 + step, 14, 4, 1, p.beetleDark, s);
    px(bx, by, 10, 14, 4, 1, p.beetleDark, s);
  }

  function drawPlayer() {
    var p = palette;
    var s = 2;
    var bx = Math.round(player.x - 3);
    var by = Math.round(player.y - 2);
    if (player.powered) by -= 2;

    ctx.save();
    if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    // 影子
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(player.x + player.w / 2, player.y + player.h + 3, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    var scale = player.powered ? 1.14 : 1;
    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h);
    ctx.scale(player.dir * scale, scale);
    ctx.translate(-16, -34);

    // 头
    px(0, 0, 4, 0, 8, 1, p.playerDark, s);
    px(0, 0, 3, 1, 10, 5, p.player, s);
    px(0, 0, 4, 6, 8, 1, p.playerDark, s);
    // 眼睛
    px(0, 0, 5, 2, 2, 2, p.white, s);
    px(0, 0, 9, 2, 2, 2, p.white, s);
    px(0, 0, 6, 3, 1, 1, p.eye, s);
    px(0, 0, 10, 3, 1, 1, p.eye, s);
    // 笑
    px(0, 0, 6, 4, 1, 1, p.eye, s);
    px(0, 0, 7, 5, 2, 1, p.eye, s);
    px(0, 0, 9, 4, 1, 1, p.eye, s);
    // 围巾
    px(0, 0, 2, 6, 12, 2, p.scarf, s);
    px(0, 0, 1, 7, 2, 3, p.scarf, s);
    // 身体
    px(0, 0, 3, 8, 10, 4, p.player, s);
    px(0, 0, 5, 9, 6, 2, p.playerLight, s);
    px(0, 0, 1, 8, 2, 3, p.playerDark, s);
    px(0, 0, 13, 8, 2, 3, p.playerDark, s);
    // 腿
    var walk = player.grounded && Math.abs(player.vx) > 0.4 ? player.anim % 2 : 0;
    if (walk) {
      px(0, 0, 3, 12, 3, 3, p.playerDark, s);
      px(0, 0, 10, 12, 3, 3, p.playerDark, s);
    } else {
      px(0, 0, 4, 12, 3, 3, p.playerDark, s);
      px(0, 0, 9, 12, 3, 3, p.playerDark, s);
    }
    // 鞋
    px(0, 0, 3, 15, 4, 2, p.shoe, s);
    px(0, 0, 9, 15, 4, 2, p.shoe, s);

    ctx.restore();
    ctx.restore();
  }

  function render() {
    var p = palette;
    var sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, p.skyTop);
    sky.addColorStop(1, p.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, VIEW_H);

    drawHills();
    drawClouds();
    drawBushes();

    ctx.save();
    ctx.translate(-Math.round(camX), 0);
    drawTiles();
    drawFlag();

    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      if (!entity.active) continue;
      if (entity.x + entity.w < camX - 40 || entity.x > camX + view.w + 40) continue;
      if (entity.kind === "coin") drawCoin(entity);
      else if (entity.kind === "crystal") drawCrystal(entity);
      else if (entity.kind === "slime") drawSlime(entity);
      else if (entity.kind === "beetle") drawBeetle(entity);
    }

    drawPlayer();
    ctx.restore();
  }

  /* ---------- 界面 ---------- */

  function pad(value, length) {
    var text = String(Math.max(0, Math.round(value)));
    while (text.length < length) text = "0" + text;
    return text;
  }

  function updateHud() {
    ui.score.textContent = pad(state.score, 6);
    ui.coins.textContent = "×" + pad(state.coins, 2);
    ui.lives.textContent = "×" + Math.max(0, state.lives);
    ui.time.textContent = pad(state.time, 3);
  }

  function setStatus(text) {
    ui.status.textContent = text;
  }

  function showCover(title, button, note) {
    ui.cover.hidden = false;
    ui.coverTitle.textContent = title;
    ui.coverBtn.textContent = button;
    ui.coverNote.textContent = note;
  }

  function hideCover() {
    ui.cover.hidden = true;
  }

  function resetWorld() {
    buildLevel();
    spawnEntityList();
    bumping = [];
    player.h = 32;
    player.powered = false;
    player.x = CHECKPOINTS[0];
    player.y = GROUND_ROW * TILE - player.h;
    player.vx = 0;
    player.vy = 0;
    player.dir = 1;
    player.invincible = 0;
    player.grounded = true;
    player.anim = 0;
    camX = clampCam(player.x - view.w * 0.35);
    state.score = 0;
    state.coins = 0;
    state.lives = 3;
    state.time = START_TIME;
    state.timeFrames = 0;
    state.checkpoint = 0;
    state.submitted = false;
    state.isRecord = false;
    state.bonus = 0;
    updateHud();
  }

  function startGame() {
    resetWorld();
    state.mode = "playing";
    ui.pause.disabled = false;
    ui.pause.textContent = "暂停";
    hideCover();
    setStatus("走到最右边的旗子就通关");
    canvas.focus && canvas.focus();
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
      ui.pause.textContent = "继续";
      showCover("已暂停", "继续游戏", "按 Esc 或空格也可以继续");
    } else if (state.mode === "paused") {
      state.mode = "playing";
      ui.pause.textContent = "暂停";
      hideCover();
      state.lastTime = 0;
    }
  }

  function finish(kind) {
    if (state.mode !== "playing") return;
    state.mode = kind;
    keys.left = false;
    keys.right = false;
    keys.jump = false;
    keys.run = false;
    ui.pause.disabled = true;
    ui.pause.textContent = "暂停";

    if (kind === "clear") {
      state.bonus = Math.max(0, state.time) * 10 + 1000;
      state.score += state.bonus;
      updateHud();
    }
    state.isRecord = state.score > state.best;
    if (state.isRecord) {
      state.best = state.score;
      Arcade.write(BEST_KEY, String(state.best));
    }
    setStatus(kind === "clear"
      ? "通关！时间奖励 " + state.bonus + " 分"
      : "这一局结束了，拿了 " + state.score + " 分");
    setTimeout(function () {
      if (state.mode === kind) openModal(kind);
    }, 650);
  }

  /* ---------- 排行榜 ---------- */

  var lb = Arcade.createLeaderboard({
    meta: "ph-api",
    idPrefix: "ph",
    idKey: "pixel-hop-player-id",
    nameKey: "pixel-hop-player-name",
    path: "/pixel-hop",
    list: $("[data-leaderboard]"),
    refresh: $("[data-refresh]"),
    formatScore: function (value) { return String(value); }
  });

  function openModal(kind) {
    ui.modal.hidden = false;
    ui.finalScore.textContent = state.score;
    ui.modalEyebrow.textContent = kind === "clear" ? "LEVEL CLEAR" : "GAME OVER";
    ui.modalTitle.textContent = kind === "clear"
      ? (state.isRecord ? "通关，还破了纪录！" : "通关啦！")
      : (state.isRecord ? "新纪录！" : "这一局结束了");
    if (kind === "clear") {
      ui.modalBest.textContent = "时间奖励 +" + state.bonus + " · 个人最佳 " + state.best + " 分";
    } else {
      ui.modalBest.textContent = "个人最佳 " + state.best + " 分";
    }
    ui.formMsg.textContent = "";
    ui.formMsg.classList.remove("is-error");
    ui.name.value = lb.name || "";
    ui.form.hidden = state.score <= 0;
    var canSubmit = state.score > 0 && !state.submitted;
    ui.form.querySelector("button").disabled = !canSubmit;
    ui.name.disabled = !canSubmit;
  }

  function setFormMessage(text, isError) {
    ui.formMsg.textContent = text;
    ui.formMsg.classList.toggle("is-error", !!isError);
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

  /* ---------- 输入 ---------- */

  function jumpPressed() {
    player.jumpBuf = 8;
    keys.jump = true;
  }

  function jumpReleased() {
    keys.jump = false;
  }

  function bindKeyboard() {
    document.addEventListener("keydown", function (event) {
      var code = event.code;
      if (event.target && event.target.tagName && /input|textarea/i.test(event.target.tagName)) return;
      if (code === "Escape") {
        if (!ui.modal.hidden) { ui.modal.hidden = true; return; }
        togglePause();
        return;
      }
      if (code === "KeyP") { togglePause(); return; }
      if (code === "Enter" && state.mode !== "playing" && ui.modal.hidden) {
        startGame();
        return;
      }
      if (code === "ArrowLeft" || code === "KeyA") { keys.left = true; event.preventDefault(); }
      else if (code === "ArrowRight" || code === "KeyD") { keys.right = true; event.preventDefault(); }
      else if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
        event.preventDefault();
        if (state.mode === "ready") startGame();
        else if (state.mode === "paused") togglePause();
        else if (state.mode === "playing") jumpPressed();
      } else if (code === "ShiftLeft" || code === "ShiftRight") {
        keys.run = true;
      }
    });

    document.addEventListener("keyup", function (event) {
      var code = event.code;
      if (code === "ArrowLeft" || code === "KeyA") keys.left = false;
      else if (code === "ArrowRight" || code === "KeyD") keys.right = false;
      else if (code === "Space" || code === "ArrowUp" || code === "KeyW") jumpReleased();
      else if (code === "ShiftLeft" || code === "ShiftRight") keys.run = false;
    });
  }

  function bindTouch() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-key]"), function (button) {
      var key = button.dataset.key;
      var press = function (event) {
        event.preventDefault();
        button.classList.add("is-down");
        if (state.mode === "ready") startGame();
        if (key === "left") keys.left = true;
        else if (key === "right") keys.right = true;
        else jumpPressed();
      };
      var release = function (event) {
        if (event) event.preventDefault();
        button.classList.remove("is-down");
        if (key === "left") keys.left = false;
        else if (key === "right") keys.right = false;
        else jumpReleased();
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", function (event) {
        if (event.buttons) release(event);
      });
    });
  }

  function bindButtons() {
    ui.coverBtn.addEventListener("click", function () {
      if (state.mode === "paused") togglePause();
      else startGame();
    });

    ui.pause.addEventListener("click", togglePause);
    ui.restart.addEventListener("click", function () {
      ui.modal.hidden = true;
      startGame();
    });

    ui.form.addEventListener("submit", submitScore);

    ui.again.addEventListener("click", function () {
      ui.modal.hidden = true;
      startGame();
    });

    ui.closeModal.addEventListener("click", function () {
      ui.modal.hidden = true;
      showCover("休息一下？", "再来一局", "走到最右边的旗子就通关");
    });

    $("[data-refresh]").addEventListener("click", function () { lb.load(); });
  }

  /* ---------- 主循环 ---------- */

  function frame(now) {
    if (!state.lastTime) state.lastTime = now;
    var delta = Math.min(now - state.lastTime, 120);
    state.lastTime = now;
    state.acc += delta;
    var step = 1000 / 60;
    var guard = 0;
    while (state.acc >= step && guard < 3) {
      tick();
      state.acc -= step;
      guard++;
    }
    if (state.acc > step * 3) state.acc = 0;
    render();
    state.raf = requestAnimationFrame(frame);
  }

  function init() {
    Arcade.initTheme();
    palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;
    fitView();
    buildLevel();
    spawnEntityList();
    resetWorld();
    showCover("准备好了吗？", "开始游戏", window.innerWidth <= 760
      ? "手机：左下右下移动，中间「跳」"
      : "电脑：← → 移动，空格跳，Shift 加速");
    setStatus("踩怪兽 +100 · 金币 +200 · 到旗子结束");
    lb.load();

    bindKeyboard();
    bindTouch();
    bindButtons();

    document.addEventListener("arcade:theme", function () {
      palette = PALETTE[Arcade.currentTheme()] || PALETTE.light;
    });

    window.addEventListener("resize", function () {
      fitView();
      camX = clampCam(camX);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && state.mode === "playing") togglePause();
    });

    state.raf = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
