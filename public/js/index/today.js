  /* ---------------- AMBIENT CONTEXT ----------------
     Weather + rain, air quality / UV, commute timing and a general ambient
     notification surface. The browser location is used only for live context;
     FRAME_LATITUDE / FRAME_LONGITUDE on the server are optional fallbacks.
  ------------------------------------------------------------------- */
  var ambientContextData = null;
  var ambientContextCoords = null;
  var ambientContextRefreshTimer = 0;
  var ambientNoticeTimer = 0;
  var ambientNoticeCycleTimer = 0;
  var ambientNoticeIndex = -1;
  var AMBIENT_CONTEXT_REFRESH_MS = 5 * 60 * 1000;
  var AMBIENT_NOTICE_DURATION_MS = 11000;
  var AMBIENT_NOTICE_CYCLE_MS = 36000;
  var homeWeather = document.getElementById("home-weather");
  var weatherTemp = document.getElementById("temp");
  var weatherDetail = document.getElementById("weather-detail");
  var contextMetrics = document.getElementById("home-context-metrics");
  var aqiMetric = document.getElementById("aqi-metric");
  var aqiValue = document.getElementById("aqi-value");
  var uvMetric = document.getElementById("uv-metric");
  var uvValue = document.getElementById("uv-value");
  var rainMetric = document.getElementById("rain-metric");
  var rainValue = document.getElementById("rain-value");
  var ambientNotice = document.getElementById("ambient-context-notice");
  var ambientNoticeKind = document.getElementById("ambient-notice-kind");
  var ambientNoticeTitle = document.getElementById("ambient-notice-title");
  var ambientNoticeBody = document.getElementById("ambient-notice-body");
  var ambientNoticeProgress = document.getElementById(
    "ambient-notice-progress",
  );
  var homeCalendarGlance = document.getElementById("home-calendar-glance");
  var homeCalendarTitle = document.getElementById("home-calendar-title");
  var homeCalendarTime = document.getElementById("home-calendar-time");
  var morningBrief = document.getElementById("morning-brief");
  var morningWeather = document.getElementById("morning-weather");
  var morningWeatherSub = document.getElementById("morning-weather-sub");
  var morningEvent = document.getElementById("morning-event");
  var morningEventSub = document.getElementById("morning-event-sub");
  var morningCommute = document.getElementById("morning-commute");
  var morningCommuteSub = document.getElementById("morning-commute-sub");
  var morningBriefDismiss = document.getElementById("morning-brief-dismiss");
  var morningBriefTimer = 0;
  var routineGrid = document.getElementById("routine-grid");
  var notificationList = document.getElementById("notification-list");
  var notificationReadAll = document.getElementById("notification-read-all");
  var todayRefreshButton = document.getElementById("today-refresh-btn");
  var todayTabBadge = document.getElementById("today-tab-badge");
  var todayDataLoading = false;

  function frameCoordinateQuery() {
    if (
      !ambientContextCoords ||
      !isFinite(ambientContextCoords.latitude) ||
      !isFinite(ambientContextCoords.longitude)
    )
      return "";
    return (
      "?lat=" +
      encodeURIComponent(ambientContextCoords.latitude) +
      "&lon=" +
      encodeURIComponent(ambientContextCoords.longitude)
    );
  }

  function frameCoordinateBody() {
    return ambientContextCoords
      ? {
          latitude: ambientContextCoords.latitude,
          longitude: ambientContextCoords.longitude,
        }
      : {};
  }

  function todayJson(url, options) {
    options = options || {};
    var init = {
      method: options.method || "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body || {});
    }
    return fetchFrameJson(url, init, 25000);
  }

  function frameIconSvg(name) {
    name = String(name || "info").toLowerCase();
    var body = "";
    if (name === "rain" || name === "weather")
      body =
        '<path d="M7 16.5h9.1a3.9 3.9 0 0 0 .5-7.77A5.2 5.2 0 0 0 6.7 10.2 3.2 3.2 0 0 0 7 16.5Z"/><path d="m9 19-1 2m5-2-1 2m5-2-1 2"/>';
    else if (name === "air" || name === "wind")
      body =
        '<path d="M4 8h10.5a2.5 2.5 0 1 0-2.3-3.5M4 12h15a2 2 0 1 1-1.7 3M4 16h7"/>';
    else if (name === "uv" || name === "sun")
      body =
        '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4m0-13.4-1.4 1.4M6.7 17.3l-1.4 1.4"/>';
    else if (name === "calendar")
      body =
        '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h3"/>';
    else if (name === "commute" || name === "route")
      body =
        '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3"/>';
    else if (name === "spotify" || name === "music")
      body =
        '<path d="M9 18V6l10-2v11"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="15" r="3"/>';
    else if (name === "alarm")
      body =
        '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 1.5M5.5 4.5 3.5 7M18.5 4.5l2 2.5"/>';
    else if (name === "moon")
      body = '<path d="M20 15.1A8 8 0 0 1 8.9 4 8.1 8.1 0 1 0 20 15.1Z"/>';
    else if (name === "error")
      body =
        '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3v.1"/>';
    else
      body =
        '<path d="M6 9a6 6 0 0 1 12 0v3.5c0 1.5.6 2.8 1.7 3.8H4.3A5.4 5.4 0 0 0 6 12.5V9Z"/><path d="M9.5 19a2.7 2.7 0 0 0 5 0"/>';
    return (
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      body +
      "</g></svg>"
    );
  }

  function notificationGlyph(type) {
    return frameIconSvg(type || "info");
  }

  function updateNotificationBadge(count) {
    count = Math.max(0, Number(count) || 0);
    if (!todayTabBadge) return;
    todayTabBadge.textContent = count > 99 ? "99+" : String(count || "");
    todayTabBadge.classList.toggle("show", count > 0);
  }

  function renderNotifications(payload) {
    var items = payload && Array.isArray(payload.items) ? payload.items : [];
    updateNotificationBadge(payload && payload.unreadCount);
    if (!notificationList) return;
    if (!items.length) {
      notificationList.innerHTML =
        '<div class="today-empty">Không có thông báo mới.</div>';
      return;
    }
    notificationList.innerHTML = items
      .map(function (item) {
        var id = escVoice(item.id || "");
        return (
          '<article class="notification-item' +
          (item.readAt ? "" : " unread") +
          '" data-notification-id="' +
          id +
          '" data-notification-action="' +
          escVoice(item.action || "") +
          '"><div class="notification-icon" aria-hidden="true">' +
          notificationGlyph(item.icon || item.type) +
          '</div><div class="notification-copy"><strong>' +
          escVoice(item.title || "Thông báo") +
          "</strong><span>" +
          escVoice(item.body || "") +
          '</span></div><button class="notification-dismiss" type="button" data-dismiss-notification="' +
          id +
          '" aria-label="Ẩn thông báo">×</button></article>'
        );
      })
      .join("");
    notificationList
      .querySelectorAll("[data-notification-id]")
      .forEach(function (row) {
        row.addEventListener("click", function (event) {
          if (event.target.closest("[data-dismiss-notification]")) return;
          var action = row.getAttribute("data-notification-action");
          if (action === "open-media") switchView("media");
          else if (action === "open-alarms") switchView("alarm");
          else if (action === "retry-context") refreshAmbientContext();
          if (row.classList.contains("unread"))
            todayJson(
              "/notifications/" +
                encodeURIComponent(row.getAttribute("data-notification-id")) +
                "/read",
              { method: "PUT", body: {} },
            ).then(loadNotifications).catch(function () {});
        });
      });
    notificationList
      .querySelectorAll("[data-dismiss-notification]")
      .forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          todayJson(
            "/notifications/" +
              encodeURIComponent(
                button.getAttribute("data-dismiss-notification"),
              ),
            { method: "DELETE" },
          ).then(loadNotifications).catch(function () {});
        });
      });
  }

  function loadNotifications() {
    return todayJson("/notifications")
      .then(function (payload) {
        renderNotifications(payload);
        return payload;
      })
      .catch(function () {
        if (notificationList)
          notificationList.innerHTML =
            '<div class="today-empty">Không thể tải thông báo.</div>';
        return null;
      });
  }

  function routineGlyph(icon) {
    return frameIconSvg(icon || "info");
  }

  function renderRoutines(payload) {
    if (!routineGrid) return;
    var items = payload && Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      routineGrid.innerHTML =
        '<div class="today-empty">Không có routine khả dụng.</div>';
      return;
    }
    routineGrid.innerHTML = items
      .map(function (item) {
        return (
          '<button class="routine-card' +
          (item.suggested ? " suggested" : "") +
          '" type="button" data-routine-id="' +
          escVoice(item.id || "") +
          '"><span class="routine-card-icon" aria-hidden="true">' +
          routineGlyph(item.icon) +
          "</span>" +
          (item.suggested
            ? '<span class="routine-suggested">Suggested</span>'
            : "") +
          "<strong>" +
          escVoice(item.name || "Thói quen") +
          "</strong><p>" +
          escVoice(item.description || "") +
          "</p></button>"
        );
      })
      .join("");
    routineGrid.querySelectorAll("[data-routine-id]").forEach(function (card) {
      card.addEventListener("click", function () {
        runRoutine(card.getAttribute("data-routine-id"), card);
      });
    });
  }

  function loadRoutines() {
    return todayJson("/routines" + frameCoordinateQuery())
      .then(function (payload) {
        renderRoutines(payload);
        return payload;
      })
      .catch(function () {
        if (routineGrid)
          routineGrid.innerHTML =
            '<div class="today-empty">Không thể tải routine.</div>';
        return null;
      });
  }

  function runRoutine(id, card) {
    if (!id || (card && card.disabled)) return;
    if (card) card.disabled = true;
    todayJson("/routines/" + encodeURIComponent(id) + "/run", {
      method: "POST",
      body: frameCoordinateBody(),
    })
      .then(function (result) {
        if (!result || !result.display) throw new Error("Thói quen không có nội dung");
        showVoiceShell();
        setVoiceState(
          "idle",
          "Thói quen hoàn tất",
          result.display.title || "Đã chuẩn bị thông tin",
          "Nhấn × để quay lại Hôm nay",
        );
        showAssistantPage(result.display);
      })
      .catch(function (err) {
        pushClientNotification(
          "client:routine:" + id,
          "Không thể hoàn tất thói quen",
          (err && err.message) || "Lỗi không xác định",
        );
        if (notificationList)
          loadNotifications();
      })
      .then(function () {
        if (card) card.disabled = false;
      });
  }

  function loadMorningBriefing(automatic) {
    return todayJson("/briefing/morning" + frameCoordinateQuery())
      .then(function (payload) {
        if (!automatic || !payload || !payload.autoShow) return payload;
        if (typeof currentView !== "undefined" && currentView !== "home")
          return payload;
        if (renderMorningBrief(payload.context)) {
          todayJson("/briefing/morning/presented", {
            method: "POST",
            body: {},
          }).catch(function () {});
        }
        return payload;
      })
      .catch(function () {
        return null;
      });
  }

  function refreshTodayData() {
    if (todayDataLoading) return;
    todayDataLoading = true;
    if (todayRefreshButton) todayRefreshButton.disabled = true;
    Promise.all([loadRoutines(), loadNotifications()]).then(function () {
      todayDataLoading = false;
      if (todayRefreshButton) todayRefreshButton.disabled = false;
    });
  }

  function pushClientNotification(id, title, body) {
    return todayJson("/notifications", {
      method: "POST",
      body: {
        id: id,
        type: "error",
        priority: 72,
        title: title,
        body: body,
        icon: "error",
      },
    }).catch(function () {});
  }

  if (todayRefreshButton)
    todayRefreshButton.addEventListener("click", refreshTodayData);
  if (notificationReadAll)
    notificationReadAll.addEventListener("click", function () {
      todayJson("/notifications/read-all", { method: "PUT", body: {} })
        .then(loadNotifications)
        .catch(function () {});
    });

  function contextMetricLevel(kind, value) {
    value = Number(value);
    if (kind === "aqi")
      return value >= 151 ? "bad" : value >= 101 ? "warn" : "";
    if (kind === "uv") return value >= 8 ? "bad" : value >= 6 ? "warn" : "";
    if (kind === "rain") return value >= 75 ? "bad" : value >= 55 ? "warn" : "";
    return "";
  }
  function setMetricLevel(el, level) {
    if (el) el.setAttribute("data-level", level || "");
  }
  function renderAmbientContext(data) {
    ambientContextData = data || null;
    if (!data || !data.configured) {
      if (contextMetrics) contextMetrics.classList.remove("show");
      if (weatherTemp) weatherTemp.textContent = "--°";
      if (weatherDetail) weatherDetail.textContent = "Cần vị trí";
      return;
    }
    var w = data.weather || {},
      air = data.air || {};
    if (weatherTemp)
      weatherTemp.textContent =
        w.temperature == null ? "--°" : Math.round(Number(w.temperature)) + "°";
    var detail = w.label || "Thời tiết";
    if (w.rainStartMinutes != null && Number(w.rainStartMinutes) <= 180)
      detail +=
        " · rain " +
        (Number(w.rainStartMinutes) <= 5
          ? "ngay bây giờ"
          : "sau " + Math.max(1, Math.round(Number(w.rainStartMinutes))) + " phút");
    else if (Number(w.maxRainChanceNext3h || 0) >= 40)
      detail += " · " + Math.round(Number(w.maxRainChanceNext3h)) + "% khả năng mưa";
    if (weatherDetail) weatherDetail.textContent = detail;
    if (aqiValue)
      aqiValue.textContent =
        air.aqi == null ? "--" : Math.round(Number(air.aqi));
    if (uvValue)
      uvValue.textContent =
        air.maxUvNext12h == null ? "--" : Math.round(Number(air.maxUvNext12h));
    if (rainValue)
      rainValue.textContent =
        Math.round(Number(w.maxRainChanceNext3h || 0)) + "%";
    setMetricLevel(aqiMetric, contextMetricLevel("aqi", air.aqi));
    setMetricLevel(uvMetric, contextMetricLevel("uv", air.maxUvNext12h));
    setMetricLevel(
      rainMetric,
      contextMetricLevel("rain", w.maxRainChanceNext3h),
    );
    if (contextMetrics) contextMetrics.classList.add("show");
    var events =
      data.calendar && Array.isArray(data.calendar.events)
        ? data.calendar.events
        : [];
    var nowTs = Date.now();
    var nextEv = events.find(function (ev) {
      var t = new Date(ev.start).getTime();
      return isFinite(t) && t >= nowTs - 5 * 60000;
    });
    if (nextEv && homeCalendarGlance) {
      homeCalendarGlance.classList.add("show");
      homeCalendarGlance._event = nextEv;
      if (homeCalendarTitle)
        homeCalendarTitle.textContent = nextEv.title || "Sự kiện tiếp theo";
      if (homeCalendarTime)
        homeCalendarTime.textContent = formatBriefEventTime(nextEv.start);
    } else if (homeCalendarGlance) {
      homeCalendarGlance.classList.remove("show");
      homeCalendarGlance._event = null;
    }
  }
  function ambientNotificationKind(type) {
    if (type === "commute") return "Commute";
    if (type === "weather") return "Cảnh báo thời tiết";
    if (type === "air") return "Chất lượng không khí";
    if (type === "uv") return "Cảnh báo UV";
    if (type === "calendar") return "Lịch";
    return "Cập nhật xung quanh";
  }
  function hideAmbientNotice() {
    clearTimeout(ambientNoticeTimer);
    ambientNoticeTimer = 0;
    if (ambientNotice) ambientNotice.classList.remove("show");
  }
  function showAmbientNotice(item, duration) {
    if (!item || !ambientNotice) return false;
    if (typeof currentView !== "undefined" && currentView !== "home")
      return false;
    if (idleActive) return false;
    var news = document.getElementById("news-ambient");
    if (news && news.classList.contains("show")) return false;
    ambientNotice.setAttribute("data-type", item.type || "update");
    if (ambientNoticeKind)
      ambientNoticeKind.textContent = ambientNotificationKind(item.type);
    if (ambientNoticeTitle)
      ambientNoticeTitle.textContent = item.title || "Cập nhật xung quanh";
    if (ambientNoticeBody) ambientNoticeBody.textContent = item.body || "";
    ambientNotice.classList.add("show");
    if (ambientNoticeProgress) {
      ambientNoticeProgress.style.transition = "none";
      ambientNoticeProgress.style.webkitTransition = "none";
      ambientNoticeProgress.style.transform = "scaleX(1)";
      ambientNoticeProgress.style.webkitTransform = "scaleX(1)";
      setTimeout(function () {
        if (!ambientNoticeProgress) return;
        ambientNoticeProgress.style.transition =
          "transform " +
          Math.round(((duration || AMBIENT_NOTICE_DURATION_MS) / 1000) * 100) /
            100 +
          "s linear";
        ambientNoticeProgress.style.webkitTransition =
          "-webkit-transform " +
          Math.round(((duration || AMBIENT_NOTICE_DURATION_MS) / 1000) * 100) /
            100 +
          "s linear";
        ambientNoticeProgress.style.transform = "scaleX(0)";
        ambientNoticeProgress.style.webkitTransform = "scaleX(0)";
      }, 40);
    }
    clearTimeout(ambientNoticeTimer);
    ambientNoticeTimer = setTimeout(
      hideAmbientNotice,
      duration || AMBIENT_NOTICE_DURATION_MS,
    );
    return true;
  }
  function cycleAmbientNotice() {
    var list =
      ambientContextData && Array.isArray(ambientContextData.notifications)
        ? ambientContextData.notifications
        : [];
    if (!list.length) return;
    ambientNoticeIndex = (ambientNoticeIndex + 1) % list.length;
    showAmbientNotice(list[ambientNoticeIndex], AMBIENT_NOTICE_DURATION_MS);
  }
  function manualAmbientSummary() {
    if (!ambientContextData || !ambientContextData.configured) return;
    var w = ambientContextData.weather || {},
      a = ambientContextData.air || {};
    var body = [];
    if (w.label)
      body.push(
        w.label +
          (w.apparentTemperature != null
            ? " · feels " + Math.round(Number(w.apparentTemperature)) + "°"
            : ""),
      );
    if (a.aqi != null)
      body.push(
        "AQI " +
          Math.round(Number(a.aqi)) +
          (a.aqiLabel ? " " + String(a.aqiLabel).toLowerCase() : ""),
      );
    if (a.maxUvNext12h != null)
      body.push("UV peak " + Math.round(Number(a.maxUvNext12h)));
    showAmbientNotice(
      {
        type: "weather",
        title:
          w.temperature == null
            ? "Thời tiết"
            : Math.round(Number(w.temperature)) +
              "° · " +
              (w.label || "Thời tiết"),
        body: body.join(" · "),
      },
      AMBIENT_NOTICE_DURATION_MS,
    );
  }
  function ambientContextUrl(coords) {
    var u = "/ambient/context?ts=" + Date.now();
    if (coords && isFinite(coords.latitude) && isFinite(coords.longitude))
      u +=
        "&lat=" +
        encodeURIComponent(coords.latitude) +
        "&lon=" +
        encodeURIComponent(coords.longitude);
    return u;
  }
  function fetchAmbientContext(coords) {
    return fetchFrameJson(
      ambientContextUrl(coords),
      { cache: "no-store" },
      25000,
    ).then(function (data) {
      renderAmbientContext(data);
      return data;
    });
  }
  function refreshAmbientContext() {
    if (ambientContextCoords)
      return fetchAmbientContext(ambientContextCoords).catch(function () {});
    if (navigator.geolocation) {
      return new Promise(function (resolve) {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            ambientContextCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            fetchAmbientContext(ambientContextCoords)
              .then(resolve)
              .catch(function () {
                fetchAmbientContext(null)
                  .then(resolve)
                  .catch(function () {
                    resolve(null);
                  });
              });
          },
          function () {
            fetchAmbientContext(null)
              .then(resolve)
              .catch(function () {
                resolve(null);
              });
          },
          {
            enableHighAccuracy: false,
            maximumAge: 30 * 60 * 1000,
            timeout: 7000,
          },
        );
      });
    }
    return fetchAmbientContext(null).catch(function () {
      return null;
    });
  }
  function initAmbientContext() {
    refreshAmbientContext().then(function () {
      setTimeout(cycleAmbientNotice, 2200);
      loadMorningBriefing(true);
      refreshTodayData();
    });
    clearInterval(ambientContextRefreshTimer);
    ambientContextRefreshTimer = setInterval(
      function () {
        refreshAmbientContext().then(function () {
          loadMorningBriefing(true);
          loadNotifications();
        });
      },
      AMBIENT_CONTEXT_REFRESH_MS,
    );
    clearInterval(ambientNoticeCycleTimer);
    ambientNoticeCycleTimer = setInterval(
      cycleAmbientNotice,
      AMBIENT_NOTICE_CYCLE_MS,
    );
  }
  function formatBriefEventTime(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TIMEZONE,
      }).format(d);
    } catch (_) {
      return d.toLocaleTimeString();
    }
  }
  function hideMorningBrief() {
    clearTimeout(morningBriefTimer);
    morningBriefTimer = 0;
    if (morningBrief) {
      morningBrief.classList.remove("show");
      morningBrief.setAttribute("aria-hidden", "true");
    }
  }
  function renderMorningBrief(data) {
    if (!data || !data.configured || !morningBrief) return false;
    var w = data.weather || {},
      a = data.air || {},
      calendar = data.calendar || {},
      events = calendar.events || [],
      commutes = data.commutes || [];
    if (morningWeather)
      morningWeather.textContent =
        (w.temperature == null
          ? "--°"
          : Math.round(Number(w.temperature)) + "°") +
        (w.label ? " · " + w.label : "");
    var weatherBits = [];
    if (w.rainStartMinutes != null)
      weatherBits.push(
        Number(w.rainStartMinutes) <= 5
          ? "Trời bắt đầu mưa"
          : "Mưa sau " +
              Math.max(1, Math.round(Number(w.rainStartMinutes))) +
              " min",
      );
    else if (w.maxRainChanceNext3h != null)
      weatherBits.push(Math.round(Number(w.maxRainChanceNext3h)) + "% rain");
    if (a.aqi != null) weatherBits.push("AQI " + Math.round(Number(a.aqi)));
    if (a.maxUvNext12h != null)
      weatherBits.push("UV " + Math.round(Number(a.maxUvNext12h)));
    if (morningWeatherSub)
      morningWeatherSub.textContent =
        weatherBits.join(" · ") || "Thời tiết ổn định";
    var now = Date.now(),
      ev =
        events.find(function (x) {
          var t = new Date(x.start).getTime();
          return isFinite(t) && t >= now - 5 * 60000;
        }) || events[0];
    if (ev) {
      if (morningEvent) morningEvent.textContent = ev.title || "Sự kiện lịch";
      if (morningEventSub)
        morningEventSub.textContent =
          formatBriefEventTime(ev.start) +
          (ev.location ? " · " + ev.location : "");
    } else {
      if (morningEvent)
        morningEvent.textContent = calendar.configured
          ? "Không có sự kiện sắp tới"
          : "Chưa cấu hình lịch";
      if (morningEventSub)
        morningEventSub.textContent = calendar.configured
          ? "Không có việc sắp tới"
          : "Add FRAME_CALENDAR_ICS_URL";
    }
    var c = commutes.slice().sort(function (x, y) {
      return Number(x.leaveInMinutes) - Number(y.leaveInMinutes);
    })[0];
    if (c) {
      var leave = Number(c.leaveInMinutes);
      if (morningCommute)
        morningCommute.textContent =
          leave <= 0 ? "Đi ngay" : "Đi sau " + leave + " phút";
      if (morningCommuteSub)
        morningCommuteSub.textContent =
          (c.eventTitle || c.name || "Destination") +
          " · " +
          Math.round(Number(c.durationMinutes) || 0) +
          " min" +
          (c.distanceKm != null ? " · " + c.distanceKm + " km" : "");
    } else {
      if (morningCommute) morningCommute.textContent = "Không có chuyến đi sắp tới";
      if (morningCommuteSub)
        morningCommuteSub.textContent = "Hiện chưa có việc cần đi";
    }
    hideAmbientNotice();
    hideNews();
    morningBrief.classList.add("show");
    morningBrief.setAttribute("aria-hidden", "false");
    clearTimeout(morningBriefTimer);
    morningBriefTimer = setTimeout(hideMorningBrief, 26000);
    return true;
  }
  function showMorningBrief() {
    exitIdle(false);
    if (typeof switchView === "function") switchView("home");
    if (ambientContextData && ambientContextData.configured) {
      renderMorningBrief(ambientContextData);
      return;
    }
    refreshAmbientContext().then(function (data) {
      if (data) renderMorningBrief(data);
    });
  }
  if (morningBriefDismiss)
    morningBriefDismiss.addEventListener("click", function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      hideMorningBrief();
      todayJson("/briefing/morning/dismiss", {
        method: "POST",
        body: {},
      }).catch(function () {});
    });

  if (homeWeather)
    homeWeather.addEventListener("click", function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      manualAmbientSummary();
    });
  if (homeCalendarGlance)
    homeCalendarGlance.addEventListener("click", function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var ev = homeCalendarGlance._event;
      if (!ev) return;
      var body = [];
      if (ev.start) body.push(formatBriefEventTime(ev.start));
      if (ev.location) body.push(ev.location);
      var c =
        ambientContextData && Array.isArray(ambientContextData.commutes)
          ? ambientContextData.commutes.find(function (x) {
              return x.eventId && String(x.eventId) === String(ev.id);
            })
          : null;
      if (c)
        body.push(
          Number(c.leaveInMinutes) <= 0
            ? "Đi ngay"
            : "Đi sau " + c.leaveInMinutes + " phút",
        );
      showAmbientNotice(
        {
          type: "calendar",
          title: ev.title || "Sự kiện tiếp theo",
          body: body.join(" · "),
        },
        AMBIENT_NOTICE_DURATION_MS,
      );
    });
