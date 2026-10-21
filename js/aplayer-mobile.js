(function () {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const IDLE_DELAY = 12000;
  let player = null;
  let idleTimer = null;

  function clearIdle() {
    if (player) player.classList.remove('is-idle');
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (!player || !mobileQuery.matches || player.classList.contains('hide')) return;

    idleTimer = setTimeout(function () {
      if (player && mobileQuery.matches && !player.classList.contains('hide')) {
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
    if (!element || element.dataset.mobileIdleReady === '1') return;

    player = element;
    player.dataset.mobileIdleReady = '1';

    ['pointerdown', 'pointermove', 'touchstart', 'click', 'focusin'].forEach(function (eventName) {
      player.addEventListener(eventName, wakePlayer, { passive: true });
    });

    window.addEventListener('scroll', wakePlayer, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) wakePlayer();
    });

    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', wakePlayer);
    } else if (mobileQuery.addListener) {
      mobileQuery.addListener(wakePlayer);
    }

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
