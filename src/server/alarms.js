// ---------------- Alarm persistence ----------------
// Alarm definitions live in a JSON file beside the server by default. Disabled
// alarms remain in the file and are always returned to the client.
const MAX_ALARM_CONFIRMATIONS = ALARM_MAX_CONFIRMATIONS;

// Remote control API. Keep this token secret; the display itself never needs it.
// POST /remote/control accepts alarm commands from another device/service.
let remoteControlVersion = 0;
let remoteDismissVersion = 0;
let remoteLastCommand = null;
let remoteCommands = [];
const frameSessions = new Map();
let frameHeartbeat = {
  sessionId: "",
  lastSeen: 0,
  view: "",
  idle: false,
  assistantState: "idle",
  assistantBusy: false,
  pageOpen: false,
  pageTitle: "",
  cameraState: "",
  lastError: "",
};
// Unique command ids avoid version collisions when Node restarts.
let remoteCommandId = "";
let remoteDismissId = "";

function remoteTokenFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const headerToken = String(req.headers["x-remote-token"] || "").trim();
  if (headerToken) return headerToken;
  return String((req.query && req.query.token) || "").trim();
}

function remoteTokenMatches(candidate) {
  if (!REMOTE_CONTROL_TOKEN || !candidate) return false;
  const a = Buffer.from(REMOTE_CONTROL_TOKEN);
  const b = Buffer.from(String(candidate));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireRemoteControl(req, res, next) {
  if (!REMOTE_CONTROL_TOKEN)
    return res.status(503).json({ error: "Chưa cấu hình điều khiển từ xa" });
  if (!remoteTokenMatches(remoteTokenFromRequest(req)))
    return res.status(401).json({ error: "Không được phép truy cập" });
  next();
}

function createAlarmRecord(input) {
  const data = cleanAlarmInput(input, null);
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString("hex"),
    ...data,
    lastTriggeredDate: "",
    createdAt: now,
    updatedAt: now,
  };
}

function noteRemoteCommand(action, extra) {
  remoteControlVersion++;
  remoteCommandId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  remoteLastCommand = {
    id: remoteCommandId,
    version: remoteControlVersion,
    action: String(action || ""),
    at: new Date().toISOString(),
    ...(extra || {}),
  };
  remoteCommands.push(remoteLastCommand);
  if (remoteCommands.length > 100) remoteCommands = remoteCommands.slice(-100);
  return remoteLastCommand;
}

function ensureAlarmsFile() {
  try {
    if (!fs.existsSync(ALARMS_FILE)) {
      fs.mkdirSync(path.dirname(ALARMS_FILE), { recursive: true });
      fs.writeFileSync(ALARMS_FILE, "[]\n", "utf8");
    }
  } catch (err) {
    console.error("Could not initialize alarm file:", err.message || err);
  }
}

function readAlarmsFile() {
  ensureAlarmsFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(ALARMS_FILE, "utf8") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Could not read alarms.json:", err.message || err);
    return [];
  }
}

function writeAlarmsFile(items) {
  ensureAlarmsFile();
  const tmp = ALARMS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, ALARMS_FILE);
}

