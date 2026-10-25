/* 游戏页被 blog-overlay.js 装进 iframe 时：
 * 1. 「← 秘密基地 / 回到秘密基地」不再整页跳走，而是请父页面关掉浮层；
 * 2. 大厅 → 游戏之间的跳转用 location.replace，避免在浏览器的联合会话
 *    历史里留下一条条 iframe 记录，父页面按返回键才能直接关掉浮层；
 * 3. 焦点在游戏里时，Esc 也能关浮层。
 */
(function () {
  'use strict';

  if (window.self === window.top) return;
  document.documentElement.classList.add('is-embedded');

  // 浮层顶栏已经提供了「返回 + 游戏名」，游戏页自己的返回和标题就不再重复。
  // 这里用 href / class 兜底，六个游戏页和大厅都不用各写一份 CSS。
  var style = document.createElement('style');
  style.id = 'xm-embed-header-fix';
  style.textContent = [
    'html.is-embedded header > a[href="/"],',
    'html.is-embedded header > a[href="/play/"],',
    'html.is-embedded header > a[href="/index.html"],',
    'html.is-embedded header > [class*="brand"] { display: none !important; }',
    'html.is-embedded .g-top,',
    'html.is-embedded .hx-top,',
    'html.is-embedded .ct10-top,',
    'html.is-embedded .gm-top,',
    'html.is-embedded .p-top { justify-content: flex-end !important; }'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  function postClose() {
    try {
      window.parent.postMessage({ type: 'xm9-overlay-close' }, window.location.origin);
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

    var href = link.getAttribute('href');
    if (href === '/' || href === '/index.html') {
      event.preventDefault();
      postClose();
      return;
    }

    var url;
    try {
      url = new URL(href, window.location.href);
    } catch (e) {
      return;
    }
    if (url.origin !== window.location.origin) return;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // 同样用 replace，不往联合历史里加条目
    event.preventDefault();
    window.location.replace(url.href);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      postClose();
    }
  });
})();
