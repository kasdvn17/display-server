(function () {
  "use strict";

  function remoteT(key, fallback, variables) {
    return window.FrameI18n
      ? window.FrameI18n.t(key, fallback, variables)
      : String(fallback || key);
  }

  function remoteLocale() {
    return window.FrameI18n && window.FrameI18n.language === "vi"
      ? "vi-VN"
      : "en-US";
  }

  var REMOTE_REFRESH_INTERVAL_MS = 5000,
    REMOTE_TOAST_DURATION_MS = 1900,
    REMOTE_DEFAULT_ALARM_OFFSET_MINUTES = 5;

  fetch("/frame/bootstrap", { cache: "no-store" })
    .then(function (response) {
      return response.ok ? response.json() : {};
    })
    .then(function (data) {
      var variables = (data && data.themeVariables) || {},
        timing = (data && data.timing) || {};
      Object.keys(variables).forEach(function (key) {
        if (/^--theme-/.test(key))
          document.documentElement.style.setProperty(key, String(variables[key]));
      });
      if (isFinite(Number(timing.remoteRefreshIntervalMs)))
        REMOTE_REFRESH_INTERVAL_MS = Number(timing.remoteRefreshIntervalMs);
      if (isFinite(Number(timing.remoteToastDurationMs)))
        REMOTE_TOAST_DURATION_MS = Number(timing.remoteToastDurationMs);
      if (isFinite(Number(timing.remoteDefaultAlarmOffsetMinutes)))
        REMOTE_DEFAULT_ALARM_OFFSET_MINUTES = Number(
          timing.remoteDefaultAlarmOffsetMinutes,
        );
      scheduleRemoteRefresh();
    })
    .catch(function () {});

  function byId(id) {
    return document.getElementById(id);
  }

  var tokenInput = byId("token"),
    connectButton = byId("connect"),
    statusElement = byId("status"),
    authCard = byId("auth-card"),
    controls = byId("controls"),
    alarmsElement = byId("alarms"),
    alarmCount = byId("count"),
    lastCommand = byId("last"),
    dismissAlarmButton = byId("dismiss"),
    addAlarmButton = byId("add"),
    modalBackdrop = byId("modal-bg"),
    alarmForm = byId("form"),
    timeInput = byId("time"),
    labelInput = byId("label"),
    daysElement = byId("days"),
    confirmationsElement = byId("confirms"),
    cancelButton = byId("cancel"),
    toastElement = byId("toast"),
    frameDot = byId("frame-dot"),
    frameOnline = byId("frame-online"),
    frameView = byId("frame-view"),
    frameAssistant = byId("frame-assistant"),
    framePage = byId("frame-page"),
    frameCamera = byId("frame-camera"),
    frameSeen = byId("frame-seen"),
    routinesElement = byId("routines"),
    notificationsElement = byId("notifications"),
    diagnosticsElement = byId("diagnostics"),
    diagnosticSummary = byId("diagnostic-summary"),
    readAllButton = byId("read-all"),
    composeForm = byId("compose-form"),
    composeMode = byId("compose-mode"),
    messageTitle = byId("message-title"),
    messageText = byId("message-text"),
    messageSend = byId("message-send");

  var token = "",
    confirmCount = 1,
    repeatDays = [],
    sendMode = "message",
    refreshTimer = 0,
    toastTimer = 0;

  try {
    token = localStorage.getItem("nestFrameRemoteToken") || "";
  } catch (_) {}
  tokenInput.value = token;

  function setStatus(text, kind) {
    statusElement.textContent = text;
    statusElement.className = "status" + (kind ? " " + kind : "");
  }

  function toast(text) {
    toastElement.textContent = text;
    toastElement.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastElement.classList.remove("show");
    }, REMOTE_TOAST_DURATION_MS);
  }

  function api(method, body) {
    return fetch("/remote/control", {
      method: method,
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (_) {
          data = { error: text };
        }
        if (!response.ok) {
          var error = new Error(data.error || remoteT("HTTP_ERROR", "HTTP error {STATUS}", { STATUS: response.status }));
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function command(body, successMessage) {
    return api("POST", body)
      .then(function (result) {
        if (successMessage) toast(successMessage);
        return refresh().then(function () {
          return result;
        });
      })
      .catch(function (error) {
        toast(error.message || remoteT("COMMAND_SEND_FAILED", "Unable to send command"));
        throw error;
      });
  }

  function relativeTime(value) {
    var stamp = new Date(value).getTime();
    if (!Number.isFinite(stamp)) return remoteT("NO_DATA_YET", "No data yet");
    var seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
    if (seconds < 10) return remoteT("JUST_NOW", "Just now");
    if (seconds < 60) return remoteT("SECONDS_AGO", "{COUNT} seconds ago", { COUNT: seconds });
    if (seconds < 3600) return remoteT("MINUTES_AGO", "{COUNT} minutes ago", { COUNT: Math.floor(seconds / 60) });
    return new Date(stamp).toLocaleString(remoteLocale(), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  function readableState(value) {
    var labels = {
      home: remoteT("HOME_PAGE", "Home"), today: remoteT("TODAY_PAGE", "Today"), media: remoteT("MEDIA_PAGE", "Media"), news: remoteT("NEWS_PAGE", "News"),
      alarm: remoteT("ALARMS_PAGE", "Alarms"), call: remoteT("CAMERA_CALL", "Camera call"), idle: remoteT("IDLE_MODE", "Idle mode"),
      listening: remoteT("LISTENING", "Listening"), thinking: remoteT("PROCESSING", "Processing"), speaking: remoteT("RESPONDING", "Responding"),
      ready: remoteT("SPOTIFY_READY", "Ready"), setup: remoteT("NOT_ENABLED", "Not enabled"), live: remoteT("LIVE", "Live"),
      connecting: remoteT("CONNECTING", "Connecting"), error: remoteT("HAS_ERROR", "Error"),
    };
    return labels[value] || String(value || "-");
  }

  function readableAction(value) {
    var labels = {
      navigate: remoteT("ACTION_NAVIGATE", "switch tab"),
      close_page: remoteT("ACTION_CLOSE_PAGE", "close page"),
      back: remoteT("ACTION_GO_BACK", "go back"),
      idle: remoteT("ACTION_IDLE", "open idle mode"),
      reload: remoteT("ACTION_RELOAD", "reload display"),
      stop_assistant: remoteT("ACTION_STOP_ASSISTANT", "stop assistant"),
      run_routine: remoteT("ACTION_RUN_ROUTINE", "run routine"),
      show_message: remoteT("ACTION_SHOW_MESSAGE", "show notification"),
      assistant_query: remoteT("ACTION_ASK_GEMINI", "ask Gemini"),
      retry_context: remoteT("ACTION_RETRY_CONTEXT", "retry ambient context"),
      retry_calendar: remoteT("ACTION_RETRY_CALENDAR", "retry calendar"),
      retry_camera: remoteT("ACTION_RETRY_CAMERA", "retry camera"),
      add_alarm: remoteT("ACTION_ADD_ALARM", "add alarm"),
      enable_alarm: remoteT("ACTION_ENABLE_ALARM", "enable alarm"),
      disable_alarm: remoteT("ACTION_DISABLE_ALARM", "disable alarm"),
      delete_alarm: remoteT("ACTION_DELETE_ALARM", "delete alarm"),
      dismiss_alarm: remoteT("ACTION_DISMISS_ALARM", "dismiss alarm"),
    };
    return labels[value] || String(value || "").replace(/_/g, " ");
  }

  function renderStatus(status) {
    status = status || {};
    var frame = status.frame || {};
    frameDot.classList.toggle("online", !!status.online);
    frameOnline.textContent = status.online ? remoteT("ONLINE", "Online") : remoteT("OFFLINE", "Offline");
    frameView.textContent = frame.idle ? remoteT("IDLE_MODE", "Idle mode") : readableState(frame.view);
    frameAssistant.textContent = frame.assistantBusy
      ? readableState(frame.assistantState)
      : remoteT("SPOTIFY_READY", "Ready");
    framePage.textContent = frame.pageOpen ? frame.pageTitle || remoteT("OPEN", "Open") : remoteT("NOT_OPEN", "Not open");
    frameCamera.textContent = readableState(frame.cameraState);
    frameSeen.textContent = status.lastSeen
      ? remoteT("STATUS_SIGNAL_TIME", "Status signal {TIME}", { TIME: relativeTime(status.lastSeen) })
      : remoteT("NO_STATUS_SIGNAL", "No status signal received");
  }

  function renderRoutines(items) {
    routinesElement.innerHTML = "";
    (items || []).forEach(function (routine) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "routine-command" + (routine.suggested ? " suggested" : "");
      button.innerHTML =
        "<strong>" + escapeHtml(routine.name || remoteT("ROUTINE", "Routine")) + "</strong><span>" +
        escapeHtml(routine.description || "") + "</span>";
      button.onclick = function () {
        button.disabled = true;
        command(
          { action: "run_routine", routineId: routine.id },
          remoteT("ROUTINE_RAN", "Ran {NAME}", { NAME: routine.name || remoteT("ROUTINE", "routine") }),
        )
          .catch(function () {})
          .then(function () { button.disabled = false; });
      };
      routinesElement.appendChild(button);
    });
  }

  function renderNotifications(payload) {
    var items = (payload && payload.items) || [];
    notificationsElement.innerHTML = "";
    if (!items.length) {
      notificationsElement.innerHTML = '<div class="card empty">' + escapeHtml(remoteT("NO_NOTIFICATIONS", "No notifications")) + '</div>';
      return;
    }
    items.slice(0, 20).forEach(function (item) {
      var row = document.createElement("article");
      row.className = "card notification" + (item.readAt ? "" : " unread");
      row.innerHTML =
        '<span class="notification-mark"></span><div class="notification-copy"><strong>' +
        escapeHtml(item.title || remoteT("NOTIFICATIONS", "Notification")) + "</strong><p>" + escapeHtml(item.body || "") +
        "</p><small>" + relativeTime(item.updatedAt || item.createdAt) +
        '</small></div><button type="button" class="notification-close" aria-label="' + escapeHtml(remoteT("DISMISS_NOTIFICATION", "Dismiss notification")) + '">×</button>';
      row.querySelector("button").onclick = function () {
        command({ action: "dismiss_notification", id: item.id }, remoteT("NOTIFICATION_DISMISSED", "Notification dismissed"))
          .catch(function () {});
      };
      notificationsElement.appendChild(row);
    });
  }

  function diagnosticRow(label, service, retryAction) {
    var configured = !!service.configured;
    var error = String(service.lastError || "");
    var state = !configured ? remoteT("NOT_CONFIGURED", "Not configured") : error ? remoteT("HAS_ERROR", "Error") : remoteT("WORKING", "Working");
    var detail = error || (service.lastSuccess ? remoteT("UPDATED_TIME", "Updated {TIME}", { TIME: relativeTime(service.lastSuccess) }) : remoteT("WAITING_FOR_DATA", "Waiting for data"));
    return '<article class="card diagnostic ' + (error ? "has-error" : "") + '">' +
      '<div><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(state) +
      '</span><small>' + escapeHtml(detail) + '</small></div>' +
      (retryAction ? '<button class="btn ghost" type="button" data-retry="' + retryAction + '">' + escapeHtml(remoteT("RETRY", "Retry")) + '</button>' : "") +
      "</article>";
  }

  function renderDiagnostics(services) {
    services = services || {};
    var errorCount = Object.keys(services).filter(function (key) {
      return services[key] && services[key].lastError;
    }).length;
    diagnosticSummary.textContent = errorCount ? remoteT("ERROR_COUNT", "{COUNT} errors", { COUNT: errorCount }) : remoteT("NO_NEW_ERRORS", "No new errors");
    diagnosticsElement.innerHTML =
      diagnosticRow("Gemini Live", services.gemini || {}, "") +
      diagnosticRow(remoteT("CALENDAR", "Calendar"), services.calendar || {}, "retry_calendar") +
      diagnosticRow(remoteT("WEATHER_AND_CONTEXT", "Weather and context"), services.context || {}, "retry_context") +
      diagnosticRow(remoteT("CAMERA", "Camera"), services.camera || {}, "retry_camera");
    diagnosticsElement.querySelectorAll("[data-retry]").forEach(function (button) {
      button.onclick = function () {
        button.disabled = true;
        command({ action: button.dataset.retry }, remoteT("RETRY_REQUESTED", "Retry requested"))
          .catch(function () {})
          .then(function () { button.disabled = false; });
      };
    });
  }

  function dayText(days) {
    if (!days || !days.length) return remoteT("ONE_TIME", "One time");
    if (days.length === 7) return remoteT("DAILY", "Daily");
    var names = { 0: remoteT("SUN_SHORT", "Sun"), 1: remoteT("MON_SHORT", "Mon"), 2: remoteT("TUE_SHORT", "Tue"), 3: remoteT("WED_SHORT", "Wed"), 4: remoteT("THU_SHORT", "Thu"), 5: remoteT("FRI_SHORT", "Fri"), 6: remoteT("SAT_SHORT", "Sat") };
    return days.map(function (day) { return names[day]; }).join(" · ");
  }

  function renderAlarms(items) {
    items = items || [];
    alarmsElement.innerHTML = "";
    alarmCount.textContent = remoteT("ALARM_COUNT", "{COUNT} alarms", { COUNT: items.length });
    if (!items.length)
      alarmsElement.innerHTML = '<div class="card empty">' + escapeHtml(remoteT("NO_ALARMS", "No alarms")) + '</div>';
    items.forEach(function (alarm) {
      var row = document.createElement("div");
      row.className = "card alarm";
      row.innerHTML = '<div class="alarm-time">' + escapeHtml(alarm.time || "--:--") +
        '</div><div class="alarm-copy"><div class="alarm-label">' +
        escapeHtml(alarm.label || remoteT("ALARM", "Alarm")) + '</div><div class="alarm-meta">' +
        escapeHtml(dayText(alarm.repeatDays)) +
        (Number(alarm.confirmCount || 1) > 1 ? remoteT("CONFIRMATIONS_COUNT", " · Confirmations ×{COUNT}", { COUNT: alarm.confirmCount }) : "") +
        '</div></div><div class="alarm-actions"><button type="button" class="toggle' +
        (alarm.enabled ? " on" : "") + '" aria-label="' + escapeHtml(remoteT("TOGGLE_ALARM", "Toggle alarm")) + '"></button>' +
        '<button type="button" class="trash" aria-label="' + escapeHtml(remoteT("DELETE_ALARM", "Delete alarm")) + '">×</button></div>';
      row.querySelector(".toggle").onclick = function () {
        command({ action: alarm.enabled ? "disable_alarm" : "enable_alarm", id: alarm.id }, alarm.enabled ? remoteT("ALARM_DISABLED", "Alarm disabled") : remoteT("ALARM_ENABLED_DONE", "Alarm enabled")).catch(function () {});
      };
      row.querySelector(".trash").onclick = function () {
        if (!confirm(remoteT("CONFIRM_DELETE_NAMED", 'Delete "{NAME}"?', { NAME: alarm.label || alarm.time }))) return;
        command({ action: "delete_alarm", id: alarm.id }, remoteT("ALARM_DELETED", "Alarm deleted")).catch(function () {});
      };
      alarmsElement.appendChild(row);
    });
  }

  function render(data) {
    renderStatus(data.status);
    renderRoutines(data.status && data.status.routines);
    renderNotifications(data.status && data.status.notifications);
    renderDiagnostics(data.status && data.status.services);
    renderAlarms(data.alarms);
    lastCommand.textContent = data.lastCommand
      ? readableAction(data.lastCommand.action) + " · " + relativeTime(data.lastCommand.at)
      : "-";
  }

  function refresh(options) {
    options = options || {};
    if (!token) return Promise.reject(new Error(remoteT("TOKEN_REQUIRED", "A token is required")));
    if (!options.quiet) setStatus(remoteT("CONNECTING", "Connecting…"), "");
    return api("GET")
      .then(function (data) {
        setStatus(remoteT("CONNECTED", "Connected"), "ok");
        authCard.style.display = "none";
        controls.hidden = false;
        render(data);
        return data;
      })
      .catch(function (error) {
        if (!options.quiet) {
          controls.hidden = true;
          authCard.style.display = "grid";
          setStatus(error.status === 401 ? remoteT("INVALID_TOKEN", "Invalid token") : remoteT("CONNECTION_LOST", "Connection lost"), "bad");
        }
        throw error;
      });
  }

  [[1, "MON_SHORT"], [2, "TUE_SHORT"], [3, "WED_SHORT"], [4, "THU_SHORT"], [5, "FRI_SHORT"], [6, "SAT_SHORT"], [0, "SUN_SHORT"]].forEach(function (entry) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = remoteT(entry[1], entry[1].slice(0, 3));
    button.dataset.day = entry[0];
    button.onclick = function () {
      var day = Number(this.dataset.day);
      var index = repeatDays.indexOf(day);
      if (index >= 0) repeatDays.splice(index, 1);
      else repeatDays.push(day);
      this.classList.toggle("active", repeatDays.indexOf(day) >= 0);
    };
    daysElement.appendChild(button);
  });

  [1, 2, 3, 4, 5].forEach(function (number) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (number === 1 ? " active" : "");
    button.textContent = number;
    button.onclick = function () {
      confirmCount = number;
      confirmationsElement.querySelectorAll(".chip").forEach(function (chip) {
        chip.classList.toggle("active", Number(chip.textContent) === number);
      });
    };
    confirmationsElement.appendChild(button);
  });

  connectButton.onclick = function () {
    token = tokenInput.value.trim();
    if (!token) return toast(remoteT("ENTER_TOKEN", "Enter a token"));
    try { localStorage.setItem("nestFrameRemoteToken", token); } catch (_) {}
    refresh().catch(function () {});
  };

  document.querySelectorAll("[data-command]").forEach(function (button) {
    button.onclick = function () {
      var action = button.dataset.command;
      if (action === "reload" && !confirm(remoteT("CONFIRM_RELOAD", "Reload the display now?"))) return;
      command({ action: action }, remoteT("COMMAND_SENT", "Command sent")).catch(function () {});
    };
  });

  document.querySelectorAll("[data-view]").forEach(function (button) {
    button.onclick = function () {
      command({ action: "navigate", view: button.dataset.view }, remoteT("TAB_SWITCHED", "Tab switched")).catch(function () {});
    };
  });

  dismissAlarmButton.onclick = function () {
    command({ action: "dismiss_alarm" }, remoteT("ALARM_DISMISSED", "Alarm dismissed")).catch(function () {});
  };

  readAllButton.onclick = function () {
    command({ action: "read_all_notifications" }, remoteT("ALL_MARKED_READ", "All notifications marked as read")).catch(function () {});
  };

  composeMode.querySelectorAll("[data-mode]").forEach(function (button) {
    button.onclick = function () {
      sendMode = button.dataset.mode;
      composeMode.querySelectorAll("[data-mode]").forEach(function (item) {
        item.classList.toggle("active", item === button);
      });
      messageTitle.hidden = sendMode === "assistant";
      messageTitle.required = sendMode !== "assistant";
      messageText.required = sendMode === "assistant";
      messageText.placeholder = sendMode === "assistant" ? remoteT("GEMINI_QUESTION_PLACEHOLDER", "Enter a question for Gemini…") : remoteT("DESCRIPTION_OPTIONAL_PLACEHOLDER", "Description (optional)");
      messageSend.textContent = sendMode === "assistant" ? remoteT("ASK_GEMINI", "Ask Gemini") : remoteT("SEND_TO_DISPLAY", "Send to display");
    };
  });

  composeForm.onsubmit = function (event) {
    event.preventDefault();
    var text = messageText.value.trim(),
      title = messageTitle.value.trim();
    if (sendMode === "assistant" && !text)
      return toast(remoteT("ENTER_CONTENT", "Enter some content"));
    if (sendMode === "message" && !title)
      return toast(remoteT("ENTER_TITLE", "Enter a title"));
    messageSend.disabled = true;
    command(
      sendMode === "assistant"
        ? { action: "assistant_query", text: text }
        : { action: "show_message", title: title, text: text },
      sendMode === "assistant" ? remoteT("GEMINI_PROCESSING", "Gemini is processing") : remoteT("NOTIFICATION_SENT", "Notification sent"),
    )
      .then(function () {
        messageText.value = "";
        if (sendMode === "message") messageTitle.value = "";
      })
      .catch(function () {})
      .then(function () { messageSend.disabled = false; });
  };

  addAlarmButton.onclick = function () {
    repeatDays = [];
    confirmCount = 1;
    daysElement.querySelectorAll(".chip").forEach(function (chip) { chip.classList.remove("active"); });
    confirmationsElement.querySelectorAll(".chip").forEach(function (chip) { chip.classList.toggle("active", chip.textContent === "1"); });
    var date = new Date(
      Date.now() + REMOTE_DEFAULT_ALARM_OFFSET_MINUTES * 60000,
    );
    timeInput.value = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    labelInput.value = "";
    modalBackdrop.classList.add("show");
  };

  function closeModal() { modalBackdrop.classList.remove("show"); }
  cancelButton.onclick = closeModal;
  modalBackdrop.onclick = function (event) { if (event.target === modalBackdrop) closeModal(); };
  alarmForm.onsubmit = function (event) {
    event.preventDefault();
    var submit = alarmForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    command({
      action: "add_alarm",
      time: timeInput.value,
      label: labelInput.value.trim() || remoteT("ALARM", "Alarm"),
      repeatDays: repeatDays.slice(),
      confirmCount: confirmCount,
      enabled: true,
    }, remoteT("ALARM_ADDED", "Alarm added"))
      .then(closeModal)
      .catch(function () {})
      .then(function () { submit.disabled = false; });
  };

  function scheduleRemoteRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (token && !controls.hidden)
        refresh({ quiet: true }).catch(function () {});
    }, REMOTE_REFRESH_INTERVAL_MS);
  }
  if (token) refresh().catch(function () {});
  scheduleRemoteRefresh();
  window.addEventListener("frame:languagechange", function () {
    if (token && !controls.hidden) refresh({ quiet: true }).catch(function () {});
  });
})();
