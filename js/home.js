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
        var slotsWrap = section.querySelector('[data-random-slots]');
        var btn = section.querySelector('[data-random-btn]');
        var label = section.querySelector('[data-random-label]');
        var countInput = section.querySelector('[data-random-count]');
        var minInput = section.querySelector('[data-random-min]');
        var maxInput = section.querySelector('[data-random-max]');
        var uniqueInput = section.querySelector('[data-random-unique]');
        var hint = section.querySelector('[data-random-hint]');
        if (!slotsWrap || !btn || !label || !countInput || !minInput || !maxInput
          || !uniqueInput || !hint || btn.getAttribute('data-bound')) return;
        btn.setAttribute('data-bound', '1');

        var reduceMotion = window.matchMedia
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var rolling = false;
        var inputs = [countInput, minInput, maxInput, uniqueInput];

        var readInt = function (input, fallback) {
          var value = parseInt(input.value, 10);
          return Number.isFinite(value) ? value : fallback;
        };

        // 输入值统一收进合法区间；最小值比最大值大时自动对调，少一步报错。
        var readSettings = function () {
          var count = Math.min(8, Math.max(1, readInt(countInput, 3)));
          var min = Math.min(999, Math.max(0, readInt(minInput, 0)));
          var max = Math.min(999, Math.max(0, readInt(maxInput, 9)));
          if (min > max) {
            var swap = min;
            min = max;
            max = swap;
          }
          countInput.value = count;
          minInput.value = min;
          maxInput.value = max;
          return { count: count, min: min, max: max, unique: uniqueInput.checked };
        };

        var rangeError = function (cfg) {
          if (cfg.unique && cfg.max - cfg.min + 1 < cfg.count) {
            return '范围里只有 ' + (cfg.max - cfg.min + 1) + ' 个数字，放不下 '
              + cfg.count + ' 个不重复的数。';
          }
          return '';
        };

        var showHint = function (text) {
          hint.textContent = text || '';
          hint.hidden = !text;
        };

        var draw = function (cfg) {
          var values = [];
          var span = cfg.max - cfg.min + 1;
          if (cfg.unique) {
            var pool = [];
            for (var v = cfg.min; v <= cfg.max; v++) pool.push(v);
            for (var u = 0; u < cfg.count; u++) {
              values.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
          } else {
            for (var w = 0; w < cfg.count; w++) {
              values.push(cfg.min + Math.floor(Math.random() * span));
            }
          }
          return values;
        };

        var buildSlots = function (count) {
          while (slotsWrap.children.length > count) {
            slotsWrap.removeChild(slotsWrap.lastElementChild);
          }
          while (slotsWrap.children.length < count) {
            var slot = document.createElement('span');
            slot.className = 'home-random-slot';
            slot.textContent = '0';
            slotsWrap.appendChild(slot);
          }
          return slotsWrap.querySelectorAll('.home-random-slot');
        };

        var paint = function (slots, values) {
          for (var j = 0; j < slots.length; j++) {
            var text = String(values[j]);
            slots[j].textContent = text;
            if (text.length >= 3) {
              slots[j].classList.add('is-wide');
            } else {
              slots[j].classList.remove('is-wide');
            }
          }
        };

        // 改设置时立即按新规则预摇一组，不用等按按钮。
        var syncPreview = function () {
          if (rolling) return;
          var cfg = readSettings();
          var error = rangeError(cfg);
          var slots = buildSlots(cfg.count);
          showHint(error);
          btn.disabled = !!error;
          if (error) {
            // 规则不成立时别留一串旧数字，直接摆一排占位符。
            for (var k = 0; k < slots.length; k++) {
              slots[k].textContent = '–';
              slots[k].classList.remove('is-wide');
            }
          } else {
            paint(slots, draw(cfg));
          }
        };

        // 进页面先按默认值放一组，别让三个 0 看起来像坏掉了。
        var initial = readSettings();
        paint(buildSlots(initial.count), draw(initial));

        countInput.addEventListener('change', syncPreview);
        minInput.addEventListener('change', syncPreview);
        maxInput.addEventListener('change', syncPreview);
        uniqueInput.addEventListener('change', syncPreview);

        btn.addEventListener('click', function () {
          if (rolling) return;
          var cfg = readSettings();
          var error = rangeError(cfg);
          if (error) {
            showHint(error);
            btn.disabled = true;
            return;
          }

          var slots = buildSlots(cfg.count);
          var finals = draw(cfg);
          showHint('');
          if (reduceMotion) {
            paint(slots, finals);
            return;
          }

          // 摇一摇要有摇的过程：数字滚动 420ms 再定格。
          rolling = true;
          btn.disabled = true;
          label.textContent = '小狗正在摇…';
          slotsWrap.setAttribute('aria-live', 'off');
          for (var a = 0; a < inputs.length; a++) inputs[a].disabled = true;
          for (var b = 0; b < slots.length; b++) slots[b].classList.add('is-rolling');

          var span = cfg.max - cfg.min + 1;
          var started = Date.now();
          var timer = setInterval(function () {
            for (var p = 0; p < slots.length; p++) {
              var text = String(cfg.min + Math.floor(Math.random() * span));
              slots[p].textContent = text;
              slots[p].classList.toggle('is-wide', text.length >= 3);
            }
            if (Date.now() - started >= 420) {
              clearInterval(timer);
              paint(slots, finals);
              for (var q = 0; q < slots.length; q++) slots[q].classList.remove('is-rolling');
              slotsWrap.setAttribute('aria-live', 'polite');
              for (var r = 0; r < inputs.length; r++) inputs[r].disabled = false;
              label.textContent = '小狗帮你摇一摇';
              rolling = false;
              btn.disabled = !!rangeError(readSettings());
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
