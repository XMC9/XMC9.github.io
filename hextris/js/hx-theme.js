/* ============================================================
 * HEXTRIS × 秘密基地 · 主题适配
 * 把游戏画布的底色、六边形描边、中心块颜色接到博客的蓝 / 藏青配色。
 * 这个文件要在 initialization.js 之前加载。
 * ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "REDEFINE-THEME-STATUS";

  var LIGHT = {
    bg: "#E8F1F8",
    bgClear: "rgba(232, 241, 248, 0.55)",
    boardFill: "#DCE9F4",
    boardFillStart: "#E4EFF8",
    centerRgb: [22, 40, 63],
    centerInk: "#EAF4FF",
    ink: "#16283F",
    muted: "#5E768E",
    title: "#16283F",
    accent: "#2E75B6"
  };

  var DARK = {
    bg: "#0B1726",
    bgClear: "rgba(11, 23, 38, 0.55)",
    boardFill: "#102A43",
    boardFillStart: "#0E2237",
    centerRgb: [27, 53, 82],
    centerInk: "#EAF4FF",
    ink: "#DCE9F6",
    muted: "#8BA5C0",
    title: "#EAF4FF",
    accent: "#7FB2E5"
  };

  // 方块颜色：珊瑚红 / 琥珀 / 博客蓝 / 鼠尾草绿。
  window.colors = ["#e06c5a", "#e8b85c", "#2e75b6", "#6faf8f"];

  window.hexColorsToTintedColors = {
    "#e06c5a": "rgb(240,182,173)",
    "#e8b85c": "rgb(244,220,174)",
    "#2e75b6": "rgb(151,186,219)",
    "#6faf8f": "rgb(183,215,199)"
  };

  window.rgbColorsToTintedColors = {
    "rgb(224,108,90)": "rgb(240,182,173)",
    "rgb(232,184,92)": "rgb(244,220,174)",
    "rgb(46,117,182)": "rgb(151,186,219)",
    "rgb(111,175,143)": "rgb(183,215,199)"
  };

  window.rgbToHex = {
    "rgb(224,108,90)": "#e06c5a",
    "rgb(232,184,92)": "#e8b85c",
    "rgb(46,117,182)": "#2e75b6",
    "rgb(111,175,143)": "#6faf8f",
    // 旧版配色，用来兼容以前存档里的方块颜色。
    "rgb(231,76,60)": "#e06c5a",
    "rgb(241,196,15)": "#e8b85c",
    "rgb(52,152,219)": "#2e75b6",
    "rgb(46,204,113)": "#6faf8f"
  };

  function paletteFor(theme) {
    return theme === "dark" ? DARK : LIGHT;
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function apply(theme) {
    var palette = paletteFor(theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.hxPalette = palette;

    // render.js / view.js / Hex.js 每帧都会读这些全局变量。
    window.hexagonBackgroundColor = palette.bg;
    window.hexagonBackgroundColorClear = palette.bgClear;
    window.centerBlue = "rgb(" + palette.centerRgb.join(",") + ")";
    if (window.MainHex) {
      window.MainHex.fillColor = palette.centerRgb.slice();
      window.MainHex.tempColor = palette.centerRgb.slice();
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", palette.bg);

    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    }
  }

  function toggle() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    apply(next);
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) { /* 隐私模式下不记也没关系 */ }
  }

  apply(currentTheme());

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector("[data-theme-toggle]");
    if (button) button.addEventListener("click", toggle);
    apply(currentTheme());
  });

  window.hxApplyTheme = apply;
  window.hxToggleTheme = toggle;
})();
