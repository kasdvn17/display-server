  /* ---------------- clock + date ---------------- */
  var clockFormatters = null,
    clockTimer = 0;
  function resetClockFormatters() {
    clockFormatters = {
      hour: new Intl.DateTimeFormat(frameLocale(), {
        timeZone: TIMEZONE,
        hour: "2-digit",
        hour12: false,
      }),
      minute: new Intl.DateTimeFormat(frameLocale(), {
        timeZone: TIMEZONE,
        minute: "2-digit",
      }),
      date: new Intl.DateTimeFormat(frameLocale(), {
        timeZone: TIMEZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      hour24: new Intl.DateTimeFormat(frameLocale(), {
        timeZone: TIMEZONE,
        hour: "numeric",
        hour12: false,
      }),
    };
  }
  function getParts() {
    var now = new Date();
    if (!clockFormatters) resetClockFormatters();
    var hourFmt = clockFormatters.hour;
    var hour = "12";
    var hp = hourFmt.formatToParts(now);
    for (var i = 0; i < hp.length; i++) {
      if (hp[i].type === "hour") hour = hp[i].value;
    }

    var minute = pad(parseInt(clockFormatters.minute.format(now), 10));

    var dateFmt = clockFormatters.date;
    var dp = dateFmt.formatToParts(now);
    var weekday = "",
      month = "",
      day = "";
    for (var j = 0; j < dp.length; j++) {
      if (dp[j].type === "weekday") weekday = dp[j].value;
      if (dp[j].type === "month") month = dp[j].value;
      if (dp[j].type === "day") day = dp[j].value;
    }
    var hourFmt24 = clockFormatters.hour24;
    var greetHour = parseInt(hourFmt24.format(now), 10);
    return {
      time: hour + ":" + minute,
      date: dateFmt.format(now).toUpperCase(),
      greetHour: greetHour,
    };
  }

  function greeting(h) {
    if (h < 5) return tr("GOOD_NIGHT", "Chúc ngủ ngon");
    if (h < 12) return tr("GOOD_MORNING", "Chào buổi sáng");
    if (h < 18) return tr("GOOD_AFTERNOON", "Chào buổi chiều");
    return tr("GOOD_EVENING", "Chào buổi tối");
  }

  function updateClock() {
    var p = getParts();
    var timeEl = document.getElementById("time");
    var dateEl = document.getElementById("date");
    if (timeEl) timeEl.textContent = p.time;
    if (idleTimeEl) idleTimeEl.textContent = p.time;
    if (dateEl) dateEl.textContent = p.date;
  }
  function scheduleClock() {
    clearTimeout(clockTimer);
    updateClock();
    clockTimer = setTimeout(scheduleClock, 60050 - (Date.now() % 60000));
  }

  frameBootstrapPromise.then(function () {
    resetClockFormatters();
    scheduleClock();
    initPhotoFrame();
  });
  window.addEventListener("frame:languagechange", function () {
    resetClockFormatters();
    updateClock();
  });
