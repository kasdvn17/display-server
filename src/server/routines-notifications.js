// ---------------- Routines / morning briefing / notification center ----------------
// The server composes these payloads so the display only renders ready-to-use data.
function frameDateKey(value = new Date()) {
  const parts = datePartsInZone(value, FRAME_TIMEZONE);
  return (
    String(parts.y).padStart(4, "0") +
    "-" +
    String(parts.mo).padStart(2, "0") +
    "-" +
    String(parts.d).padStart(2, "0")
  );
}

function frameLocalHour(value = new Date()) {
  return Number(datePartsInZone(value, FRAME_TIMEZONE).h) || 0;
}

function requestFrameCoordinates(input) {
  input = input && typeof input === "object" ? input : {};
  return {
    latitude:
      finiteCoord(input.latitude ?? input.lat, -90, 90) ??
      finiteCoord(FRAME_LATITUDE, -90, 90),
    longitude:
      finiteCoord(input.longitude ?? input.lon ?? input.lng, -180, 180) ??
      finiteCoord(FRAME_LONGITUDE, -180, 180),
  };
}

async function getRoutineAmbientContext(input) {
  const coords = requestFrameCoordinates(input);
  if (coords.latitude == null || coords.longitude == null) {
    const calendar = await getCalendarEvents(false).catch(() => ({
      configured: false,
      name: FRAME_CALENDAR_NAME,
      events: [],
    }));
    return {
      configured: false,
      generatedAt: new Date().toISOString(),
      location: { name: FRAME_LOCATION_NAME },
      weather: {},
      air: {},
      calendar,
      commutes: [],
      notifications: [],
    };
  }
  const key = `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}`;
  const cached = ambientContextCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.payload;
  const payload = await buildAmbientContext(coords.latitude, coords.longitude);
  boundedCacheSet(
    ambientContextCache,
    key,
    { expires: Date.now() + AMBIENT_CONTEXT_REFRESH_MS, payload },
    40,
  );
  return payload;
}

