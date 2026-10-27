/* 首页「今天有想我嘛？」：只读 /v1/home 的公开摘要，不读取任何明细。 */
(function () {
  "use strict";

  var root = document.querySelector("[data-love-home]");
  if (!root) return;

  var TZ = "Asia/Shanghai";
  var WEEK_CHARS = "日一二三四五六";
  var KIND_LABELS = {
    birthday: "生日",
    anniversary: "纪念日",
    valentine: "情人节",
    qixi: "七夕",
    date: "约会啦",
    milestone: "大事记"
  };

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function todayISO() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (part) { map[part.type] = part.value; });
      if (map.year && map.month && map.day) return map.year + "-" + map.month + "-" + map.day;
    } catch (e) { /* 本地日期兜底 */ }
    var now = new Date();
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  }

  function splitISO(iso) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!matched) return null;
    var year = Number(matched[1]);
    var month = Number(matched[2]);
    var day = Number(matched[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return { y: year, m: month, d: day };
  }

  function diffDays(fromISO, toISO) {
    var from = splitISO(fromISO);
    var to = splitISO(toISO);
    if (!from || !to) return NaN;
    return Math.round((Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / 86400000);
  }

  function formatDateCN(iso) {
    var parts = splitISO(iso);
    if (!parts) return "";
    var weekday = WEEK_CHARS.charAt(new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay());
    return parts.y + "年" + parts.m + "月" + parts.d + "日 · 周" + weekday;
  }

  function countdown(iso, fromISO) {
    var days = diffDays(fromISO, iso);
    if (!isFinite(days)) return { value: "--", unit: "" };
    if (days === 0) return { value: "今天", unit: "就是今天", word: true };
    if (days === 1) return { value: "1", unit: "明天" };
    if (days > 1) return { value: String(days), unit: "天后" };
    return { value: String(Math.abs(days)), unit: "已过", past: true };
  }

  function q(selector) {
    return root.querySelector(selector);
  }

  function setText(selector, value) {
    var node = q(selector);
    if (node) node.textContent = value == null ? "" : String(value);
  }

  function setDays(prefix, parts) {
    var days = q("[data-love-home-" + prefix + "-days]");
    var unit = q("[data-love-home-" + prefix + "-unit]");
    if (days) {
      days.textContent = parts.value;
      days.classList.toggle("is-word", !!parts.word);
      days.classList.toggle("is-past", !!parts.past);
    }
    if (unit) unit.textContent = parts.unit || "";
  }

  function renderImportant(item) {
    var kicker = q("[data-love-home-important-kicker]");
    if (!item || !item.date) {
      if (kicker) kicker.textContent = "最近的重要日子";
      setText("[data-love-home-important-title]", "暂时没有计划");
      setText("[data-love-home-important-date]", "去信息墙添一个重要的日子吧");
      setDays("important", { value: "--", unit: "" });
      return;
    }
    var kind = KIND_LABELS[item.kind] || "重要日子";
    if (kicker) kicker.textContent = "最近的重要日子 · " + kind;
    setText("[data-love-home-important-title]", item.title || "重要日子");
    setText("[data-love-home-important-date]", formatDateCN(item.date));
    setDays("important", countdown(item.date, todayISO()));
  }

  function renderDate(item) {
    var kicker = q("[data-love-home-date-kicker]");
    if (!item || !item.date) {
      if (kicker) kicker.textContent = "下一次约会";
      setText("[data-love-home-date-title]", "暂时没有计划");
      setText("[data-love-home-date-date]", "快来一期规划吧");
      setDays("date", { value: "--", unit: "" });
      return;
    }
    var kind = KIND_LABELS[item.kind] || "约会";
    if (kicker) kicker.textContent = (item.past ? "上一次约会" : "下一次约会") + " · " + kind;
    setText("[data-love-home-date-title]", item.title || "约会");
    setText("[data-love-home-date-date]", formatDateCN(item.date));
    setDays("date", countdown(item.date, todayISO()));
  }

  function renderUnavailable() {
    var kicker = q("[data-love-home-date-kicker]");
    if (kicker) kicker.textContent = "下一次约会";
    setText("[data-love-home-important-title]", "暂时没有计划");
    setText("[data-love-home-important-date]", "去信息墙看看吧");
    setDays("important", { value: "--", unit: "" });
    setText("[data-love-home-date-title]", "暂时没有计划");
    setText("[data-love-home-date-date]", "去信息墙看看吧");
    setDays("date", { value: "--", unit: "" });
  }

  function apiBases() {
    if (typeof window.LOVE_API_BASE === "string" && window.LOVE_API_BASE) {
      return [String(window.LOVE_API_BASE).replace(/\/+$/, "")];
    }
    var host = window.location.hostname;
    if (host === "xm9.asia" || host === "www.xm9.asia") {
      return ["https://xm9.asia/love-api", "https://love-api.xm9.asia"];
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
      return ["http://127.0.0.1:8787"];
    }
    return ["https://love-api.xm9.asia", "https://xm9.asia/love-api"];
  }

  function loadHome() {
    if (typeof window.fetch !== "function") {
      renderUnavailable();
      return;
    }
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, 8000);
    var bases = apiBases();

    function finish() {
      window.clearTimeout(timer);
    }

    function attempt(index) {
      return window.fetch(bases[index] + "/v1/home", {
        method: "GET",
        headers: { Accept: "application/json" },
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      }).then(function (payload) {
        if (!payload || !payload.ok || !payload.data) throw new Error("bad payload");
        var data = payload.data;
        if (data.room && data.room.timezone) TZ = data.room.timezone;
        renderImportant(data.nextImportant);
        renderDate(data.nextDate);
      }).catch(function (error) {
        if (index + 1 < bases.length) return attempt(index + 1);
        throw error;
      });
    }

    attempt(0).then(finish, function () {
      // 后端暂时连不上时给一个安静的兜底，不把错误显示在首页。
      renderUnavailable();
      finish();
    });
  }

  loadHome();
})();
