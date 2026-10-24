(function () {
  "use strict";
  var root = document.documentElement;
  var button = document.querySelector("[data-theme-toggle]");

  function apply(theme) {
    root.dataset.theme = theme;
    if (button) button.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1726" : "#E8F1F8");
  }

  function toggle() {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try {
      var stored = JSON.parse(localStorage.getItem("REDEFINE-THEME-STATUS") || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem("REDEFINE-THEME-STATUS", JSON.stringify(stored));
    } catch (e) { /* 忽略隐私模式 */ }
  }

  apply(root.dataset.theme === "dark" ? "dark" : "light");
  if (button) button.addEventListener("click", toggle);
})();
