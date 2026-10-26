/* 首页「重要日子」小栏目：先按页面里嵌的数据渲染，再尝试从后端取最新的一份。
 * 静态兜底数据来自 source/_data/love.json，线上数据来自 love-api 的 /v1/public。
 */
(function () {
  "use strict";

  var dataEl = document.getElementById("love-home-data");
  if (!dataEl) return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent || "{}");
  } catch (e) {
    return;
  }

  var room = data.room || {};
  var events = Array.isArray(data.events) ? data.events : [];
  var TZ = room.timezone || "Asia/Shanghai";
  var WEEK_CHARS = "日一二三四五六";
  var HOME_LIMIT = 6;
  var today = todayISO();

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
    var a = Date.UTC(from.y, from.m - 1, from.d);
    var b = Date.UTC(to.y, to.m - 1, to.d);
    return Math.round((b - a) / 86400000);
  }

  function formatDateCN(iso) {
    var parts = splitISO(iso);
    if (!parts) return "";
    return parts.y + "年" + parts.m + "月" + parts.d + "日 · 周" + WEEK_CHARS.charAt(new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay());
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function yearlySeed(event, year) {
    var date = String(event.date || "");
    var monthDay = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5) : (/^\d{2}-\d{2}$/.test(date) ? date : "");
    if (!monthDay) return [];
    if (monthDay === "02-29" && !isLeapYear(year)) return [];
    return splitISO(year + "-" + monthDay) ? [year + "-" + monthDay] : [];
  }

  function occurrencesInYear(event, year) {
    if (!event) return [];
    if (event.repeat === "dates") {
      return (Array.isArray(event.dates) ? event.dates : [])
        .filter(function (date) { return splitISO(date) && Number(date.slice(0, 4)) === year; })
        .sort();
    }
    if (event.repeat === "yearly") return yearlySeed(event, year);
    if (event.repeat === "none") {
      return splitISO(event.date) && Number(event.date.slice(0, 4)) === year ? [event.date] : [];
    }
    return [];
  }

  function nextOccurrence(event, fromISO) {
    if (!event) return null;
    if (event.repeat === "dates") {
      var dates = (Array.isArray(event.dates) ? event.dates : []).filter(function (date) { return splitISO(date); }).sort();
      for (var i = 0; i < dates.length; i++) {
        if (dates[i] >= fromISO) return dates[i];
      }
      return null;
    }
    if (event.repeat === "none") return splitISO(event.date) && event.date >= fromISO ? event.date : null;
    if (event.repeat === "yearly") {
      var startYear = Number(fromISO.slice(0, 4)) || new Date().getFullYear();
      for (var year = startYear; year <= startYear + 8; year++) {
        var list = occurrencesInYear(event, year);
        for (var j = 0; j < list.length; j++) {
          if (list[j] >= fromISO) return list[j];
        }
      }
    }
    return null;
  }

  function pastOccurrence(event, fromISO) {
    if (event && event.repeat === "none" && splitISO(event.date) && event.date < fromISO) return event.date;
    return null;
  }

  function countdown(iso, fromISO) {
    var days = diffDays(fromISO, iso);
    if (!isFinite(days)) return "待定";
    if (days === 0) return "今天";
    if (days === 1) return "明天";
    if (days > 1) return days + " 天后";
    return "已过 " + Math.abs(days) + " 天";
  }

  function repeatLabel(event) {
    if (event.repeat === "yearly") return "每年";
    if (event.repeat === "none") return "仅一次";
    if (event.repeat === "dates") return "农历七月初七";
    return "";
  }

  function eventDateLabel(event) {
    if (!event) return "";
    if (event.repeat === "dates") return "农历七月初七";
    if (event.date && event.date.length === 5) return event.date.replace("-", ".");
    if (event.date) return event.date.slice(5).replace("-", ".");
    return "";
  }

  function findNext(fromISO) {
    var candidates = [];
    events.forEach(function (event) {
      var iso = nextOccurrence(event, fromISO);
      if (iso) candidates.push({ event: event, iso: iso });
    });
    candidates.sort(function (a, b) {
      if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
      return String(a.event.title || "").localeCompare(String(b.event.title || ""), "zh");
    });
    return candidates[0] || null;
  }

  function loveHref() {
    var feature = document.querySelector(".home-love-feature");
    return feature ? feature.getAttribute("href") : "/love/";
  }

  function renderNext() {
    var next = findNext(today);
    var titleNode = document.querySelector("[data-love-home-next-title]");
    var dateNode = document.querySelector("[data-love-home-next-date]");
    var daysNode = document.querySelector("[data-love-home-next-days]");
    var unitNode = document.querySelector("[data-love-home-next-unit]");

    if (!next) {
      if (titleNode) titleNode.textContent = "还没有新的日子";
      if (dateNode) dateNode.textContent = "去 Love Story 添一个吧";
      if (daysNode) { daysNode.textContent = "--"; daysNode.classList.remove("is-word"); }
      if (unitNode) unitNode.textContent = "";
      return;
    }

    if (titleNode) titleNode.textContent = next.event.title || "下一个重要日子";
    if (dateNode) dateNode.textContent = formatDateCN(next.iso) + " · " + repeatLabel(next.event);
    var diff = diffDays(today, next.iso);
    if (daysNode) {
      daysNode.textContent = diff === 0 ? "今天" : (diff === 1 ? "1" : String(diff));
      daysNode.classList.toggle("is-word", diff === 0);
    }
    if (unitNode) unitNode.textContent = diff === 0 ? "就是今天" : (diff === 1 ? "明天" : "天后");
  }

  function homeRows() {
    var rows = [];
    events.forEach(function (event) {
      if (!event || !event.home) return;
      var occurrence = nextOccurrence(event, today);
      var past = pastOccurrence(event, today);
      rows.push({ event: event, iso: occurrence || past || "9999-99-99", pin: event.pin ? 1 : 0 });
    });
    rows.sort(function (a, b) {
      if (a.pin !== b.pin) return b.pin - a.pin;
      if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
      return String(a.event.title || "").localeCompare(String(b.event.title || ""), "zh");
    });
    return rows.slice(0, HOME_LIMIT);
  }

  function renderRows() {
    var listNode = document.querySelector(".home-love-list");
    if (!listNode) return;
    listNode.innerHTML = "";

    homeRows().forEach(function (rowData) {
      var event = rowData.event;
      var occurrence = nextOccurrence(event, today);
      var past = pastOccurrence(event, today);

      var row = document.createElement("a");
      row.className = "home-love-row" + (event.pin ? " is-pin" : "");
      row.href = loveHref();
      row.setAttribute("data-love-home-event", event.id || "");

      var icon = document.createElement("span");
      icon.className = "home-love-row-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = event.icon || "♡";

      var copy = document.createElement("span");
      copy.className = "home-love-row-copy";
      var titleLine = document.createElement("span");
      titleLine.className = "home-love-row-title";
      var title = document.createElement("strong");
      title.textContent = event.title || "重要日子";
      titleLine.appendChild(title);
      if (event.pin) {
        var pin = document.createElement("span");
        pin.className = "home-love-row-pin";
        pin.textContent = "置顶";
        titleLine.appendChild(pin);
      }
      var date = document.createElement("small");
      date.setAttribute("data-love-home-date", "");
      date.textContent = eventDateLabel(event);
      copy.appendChild(titleLine);
      copy.appendChild(date);

      var days = document.createElement("span");
      days.className = "home-love-row-days";
      days.setAttribute("data-love-home-days", "");
      if (occurrence) days.textContent = countdown(occurrence, today);
      else if (past) days.textContent = "已过 " + Math.abs(diffDays(past, today)) + " 天";
      else days.textContent = "待补";

      row.appendChild(icon);
      row.appendChild(copy);
      row.appendChild(days);
      listNode.appendChild(row);
    });
  }

  function render() {
    renderNext();
    renderRows();
  }

  /* ---------- 线上最新数据 ---------- */

  function apiBase() {
    if (typeof window.LOVE_API_BASE === "string" && window.LOVE_API_BASE) {
      return String(window.LOVE_API_BASE).replace(/\/+$/, "");
    }
    var host = window.location.hostname;
    if (host === "xm9.asia" || host === "www.xm9.asia") {
      return "https://xm9.asia/love-api";
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
      return "http://127.0.0.1:8787";
    }
    return "https://love-api.xm9.asia";
  }

  function loadLatest() {
    if (typeof window.fetch !== "function") return;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, 8000);

    function finish() {
      window.clearTimeout(timer);
    }

    window.fetch(apiBase() + "/v1/public", {
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
      var next = payload.data;
      if (next.version && next.version !== 1) throw new Error("unsupported version");
      room = next.room || room;
      events = Array.isArray(next.events) ? next.events : events;
      TZ = room.timezone || TZ;
      today = todayISO();
      render();
      finish();
    }).catch(function () {
      // 连不上后端就保持静态版本，不打扰首页。
      finish();
    });
  }

  render();
  loadLatest();
})();
