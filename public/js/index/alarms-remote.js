  /* ---------------- SERVER-SAVED ALARMS ----------------
     Definitions are pulled from /alarms at startup, including disabled alarms.
     A multi-confirm cycle requires Done on every round; completed rounds are
     separated by five minutes. One-time alarms disable themselves only after
     the final Done. Repeating alarms remain enabled for the next matching day.
  -------------------------------------------------------------------------- */
  var alarms = [];
  var alarmEditingId = "";
  var activeAlarmCycle = null;
  var alarmRoundTimer = null;
  var alarmSchedulerTimer = null;
  var alarmCountdownTimer = null;
  var alarmAudioUnlocked = false;
  var alarmSoundWatchdog = 0;
  var ALARM_CONFIRM_INTERVAL_MS = 5 * 60 * 1000;
  var alarmResumeSpotify = false;
  var alarmList = document.getElementById("alarm-list");
  var alarmEditorBackdrop = document.getElementById("alarm-editor-backdrop");
  var alarmEditorForm = document.getElementById("alarm-editor-form");
  var alarmEditorTitle = document.getElementById("alarm-editor-title");
  var alarmTimeInput = document.getElementById("alarm-time-input");
  var alarmLabelInput = document.getElementById("alarm-label-input");
  var alarmConfirmInput = document.getElementById("alarm-confirm-input");
  var alarmConfirmControl = document.getElementById("alarm-confirm-control");
  var alarmConfirmCaption = document.getElementById("alarm-confirm-caption");
  var alarmEnabledInput = document.getElementById("alarm-enabled-input");
  var alarmAudio = document.getElementById("alarm-audio");
  if (alarmAudio) {
    alarmAudio.loop = true;
    alarmAudio.addEventListener("ended", ensureAlarmSoundPlaying);
    alarmAudio.addEventListener("stalled", function () {
      setTimeout(ensureAlarmSoundPlaying, 120);
    });
    alarmAudio.addEventListener("pause", function () {
      if (activeAlarmCycle && activeAlarmCycle.ringing)
        setTimeout(ensureAlarmSoundPlaying, 80);
    });
  }
  var alarmAlert = document.getElementById("alarm-alert");
  var alarmAlertTime = document.getElementById("alarm-alert-time");
  var alarmAlertLabel = document.getElementById("alarm-alert-label");
  var alarmAlertRound = document.getElementById("alarm-alert-round");
  var alarmSoundWarning = document.getElementById("alarm-sound-warning");
  var alarmWaitingBanner = document.getElementById("alarm-waiting-banner");
  var alarmWaitingText = document.getElementById("alarm-waiting-text");
  var alarmTestSound = document.getElementById("alarm-test-sound");

  function alarmFetch(url, options) {
    options = options || {};
    var init = {
      method: options.method || "GET",
      headers: { Accept: "application/json" },
      cache: options.cache || "no-store",
    };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(url, init).then(function (r) {
      if (r.status === 204) return null;
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (x) {
          if (!r.ok)
            throw new Error(
              x.error ||
                tr("ALARM_REQUEST_FAILED", "Yêu cầu báo thức thất bại: {STATUS}", {
                  STATUS: r.status,
                }),
            );
          return x;
        });
    });
  }
  var alarmZoneFormatter = null;
  function alarmZonedParts(date) {
    try {
      if (!alarmZoneFormatter)
        alarmZoneFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          weekday: "short",
        });
      var out = {};
      alarmZoneFormatter.formatToParts(date).forEach(function (part) {
        if (part.type !== "literal") out[part.type] = part.value;
      });
      return {
        y: Number(out.year),
        mo: Number(out.month),
        d: Number(out.day),
        h: Number(out.hour) % 24,
        mi: Number(out.minute),
        weekday: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
          out.weekday
        ],
      };
    } catch (_) {
      return {
        y: date.getFullYear(),
        mo: date.getMonth() + 1,
        d: date.getDate(),
        h: date.getHours(),
        mi: date.getMinutes(),
        weekday: date.getDay(),
      };
    }
  }
  function alarmDateKey(parts) {
    return (
      parts.y +
      "-" +
      String(parts.mo).padStart(2, "0") +
      "-" +
      String(parts.d).padStart(2, "0")
    );
  }
  function alarmDaysText(days) {
    if (!days || !days.length) return tr("ONE_TIME", "Một lần");
    var names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    if (days.length === 7) return tr("DAILY", "Hằng ngày");
    if (days.join(",") === "1,2,3,4,5") return tr("WEEKDAYS", "Ngày trong tuần");
    if (days.join(",") === "0,6") return tr("WEEKENDS", "Cuối tuần");
    return days
      .map(function (d) {
        return names[d];
      })
      .join(" · ");
  }
  function alarmSvg(kind) {
    if (kind === "edit")
      return '<svg viewBox="0 0 24 24" fill="none"><path d="m5 16.5-.7 3.2 3.2-.7L18 8.5 15.5 6 5 16.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14.5 7 2.5 2.5" stroke="currentColor" stroke-width="1.7"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M8 7h8M9 7V5h6v2M7 7l.7 12h8.6L17 7M10 10v6M14 10v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function renderAlarms() {
    if (!alarmList) return;
    alarmList.innerHTML = "";
    if (!alarms.length) {
      alarmList.innerHTML =
        '<div class="alarm-empty"><strong>' +
        tr("NO_ALARMS", "Chưa có báo thức") +
        "</strong><span>" +
        tr(
          "NO_ALARMS_HELP",
          "Thêm báo thức, chọn ngày lặp và số lần xác nhận cách nhau 5 phút nếu cần.",
        ) +
        "</span></div>";
      return;
    }
    alarms
      .slice()
      .sort(function (a, b) {
        return String(a.time).localeCompare(String(b.time));
      })
      .forEach(function (a) {
        var card = document.createElement("article");
        card.className = "alarm-card" + (a.enabled ? "" : " off");
        var top = document.createElement("div");
        top.className = "alarm-card-top";
        var time = document.createElement("div");
        time.className = "alarm-time";
        time.textContent = a.time;
        var copy = document.createElement("div");
        copy.className = "alarm-card-copy";
        var label = document.createElement("div");
        label.className = "alarm-label";
        label.textContent = a.label || tr("ALARM", "Báo thức");
        var meta = document.createElement("div");
        meta.className = "alarm-meta";
        meta.textContent =
          (Number(a.confirmCount || 1) > 1
            ? tr("CONFIRMATIONS_INTERVAL", "{COUNT} lần xác nhận · cách nhau 5 phút", {
                COUNT: Number(a.confirmCount),
              })
            : tr("SINGLE_CONFIRMATION", "Xác nhận một lần")) +
          (a.enabled ? "" : " · " + tr("DISABLED", "Đã tắt"));
        copy.appendChild(label);
        copy.appendChild(meta);
        var sw = document.createElement("button");
        sw.type = "button";
        sw.className = "alarm-switch" + (a.enabled ? " on" : "");
        sw.setAttribute(
          "aria-label",
          a.enabled
            ? tr("DISABLE_ALARM", "Tắt báo thức")
            : tr("ENABLE_ALARM", "Bật báo thức"),
        );
        sw.addEventListener("click", function () {
          updateAlarm(a.id, { enabled: !a.enabled });
        });
        top.appendChild(time);
        top.appendChild(copy);
        top.appendChild(sw);
        var foot = document.createElement("div");
        foot.className = "alarm-card-footer";
        var repeat = document.createElement("div");
        repeat.className = "alarm-repeat";
        repeat.textContent = alarmDaysText(a.repeatDays || []);
        var acts = document.createElement("div");
        acts.className = "alarm-card-actions";
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "alarm-icon-btn";
        edit.setAttribute("aria-label", tr("EDIT_ALARM", "Sửa báo thức"));
        edit.innerHTML = alarmSvg("edit");
        edit.addEventListener("click", function () {
          openAlarmEditor(a);
        });
        var del = document.createElement("button");
        del.type = "button";
        del.className = "alarm-icon-btn delete";
        del.setAttribute("aria-label", tr("DELETE_ALARM", "Xóa báo thức"));
        del.innerHTML = alarmSvg("delete");
        del.addEventListener("click", function () {
          deleteAlarm(a);
        });
        acts.appendChild(edit);
        acts.appendChild(del);
        foot.appendChild(repeat);
        foot.appendChild(acts);
        card.appendChild(top);
        card.appendChild(foot);
        alarmList.appendChild(card);
      });
  }
  function loadAlarms() {
    return alarmFetch("/alarms")
      .then(function (data) {
        alarms = (data && data.items) || [];
        if (data && data.confirmIntervalMinutes)
          ALARM_CONFIRM_INTERVAL_MS =
            Number(data.confirmIntervalMinutes) * 60000;
        renderAlarms();
        return alarms;
      })
      .catch(function (e) {
        if (alarmList)
          alarmList.innerHTML =
            '<div class="alarm-empty"><strong>' +
            tr("LOAD_ALARMS_FAILED", "Không thể tải báo thức") +
            "</strong><span>" +
            escapeHtml(e.message || tr("SERVER_UNAVAILABLE", "Server không khả dụng")) +
            "</span></div>";
        return [];
      });
  }
  function selectedAlarmDays() {
    var out = [];
    document
      .querySelectorAll('#alarm-days input[type="checkbox"]')
      .forEach(function (x) {
        if (x.checked) out.push(Number(x.value));
      });
    return out;
  }
  function setAlarmConfirmCount(value) {
    var n = Math.max(1, Math.min(5, Number(value) || 1));
    alarmConfirmInput.value = String(n);
    if (alarmConfirmControl) {
      var chips = alarmConfirmControl.querySelectorAll(".alarm-confirm-chip");
      for (var i = 0; i < chips.length; i++) {
        var on = Number(chips[i].getAttribute("data-confirm")) === n;
        chips[i].classList.toggle("active", on);
        chips[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    if (alarmConfirmCaption)
      alarmConfirmCaption.textContent =
        n === 1
          ? tr("CONFIRM_ONCE_TO_COMPLETE", "Xác nhận một lần để hoàn tất")
          : tr("CONFIRMATIONS_RING_INTERVAL", "{COUNT} lần xác nhận · reo lại sau mỗi 5 phút", {
              COUNT: n,
            });
  }
  function openAlarmEditor(a) {
    alarmEditingId = (a && a.id) || "";
    if (alarmEditorTitle)
      alarmEditorTitle.textContent = a
        ? tr("EDIT_ALARM", "Sửa báo thức")
        : tr("ADD_ALARM", "Thêm báo thức");
    var now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    var defaultTime =
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0");
    alarmTimeInput.value = (a && a.time) || defaultTime;
    alarmLabelInput.value = (a && a.label) || "";
    setAlarmConfirmCount((a && a.confirmCount) || 1);
    alarmEnabledInput.checked = a ? a.enabled !== false : true;
    var chosen = a && Array.isArray(a.repeatDays) ? a.repeatDays : [];
    document
      .querySelectorAll('#alarm-days input[type="checkbox"]')
      .forEach(function (x) {
        x.checked = chosen.indexOf(Number(x.value)) >= 0;
      });
    alarmEditorBackdrop.classList.add("show");
    alarmEditorBackdrop.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      alarmTimeInput.focus();
    }, 60);
  }
  function closeAlarmEditor() {
    alarmEditorBackdrop.classList.remove("show");
    alarmEditorBackdrop.setAttribute("aria-hidden", "true");
    alarmEditingId = "";
  }
  function saveAlarm(e) {
    e.preventDefault();
    var body = {
      time: alarmTimeInput.value,
      label: alarmLabelInput.value.trim() || tr("ALARM", "Báo thức"),
      confirmCount: Number(alarmConfirmInput.value || 1),
      repeatDays: selectedAlarmDays(),
      enabled: alarmEnabledInput.checked,
    };
    var url = alarmEditingId
      ? "/alarms/" + encodeURIComponent(alarmEditingId)
      : "/alarms";
    alarmFetch(url, { method: alarmEditingId ? "PUT" : "POST", body: body })
      .then(function () {
        closeAlarmEditor();
        return loadAlarms();
      })
      .catch(function (err) {
        alert(err.message || tr("SAVE_ALARM_FAILED", "Không thể lưu báo thức"));
      });
  }
  function updateAlarm(id, patch) {
    var a = alarms.find(function (x) {
      return String(x.id) === String(id);
    });
    if (!a) return;
    var body = {
      time: a.time,
      label: a.label,
      repeatDays: a.repeatDays || [],
      confirmCount: a.confirmCount || 1,
      enabled: patch.enabled === undefined ? a.enabled : patch.enabled,
    };
    alarmFetch("/alarms/" + encodeURIComponent(id), {
      method: "PUT",
      body: body,
    })
      .then(loadAlarms)
      .catch(function (e) {
        alert(e.message || tr("UPDATE_ALARM_FAILED", "Không thể cập nhật báo thức"));
      });
  }
  function deleteAlarm(a) {
    if (
      !confirm(
        tr("CONFIRM_DELETE_ALARM", 'Xóa báo thức "{NAME}"?', {
          NAME: a.label || a.time,
        }),
      )
    )
      return;
    alarmFetch("/alarms/" + encodeURIComponent(a.id), { method: "DELETE" })
      .then(function () {
        if (
          activeAlarmCycle &&
          String(activeAlarmCycle.alarm.id) === String(a.id)
        )
          finishAlarmCycle(true);
        return loadAlarms();
      })
      .catch(function (e) {
        alert(e.message || tr("DELETE_ALARM_FAILED", "Không thể xóa báo thức"));
      });
  }

  function unlockAlarmAudio(playForTest) {
    if (!alarmAudio)
      return Promise.reject(
        new Error(tr("NO_ALARM_AUDIO", "Không có âm thanh báo thức")),
      );
    alarmAudio.volume = 1;
    alarmAudio.currentTime = 0;
    var p = alarmAudio.play();
    if (!p || typeof p.then !== "function") return Promise.resolve();
    return p.then(function () {
      alarmAudioUnlocked = true;
      if (alarmTestSound) alarmTestSound.classList.add("sound-ready");
      if (playForTest)
        setTimeout(function () {
          alarmAudio.pause();
          alarmAudio.currentTime = 0;
        }, 1200);
      else if (alarmSoundWarning) alarmSoundWarning.classList.remove("show");
    });
  }
  function stopAlarmSound() {
    clearInterval(alarmSoundWatchdog);
    alarmSoundWatchdog = 0;
    if (alarmAudio) {
      try {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
      } catch (_) {}
    }
    if (navigator.vibrate)
      try {
        navigator.vibrate(0);
      } catch (_) {}
  }
  function ensureAlarmSoundPlaying() {
    if (!activeAlarmCycle || !activeAlarmCycle.ringing || !alarmAudio) return;
    alarmAudio.loop = true;
    alarmAudio.volume = 1;
    if (alarmAudio.paused) {
      var p = alarmAudio.play();
      if (p && p.catch)
        p.catch(function () {
          if (alarmSoundWarning) alarmSoundWarning.classList.add("show");
        });
    }
  }
  function playAlarmSound() {
    if (alarmAudio) {
      alarmAudio.loop = true;
      alarmAudio.volume = 1;
      alarmAudio.currentTime = 0;
      var p = alarmAudio.play();
      if (p && p.catch)
        p.catch(function () {
          if (alarmSoundWarning) alarmSoundWarning.classList.add("show");
        });
      clearInterval(alarmSoundWatchdog);
      alarmSoundWatchdog = setInterval(ensureAlarmSoundPlaying, 750);
    }
    if (navigator.vibrate)
      try {
        navigator.vibrate([900, 350, 900, 350, 900, 350, 1400]);
      } catch (_) {}
  }
  function startAlarmRound() {
    exitIdle(false);
    if (!activeAlarmCycle) return;
    clearTimeout(alarmRoundTimer);
    clearInterval(alarmCountdownTimer);
    alarmWaitingBanner.classList.remove("show");
    activeAlarmCycle.ringing = true;
    alarmResumeSpotify = !!(
      typeof spotifyState !== "undefined" &&
      spotifyState &&
      spotifyState.isPlaying
    );
    if (alarmResumeSpotify && typeof pauseSpotify === "function")
      pauseSpotify();
    alarmAlertTime.textContent = activeAlarmCycle.alarm.time;
    alarmAlertLabel.textContent = activeAlarmCycle.alarm.label || tr("ALARM", "Báo thức");
    alarmAlertRound.textContent = tr(
      "CONFIRMATION_PROGRESS",
      "Xác nhận {CURRENT}/{TOTAL}",
      {
        CURRENT: activeAlarmCycle.confirmed + 1,
        TOTAL: activeAlarmCycle.total,
      },
    );
    alarmAlert.classList.add("show");
    alarmSoundWarning.classList.remove("show");
    playAlarmSound();
  }
  function scheduleNextAlarmRound() {
    if (!activeAlarmCycle) return;
    activeAlarmCycle.ringing = false;
    var target = Date.now() + ALARM_CONFIRM_INTERVAL_MS;
    activeAlarmCycle.nextRoundAt = target;
    alarmWaitingBanner.classList.add("show");
    function tick() {
      if (!activeAlarmCycle || activeAlarmCycle.ringing) return;
      var left = Math.max(0, activeAlarmCycle.nextRoundAt - Date.now()),
        sec = Math.ceil(left / 1000),
        m = Math.floor(sec / 60),
        s = sec % 60;
      alarmWaitingText.textContent = tr(
        "ALARM_NEXT_CONFIRMATION",
        "Báo thức · {CURRENT}/{TOTAL} đã xác nhận · lần tiếp theo sau {TIME}",
        {
          CURRENT: activeAlarmCycle.confirmed,
          TOTAL: activeAlarmCycle.total,
          TIME: m + ":" + String(s).padStart(2, "0"),
        },
      );
    }
    tick();
    alarmCountdownTimer = setInterval(tick, 1000);
    alarmRoundTimer = setTimeout(startAlarmRound, ALARM_CONFIRM_INTERVAL_MS);
  }
  function finishAlarmCycle(deleted) {
    if (!activeAlarmCycle) return;
    var finished = activeAlarmCycle;
    clearTimeout(alarmRoundTimer);
    clearInterval(alarmCountdownTimer);
    stopAlarmSound();
    alarmAlert.classList.remove("show");
    alarmWaitingBanner.classList.remove("show");
    activeAlarmCycle = null;
    if (alarmResumeSpotify && typeof resumeSpotify === "function")
      resumeSpotify();
    alarmResumeSpotify = false;
    if (
      !deleted &&
      (!finished.alarm.repeatDays || !finished.alarm.repeatDays.length)
    ) {
      updateAlarm(finished.alarm.id, { enabled: false });
    } else loadAlarms();
    if (!deleted) setTimeout(showMorningBrief, 650);
  }
  function confirmAlarmRound() {
    if (!activeAlarmCycle) return;
    stopAlarmSound();
    alarmAlert.classList.remove("show");
    activeAlarmCycle.confirmed++;
    if (alarmResumeSpotify && typeof resumeSpotify === "function")
      resumeSpotify();
    alarmResumeSpotify = false;
    if (activeAlarmCycle.confirmed >= activeAlarmCycle.total) {
      finishAlarmCycle(false);
      return;
    }
    scheduleNextAlarmRound();
  }
  function beginAlarmCycle(alarm, dateKey) {
    if (activeAlarmCycle) return;
    alarmFetch("/alarms/" + encodeURIComponent(alarm.id) + "/trigger", {
      method: "POST",
      body: { dateKey: dateKey },
    })
      .then(function (updated) {
        alarm.lastTriggeredDate = dateKey;
        activeAlarmCycle = {
          alarm: alarm,
          total: Math.max(1, Math.min(5, Number(alarm.confirmCount) || 1)),
          confirmed: 0,
          ringing: false,
          nextRoundAt: 0,
        };
        startAlarmRound();
        renderAlarms();
      })
      .catch(function (e) {
        console.error("Alarm trigger failed", e);
      });
  }
  function checkDueAlarms() {
    if (activeAlarmCycle) return;
    var parts = alarmZonedParts(new Date()),
      hh =
        String(parts.h).padStart(2, "0") +
        ":" +
        String(parts.mi).padStart(2, "0"),
      day = parts.weekday,
      dateKey = alarmDateKey(parts);
    for (var i = 0; i < alarms.length; i++) {
      var a = alarms[i];
      if (!a.enabled || a.time !== hh || a.lastTriggeredDate === dateKey)
        continue;
      var days = Array.isArray(a.repeatDays) ? a.repeatDays : [];
      if (days.length && days.indexOf(day) < 0) continue;
      if (!days.length && a.scheduledDate && a.scheduledDate !== dateKey)
        continue;
      beginAlarmCycle(a, dateKey);
      break;
    }
  }
  function scheduleNextAlarmCheck() {
    clearTimeout(alarmSchedulerTimer);
    alarmSchedulerTimer = setTimeout(
      function () {
        checkDueAlarms();
        scheduleNextAlarmCheck();
      },
      60050 - (Date.now() % 60000),
    );
  }
  var remoteAlarmPollTimer = 0;
  var remoteCommandCursor = 0;
  var remotePollInFlight = false;
  var frameHeartbeatTimer = 0;
  // A page reload must create a new display session. Persisting this id in
  // sessionStorage makes the freshly loaded page replay the reload command.
  var frameSessionId =
    window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  function frameHeartbeatPayload() {
    var cameraState = cameraHomeChip
        ? String(cameraHomeChip.getAttribute("data-state") || "")
        : "",
      assistantState = voiceShell
        ? String(voiceShell.getAttribute("data-state") || "idle")
        : "idle",
      pageOpen = !!(
        assistantPage && assistantPage.classList.contains("show")
      );
    return {
      sessionId: frameSessionId,
      view: currentView || "home",
      idle: !!idleActive,
      assistantState: assistantState,
      assistantBusy: !!(voiceStarting || voiceBusy || voiceProcessor),
      pageOpen: pageOpen,
      pageTitle:
        pageOpen && assistantPageTitle ? assistantPageTitle.textContent || "" : "",
      cameraState: cameraState,
      lastError: voiceLastError || "",
    };
  }
  function sendFrameHeartbeat() {
    return fetch("/frame/heartbeat", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frameHeartbeatPayload()),
    }).catch(function () {});
  }
  function showRemoteMessage(command) {
    showVoiceShell();
    setVoiceState(
      "idle",
      tr("REMOTE", "Từ xa"),
      command.title || tr("REMOTE_MESSAGE", "Tin nhắn từ xa"),
      tr("PRESS_CLOSE_RETURN", "Nhấn × để quay lại trang trước"),
    );
    showAssistantPage({
      kind: "dynamic_ui",
      kicker: tr("REMOTE", "Từ xa"),
      title: command.title || tr("REMOTE_MESSAGE", "Tin nhắn từ xa"),
      subtitle: tr("SENT_TO_DISPLAY", "Được gửi tới màn hình này"),
      layout: { columns: 12, gap: 14, density: "comfortable" },
      widgets: [
        {
          type: "callout",
          span: 12,
          order: 0,
          emphasis: "hero",
          title: command.title || tr("NOTIFICATIONS", "Thông báo"),
          text: command.text || "",
        },
      ],
    });
  }
  function performRemoteCommand(command) {
    var action = String((command && command.action) || "");
    if (["add_alarm", "enable_alarm", "disable_alarm", "delete_alarm"].indexOf(action) >= 0)
      return loadAlarms().then(checkDueAlarms);
    if (action === "dismiss_alarm") {
      if (activeAlarmCycle) finishAlarmCycle(false);
      return;
    }
    if (action === "navigate") switchView(command.view || "home");
    else if (action === "close_page") {
      endVoiceAssistant(true);
    } else if (action === "back") {
      if (assistantPage && assistantPage.classList.contains("show"))
        endVoiceAssistant(true);
      else switchView(previousView || "home");
    } else if (action === "idle") enterIdle();
    else if (action === "reload") window.location.reload();
    else if (action === "stop_assistant") endVoiceAssistant(true);
    else if (action === "run_routine") runRoutine(command.routineId);
    else if (action === "show_message") showRemoteMessage(command);
    else if (action === "assistant_query") startRemoteAssistantQuery(command.text);
    else if (action === "retry_context")
      refreshAmbientContext().then(refreshTodayData);
    else if (action === "retry_calendar")
      fetch("/calendar?refresh=1", { cache: "no-store" })
        .then(refreshAmbientContext)
        .then(refreshTodayData)
        .catch(function () {});
    else if (action === "retry_camera") {
      cameraClosePeer(false);
      cameraSetStatus(
        localStorage.getItem("nestframe-camera-enabled") === "1" ? "ready" : "setup",
        localStorage.getItem("nestframe-camera-enabled") === "1"
          ? tr("CAMERA_READY", "Camera sẵn sàng")
          : tr("ENABLE_CAMERA", "Bật camera liên lạc"),
      );
    }
    sendFrameHeartbeat();
  }
  function pollRemoteAlarmControl() {
    clearTimeout(remoteAlarmPollTimer);
    if (remotePollInFlight) return;
    remotePollInFlight = true;
    fetch(
      "/remote/control?display=1&session=" +
        encodeURIComponent(frameSessionId) +
        "&after=" +
        remoteCommandCursor +
        "&_t=" +
        Date.now(),
      { cache: "no-store" },
    )
      .then(function (r) {
        if (!r.ok) {
          var error = new Error("remote " + r.status);
          error.status = r.status;
          throw error;
        }
        return r.json();
      })
      .then(function (data) {
        var commands = data && Array.isArray(data.commands) ? data.commands : [];
        commands.forEach(function (command) {
          remoteCommandCursor = Math.max(
            remoteCommandCursor,
            Number(command.version || 0),
          );
          performRemoteCommand(command);
        });
      })
      .catch(function (error) {
        if (error && error.status === 403) sendFrameHeartbeat();
      })
      .then(function () {
        remotePollInFlight = false;
        remoteAlarmPollTimer = setTimeout(
          pollRemoteAlarmControl,
          document.hidden ? 3000 : 1200,
        );
      });
  }
  function resumeRemoteControl() {
    clearTimeout(remoteAlarmPollTimer);
    sendFrameHeartbeat().then(pollRemoteAlarmControl);
  }
  function initAlarms() {
    alarmZoneFormatter = null;
    resumeRemoteControl();
    loadAlarms().then(checkDueAlarms);
    scheduleNextAlarmCheck();
    clearInterval(frameHeartbeatTimer);
    frameHeartbeatTimer = setInterval(sendFrameHeartbeat, 12000);
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      checkDueAlarms();
      resumeRemoteControl();
    }
  });
  window.addEventListener("pageshow", resumeRemoteControl);
  window.addEventListener("focus", resumeRemoteControl);
  window.addEventListener("online", resumeRemoteControl);
  var alarmAddBtn = document.getElementById("alarm-add-btn"),
    alarmCloseBtn = document.getElementById("alarm-editor-close"),
    alarmCancelBtn = document.getElementById("alarm-cancel-btn"),
    alarmDoneBtn = document.getElementById("alarm-done-btn");
  if (alarmConfirmControl)
    alarmConfirmControl.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".alarm-confirm-chip") : null;
      if (!b) return;
      setAlarmConfirmCount(b.getAttribute("data-confirm"));
    });
  setAlarmConfirmCount((alarmConfirmInput && alarmConfirmInput.value) || 1);
  if (alarmAddBtn)
    alarmAddBtn.addEventListener("click", function () {
      openAlarmEditor(null);
    });
  if (alarmCloseBtn) alarmCloseBtn.addEventListener("click", closeAlarmEditor);
  if (alarmCancelBtn)
    alarmCancelBtn.addEventListener("click", closeAlarmEditor);
  if (alarmEditorForm) alarmEditorForm.addEventListener("submit", saveAlarm);
  if (alarmEditorBackdrop)
    alarmEditorBackdrop.addEventListener("click", function (e) {
      if (e.target === alarmEditorBackdrop) closeAlarmEditor();
    });
  if (alarmDoneBtn) alarmDoneBtn.addEventListener("click", confirmAlarmRound);
  if (alarmTestSound)
    alarmTestSound.addEventListener("click", function () {
      unlockAlarmAudio(true).catch(function () {
        alert(
          tr(
            "SAFARI_BLOCKED_ALARM_AUDIO",
            "Safari đã chặn nhạc chuông. Hãy tương tác với trang rồi chạm lại.",
          ),
        );
      });
    });
  if (alarmAlert)
    alarmAlert.addEventListener("click", function (e) {
      if (e.target !== alarmDoneBtn && !alarmAudioUnlocked)
        unlockAlarmAudio(false).catch(function () {});
    });
