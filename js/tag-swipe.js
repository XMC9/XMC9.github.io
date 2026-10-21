(function () {
  'use strict';

  function debounce(fn, delay) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(null, args);
      }, delay);
    };
  }

  function initCarousel(root) {
    if (!root || root.dataset.tagSwipeReady === '1') return;

    const track = root.querySelector('[data-tag-track]');
    if (!track) return;

    const cards = Array.prototype.slice.call(track.querySelectorAll('.tag-swipe-card'));
    if (!cards.length) return;

    const prevButton = root.querySelector('[data-tag-prev]');
    const nextButton = root.querySelector('[data-tag-next]');
    const currentLabel = root.querySelector('[data-tag-current]');
    const dots = Array.prototype.slice.call(root.querySelectorAll('[data-tag-dot]'));
    let currentIndex = 0;

    root.dataset.tagSwipeReady = '1';

    function indexFromScroll() {
      const center = track.scrollLeft + track.clientWidth / 2;
      let bestIndex = 0;
      let bestDistance = Infinity;

      cards.forEach(function (card, index) {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      return bestIndex;
    }

    function render(index) {
      currentIndex = Math.max(0, Math.min(cards.length - 1, index));

      cards.forEach(function (card, cardIndex) {
        card.classList.toggle('is-current', cardIndex === currentIndex);
      });

      dots.forEach(function (dot, dotIndex) {
        const active = dotIndex === currentIndex;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });

      if (currentLabel) {
        currentLabel.textContent = String(currentIndex + 1).padStart(2, '0');
      }

      if (prevButton) prevButton.disabled = currentIndex === 0;
      if (nextButton) nextButton.disabled = currentIndex === cards.length - 1;
    }

    function goTo(index) {
      const targetIndex = Math.max(0, Math.min(cards.length - 1, index));
      const card = cards[targetIndex];
      if (!card) return;

      track.scrollTo({
        left: Math.max(0, card.offsetLeft - 2),
        behavior: 'smooth'
      });
      render(targetIndex);
    }

    const syncIndex = debounce(function () {
      render(indexFromScroll());
    }, 70);

    track.addEventListener('scroll', syncIndex, { passive: true });

    if (prevButton) {
      prevButton.addEventListener('click', function () {
        goTo(indexFromScroll() - 1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', function () {
        goTo(indexFromScroll() + 1);
      });
    }

    dots.forEach(function (dot, index) {
      dot.addEventListener('click', function () {
        goTo(index);
      });
    });

    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(indexFromScroll() - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(indexFromScroll() + 1);
      }
    });

    window.addEventListener('resize', debounce(function () {
      render(indexFromScroll());
    }, 150));

    requestAnimationFrame(function () {
      render(0);
    });
  }

  function initAll() {
    document.querySelectorAll('[data-tag-swipe]').forEach(initCarousel);
  }

  function queueInit() {
    requestAnimationFrame(initAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queueInit, { once: true });
  } else {
    queueInit();
  }

  // Swup 切换页面后重新绑定；MutationObserver 兜底，避免事件名随主题版本变化。
  document.addEventListener('swup:page:view', queueInit);

  const main = document.getElementById('swup') || document.body;
  if (main && window.MutationObserver) {
    new MutationObserver(queueInit).observe(main, { childList: true, subtree: true });
  }

  window.addEventListener('load', queueInit);
})();