function cleanAlarmInput(input, existing) {
  input = input && typeof input === "object" ? input : {};
  const time = String(input.time ?? existing?.time ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Thời gian báo thức không hợp lệ");
  const label =
    String(input.label ?? existing?.label ?? "Báo thức")
      .trim()
      .slice(0, 80) || "Báo thức";
  const enabled =
    input.enabled === undefined
      ? existing
        ? !!existing.enabled
        : true
      : !!input.enabled;
  const rawDays = Array.isArray(input.repeatDays)
    ? input.repeatDays
    : existing?.repeatDays || [];
  const repeatDays = [
    ...new Set(
      rawDays
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  const confirmCount = Math.max(
    1,
    Math.min(
      MAX_ALARM_CONFIRMATIONS,
      Math.round(
        Number(input.confirmCount ?? existing?.confirmCount ?? 1) || 1,
      ),
    ),
  );
  const rawScheduledDate = String(
    input.scheduledDate ?? existing?.scheduledDate ?? "",
  ).trim();
  const scheduledDate =
    !repeatDays.length && /^\d{4}-\d{2}-\d{2}$/.test(rawScheduledDate)
      ? rawScheduledDate
      : "";
  return { time, label, enabled, repeatDays, confirmCount, scheduledDate };
}

function relativeAlarmMinutes(text) {
  const source = String(text || "")
    .toLocaleLowerCase("vi")
    .replace(/,/g, ".");
  if (!/(?:nữa|sau|trong|kể từ|tính từ)/i.test(source)) return 0;
  let total = 0,
    matched = false;
  const hours = source.match(/(\d+(?:\.\d+)?)\s*(?:giờ|tiếng)/i);
  const minutes = source.match(/(\d+(?:\.\d+)?)\s*(?:phút|phut)/i);
  if (hours) {
    total += Number(hours[1]) * 60;
    matched = true;
  }
  if (minutes) {
    total += Number(minutes[1]);
    matched = true;
  }
  if (/(?:nửa|nua)\s*(?:giờ|tiếng)/i.test(source)) {
    total += 30;
    matched = true;
  }
  return matched && Number.isFinite(total)
    ? Math.max(1, Math.min(7 * 24 * 60, Math.round(total)))
    : 0;
}

function frameAlarmTarget(minutes) {
  const targetMs = Math.ceil((Date.now() + minutes * 60000) / 60000) * 60000;
  const parts = datePartsInZone(new Date(targetMs), FRAME_TIMEZONE);
  return {
    time:
      String(parts.h).padStart(2, "0") +
      ":" +
      String(parts.mi).padStart(2, "0"),
    scheduledDate:
      String(parts.y).padStart(4, "0") +
      "-" +
      String(parts.mo).padStart(2, "0") +
      "-" +
      String(parts.d).padStart(2, "0"),
  };
}

app.get("/alarms", (req, res) => {
  const items = readAlarmsFile().sort(
    (a, b) =>
      String(a.time).localeCompare(String(b.time)) ||
      String(a.createdAt).localeCompare(String(b.createdAt)),
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({
    items,
    maxConfirmations: MAX_ALARM_CONFIRMATIONS,
    confirmIntervalMinutes: 5,
  });
});

app.post("/alarms", (req, res) => {
  try {
    const item = createAlarmRecord(req.body);
    const items = readAlarmsFile();
    items.push(item);
    writeAlarmsFile(items);
    recordFrameNotification({
      id: `alarm:created:${item.id}`,
      type: "alarm",
      priority: 48,
      title: `Đã đặt báo thức ${item.time}`,
      body: `${item.label} · ${repeatDaysText(item.repeatDays)}`,
      icon: "alarm",
      action: "open-alarms",
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message || "Báo thức không hợp lệ" });
  }
});

app.put("/alarms/:id", (req, res) => {
  try {
    const items = readAlarmsFile();
    const index = items.findIndex(
      (a) => String(a.id) === String(req.params.id),
    );
    if (index < 0) return res.status(404).json({ error: "Không tìm thấy báo thức" });
    const previous = items[index];
    const data = cleanAlarmInput(req.body, previous);
    items[index] = {
      ...previous,
      ...data,
      // A user edit/toggle starts a fresh schedule evaluation.
      lastTriggeredDate: "",
      updatedAt: new Date().toISOString(),
    };
    writeAlarmsFile(items);
    res.json(items[index]);
  } catch (err) {
    res.status(400).json({ error: err.message || "Báo thức không hợp lệ" });
  }
});

app.delete("/alarms/:id", (req, res) => {
  const items = readAlarmsFile();
  const next = items.filter((a) => String(a.id) !== String(req.params.id));
  if (next.length === items.length)
    return res.status(404).json({ error: "Không tìm thấy báo thức" });
  writeAlarmsFile(next);
  res.status(204).end();
});

// Marks the scheduled occurrence as consumed before the first ring is shown.
// This prevents a page reload during the same minute from creating a duplicate cycle.
app.post("/alarms/:id/trigger", (req, res) => {
  const dateKey = String((req.body && req.body.dateKey) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    return res.status(400).json({ error: "Ngày không hợp lệ" });
  const items = readAlarmsFile();
  const index = items.findIndex((a) => String(a.id) === String(req.params.id));
  if (index < 0) return res.status(404).json({ error: "Không tìm thấy báo thức" });
  items[index] = {
    ...items[index],
    lastTriggeredDate: dateKey,
    updatedAt: new Date().toISOString(),
  };
  writeAlarmsFile(items);
  recordFrameNotification({
    id: `alarm:triggered:${items[index].id}:${dateKey}`,
    type: "alarm",
    priority: 88,
    title: `Báo thức ${items[index].time}`,
      body: String(items[index].label || "Báo thức"),
    icon: "alarm",
    action: "open-alarms",
  });
  res.json(items[index]);
});
