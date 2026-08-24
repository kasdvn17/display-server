(function () {
  "use strict";

  fetch("/frame/bootstrap", { cache: "no-store" })
    .then(function (response) {
      return response.ok ? response.json() : {};
    })
    .then(function (data) {
      var variables = (data && data.themeVariables) || {};
      Object.keys(variables).forEach(function (key) {
        if (/^--theme-/.test(key))
          document.documentElement.style.setProperty(key, String(variables[key]));
      });
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
    }, 1900);
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
          var error = new Error(data.error || "Lỗi HTTP " + response.status);
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
        toast(error.message || "Không gửi được lệnh");
        throw error;
      });
  }

  function relativeTime(value) {
    var stamp = new Date(value).getTime();
    if (!Number.isFinite(stamp)) return "Chưa có dữ liệu";
    var seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
    if (seconds < 10) return "Vừa xong";
    if (seconds < 60) return seconds + " giây trước";
    if (seconds < 3600) return Math.floor(seconds / 60) + " phút trước";
    return new Date(stamp).toLocaleString("vi-VN", {
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
      home: "Trang chủ", today: "Hôm nay", media: "Giải trí", news: "Tin tức",
      alarm: "Báo thức", call: "Cuộc gọi camera", idle: "Chế độ chờ",
      listening: "Đang nghe", thinking: "Đang xử lý", speaking: "Đang trả lời",
      ready: "Sẵn sàng", setup: "Chưa bật", live: "Đang gọi",
      connecting: "Đang kết nối", error: "Có lỗi",
    };
    return labels[value] || String(value || "—");
  }

  function readableAction(value) {
    var labels = {
      navigate: "chuyển tab",
      close_page: "đóng trang",
      back: "quay lại",
      idle: "mở chế độ chờ",
      reload: "tải lại màn hình",
      stop_assistant: "dừng trợ lý",
      run_routine: "chạy thói quen",
      show_message: "hiển thị thông báo",
      assistant_query: "hỏi Gemini",
      retry_context: "thử lại thông tin xung quanh",
      retry_calendar: "thử lại lịch",
      retry_camera: "thử lại camera",
      add_alarm: "thêm báo thức",
      enable_alarm: "bật báo thức",
      disable_alarm: "tắt báo thức",
      delete_alarm: "xóa báo thức",
      dismiss_alarm: "dừng báo thức",
    };
    return labels[value] || String(value || "").replace(/_/g, " ");
  }

  function renderStatus(status) {
    status = status || {};
    var frame = status.frame || {};
    frameDot.classList.toggle("online", !!status.online);
    frameOnline.textContent = status.online ? "Trực tuyến" : "Ngoại tuyến";
    frameView.textContent = frame.idle ? "Chế độ chờ" : readableState(frame.view);
    frameAssistant.textContent = frame.assistantBusy
      ? readableState(frame.assistantState)
      : "Sẵn sàng";
    framePage.textContent = frame.pageOpen ? frame.pageTitle || "Đang mở" : "Không mở";
    frameCamera.textContent = readableState(frame.cameraState);
    frameSeen.textContent = status.lastSeen
      ? "Tín hiệu trạng thái " + relativeTime(status.lastSeen)
      : "Chưa nhận tín hiệu trạng thái";
  }

  function renderRoutines(items) {
    routinesElement.innerHTML = "";
    (items || []).forEach(function (routine) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "routine-command" + (routine.suggested ? " suggested" : "");
      button.innerHTML =
        "<strong>" + escapeHtml(routine.name || "Thói quen") + "</strong><span>" +
        escapeHtml(routine.description || "") + "</span>";
      button.onclick = function () {
        button.disabled = true;
        command(
          { action: "run_routine", routineId: routine.id },
          "Đã chạy " + (routine.name || "routine"),
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
      notificationsElement.innerHTML = '<div class="card empty">Không có thông báo</div>';
      return;
    }
    items.slice(0, 20).forEach(function (item) {
      var row = document.createElement("article");
      row.className = "card notification" + (item.readAt ? "" : " unread");
      row.innerHTML =
        '<span class="notification-mark"></span><div class="notification-copy"><strong>' +
        escapeHtml(item.title || "Thông báo") + "</strong><p>" + escapeHtml(item.body || "") +
        "</p><small>" + relativeTime(item.updatedAt || item.createdAt) +
        '</small></div><button type="button" class="notification-close" aria-label="Ẩn thông báo">×</button>';
      row.querySelector("button").onclick = function () {
        command({ action: "dismiss_notification", id: item.id }, "Đã ẩn thông báo")
          .catch(function () {});
      };
      notificationsElement.appendChild(row);
    });
  }

  function diagnosticRow(label, service, retryAction) {
    var configured = !!service.configured;
    var error = String(service.lastError || "");
    var state = !configured ? "Chưa cấu hình" : error ? "Có lỗi" : "Hoạt động";
    var detail = error || (service.lastSuccess ? "Cập nhật " + relativeTime(service.lastSuccess) : "Đang chờ dữ liệu");
    return '<article class="card diagnostic ' + (error ? "has-error" : "") + '">' +
      '<div><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(state) +
      '</span><small>' + escapeHtml(detail) + '</small></div>' +
      (retryAction ? '<button class="btn ghost" type="button" data-retry="' + retryAction + '">Thử lại</button>' : "") +
      "</article>";
  }

  function renderDiagnostics(services) {
    services = services || {};
    var errorCount = Object.keys(services).filter(function (key) {
      return services[key] && services[key].lastError;
    }).length;
    diagnosticSummary.textContent = errorCount ? errorCount + " lỗi" : "Không có lỗi mới";
    diagnosticsElement.innerHTML =
      diagnosticRow("Gemini Live", services.gemini || {}, "") +
      diagnosticRow("Lịch", services.calendar || {}, "retry_calendar") +
      diagnosticRow("Thời tiết và ngữ cảnh", services.context || {}, "retry_context") +
      diagnosticRow("Máy ảnh", services.camera || {}, "retry_camera");
    diagnosticsElement.querySelectorAll("[data-retry]").forEach(function (button) {
      button.onclick = function () {
        button.disabled = true;
        command({ action: button.dataset.retry }, "Đã yêu cầu thử lại")
          .catch(function () {})
          .then(function () { button.disabled = false; });
      };
    });
  }

  function dayText(days) {
    if (!days || !days.length) return "Một lần";
    if (days.length === 7) return "Hằng ngày";
    var names = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };
    return days.map(function (day) { return names[day]; }).join(" · ");
  }

  function renderAlarms(items) {
    items = items || [];
    alarmsElement.innerHTML = "";
    alarmCount.textContent = items.length + " báo thức";
    if (!items.length)
      alarmsElement.innerHTML = '<div class="card empty">Chưa có báo thức</div>';
    items.forEach(function (alarm) {
      var row = document.createElement("div");
      row.className = "card alarm";
      row.innerHTML = '<div class="alarm-time">' + escapeHtml(alarm.time || "--:--") +
        '</div><div class="alarm-copy"><div class="alarm-label">' +
        escapeHtml(alarm.label || "Báo thức") + '</div><div class="alarm-meta">' +
        escapeHtml(dayText(alarm.repeatDays)) +
        (Number(alarm.confirmCount || 1) > 1 ? " · Xác nhận ×" + alarm.confirmCount : "") +
        '</div></div><div class="alarm-actions"><button type="button" class="toggle' +
        (alarm.enabled ? " on" : "") + '" aria-label="Bật tắt báo thức"></button>' +
        '<button type="button" class="trash" aria-label="Xóa báo thức">×</button></div>';
      row.querySelector(".toggle").onclick = function () {
        command({ action: alarm.enabled ? "disable_alarm" : "enable_alarm", id: alarm.id }, alarm.enabled ? "Đã tắt báo thức" : "Đã bật báo thức").catch(function () {});
      };
      row.querySelector(".trash").onclick = function () {
        if (!confirm('Xóa "' + (alarm.label || alarm.time) + '"?')) return;
        command({ action: "delete_alarm", id: alarm.id }, "Đã xóa báo thức").catch(function () {});
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
      : "—";
  }

  function refresh(options) {
    options = options || {};
    if (!token) return Promise.reject(new Error("Cần nhập token"));
    if (!options.quiet) setStatus("Đang kết nối…", "");
    return api("GET")
      .then(function (data) {
        setStatus("Đã kết nối", "ok");
        authCard.style.display = "none";
        controls.hidden = false;
        render(data);
        return data;
      })
      .catch(function (error) {
        if (!options.quiet) {
          controls.hidden = true;
          authCard.style.display = "grid";
          setStatus(error.status === 401 ? "Sai token" : "Mất kết nối", "bad");
        }
        throw error;
      });
  }

  [[1, "T2"], [2, "T3"], [3, "T4"], [4, "T5"], [5, "T6"], [6, "T7"], [0, "CN"]].forEach(function (entry) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = entry[1];
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
    if (!token) return toast("Hãy nhập token");
    try { localStorage.setItem("nestFrameRemoteToken", token); } catch (_) {}
    refresh().catch(function () {});
  };

  document.querySelectorAll("[data-command]").forEach(function (button) {
    button.onclick = function () {
      var action = button.dataset.command;
      if (action === "reload" && !confirm("Reload màn hình ngay?")) return;
      command({ action: action }, "Đã gửi lệnh").catch(function () {});
    };
  });

  document.querySelectorAll("[data-view]").forEach(function (button) {
    button.onclick = function () {
      command({ action: "navigate", view: button.dataset.view }, "Đã chuyển tab").catch(function () {});
    };
  });

  dismissAlarmButton.onclick = function () {
    command({ action: "dismiss_alarm" }, "Đã dừng báo thức").catch(function () {});
  };

  readAllButton.onclick = function () {
    command({ action: "read_all_notifications" }, "Đã đánh dấu tất cả").catch(function () {});
  };

  composeMode.querySelectorAll("[data-mode]").forEach(function (button) {
    button.onclick = function () {
      sendMode = button.dataset.mode;
      composeMode.querySelectorAll("[data-mode]").forEach(function (item) {
        item.classList.toggle("active", item === button);
      });
      messageTitle.hidden = sendMode === "assistant";
      messageText.placeholder = sendMode === "assistant" ? "Nhập câu hỏi cho Gemini…" : "Nhập nội dung gửi tới frame…";
      messageSend.textContent = sendMode === "assistant" ? "Hỏi Gemini" : "Gửi tới màn hình";
    };
  });

  composeForm.onsubmit = function (event) {
    event.preventDefault();
    var text = messageText.value.trim();
    if (!text) return toast("Hãy nhập nội dung");
    messageSend.disabled = true;
    command(
      sendMode === "assistant"
        ? { action: "assistant_query", text: text }
        : { action: "show_message", title: messageTitle.value.trim(), text: text },
      sendMode === "assistant" ? "Gemini đang xử lý" : "Đã gửi thông báo",
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
    var date = new Date(Date.now() + 5 * 60000);
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
      label: labelInput.value.trim() || "Báo thức",
      repeatDays: repeatDays.slice(),
      confirmCount: confirmCount,
      enabled: true,
    }, "Đã thêm báo thức")
      .then(closeModal)
      .catch(function () {})
      .then(function () { submit.disabled = false; });
  };

  if (token) refresh().catch(function () {});
  clearInterval(refreshTimer);
  refreshTimer = setInterval(function () {
    if (token && !controls.hidden) refresh({ quiet: true }).catch(function () {});
  }, 5000);
})();
