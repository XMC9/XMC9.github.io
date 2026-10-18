/* 首页小交互：在一起天数、记忆相册横向滑动、入场动画
 * 只作用于自定义首页；Swup 切换页面后会重新执行。
 */
(function () {
  'use strict';

  function updateCounters() {
    var nodes = document.querySelectorAll('[data-home-counter]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var startRaw = el.getAttribute('data-start') || '2024-12-25T00:00:00+08:00';
      var start = new Date(startRaw);
      if (isNaN(start.getTime())) continue;
      var days = Math.floor((Date.now() - start.getTime()) / 86400000);
      if (days < 0) days = 0;
      var target = el.querySelector('[data-counter-days]');
      if (target) target.textContent = String(days);
    }
  }

  function initPhotoWall() {
    var walls = document.querySelectorAll('.home-photo-section');
    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i];
      var track = wall.querySelector('[data-photo-track]');
      if (!track) continue;

      var prev = wall.querySelector('[data-photo-prev]');
      var next = wall.querySelector('[data-photo-next]');
      if (!prev || !next) continue;

      var step = function () {
        var card = track.querySelector('.home-photo-card');
        var width = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.7;
        return Math.max(220, width * 2);
      };

      if (!prev.getAttribute('data-bound')) {
        prev.setAttribute('data-bound', '1');
        prev.addEventListener('click', function () {
          track.scrollBy({ left: -step(), behavior: 'smooth' });
        });
      }
      if (!next.getAttribute('data-bound')) {
        next.setAttribute('data-bound', '1');
        next.addEventListener('click', function () {
          track.scrollBy({ left: step(), behavior: 'smooth' });
        });
      }

      if (!track.getAttribute('data-key-bound')) {
        track.setAttribute('data-key-bound', '1');
        track.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            track.scrollBy({ left: -step(), behavior: 'smooth' });
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            track.scrollBy({ left: step(), behavior: 'smooth' });
          }
        });
      }
    }
  }

  function initReveal() {
    var items = document.querySelectorAll('.home-reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    for (var j = 0; j < items.length; j++) {
      if (!items[j].classList.contains('is-visible')) observer.observe(items[j]);
    }
  }

  function init() {
    updateCounters();
    initPhotoWall();
    initReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
