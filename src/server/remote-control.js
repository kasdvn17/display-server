// ---------------- Remote control ----------------
app.post("/frame/heartbeat", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const sessionId = String(body.sessionId || "").trim().slice(0, 100);
  if (!sessionId)
    return res.status(400).json({ error: "Thiếu sessionId" });
  const previousSession = frameSessions.get(sessionId);
  const nextHeartbeat = {
    sessionId,
    startedVersion:
      previousSession && Number.isFinite(Number(previousSession.startedVersion))
        ? Number(previousSession.startedVersion)
        : remoteControlVersion,
    lastSeen: Date.now(),
    view: String(body.view || "").slice(0, 30),
    idle: !!body.idle,
    assistantState: String(body.assistantState || "idle").slice(0, 30),
    assistantBusy: !!body.assistantBusy,
    pageOpen: !!body.pageOpen,
    pageTitle: String(body.pageTitle || "").slice(0, 180),
    cameraState: String(body.cameraState || "").slice(0, 30),
    lastError: String(body.lastError || "").slice(0, 500),
  };
  frameSessions.set(sessionId, nextHeartbeat);
  frameHeartbeat = nextHeartbeat;
  const staleBefore = Date.now() - 5 * 60 * 1000;
  for (const [id, session] of frameSessions)
    if (Number(session.lastSeen || 0) < staleBefore) frameSessions.delete(id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

function remoteStatusPayload() {
  const now = Date.now();
  const notifications = activeFrameNotifications();
  return {
    online: !!frameHeartbeat.lastSeen && now - frameHeartbeat.lastSeen < 30000,
    lastSeen: frameHeartbeat.lastSeen
      ? new Date(frameHeartbeat.lastSeen).toISOString()
      : "",
    frame: {
      view: frameHeartbeat.view,
      idle: frameHeartbeat.idle,
      assistantState: frameHeartbeat.assistantState,
      assistantBusy: frameHeartbeat.assistantBusy,
      pageOpen: frameHeartbeat.pageOpen,
      pageTitle: frameHeartbeat.pageTitle,
      cameraState: frameHeartbeat.cameraState,
      lastError: frameHeartbeat.lastError,
    },
    services: {
      gemini: {
        configured: !!GEMINI_API_KEY,
        lastError: frameHeartbeat.lastError,
      },
      calendar: {
        configured: !!FRAME_CALENDAR_ICS_URL,
        cachedItems: calendarCache.items.length,
        lastSuccess: systemDiagnostics.calendar.lastSuccess,
        lastError: systemDiagnostics.calendar.lastError,
      },
      context: {
        configured:
          !!systemDiagnostics.context.lastSuccess ||
          (finiteCoord(FRAME_LATITUDE, -90, 90) != null &&
            finiteCoord(FRAME_LONGITUDE, -180, 180) != null),
        lastSuccess: systemDiagnostics.context.lastSuccess,
        lastError: systemDiagnostics.context.lastError,
      },
      camera: { configured: !!CAMERA_REMOTE_TOKEN },
    },
    notifications,
    routines: routineDefinitions(null),
  };
}

// Registered display sessions keep command payloads out of anonymous polls and
// allow Safari, kiosk mode, and other active displays to consume the same queue.
app.get("/remote/control", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (String((req.query && req.query.display) || "") === "1") {
    const session = String((req.query && req.query.session) || "");
    const displayHeartbeat = session ? frameSessions.get(session) : null;
    if (!displayHeartbeat)
      return res.status(403).json({ error: "Phiên màn hình không xác định" });
    displayHeartbeat.lastSeen = Date.now();
    if (frameHeartbeat.sessionId === session)
      frameHeartbeat.lastSeen = displayHeartbeat.lastSeen;
    const after = Math.max(
      Number(displayHeartbeat.startedVersion || 0),
      Math.max(0, Number((req.query && req.query.after) || 0) || 0),
    );
    return res.json({
      ok: true,
      version: remoteControlVersion,
      commandId: remoteCommandId,
      dismissVersion: remoteDismissVersion,
      dismissId: remoteDismissId,
      lastAction: remoteLastCommand ? remoteLastCommand.action : "",
      commands: remoteCommands
        .filter((command) => Number(command.version || 0) > after)
        .slice(0, 30),
    });
  }
  if (!REMOTE_CONTROL_TOKEN)
    return res.status(503).json({ error: "Chưa cấu hình điều khiển từ xa" });
  if (!remoteTokenMatches(remoteTokenFromRequest(req)))
    return res.status(401).json({ error: "Không được phép truy cập" });
  const items = readAlarmsFile().sort(
    (a, b) =>
      String(a.time).localeCompare(String(b.time)) ||
      String(a.createdAt).localeCompare(String(b.createdAt)),
  );
  return res.json({
    ok: true,
    version: remoteControlVersion,
    commandId: remoteCommandId,
    dismissVersion: remoteDismissVersion,
    dismissId: remoteDismissId,
    lastCommand: remoteLastCommand,
    alarms: items,
    status: remoteStatusPayload(),
  });
});

app.post("/remote/control", requireRemoteControl, (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = String(body.action || "")
    .trim()
    .toLowerCase();
  try {
    const queuedActions = [
      "navigate",
      "close_page",
      "back",
      "idle",
      "reload",
      "stop_assistant",
      "run_routine",
      "show_message",
      "assistant_query",
      "retry_context",
      "retry_calendar",
      "retry_camera",
    ];
    if (queuedActions.includes(action)) {
      const now = Date.now();
      const hasOnlineDisplay = Array.from(frameSessions.values()).some(
        (session) => now - Number(session.lastSeen || 0) < 30000,
      );
      if (!hasOnlineDisplay)
        return res.status(409).json({ error: "Màn hình đang offline" });
      const extra = {};
      if (action === "navigate") {
        const view = String(body.view || "").trim().toLowerCase();
        if (!["home", "today", "media", "news", "alarm"].includes(view))
          return res.status(400).json({ error: "Tab không hợp lệ" });
        extra.view = view;
      }
      if (action === "run_routine") {
        const routineId = String(body.routineId || body.id || "").trim();
        if (!["morning", "leaving", "day-check", "evening"].includes(routineId))
          return res.status(400).json({ error: "Thói quen không hợp lệ" });
        extra.routineId = routineId;
      }
      if (action === "show_message") {
        extra.title = String(body.title || "Tin nhắn từ Remote").trim().slice(0, 160);
        extra.text = String(body.text || body.message || "").trim().slice(0, 2000);
        if (!extra.text) return res.status(400).json({ error: "Cần nhập nội dung" });
      }
      if (action === "assistant_query") {
        extra.text = String(body.text || body.message || "").trim().slice(0, 2000);
        if (!extra.text) return res.status(400).json({ error: "Cần nhập câu hỏi" });
      }
      if (action === "retry_context") ambientContextCache.clear();
      if (action === "retry_calendar") {
        calendarCache.expires = 0;
        ambientContextCache.clear();
      }
      const cmd = noteRemoteCommand(action, extra);
      return res.json({ ok: true, action, command: cmd });
    }

    if (action === "read_all_notifications") {
      const state = readFrameState();
      const now = new Date().toISOString();
      state.notifications = state.notifications.map((item) =>
        item.dismissedAt || item.readAt ? item : { ...item, readAt: now },
      );
      writeFrameState(state);
      return res.json({ ok: true, action });
    }

    if (action === "dismiss_notification") {
      const id = String(body.id || "").trim();
      const state = readFrameState();
      const item = state.notifications.find((entry) => String(entry.id) === id);
      if (!item) return res.status(404).json({ error: "Không tìm thấy thông báo" });
      item.dismissedAt = new Date().toISOString();
      writeFrameState(state);
      return res.json({ ok: true, action, id });
    }

    if (action === "add_alarm" || action === "add") {
      const item = createAlarmRecord(
        body.alarm && typeof body.alarm === "object" ? body.alarm : body,
      );
      const items = readAlarmsFile();
      items.push(item);
      writeAlarmsFile(items);
      noteRemoteCommand("add_alarm", { alarmId: item.id });
      return res
        .status(201)
        .json({ ok: true, action: "add_alarm", alarm: item });
    }

    if (
      action === "enable_alarm" ||
      action === "disable_alarm" ||
      action === "set_alarm_enabled"
    ) {
      const id = String(body.id || body.alarmId || "").trim();
      if (!id) return res.status(400).json({ error: "Thiếu id" });
      const items = readAlarmsFile();
      const index = items.findIndex((a) => String(a.id) === id);
      if (index < 0) return res.status(404).json({ error: "Không tìm thấy báo thức" });
      const enabled =
        action === "enable_alarm"
          ? true
          : action === "disable_alarm"
            ? false
            : !!body.enabled;
      items[index] = {
        ...items[index],
        enabled,
        lastTriggeredDate: "",
        updatedAt: new Date().toISOString(),
      };
      writeAlarmsFile(items);
      noteRemoteCommand(enabled ? "enable_alarm" : "disable_alarm", {
        alarmId: id,
      });
      return res.json({
        ok: true,
        action: enabled ? "enable_alarm" : "disable_alarm",
        alarm: items[index],
      });
    }

    if (action === "delete_alarm" || action === "delete") {
      const id = String(body.id || body.alarmId || "").trim();
      if (!id) return res.status(400).json({ error: "Thiếu id" });
      const items = readAlarmsFile();
      const next = items.filter((a) => String(a.id) !== id);
      if (next.length === items.length)
        return res.status(404).json({ error: "Không tìm thấy báo thức" });
      writeAlarmsFile(next);
      noteRemoteCommand("delete_alarm", { alarmId: id });
      return res.json({ ok: true, action: "delete_alarm", alarmId: id });
    }

    if (
      action === "dismiss_alarm" ||
      action === "stop_alarm" ||
      action === "dismiss"
    ) {
      remoteDismissVersion++;
      remoteDismissId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : crypto.randomBytes(16).toString("hex");
      const cmd = noteRemoteCommand("dismiss_alarm", {
        dismissVersion: remoteDismissVersion,
        dismissId: remoteDismissId,
      });
      return res.json({
        ok: true,
        action: "dismiss_alarm",
        dismissVersion: remoteDismissVersion,
        dismissId: remoteDismissId,
        commandId: cmd.id,
      });
    }

    return res.status(400).json({
      error: "Thao tác không xác định",
      actions: [
        "add_alarm",
        "enable_alarm",
        "disable_alarm",
        "set_alarm_enabled",
        "delete_alarm",
        "dismiss_alarm",
        ...queuedActions,
        "read_all_notifications",
        "dismiss_notification",
      ],
    });
  } catch (err) {
    return res
      .status(400)
      .json({ error: err.message || "Lệnh điều khiển từ xa thất bại" });
  }
});

app.get("/calendar", async (req, res) => {
  const data = await getCalendarEvents(req.query.refresh === "1");
  res.setHeader("Cache-Control", "private, max-age=60");
  res.json(data);
});

