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

  function initRandomGenerator() {
    var sections = document.querySelectorAll('[data-random-section]');
    for (var i = 0; i < sections.length; i++) {
      (function (section) {
        var slots = section.querySelectorAll('[data-random-slots] .home-random-slot');
        var btn = section.querySelector('[data-random-btn]');
        if (!slots.length || !btn || btn.getAttribute('data-bound')) return;
        btn.setAttribute('data-bound', '1');

        var reduceMotion = window.matchMedia
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var randomDigit = function () { return String(Math.floor(Math.random() * 10)); };
        var paint = function (values) {
          for (var j = 0; j < slots.length; j++) slots[j].textContent = values[j];
        };

        // 进页面时先放一组随机数，别让三个 0 看起来像坏掉了。
        var initial = [];
        for (var k = 0; k < slots.length; k++) initial.push(randomDigit());
        paint(initial);

        btn.addEventListener('click', function () {
          var finals = [];
          for (var n = 0; n < slots.length; n++) finals.push(randomDigit());
          if (reduceMotion) {
            paint(finals);
            return;
          }

          // 数字滚动 420ms 再定格，摇一摇要有摇的过程。
          var started = Date.now();
          btn.disabled = true;
          for (var m = 0; m < slots.length; m++) slots[m].classList.add('is-rolling');
          var timer = setInterval(function () {
            for (var p = 0; p < slots.length; p++) slots[p].textContent = randomDigit();
            if (Date.now() - started >= 420) {
              clearInterval(timer);
              paint(finals);
              for (var q = 0; q < slots.length; q++) slots[q].classList.remove('is-rolling');
              btn.disabled = false;
            }
          }, 55);
        });
      })(sections[i]);
    }
  }

  function init() {
    updateCounters();
    initPhotoWall();
    initReveal();
    initRandomGenerator();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
