/* 2048 页的深浅色：和博客共用 REDEFINE-THEME-STATUS。 */
(function () {
  "use strict";

  var root = document.documentElement;
  var button = document.querySelector("[data-theme-toggle]");

  function current() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function apply(theme) {
    root.dataset.theme = theme;
    if (button) button.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1726" : "#E8F1F8");
  }

  function toggle() {
    var next = current() === "dark" ? "light" : "dark";
    apply(next);
    try {
      var stored = JSON.parse(localStorage.getItem("REDEFINE-THEME-STATUS") || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem("REDEFINE-THEME-STATUS", JSON.stringify(stored));
    } catch (e) { /* 隐私模式下只切换当前页 */ }
  }

  apply(current());
  if (button) button.addEventListener("click", toggle);
  window.c2048ApplyTheme = apply;
})();
