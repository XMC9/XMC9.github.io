(function () {
  "use strict";

  var dataEl = document.getElementById("love-data");
  if (!dataEl) return;

  var initialData;
  try {
    initialData = JSON.parse(dataEl.textContent || "{}");
  } catch (e) {
    return;
  }

  var room = {};
  var people = [];
  var events = [];
  var bucket = [];
  var TZ = "Asia/Shanghai";
  var dataSource = "local";
  var remoteLoaded = false;

  function applyData(next) {
    var value = next || {};
    room = value.room || {};
    people = Array.isArray(value.people) ? value.people : [];
    events = Array.isArray(value.events) ? value.events : [];
    bucket = Array.isArray(value.bucketList) ? value.bucketList : [];
    TZ = room.timezone || "Asia/Shanghai";
  }

  applyData(initialData);
  var KIND_LABELS = {
    birthday: "生日",
    anniversary: "纪念日",
    valentine: "情人节",
    qixi: "七夕",
    meeting: "见面",
    custom: "自定义"
  };
  var WEEK_CHARS = "日一二三四五六";

  var $ = function (selector, root) {
    return (root || document).querySelector(selector);
  };
  var $$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };
  var setText = function (selector, value) {
    var node = $(selector);
    if (node) node.textContent = value == null ? "" : String(value);
  };

  /* ---------- 日期：全部按 Asia/Shanghai 的日历日算 ---------- */

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
      if (map.year && map.month && map.day) {
        return map.year + "-" + map.month + "-" + map.day;
      }
    } catch (e) { /* 老浏览器走本地日期兜底 */ }
    var now = new Date();
    return formatISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function formatISO(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function splitISO(iso) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!matched) return null;
    var year = Number(matched[1]);
    var month = Number(matched[2]);
    var day = Number(matched[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year
      || check.getUTCMonth() !== month - 1
      || check.getUTCDate() !== day) return null;
    return { y: year, m: month, d: day };
  }

  function dayNumber(iso) {
    var parts = splitISO(iso);
    if (!parts) return NaN;
    return Math.floor(Date.UTC(parts.y, parts.m - 1, parts.d) / 86400000);
  }

  function diffDays(fromISO, toISO) {
    var from = dayNumber(fromISO);
    var to = dayNumber(toISO);
    if (!isFinite(from) || !isFinite(to)) return NaN;
    return Math.round(to - from);
  }

  function addDays(iso, amount) {
    var parts = splitISO(iso);
    if (!parts) return iso;
    var date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + amount));
    return formatISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function weekdayOf(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function formatDateCN(iso, withWeekday) {
    var parts = splitISO(iso);
    if (!parts) return "";
    var text = parts.y + "年" + parts.m + "月" + parts.d + "日";
    if (withWeekday) text += " · 周" + WEEK_CHARS.charAt(weekdayOf(parts.y, parts.m, parts.d));
    return text;
  }

  function formatShort(iso) {
    var parts = splitISO(iso);
    return parts ? pad2(parts.m) + "." + pad2(parts.d) : "";
  }

  function monthDay(value) {
    var matched = /^(\d{2})-(\d{2})$/.exec(String(value || ""));
    return matched ? Number(matched[1]) + "." + matched[2] : "";
  }

  function dateDot(value) {
    return String(value || "").replace(/-/g, ".");
  }

  function sortedBirthdayPeople() {
    return people.slice().sort(function (a, b) {
      return String(a.birthday || "").localeCompare(String(b.birthday || ""));
    });
  }

  /* ---------- 事件展开 ---------- */

  function yearlySeed(event, year) {
    var date = String(event.date || "");
    var monthDay = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) monthDay = date.slice(5);
    else if (/^\d{2}-\d{2}$/.test(date)) monthDay = date;
    if (!monthDay) return [];
    if (monthDay === "02-29" && !isLeapYear(year)) return [];
    var iso = year + "-" + monthDay;
    return splitISO(iso) ? [iso] : [];
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
      var dates = (Array.isArray(event.dates) ? event.dates : [])
        .filter(function (date) { return splitISO(date); })
        .sort();
      for (var i = 0; i < dates.length; i++) {
        if (dates[i] >= fromISO) return dates[i];
      }
      return null;
    }
    if (event.repeat === "none") {
      return splitISO(event.date) && event.date >= fromISO ? event.date : null;
    }
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
    if (event && event.repeat === "none" && splitISO(event.date) && event.date < fromISO) {
      return event.date;
    }
    return null;
  }

  function eventsOnDate(iso) {
    var year = Number(String(iso).slice(0, 4));
    return events.filter(function (event) {
      return occurrencesInYear(event, year).indexOf(iso) !== -1;
    });
  }

  function kindLabel(event) {
    return KIND_LABELS[event && event.kind] || "重要日子";
  }

  function repeatLabel(event) {
    if (!event) return "";
    if (event.repeat === "yearly") return "每年";
    if (event.repeat === "none") return "仅一次";
    if (event.repeat === "dates") return "农历";
    return "";
  }

  function eventMeta(event) {
    var parts = [kindLabel(event)];
    var repeat = repeatLabel(event);
    if (repeat) parts.push(repeat);
    return parts.join(" · ");
  }

  function shortCountdown(iso, fromISO) {
    var days = diffDays(fromISO, iso);
    if (!isFinite(days)) return "待定";
    if (days === 0) return "今天";
    if (days === 1) return "明天";
    if (days > 1) return days + " 天后";
    return "已过 " + Math.abs(days) + " 天";
  }

  function countdownParts(iso, fromISO) {
    var days = diffDays(fromISO, iso);
    if (!isFinite(days)) return { value: "--", unit: "" };
    if (days === 0) return { value: "今天", unit: "就是今天", word: true };
    if (days === 1) return { value: "1", unit: "明天" };
    if (days > 1) return { value: String(days), unit: "天后" };
    return { value: String(Math.abs(days)), unit: "已过", past: true };
  }

  function findNextEvent(fromISO) {
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

  /* ---------- 主题 ---------- */

  var root = document.documentElement;
  var themeButton = $("[data-theme-toggle]");

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (themeButton) {
      themeButton.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1726" : "#E8F1F8");
  }

  function toggleTheme() {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      var stored = JSON.parse(localStorage.getItem("REDEFINE-THEME-STATUS") || "{}") || {};
      stored.isDark = next === "dark";
      localStorage.setItem("REDEFINE-THEME-STATUS", JSON.stringify(stored));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------- 渲染 ---------- */

  var today = todayISO();
  var todayParts = splitISO(today) || { y: new Date().getFullYear(), m: 1, d: 1 };
  var cal = {
    y: todayParts.y,
    m: todayParts.m,
    selected: today
  };
  var nextState = { iso: null, event: null };
  var calGrid = $("[data-cal-grid]");
  var calMonth = $("[data-cal-month]");
  var dayLabel = $("[data-love-day-label]");
  var dayDate = $("[data-love-day-date]");
  var dayEvents = $("[data-love-day-events]");
  var dayEmpty = $("[data-love-day-empty]");
  var eventList = $("[data-love-event-list]");
  var eventCount = $("[data-love-event-count]");
  var bucketList = $("[data-love-bucket-list]");
  var bucketCount = $("[data-love-bucket-count]");
  var bucketBar = $("[data-love-bucket-bar]");
  var nextJump = $("[data-love-next-jump]");
  var exportHint = $("[data-love-export-hint]");

  function renderHero() {
    var pageTitle = room.title || "鸡毛鸡和白小白";
    var titleNode = $("[data-love-title]");
    if (titleNode) {
      titleNode.innerHTML = "";
      var titleParts = String(pageTitle).split("和");
      var left = titleParts[0] || pageTitle;
      var right = titleParts.length > 1 ? titleParts.slice(1).join("和") : "";
      var leftSpan = document.createElement("span");
      leftSpan.textContent = left;
      titleNode.appendChild(leftSpan);
      if (right) {
        var andNode = document.createElement("em");
        andNode.textContent = "和";
        titleNode.appendChild(andNode);
        var rightSpan = document.createElement("span");
        rightSpan.textContent = right;
        titleNode.appendChild(rightSpan);
      }
    }

    setText("[data-love-eyebrow]", room.eyebrow || "OUR LITTLE UNIVERSE");
    setText("[data-love-subtitle]", room.subtitle || "把重要的日子，都放在这里。");
    setText("[data-love-since]", dateDot(room.togetherSince || "2024-12-25"));
    setText("[data-love-postcard-note]", room.postcardNote || "把普通的日子，过成值得记住的日子。");
    setText("[data-love-note]", room.readOnlyNote || "这里记录我们两个人的小事。");
    setText("[data-love-footer-title]", pageTitle);
    setText("[data-love-footer-updated]", dateDot(room.updatedAt || "") || "—");
    setText("[data-love-footer-note]", room.footerNote ? " · " + room.footerNote : "");
    document.title = pageTitle + " · 秘密基地";
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", pageTitle + "的小小信息墙：重要日子、纪念日日历和共同清单。");

    var peopleNode = $("[data-love-people]");
    if (peopleNode) {
      peopleNode.innerHTML = "";
      people.forEach(function (person) {
        var chip = document.createElement("span");
        chip.className = "l-person";
        var emoji = document.createElement("span");
        emoji.className = "l-person-emoji";
        emoji.setAttribute("aria-hidden", "true");
        emoji.textContent = person.emoji || "♡";
        var copy = document.createElement("span");
        copy.className = "l-person-copy";
        var name = document.createElement("strong");
        name.textContent = person.name || "";
        var birthday = document.createElement("small");
        birthday.textContent = monthDay(person.birthday);
        copy.appendChild(name);
        copy.appendChild(birthday);
        chip.appendChild(emoji);
        chip.appendChild(copy);
        peopleNode.appendChild(chip);
      });
    }

    var stampNode = $("[data-love-stamp]");
    if (stampNode) {
      stampNode.innerHTML = "";
      sortedBirthdayPeople().forEach(function (person) {
        var date = document.createElement("b");
        date.textContent = monthDay(person.birthday);
        stampNode.appendChild(date);
      });
    }
  }

  function renderTogether() {
    var target = $("[data-love-together-days]");
    if (!target) return;
    var since = splitISO(room.togetherSince) ? room.togetherSince : "2024-12-25";
    var elapsed = diffDays(since, today);
    var days = isFinite(elapsed) && elapsed >= 0 ? elapsed + 1 : 0;
    target.textContent = String(days);
  }

  function renderNext() {
    var titleNode = $("[data-love-next-title]");
    var dateNode = $("[data-love-next-date]");
    var daysNode = $("[data-love-next-days]");
    var unitNode = $("[data-love-next-unit]");
    var noteNode = $("[data-love-next-note]");
    if (!titleNode || !dateNode || !daysNode || !unitNode || !noteNode) return;

    var next = findNextEvent(today);
    nextState = next ? { iso: next.iso, event: next.event } : { iso: null, event: null };

    if (!next) {
      titleNode.textContent = "还没有新的日子";
      dateNode.textContent = "去清单里添一个吧";
      daysNode.textContent = "--";
      daysNode.classList.remove("is-word");
      unitNode.textContent = "";
      noteNode.textContent = "";
      if (nextJump) nextJump.hidden = true;
      return;
    }

    var parts = countdownParts(next.iso, today);
    titleNode.textContent = next.event.title || "下一个重要日子";
    dateNode.textContent = formatDateCN(next.iso, true) + " · " + repeatLabel(next.event);
    daysNode.textContent = parts.value;
    daysNode.classList.toggle("is-word", !!parts.word);
    unitNode.textContent = parts.unit;
    noteNode.textContent = next.event.note || "这一天，记得留一点时间给我们。";
    if (nextJump) {
      nextJump.hidden = false;
      nextJump.setAttribute("data-date", next.iso);
    }
  }

  function renderHighlights() {
    var grid = $("[data-love-highlight-grid]") || $(".l-highlight-grid");
    if (!grid) return;
    grid.innerHTML = "";

    var rows = [];
    events.forEach(function (event) {
      if (!event || !event.highlight) return;
      var occurrence = nextOccurrence(event, today) || pastOccurrence(event, today);
      rows.push({ event: event, iso: occurrence || "" });
    });
    rows.sort(function (a, b) {
      var aDate = a.iso || "9999-99-99";
      var bDate = b.iso || "9999-99-99";
      if (aDate !== bDate) return aDate < bDate ? -1 : 1;
      return String(a.event.title || "").localeCompare(String(b.event.title || ""), "zh");
    });

    rows.forEach(function (row) {
      var event = row.event;
      var occurrence = row.iso;

      var card = document.createElement("button");
      card.type = "button";
      card.className = "l-highlight-card";
      card.setAttribute("data-love-highlight", event.id || "");
      card.setAttribute("data-date", occurrence || "");

      var icon = document.createElement("span");
      icon.className = "l-highlight-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = event.icon || "✦";

      var label = document.createElement("span");
      label.className = "l-highlight-label";
      label.textContent = event.title || "重要日子";

      var date = document.createElement("strong");
      date.className = "l-highlight-date";
      date.setAttribute("data-love-highlight-date", "");
      date.textContent = event.repeat === "dates"
        ? "农历七月初七"
        : (formatShort(occurrence || event.date) || "待定");

      var days = document.createElement("span");
      days.className = "l-highlight-days";
      days.setAttribute("data-love-highlight-days", "");
      days.textContent = occurrence ? shortCountdown(occurrence, today) : "待补";

      card.appendChild(icon);
      card.appendChild(label);
      card.appendChild(date);
      card.appendChild(days);
      card.setAttribute("aria-label", (event.title || "日子") + (occurrence ? "，" + formatDateCN(occurrence, false) : "，日期待补"));
      grid.appendChild(card);
    });
  }

  function renderCalendar() {
    if (!calGrid || !calMonth) return;
    calMonth.textContent = cal.y + "年" + cal.m + "月";
    calGrid.innerHTML = "";

    var firstWeekday = weekdayOf(cal.y, cal.m, 1);
    var total = daysInMonth(cal.y, cal.m);
    var cellCount = Math.ceil((firstWeekday + total) / 7) * 7;
    if (cellCount < 35) cellCount = 35;

    for (var i = 0; i < cellCount; i++) {
      var offset = i - firstWeekday + 1;
      var date = new Date(Date.UTC(cal.y, cal.m - 1, offset));
      var iso = formatISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      var outside = date.getUTCMonth() !== cal.m - 1 || date.getUTCFullYear() !== cal.y;
      var cellEvents = eventsOnDate(iso);

      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "l-cal-cell";
      if (outside) cell.classList.add("is-outside");
      if (iso === today) cell.classList.add("is-today");
      if (iso === cal.selected) cell.classList.add("is-selected");
      cell.setAttribute("data-date", iso);
      cell.setAttribute("aria-pressed", iso === cal.selected ? "true" : "false");
      cell.setAttribute("aria-label", formatDateCN(iso, true)
        + (cellEvents.length
          ? "，" + cellEvents.map(function (event) { return event.title; }).join("、")
          : "，没有安排"));

      var number = document.createElement("span");
      number.className = "l-cal-num";
      number.textContent = String(date.getUTCDate());
      cell.appendChild(number);

      if (cellEvents.length) {
        var dots = document.createElement("span");
        dots.className = "l-cal-dots";
        var seen = {};
        cellEvents.slice(0, 3).forEach(function (event) {
          var kind = event.kind || "custom";
          if (seen[kind]) return;
          seen[kind] = true;
          var dot = document.createElement("i");
          dot.className = "l-dot is-" + kind;
          dots.appendChild(dot);
        });
        cell.appendChild(dots);
      }

      calGrid.appendChild(cell);
    }
  }

  function renderDay(iso) {
    if (!dayLabel || !dayDate || !dayEvents || !dayEmpty) return;
    var label = "选中日期";
    if (iso === today) label = "今天";
    else if (iso === addDays(today, 1)) label = "明天";
    dayLabel.textContent = label;
    dayDate.textContent = formatDateCN(iso, true);

    var list = eventsOnDate(iso);
    dayEvents.innerHTML = "";
    dayEmpty.hidden = list.length > 0;

    list.forEach(function (event) {
      var item = document.createElement("article");
      item.className = "l-day-event";

      var title = document.createElement("div");
      title.className = "l-day-event-title";
      var icon = document.createElement("span");
      icon.textContent = event.icon || "✦";
      icon.setAttribute("aria-hidden", "true");
      title.appendChild(icon);
      title.appendChild(document.createTextNode(event.title || "重要日子"));

      var meta = document.createElement("div");
      meta.className = "l-day-event-meta";
      meta.textContent = eventMeta(event);

      item.appendChild(title);
      item.appendChild(meta);

      if (event.note) {
        var note = document.createElement("p");
        note.className = "l-day-event-note";
        note.textContent = event.note;
        item.appendChild(note);
      }
      dayEvents.appendChild(item);
    });
  }

  function renderEventList() {
    if (!eventList) return;
    eventList.innerHTML = "";
    if (eventCount) eventCount.textContent = events.length + " 个日子";

    var rows = events.map(function (event) {
      var next = nextOccurrence(event, today);
      var past = pastOccurrence(event, today);
      return { event: event, next: next, past: past };
    });

    rows.sort(function (a, b) {
      if (a.next && b.next) {
        if (a.next !== b.next) return a.next < b.next ? -1 : 1;
      } else if (a.next && !b.next) {
        return -1;
      } else if (!a.next && b.next) {
        return 1;
      }

      if (a.past && b.past && a.past !== b.past) {
        return a.past > b.past ? -1 : 1;
      }
      if (a.past && !b.past) return -1;
      if (!a.past && b.past) return 1;

      return String(a.event.title || "").localeCompare(String(b.event.title || ""), "zh");
    });

    rows.forEach(function (row) {
      var event = row.event;
      var occurrence = row.next || row.past || "";
      var isPast = !row.next && !!row.past;

      var button = document.createElement("button");
      button.type = "button";
      button.className = "l-event-row" + (isPast ? " is-past" : "");
      button.setAttribute("data-date", occurrence);

      var dateBox = document.createElement("span");
      dateBox.className = "l-event-date";
      var dateMain = document.createElement("b");
      dateMain.textContent = occurrence ? formatShort(occurrence) : "--.--";
      var dateSmall = document.createElement("small");
      dateSmall.textContent = occurrence ? occurrence.slice(0, 4) : "待定";
      dateBox.appendChild(dateMain);
      dateBox.appendChild(dateSmall);

      var body = document.createElement("span");
      body.className = "l-event-body";
      var title = document.createElement("span");
      title.className = "l-event-title";
      title.textContent = event.title || "重要日子";
      var meta = document.createElement("span");
      meta.className = "l-event-meta";
      var tag = document.createElement("span");
      tag.className = "l-event-tag is-" + (event.kind || "custom");
      tag.textContent = repeatLabel(event) ? kindLabel(event) + " · " + repeatLabel(event) : kindLabel(event);
      meta.appendChild(tag);
      if (event.note) {
        var note = document.createElement("span");
        note.className = "l-event-note";
        note.textContent = event.note;
        meta.appendChild(note);
      }
      body.appendChild(title);
      body.appendChild(meta);

      var days = document.createElement("span");
      days.className = "l-event-days";
      if (row.next) days.textContent = shortCountdown(row.next, today);
      else if (row.past) days.textContent = "已过 " + Math.abs(diffDays(row.past, today)) + " 天";
      else days.textContent = "待定";

      button.appendChild(dateBox);
      button.appendChild(body);
      button.appendChild(days);

      if (occurrence) {
        button.addEventListener("click", function () {
          selectDate(occurrence, true);
        });
      }
      eventList.appendChild(button);
    });
  }

  function renderBucket() {
    if (!bucketList) return;
    bucketList.innerHTML = "";

    var done = bucket.filter(function (item) { return item && item.done; }).length;
    var total = bucket.length;
    if (bucketCount) bucketCount.textContent = done + " / " + total;
    if (bucketBar) bucketBar.style.width = total ? (done / total * 100) + "%" : "0%";

    var ordered = bucket.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (a.done && b.done) {
        return String(b.doneAt || "").localeCompare(String(a.doneAt || ""));
      }
      return 0;
    });

    ordered.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "l-bucket-item" + (item.done ? " is-done" : "");

      var check = document.createElement("span");
      check.className = "l-bucket-check";
      check.textContent = item.done ? "✓" : "";
      check.setAttribute("aria-hidden", "true");

      var body = document.createElement("span");
      body.className = "l-bucket-body";
      var title = document.createElement("span");
      title.className = "l-bucket-title";
      title.textContent = item.title || "想一起做的事";
      body.appendChild(title);

      var meta = document.createElement("span");
      meta.className = "l-bucket-meta";
      if (item.category) {
        var category = document.createElement("span");
        category.className = "l-bucket-cat";
        category.textContent = item.category;
        meta.appendChild(category);
      }
      if (item.note) {
        var note = document.createElement("span");
        note.textContent = item.note;
        meta.appendChild(note);
      }
      if (meta.childNodes.length) body.appendChild(meta);

      var date = document.createElement("span");
      date.className = "l-bucket-date";
      date.textContent = item.done && item.doneAt ? formatShort(item.doneAt) + " 完成" : "待完成";

      row.appendChild(check);
      row.appendChild(body);
      row.appendChild(date);
      bucketList.appendChild(row);
    });
  }

  function scrollToCalendar() {
    var panel = $(".l-calendar-panel");
    if (!panel) return;
    var top = panel.getBoundingClientRect().top + window.pageYOffset - 82;
    try {
      window.scrollTo({ top: top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch (e) {
      window.scrollTo(0, top);
    }
  }

  function selectDate(iso, shouldScroll) {
    if (!splitISO(iso)) return;
    cal.selected = iso;
    var parts = splitISO(iso);
    cal.y = parts.y;
    cal.m = parts.m;
    renderCalendar();
    renderDay(iso);
    if (shouldScroll) scrollToCalendar();
  }

  /* ---------- 导出 .ics ---------- */

  function icsEscape(text) {
    return String(text == null ? "" : text)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function icsDate(iso) {
    return String(iso || "").replace(/-/g, "");
  }

  function icsFold(line) {
    var encoder = new TextEncoder();
    var text = String(line == null ? "" : line);
    if (encoder.encode(text).length <= 75) return text;

    var parts = [];
    var current = "";
    var limit = 75;
    var currentBytes = 0;
    for (var i = 0; i < text.length; i++) {
      var char = text.charAt(i);
      var code = text.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
        var next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          char += text.charAt(i + 1);
          i += 1;
        }
      }
      var charBytes = encoder.encode(char).length;
      if (currentBytes + charBytes > limit) {
        parts.push(current);
        current = char;
        currentBytes = charBytes;
        limit = 74;
      } else {
        current += char;
        currentBytes += charBytes;
      }
    }
    parts.push(current);
    return parts.map(function (part, index) {
      return index === 0 ? part : " " + part;
    }).join("\r\n");
  }

  function icsStamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function buildCalendar() {
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//xm9.asia//Love Story//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape(room.title || "鸡毛鸡和白小白"),
      "X-WR-TIMEZONE:" + icsEscape(TZ),
      "X-WR-CALDESC:" + icsEscape(room.subtitle || "")
    ];
    var stamp = icsStamp();

    events.forEach(function (event) {
      var occurrences = [];

      if (event.repeat === "yearly") {
        var date = String(event.date || "");
        var startYear = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : todayParts.y;
        var seeds = yearlySeed(event, startYear);
        while (!seeds.length && startYear < todayParts.y + 8) {
          startYear += 1;
          seeds = yearlySeed(event, startYear);
        }
        if (seeds.length) occurrences.push({ iso: seeds[0], recurring: true });
      } else if (event.repeat === "none") {
        if (splitISO(event.date)) occurrences.push({ iso: event.date, recurring: false });
      } else if (event.repeat === "dates") {
        (Array.isArray(event.dates) ? event.dates : []).forEach(function (date) {
          if (splitISO(date)) occurrences.push({ iso: date, recurring: false });
        });
      }

      occurrences.forEach(function (occurrence) {
        lines.push("BEGIN:VEVENT");
        lines.push("UID:" + icsEscape(String(event.id || "event") + "-" + icsDate(occurrence.iso) + "@xm9.asia"));
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART;VALUE=DATE:" + icsDate(occurrence.iso));
        lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(occurrence.iso, 1)));
        if (occurrence.recurring) lines.push("RRULE:FREQ=YEARLY");
        lines.push("SUMMARY:" + icsEscape(event.title || "重要日子"));

        var description = [];
        if (event.note) description.push(event.note);
        description.push("来自 " + (room.title || "鸡毛鸡和白小白"));
        lines.push("DESCRIPTION:" + icsEscape(description.join("\n")));
        lines.push("TRANSP:TRANSPARENT");
        lines.push("END:VEVENT");
      });
    });

    lines.push("END:VCALENDAR");
    return lines.map(icsFold).join("\r\n") + "\r\n";
  }

  function showExportHint(text) {
    if (!exportHint) return;
    exportHint.textContent = text;
    exportHint.hidden = false;
    window.clearTimeout(showExportHint.timer);
    showExportHint.timer = window.setTimeout(function () {
      exportHint.hidden = true;
    }, 3200);
  }

  function exportCalendar() {
    try {
      var text = buildCalendar();
      var blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "our-days.ics";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      showExportHint("日历文件已生成，可以导入手机日历了。");
    } catch (e) {
      showExportHint("导出没有成功，请换一个浏览器再试。");
    }
  }

  /* ---------- 事件绑定 ---------- */

  if (themeButton) themeButton.addEventListener("click", toggleTheme);
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

  if (calGrid) {
    calGrid.addEventListener("click", function (event) {
      var cell = event.target.closest(".l-cal-cell");
      if (cell && cell.getAttribute("data-date")) selectDate(cell.getAttribute("data-date"), false);
    });
  }

  var prevButton = $("[data-cal-prev]");
  if (prevButton) {
    prevButton.addEventListener("click", function () {
      cal.m -= 1;
      if (cal.m < 1) { cal.m = 12; cal.y -= 1; }
      renderCalendar();
    });
  }

  var nextButton = $("[data-cal-next]");
  if (nextButton) {
    nextButton.addEventListener("click", function () {
      cal.m += 1;
      if (cal.m > 12) { cal.m = 1; cal.y += 1; }
      renderCalendar();
    });
  }

  var todayButton = $("[data-cal-today]");
  if (todayButton) {
    todayButton.addEventListener("click", function () {
      selectDate(today, false);
    });
  }

  if (nextJump) {
    nextJump.addEventListener("click", function () {
      var iso = nextJump.getAttribute("data-date");
      if (iso) selectDate(iso, true);
    });
  }

  var highlightGrid = $("[data-love-highlight-grid]");
  if (highlightGrid) {
    highlightGrid.addEventListener("click", function (event) {
      var card = event.target.closest("[data-love-highlight]");
      var iso = card && card.getAttribute("data-date");
      if (iso) selectDate(iso, true);
    });
  }

  var exportButton = $("[data-love-export]");
  if (exportButton) exportButton.addEventListener("click", exportCalendar);

  /* ---------- 线上数据 ---------- */

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

  function loadPublicData() {
    if (typeof window.fetch !== "function") return;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, 8000);

    function finish() {
      window.clearTimeout(timer);
    }

    var bases = apiBases();

    function attempt(index) {
      return window.fetch(bases[index] + "/v1/public", {
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
        applyData(next);
        dataSource = "api";
        remoteLoaded = true;
        renderAll();
      }).catch(function (error) {
        if (index + 1 < bases.length) return attempt(index + 1);
        throw error;
      });
    }

    attempt(0).then(finish, function () {
      // 后端暂时连不上时，继续用页面里嵌的那一份，访客无感。
      finish();
    });
  }

  /* ---------- 启动 ---------- */

  function renderAll() {
    renderHero();
    renderTogether();
    renderNext();
    renderHighlights();
    renderCalendar();
    renderDay(cal.selected);
    renderEventList();
    renderBucket();
  }

  renderAll();
  loadPublicData();

  // 页面跨过零点时，把「今天」和倒计时一起翻页。
  window.setInterval(function () {
    var current = todayISO();
    if (current !== today) {
      today = current;
      var parts = splitISO(today);
      if (parts) {
        cal.y = parts.y;
        cal.m = parts.m;
        cal.selected = today;
      }
      renderAll();
    }
  }, 60000);
})();
