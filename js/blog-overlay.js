/* 站内小游戏浮层
 * ------------------------------------------------------------------
 * 游戏页是 skip_render 的独立文档，直接点进去整页会重载，背景音乐
 * 一定会断。这里把所有通往 PLAY NOOK / 六个游戏的链接改成浮层里的
 * iframe：父页面一直活着，APlayer 的那首 audio 就不会被销毁。
 *
 * 浮层自己带一条窄窄的深蓝顶栏（返回博客 / 游戏名 / 音乐状态），
 * 游戏页里的「← 秘密基地」由 source/js/game-embed.js 转成关闭浮层。
 */
(function () {
  'use strict';

  if (window.__xmGameOverlayReady) return;
  window.__xmGameOverlayReady = true;

  var GAME_PATH = /^\/(?:play|count-to-10|hextris|2048|blockfall|crates|pixel-hop)(?:\/index\.html)?\/?$/;
  var overlay = null;
  var frame = null;
  var titleEl = null;
  var musicEl = null;
  var isOpen = false;
  var pushed = false;

  function resolveGameUrl(href) {
    try {
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (!GAME_PATH.test(url.pathname)) return null;
      return url.pathname + url.search + url.hash;
    } catch (e) {
      return null;
    }
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'xm-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '小游戏');
    overlay.innerHTML = [
      '<div class="xm-overlay-bar">',
      '  <button type="button" class="xm-overlay-close"><span aria-hidden="true">←</span>返回秘密基地</button>',
      '  <span class="xm-overlay-title">PLAY NOOK</span>',
      '  <span class="xm-overlay-music" aria-hidden="true"></span>',
      '</div>',
      '<div class="xm-overlay-stage">',
      '  <iframe class="xm-overlay-frame" title="秘密基地小游戏" allow="autoplay; fullscreen; gamepad"></iframe>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    frame = overlay.querySelector('.xm-overlay-frame');
    titleEl = overlay.querySelector('.xm-overlay-title');
    musicEl = overlay.querySelector('.xm-overlay-music');

    overlay.querySelector('.xm-overlay-close').addEventListener('click', function () {
      close(false);
    });

    frame.addEventListener('load', function () {
      if (!isOpen) return;
      var nextTitle = '';
      try {
        nextTitle = frame.contentDocument && frame.contentDocument.title;
      } catch (e) { /* 理论上同源，兜底而已 */ }
      if (nextTitle) {
        titleEl.textContent = nextTitle.split('·')[0].trim() || 'PLAY NOOK';
      }
      updateMusic();
      try {
        frame.contentWindow.focus();
      } catch (e) { /* ignore */ }
    });
  }

  function updateMusic() {
    if (!musicEl) return;
    // APlayer 播放中时按钮带 aplayer-pause；暂停时是 aplayer-play。
    var playing = !!document.querySelector('#aplayer .aplayer-pause');
    musicEl.textContent = playing ? '♪ 音乐继续' : '';
  }

  // 用 location.replace 打开 iframe 的第一个地址：
  // 这样 iframe 不会在「联合会话历史」里多插一条，浏览器返回键
  // 才能退到父页面自己 push 的那条状态上，而不是先在游戏历史里转圈。
  function setFrameUrl(url) {
    try {
      frame.contentWindow.location.replace(url);
    } catch (e) {
      frame.src = url;
    }
  }

  function open(url) {
    if (!overlay) build();
    if (isOpen) {
      setFrameUrl(url);
      titleEl.textContent = 'PLAY NOOK';
      updateMusic();
      return;
    }

    isOpen = true;
    overlay.hidden = false;
    void overlay.offsetWidth; // 先让它出现在页面上，透明度过渡才会生效
    overlay.classList.add('is-open');
    document.documentElement.classList.add('xm-overlay-open');
    titleEl.textContent = 'PLAY NOOK';
    updateMusic();
    setFrameUrl(url);

    if (!pushed) {
      try {
        window.history.pushState({ xmOverlay: true }, '');
        pushed = true;
      } catch (e) { /* 无 history 的环境就不管返回键 */ }
    }

    // APlayer 的播放状态偶尔比浮层晚一拍，再补一次。
    window.setTimeout(updateMusic, 400);
  }

  function close(viaPop) {
    if (!isOpen || !overlay) return;
    isOpen = false;
    overlay.classList.remove('is-open');
    document.documentElement.classList.remove('xm-overlay-open');

    var leavingFrame = frame;
    window.setTimeout(function () {
      if (isOpen) return;
      overlay.hidden = true;
      try {
        leavingFrame.src = 'about:blank';
      } catch (e) { /* ignore */ }
    }, 240);

    if (viaPop) {
      pushed = false;
    } else if (pushed) {
      pushed = false;
      window.history.back();
    }
  }

  // 拦截通往游戏页的普通左键点击，交给浮层处理。
  // 新标签 / 新窗口 / 下载 / 带修饰键的点击保持原样。
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;

    var target = link.getAttribute('target');
    if (target && target !== '_self') return;
    if (link.hasAttribute('download')) return;

    var url = resolveGameUrl(link.getAttribute('href'));
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();
    open(url);
  }, true);

  window.addEventListener('popstate', function () {
    if (pushed) {
      pushed = false;
      close(true);
    }
  });

  window.addEventListener('message', function (event) {
    if (!isOpen || !frame) return;
    if (event.origin !== window.location.origin) return;
    if (event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === 'xm9-overlay-close') {
      close(false);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (!isOpen) return;
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      close(false);
    }
  });

  // 桌面上音乐盒浮在游戏上方，点了播放/暂停就同步一下顶栏的小字。
  document.addEventListener('click', function (event) {
    if (!isOpen) return;
    var target = event.target;
    if (target && target.closest && target.closest('#aplayer')) {
      window.setTimeout(updateMusic, 350);
    }
  });
})();
