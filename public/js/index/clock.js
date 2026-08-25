  /* ---------------- clock + date ---------------- */
  var clockFormatters = null,
    clockTimer = 0;
  function resetClockFormatters() {
    clockFormatters = {
      clock: new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      date: new Intl.DateTimeFormat(frameLocale(), {
        timeZone: TIMEZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };
  }
  function getParts() {
    var now = frameNow();
    if (!clockFormatters) resetClockFormatters();
    var hour = 0,
      minute = "00",
      dayPeriod = "";
    var hp = clockFormatters.clock.formatToParts(now);
    for (var i = 0; i < hp.length; i++) {
      if (hp[i].type === "hour") hour = parseInt(hp[i].value, 10) || 0;
      if (hp[i].type === "minute") minute = pad(parseInt(hp[i].value, 10));
      if (hp[i].type === "dayPeriod") dayPeriod = hp[i].value.toUpperCase();
    }
    if (dayPeriod === "PM" && hour < 12) hour += 12;
    if (dayPeriod === "AM" && hour === 12) hour = 0;

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
    return {
      time: pad(hour) + ":" + minute,
      date: dateFmt.format(now).toUpperCase(),
      greetHour: hour,
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
    clockTimer = setTimeout(
      scheduleClock,
      60050 - (frameNow().getTime() % 60000),
    );
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
