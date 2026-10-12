/* ============================================================
 * 生日彩蛋 · 主页飞来飞去的小狗（生日过后长期留在博客当小宠物）
 * 北京 2026-10-14 18:00 起自动出现在首页，点击 → 生日页
 * 时间用绝对时刻（Date.UTC），和访客设备时区无关
 * 测试参数（本地 localhost 或线上都行）：
 *   ?pup=1                          立刻显示
 *   ?pup=0                          强制隐藏
 *   ?pupin=5                        打开 5 秒后显示（验证"到点自动出现"用）
 *   ?at=2026-10-11T12:40:00+08:00   把这个"到点"改到指定时刻（带时区，测时间锁用）
 * ============================================================ */
(function () {
  'use strict';
  if (window.__hbPupLoaded) return;
  window.__hbPupLoaded = true;

  var SHOW_AT = Date.UTC(2026, 9, 14, 10, 0, 0);        /* 北京 2026-10-14 18:00 */
  var LINK = '/' + atob('bW9jaGktMzI=') + '/';          /* 点击后去的地方（藏一下） */
  var IMG = '/image/2026Birthday/flying.gif';           /* 想换别的 GIF：改这一行即可 */
  var HOME_RE = /^\/(index\.html)?$/;

  function qs(name) {
    var m = window.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? m[1] : null;
  }
  var force = qs('pup');   /* 1 | 0 */
  var inSec = qs('pupin'); /* 秒 */
  var atRaw = qs('at');    /* 指定"到点"时刻 */
  var demo = false;        /* ?pupin= 触发后保持显示 */

  var TARGET = SHOW_AT;
  if (atRaw !== null) {
    /* 例：?at=2026-10-11T12:40:00+08:00（或写成 04:40:00Z，同一时刻都行） */
    var msAt = Date.parse(decodeURIComponent(atRaw).replace(/ /g, '+'));
    if (!isNaN(msAt)) TARGET = msAt;
  }

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }

  /* 测试小助手：?theme=light / ?theme=dark 强制预览这一页的深浅色（任何页面都能用） */
  var tm = window.location.search.match(/[?&]theme=(light|dark)/);
  if (tm) {
    var wantDark = tm[1] === 'dark';
    var pinTheme = function () {
      document.documentElement.classList.toggle('dark', wantDark);
      if (document.body) document.body.classList.toggle('dark-mode', wantDark);
    };
    pinTheme();
    document.addEventListener('DOMContentLoaded', pinTheme);
    setTimeout(pinTheme, 800);
  }

  /* 点击小音效（简单两个音，不引外部文件） */
  var actx = null;
  function tick(freqs) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === 'suspended') actx.resume();
      var t0 = actx.currentTime;
      for (var i = 0; i < freqs.length; i++) {
        var st = t0 + i * 0.06;
        var o = actx.createOscillator();
        var g = actx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freqs[i], st);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(i ? 0.045 : 0.06, st + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.14);
        o.connect(g);
        g.connect(actx.destination);
        o.start(st);
        o.stop(st + 0.16);
      }
    } catch (err) {}
  }

  var el = null;
  var moveTimer = null;

  function isHome() { return HOME_RE.test(window.location.pathname); }
  function arrived() {
    if (force === '1' || demo) return true;
    if (force === '0') return false;
    return Date.now() >= TARGET;
  }
  function size() { return window.innerWidth < 481 ? 92 : 118; }

  function addStyle() {
    if (document.getElementById('hbPupStyle')) return;
    var s = document.createElement('style');
    s.id = 'hbPupStyle';
    s.textContent =
      '.hb-pupf{position:fixed;left:0;top:0;z-index:56;width:118px;height:118px;padding:0;border:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;}' +
      '.hb-pupf img{display:block;width:100%;height:100%;filter:drop-shadow(0 12px 18px rgba(74,144,217,.35));animation:hbPupBob 1.7s ease-in-out infinite;}' +
      '@keyframes hbPupBob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-7px) rotate(5deg)}}' +
      '.hb-pupf-in{animation:hbPupIn .8s cubic-bezier(.2,.8,.3,1) both}' +
      '@keyframes hbPupIn{0%{transform:scale(0);opacity:0}62%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}' +
      '.hb-pupf:focus{outline:none}' +
      '.hb-pupf:focus-visible{outline:3px dashed #7FB2E5;outline-offset:6px;border-radius:26px}' +
      '@media(max-width:480px){.hb-pupf{width:92px;height:92px}}' +
      '@media(prefers-reduced-motion:reduce){.hb-pupf img{animation:none}.hb-pupf-in{animation-duration:.01ms}}';
    document.head.appendChild(s);
  }

  function pos() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var s = size();
    var x = 10 + Math.random() * Math.max(20, w - s - 20);
    var y = 76 + Math.random() * Math.max(20, h - s - 170);
    return [Math.round(x) + 'px', Math.round(y) + 'px'];
  }

  function hop() {
    if (!el) return;
    var p = pos();
    var d = (1.05 + Math.random() * 0.85).toFixed(2);   /* 每一跳飞多久：想更快就再调小 */
    el.style.transition = 'left ' + d + 's cubic-bezier(.4,.05,.5,.95), top ' + d + 's cubic-bezier(.4,.05,.5,.95)';
    el.style.left = p[0];
    el.style.top = p[1];
  }

  function schedule() {
    /* 两跳之间几乎不停，飞得又快又欢脱 */
    moveTimer = setTimeout(function () { hop(); schedule(); }, 700 + Math.random() * 700);
  }

  function show() {
    if (el) return;
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'hb-pupf hb-pupf-in';
    el.setAttribute('aria-label', '一只小狗');
    el.title = '汪？';
    var img = document.createElement('img');
    img.src = IMG;
    img.alt = '';
    img.draggable = false;
    el.appendChild(img);
    el.addEventListener('click', function () {
      tick([784, 1175]);
      setTimeout(function () { window.location.href = LINK; }, 190);
    });
    document.body.appendChild(el);
    var p = pos();
    el.style.left = p[0];
    el.style.top = p[1];
    if (!reduce) schedule();
  }

  function hide() {
    if (moveTimer) { clearTimeout(moveTimer); moveTimer = null; }
    if (el) { el.remove(); el = null; }
  }

  function sync() {
    if (el && !document.body.contains(el)) { el = null; if (moveTimer) { clearTimeout(moveTimer); moveTimer = null; } }
    if (isHome() && arrived()) show();
    else hide();
  }

  window.addEventListener('resize', function () {
    if (!el) return;
    var p = pos();
    el.style.transition = 'none';
    el.style.left = p[0];
    el.style.top = p[1];
  });

  addStyle();
  if (inSec !== null) {
    var n = Math.min(parseInt(inSec, 10) || 0, 7200);
    setTimeout(function () { demo = true; if (isHome()) show(); }, n * 1000);
  }
  sync();
  setInterval(sync, 3000);
})();
