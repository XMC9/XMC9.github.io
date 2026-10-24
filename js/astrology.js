/**
 * 占星页的下拉切换：星座大板块，以及太阳 / 上升两段解读。
 *
 * 12 个星座的正文都已经渲染在 HTML 里（默认只有一份可见），
 * 这里只负责跟着下拉框切显示，不请求接口，也不做任何改写。
 *
 * 注意绑定方式：Redefine 用 Swup 做无刷新切页，而它用的是 swup.hooks
 * （page:view 钩子），不一定会在 document 上派发 DOM 事件。所以这里
 * **不按元素绑定**，改成在 document 上做事件委托——无论 DOM 被换过
 * 几次，下拉框的 change 都能收到。另外再挂一次钩子，处理带 ?sign=
 * 的深链接。
 */
(function () {
  function apply(root, key) {
    var panels = root.querySelectorAll(".astro-panel");
    Array.prototype.forEach.call(panels, function (panel) {
      var on = panel.getAttribute("data-panel") === key;
      panel.classList.toggle("is-active", on);
      if (on) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
  }

  // 太阳 / 上升：同一张卡里 12 段文字，按选中的星座留一段。
  function applyPersonal(select) {
    var card = select.closest(".astro-read-personal");
    if (!card) return;
    var role = select.getAttribute("data-astro-personal");
    var texts = card.querySelectorAll('[data-personal-panel="' + role + '"]');
    Array.prototype.forEach.call(texts, function (text) {
      if (text.getAttribute("data-sign") === select.value) {
        text.removeAttribute("hidden");
      } else {
        text.setAttribute("hidden", "");
      }
    });
  }

  function currentKey(select) {
    var wanted = "";
    try {
      wanted = new URL(window.location.href).searchParams.get("sign") || "";
    } catch (err) {
      /* 老浏览器不支持就算了 */
    }
    if (wanted) {
      var option = select.querySelector('option[value="' + wanted + '"]');
      if (option) return wanted;
    }
    return select.value;
  }

  function sync(root) {
    var select = root.querySelector("[data-astro-select]");
    if (!select) return;
    var key = currentKey(select);
    if (key && select.value !== key) select.value = key;
    apply(root, key);
  }

  function boot() {
    Array.prototype.forEach.call(
      document.querySelectorAll(".astro-dashboard"),
      sync,
    );
  }

  // 事件委托：一次绑定，Swup 换多少次 DOM 都不用重绑。
  document.addEventListener(
    "change",
    function (event) {
      var target = event.target;
      if (!target || !target.matches) return;
      if (target.matches("[data-astro-personal]")) {
        applyPersonal(target);
        return;
      }
      if (!target.matches("[data-astro-select]")) return;
      var root = target.closest(".astro-dashboard") || document;
      apply(root, target.value);
      try {
        var url = new URL(window.location.href);
        url.searchParams.set("sign", target.value);
        window.history.replaceState(null, "", url);
      } catch (err) {
        /* 切换本身不受影响 */
      }
    },
    true,
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("swup:page:view", boot);
  try {
    if (window.swup && swup.hooks) swup.hooks.on("page:view", boot);
  } catch (err) {
    /* 没有 swup 就是普通页面，DOMContentLoaded 已经够了 */
  }
})();