function activeFrameNotifications() {
  const now = Date.now();
  const items = readFrameState().notifications
    .filter((item) => {
      if (!item || item.dismissedAt) return false;
      const expires = item.expiresAt ? new Date(item.expiresAt).getTime() : 0;
      return !Number.isFinite(expires) || !expires || expires > now;
    })
    .sort(
      (a, b) =>
        Number(b.priority || 0) - Number(a.priority || 0) ||
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
  return {
    items,
    unreadCount: items.filter((item) => !item.readAt).length,
  };
}

function repeatDaysText(days) {
  if (!Array.isArray(days) || !days.length) return "One time";
  if (days.length === 7) return "Daily";
  const labels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return days.map((day) => labels[Number(day)] || "").filter(Boolean).join(", ");
}

function upcomingAlarmItems() {
  return readAlarmsFile()
    .filter((alarm) => alarm && alarm.enabled)
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
    .slice(0, 5)
    .map((alarm) => ({
      label: String(alarm.time || "--:--"),
      value: String(alarm.label || "Alarm"),
      detail: repeatDaysText(alarm.repeatDays),
    }));
}

function calendarWidgetItems(context, limit = 6) {
  const events =
    context && context.calendar && Array.isArray(context.calendar.events)
      ? context.calendar.events
      : [];
  return events.slice(0, limit).map((event) => ({
    time: String(event.start || ""),
    title: String(event.title || "Event"),
    detail: [event.location, event.description].filter(Boolean).join(" · "),
    url: String(event.url || ""),
  }));
}

function contextAlertItems(context) {
  const current = activeFrameNotifications().items;
  const contextIds = new Set(
    (context && Array.isArray(context.notifications)
      ? context.notifications
      : []
    ).map((item) => String(item.id || "")),
  );
  return current
    .filter(
      (item) =>
        !item.readAt || contextIds.has(String(item.id || "")) || item.priority >= 85,
    )
    .slice(0, 6)
    .map((item) => ({
      label: String(item.type || "Information"),
      value: String(item.title || "Notification"),
      detail: String(item.body || ""),
      icon: String(item.icon || item.type || "info"),
    }));
}

function buildMorningBriefing(context) {
  const weather = (context && context.weather) || {};
  const air = (context && context.air) || {};
  const commutes = Array.isArray(context && context.commutes)
    ? context.commutes.slice().sort((a, b) => a.leaveInMinutes - b.leaveInMinutes)
    : [];
  const widgets = [];
  widgets.push({
    type: "weather",
    span: 4,
    order: 0,
    emphasis: "hero",
    title: weather.label || "Weather",
    value:
      weather.temperature == null ? "—" : `${Math.round(weather.temperature)}°`,
    text: [
      weather.maxRainChanceNext3h == null
        ? ""
        : `${Math.round(weather.maxRainChanceNext3h)}% chance of rain`,
      air.aqi == null ? "" : `AQI ${Math.round(air.aqi)}`,
      air.maxUvNext12h == null ? "" : `UV ${Math.round(air.maxUvNext12h)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  });
  const events = calendarWidgetItems(context, 6);
  widgets.push({
    type: "calendar",
    span: 8,
    order: 1,
    title: "Upcoming calendar",
    items: events,
    text: events.length ? "" : "No upcoming events.",
  });
  if (commutes.length) {
    const commute = commutes[0];
    widgets.push({
      type: "stats",
      span: 6,
      order: 2,
      title: "Commute",
      items: [
        {
          label: "Departure",
          value:
            commute.leaveInMinutes <= 0
              ? "Leave now"
              : `In ${commute.leaveInMinutes} minutes`,
        },
        { label: "Duration", value: `${commute.durationMinutes} minutes` },
        {
          label: "Destination",
          value: String(commute.eventTitle || commute.name || "Destination"),
        },
      ],
    });
  }
  const alerts = contextAlertItems(context);
  if (alerts.length)
    widgets.push({
      type: "callout",
      span: commutes.length ? 6 : 12,
      order: 3,
      title: "Things to note",
      items: alerts,
    });
  const alarms = upcomingAlarmItems();
  if (alarms.length)
    widgets.push({
      type: "list",
      span: 12,
      order: 4,
      title: "Active alarms",
      items: alarms,
    });
  return {
    kind: "dynamic_ui",
    kicker: "Morning briefing",
    title: "Good morning",
    subtitle: `Summary for ${FRAME_LOCATION_NAME} · ${frameDateKey()}`,
    layout: { columns: 12, gap: 14, density: "comfortable" },
    widgets,
  };
}

function routineDefinitions(context) {
  const hour = frameLocalHour();
  const commute =
    context && Array.isArray(context.commutes) ? context.commutes[0] : null;
  const suggestedId =
    commute && Number(commute.leaveInMinutes) <= 60
      ? "leaving"
      : hour >= 18 || hour < 5
        ? "evening"
        : hour < 12
          ? "morning"
          : "day-check";
  return [
    {
      id: "morning",
      name: "Good morning",
      description: "Weather, calendar, commute, alerts, and alarms.",
      icon: "sun",
      suggested: suggestedId === "morning",
    },
    {
      id: "leaving",
      name: "Leave home",
      description: "Departure time, weather, and the next event.",
      icon: "route",
      suggested: suggestedId === "leaving",
    },
    {
      id: "day-check",
      name: "Check today",
      description: "Calendar summary and unread notifications.",
      icon: "calendar",
      suggested: suggestedId === "day-check",
    },
    {
      id: "evening",
      name: "Evening preparation",
      description: "Alarms, upcoming calendar, and things to note.",
      icon: "moon",
      suggested: suggestedId === "evening",
    },
  ];
}

function buildRoutineDisplay(id, context) {
  if (id === "morning") return buildMorningBriefing(context);
  const alerts = contextAlertItems(context);
  const events = calendarWidgetItems(context, 6);
  const alarms = upcomingAlarmItems();
  const weather = (context && context.weather) || {};
  const commutes = Array.isArray(context && context.commutes)
    ? context.commutes
    : [];
  const widgets = [];
  if (id === "leaving") {
    const commute = commutes[0];
    widgets.push({
      type: "stats",
      span: 7,
      order: 0,
      emphasis: "hero",
      title: "Commute plan",
      items: commute
        ? [
            {
              label: "Departure",
              value:
                commute.leaveInMinutes <= 0
                  ? "Leave now"
                  : `In ${commute.leaveInMinutes} minutes`,
            },
            { label: "Duration", value: `${commute.durationMinutes} minutes` },
            { label: "Destination", value: commute.eventTitle || commute.name },
          ]
        : [{ label: "Status", value: "No upcoming trips" }],
    });
    widgets.push({
      type: "weather",
      span: 5,
      order: 1,
      title: weather.label || "Weather",
      value:
        weather.temperature == null
          ? "—"
          : `${Math.round(weather.temperature)}°`,
      text:
        weather.maxRainChanceNext3h == null
          ? ""
          : `${Math.round(weather.maxRainChanceNext3h)}% chance of rain`,
    });
  } else {
    widgets.push({
      type: "calendar",
      span: 7,
      order: 0,
      emphasis: "hero",
      title: "Upcoming calendar",
      items: events,
      text: events.length ? "" : "No upcoming events.",
    });
    widgets.push({
      type: "list",
      span: 5,
      order: 1,
      title: "Active alarms",
      items: alarms,
      text: alarms.length ? "" : "No active alarms.",
    });
  }
  if (alerts.length)
    widgets.push({
      type: "callout",
      span: 12,
      order: 3,
      title: "Important notifications",
      items: alerts,
    });
  const title =
    id === "leaving"
      ? "Ready to leave home"
      : id === "evening"
        ? "Evening preparation"
        : "Today's overview";
  return {
    kind: "dynamic_ui",
    kicker: "Nest routines",
    title,
    subtitle: "Generated on the server from the latest data.",
    layout: { columns: 12, gap: 14, density: "comfortable" },
    widgets,
  };
}

app.get("/routines", async (req, res) => {
  try {
    const context = await getRoutineAmbientContext(req.query);
    res.setHeader("Cache-Control", "no-store");
    res.json({ items: routineDefinitions(context), generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: "Unable to load routines", detail: String(err.message || err) });
  }
});

app.post("/routines/:id/run", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!["morning", "leaving", "day-check", "evening"].includes(id))
    return res.status(404).json({ error: "Routine not found" });
  try {
    const context = await getRoutineAmbientContext(req.body);
    const display = buildRoutineDisplay(id, context);
    return res.json({ ok: true, routineId: id, display });
  } catch (err) {
    recordFrameNotification({
      id: `system:routine:${id}`,
      type: "error",
      priority: 72,
      title: "Unable to complete routine",
      body: String(err.message || err),
      icon: "error",
    });
    return res.status(502).json({ error: "Unable to complete routine", detail: String(err.message || err) });
  }
});

app.get("/briefing/morning", async (req, res) => {
  try {
    const context = await getRoutineAmbientContext(req.query);
    const state = readFrameState();
    const dateKey = frameDateKey();
    const hour = frameLocalHour();
    const eligible =
      hour >= FRAME_MORNING_BRIEF_START_HOUR &&
      hour <= FRAME_MORNING_BRIEF_END_HOUR;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      dateKey,
      eligible,
      autoShow:
        eligible &&
        state.morningBrief.presentedDate !== dateKey &&
        state.morningBrief.dismissedDate !== dateKey,
      context,
      display: buildMorningBriefing(context),
    });
  } catch (err) {
    res.status(502).json({ error: "Unable to create morning briefing", detail: String(err.message || err) });
  }
});

function markMorningBrief(field, res) {
  const state = readFrameState();
  state.morningBrief[field] = frameDateKey();
  writeFrameState(state);
  res.json({ ok: true, dateKey: state.morningBrief[field] });
}

app.post("/briefing/morning/presented", (_req, res) =>
  markMorningBrief("presentedDate", res),
);
app.post("/briefing/morning/dismiss", (_req, res) =>
  markMorningBrief("dismissedDate", res),
);

app.get("/notifications", (req, res) => {
  const payload = activeFrameNotifications();
  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
});

app.post("/notifications", (req, res) => {
  const item = cleanFrameNotification(req.body);
  upsertFrameNotifications(item);
  res.status(201).json({ ok: true, item });
});

app.put("/notifications/read-all", (_req, res) => {
  const state = readFrameState();
  const now = new Date().toISOString();
  state.notifications = state.notifications.map((item) =>
    item.dismissedAt || item.readAt ? item : { ...item, readAt: now },
  );
  writeFrameState(state);
  res.json({ ok: true });
});

app.put("/notifications/:id/read", (req, res) => {
  const state = readFrameState();
  const item = state.notifications.find(
    (entry) => String(entry.id) === String(req.params.id),
  );
  if (!item) return res.status(404).json({ error: "Notification not found" });
  item.readAt = item.readAt || new Date().toISOString();
  writeFrameState(state);
  res.json({ ok: true, item });
});

app.delete("/notifications/:id", (req, res) => {
  const state = readFrameState();
  const item = state.notifications.find(
    (entry) => String(entry.id) === String(req.params.id),
  );
  if (!item) return res.status(404).json({ error: "Notification not found" });
  item.dismissedAt = new Date().toISOString();
  writeFrameState(state);
  res.json({ ok: true });
});
