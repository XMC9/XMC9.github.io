/* 背景音乐盒的「发呆隐身」：
 * 桌面和手机都一样，20 秒没碰音乐盒就加 .is-idle 淡下去；
 * 鼠标移回来、滚动、切回标签页都会立刻恢复。
 * 具体透明度和动画在 source/css/custom-theme.css 里。
 */
(function () {
  'use strict';

  const IDLE_DELAY = 20000;
  let player = null;
  let idleTimer = null;

  function clearIdle() {
    if (player) player.classList.remove('is-idle');
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (!player || player.classList.contains('hide')) return;

    idleTimer = setTimeout(function () {
      if (player && !player.classList.contains('hide')) {
        player.classList.add('is-idle');
      }
    }, IDLE_DELAY);
  }

  function wakePlayer() {
    clearIdle();
    scheduleIdle();
  }

  function initPlayer() {
    const element = document.getElementById('aplayer');
    if (!element || element.dataset.idleReady === '1') return;

    player = element;
    player.dataset.idleReady = '1';

    ['pointerdown', 'pointermove', 'touchstart', 'click', 'focusin'].forEach(function (eventName) {
      player.addEventListener(eventName, wakePlayer, { passive: true });
    });

    window.addEventListener('scroll', wakePlayer, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) wakePlayer();
    });

    wakePlayer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayer, { once: true });
  } else {
    initPlayer();
  }

  // APlayer 在部分页面会晚于 DOMContentLoaded 初始化，补两次兜底。
  window.addEventListener('load', initPlayer);
  setTimeout(initPlayer, 800);
  setTimeout(initPlayer, 2000);
})();
