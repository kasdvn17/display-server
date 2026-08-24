// Every visual data tool is converted to the same Dynamic UI contract on the
// server. The browser commits at most one candidate per voice turn, so a late
// model-authored render call cannot replace this stable canonical layout.
function voiceResultDisplay(result) {
  if (!result || typeof result !== "object") return null;
  if (result.kind === "dynamic_ui") return result;
  const base = {
    kind: "dynamic_ui",
    kicker: serverLocaleText("Nest Assistant", "Trợ lý Nest"),
    title: serverLocaleText("Information", "Thông tin"),
    subtitle: "",
    layout: { columns: 12, gap: 14, density: "comfortable" },
    widgets: [],
  };
  const item = (x) => ({
    label: String((x && x.label) || ""),
    value: String((x && x.value) || ""),
    detail: String((x && x.detail) || ""),
    title: String((x && x.title) || ""),
    subtitle: String((x && x.subtitle) || ""),
    text: String((x && x.text) || ""),
    url: String((x && (x.url || x.href || x.link)) || ""),
    image: String((x && x.image) || ""),
    icon: String((x && x.icon) || ""),
    time: String((x && x.time) || ""),
    date: String((x && x.date) || ""),
    source: String((x && x.source) || ""),
  });
  if (result.kind === "recipe") {
    base.kicker = serverLocaleText("Recipe", "Công thức");
    base.title = String(result.title || serverLocaleText("Recipe", "Công thức"));
    base.subtitle = String(result.summary || "");
    const chips = [];
    if (result.timeMinutes) chips.push({ value: serverLocaleText(`${result.timeMinutes} minutes`, `${result.timeMinutes} phút`) });
    if (result.servings) chips.push({ value: serverLocaleText(`${result.servings} servings`, `${result.servings} khẩu phần`) });
    if (chips.length)
      base.widgets.push({
        type: "chips",
        span: 12,
        order: 0,
        title: serverLocaleText("Summary", "Tóm tắt"),
        items: chips,
      });
    base.widgets.push({
      type: "list",
      span: 5,
      order: 1,
      title: serverLocaleText("Ingredients", "Nguyên liệu"),
      items: (result.ingredients || []).map((x, i) => ({
        label: String(i + 1),
        value: String(x),
      })),
    });
    base.widgets.push({
      type: "recipe",
      span: 7,
      order: 2,
      emphasis: "hero",
      title: serverLocaleText("Directions", "Cách làm"),
      items: (result.steps || []).map((x, i) => ({
        label: String(i + 1),
        value: String(x),
      })),
    });
    if ((result.tips || []).length)
      base.widgets.push({
        type: "callout",
        span: 12,
        order: 3,
        title: serverLocaleText("Tips", "Mẹo nhỏ"),
        items: result.tips.map((x) => ({ value: String(x) })),
      });
    return base;
  }
  if (result.kind === "directions") {
    const origin = result.origin || {},
      destination = result.destination || {};
    base.kicker = serverLocaleText("Directions", "Chỉ đường");
    base.title = serverLocaleText("Route", "Lộ trình");
    base.subtitle = [origin.name, destination.name].filter(Boolean).join(" → ");
    base.widgets = [
      {
        type: "stats",
        span: 4,
        order: 0,
        emphasis: "hero",
        title: serverLocaleText("Estimate", "Ước tính"),
        items: [
          {
            label: serverLocaleText("Duration", "Thời gian"),
            value: serverLocaleText(`${result.durationMinutes || "—"} minutes`, `${result.durationMinutes || "—"} phút`),
          },
          {
            label: serverLocaleText("Distance", "Khoảng cách"),
            value: result.distanceKm != null ? `${result.distanceKm} km` : "—",
          },
          { label: serverLocaleText("Mode", "Phương tiện"), value: serverLocaleText("Car", "Ô tô") },
        ],
      },
      {
        type: "facts",
        span: 8,
        order: 1,
        title: serverLocaleText("Journey", "Hành trình"),
        items: [
          {
            label: serverLocaleText("Origin", "Điểm đi"),
            value: String(origin.name || serverLocaleText("Current location", "Vị trí hiện tại")),
          },
          { label: serverLocaleText("Destination", "Điểm đến"), value: String(destination.name || serverLocaleText("Destination", "Điểm đến")) },
        ],
      },
    ];
    if ((result.steps || []).length)
      base.widgets.push({
        type: "timeline",
        span: 12,
        order: 2,
        title: serverLocaleText("Main steps", "Các chặng chính"),
        items: result.steps.map((x) => ({
          label:
            x.distanceMeters >= 1000
              ? `${Math.round(x.distanceMeters / 100) / 10} km`
              : `${x.distanceMeters} m`,
          title: String(x.instruction || serverLocaleText("Continue", "Tiếp tục")),
          detail: serverLocaleText(`About ${x.durationMinutes || 1} minutes`, `Khoảng ${x.durationMinutes || 1} phút`),
        })),
      });
    base.widgets.push({
      type: "sources",
      span: 12,
      order: 3,
      title: serverLocaleText("Map", "Bản đồ"),
      items: [
        result.mapsUrl
          ? {
              title: serverLocaleText("Open directions in Google Maps", "Mở chỉ đường trong Google Maps"),
              url: String(result.mapsUrl),
            }
          : null,
        {
          title: "Map data © OpenStreetMap contributors",
          url: "https://www.openstreetmap.org/copyright",
        },
      ].filter(Boolean),
    });
    return base;
  }
  if (result.kind === "weather") {
    const c = result.current || {};
    base.kicker = serverLocaleText("Weather", "Thời tiết");
    base.title = String(result.location || serverLocaleText("Weather", "Thời tiết"));
    base.subtitle = String(c.condition || "");
    base.widgets = [
      {
        type: "weather",
        span: 5,
        order: 0,
        emphasis: "hero",
        title: serverLocaleText("Current", "Hiện tại"),
        value: Number.isFinite(c.temperature)
          ? `${Math.round(c.temperature)}°`
          : "—",
        text: Number.isFinite(c.feelsLike)
          ? serverLocaleText(`Feels like ${Math.round(c.feelsLike)}°`, `Cảm giác như ${Math.round(c.feelsLike)}°`)
          : "",
      },
      {
        type: "stats",
        span: 7,
        order: 1,
        title: serverLocaleText("Conditions", "Điều kiện"),
        items: [
          {
            label: serverLocaleText("Humidity", "Độ ẩm"),
            value: Number.isFinite(c.humidity)
              ? `${Math.round(c.humidity)}%`
              : "—",
          },
          {
            label: serverLocaleText("Wind", "Gió"),
            value: Number.isFinite(c.wind) ? `${Math.round(c.wind)} km/h` : "—",
          },
          {
            label: "AQI",
            value: Number.isFinite(c.aqi) ? String(Math.round(c.aqi)) : "—",
            detail: c.aqiLabel || "",
          },
          {
            label: "UV",
            value: Number.isFinite(c.uv) ? String(Math.round(c.uv)) : "—",
          },
        ],
      },
      {
        type: "forecast",
        span: 12,
        order: 2,
        title: serverLocaleText("Forecast", "Dự báo"),
        items: (result.daily || []).map((x) => ({
          date: x.date,
          value: Number.isFinite(x.max)
            ? `${Math.round(x.max)}° / ${Math.round(x.min)}°`
            : "—",
          detail: [
            x.condition,
            Number.isFinite(x.rainChance)
              ? serverLocaleText(`${Math.round(x.rainChance)}% rain`, `Mưa ${Math.round(x.rainChance)}%`)
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      },
    ];
    return base;
  }
  if (result.kind === "person") {
    base.kicker = serverLocaleText("Profile", "Hồ sơ");
    base.title = String(result.title || serverLocaleText("Person", "Nhân vật"));
    base.subtitle = String(result.subtitle || "");
    base.widgets = [
      {
        type: "profile",
        span: 7,
        order: 0,
        emphasis: "hero",
        title: String(result.title || ""),
        subtitle: String(result.subtitle || ""),
        text: String(result.summary || ""),
        image: String(result.image || ""),
      },
      {
        type: "facts",
        span: 5,
        order: 1,
        title: serverLocaleText("Information", "Thông tin"),
        items: (result.facts || []).map(item),
      },
      {
        type: "sources",
        span: 12,
        order: 2,
        title: serverLocaleText("Sources", "Nguồn"),
        items: (result.sources || []).map((x) => ({
          title: String(x.name || x.title || serverLocaleText("Source", "Nguồn")),
          url: String(x.url || ""),
        })),
      },
    ];
    return base;
  }
  if (result.kind === "news-search" || result.kind === "web-search") {
    base.kicker = result.kind === "news-search" ? serverLocaleText("News", "Tin tức") : serverLocaleText("Search", "Tìm kiếm");
    base.title = String(result.title || serverLocaleText("Results", "Kết quả"));
    base.subtitle = String(result.subtitle || "");
    base.widgets = [
      {
        type: "news",
        span: 12,
        order: 0,
        emphasis: "hero",
        items: (result.items || []).map((x) => ({
          title: String(x.title || ""),
          detail: String(x.summary || x.snippet || ""),
          source: String(x.source || x.domain || ""),
          url: String(x.url || ""),
          image: String(x.image || ""),
        })),
      },
    ];
    return base;
  }
  if (result.kind === "calendar") {
    base.kicker = serverLocaleText("Calendar", "Lịch");
    base.title = String(result.name || serverLocaleText("Upcoming calendar", "Lịch sắp tới"));
    base.widgets = [
      {
        type: "calendar",
        span: 12,
        order: 0,
        emphasis: "hero",
        items: (result.events || []).map((x) => ({
          time: String(x.start || ""),
          title: String(x.title || serverLocaleText("Event", "Sự kiện")),
          detail: [x.location, x.description].filter(Boolean).join(" · "),
          url: String(x.url || ""),
        })),
      },
    ];
    return base;
  }
  if (result.kind === "spotify-devices") {
    base.kicker = "Spotify";
    base.title = serverLocaleText("Available devices", "Thiết bị khả dụng");
    base.subtitle = String(result.message || "");
    base.widgets = [
      {
        type: "list",
        span: 12,
        order: 0,
        emphasis: "hero",
        title: "Spotify Connect",
        items: (result.devices || []).map((device) => ({
          label: device.isActive ? serverLocaleText("Active", "Đang hoạt động") : serverLocaleText("Available", "Khả dụng"),
          value: String(device.name || serverLocaleText("Unnamed device", "Thiết bị chưa đặt tên")),
          detail: [
            String(device.type || ""),
            device.volumePercent == null
              ? ""
              : serverLocaleText(`Volume ${device.volumePercent}%`, `Âm lượng ${device.volumePercent}%`),
            device.isRestricted ? serverLocaleText("Restricted controls", "Điều khiển bị hạn chế") : "",
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      },
    ];
    return base;
  }
  if (result.kind === "info") {
    base.title = String(result.title || serverLocaleText("Information", "Thông tin"));
    base.subtitle = String(result.subtitle || "");
    base.widgets = [
      {
        type: "facts",
        span: 12,
        order: 0,
        items: (result.items || []).map(item),
      },
    ];
    return base;
  }
  return null;
}

app.get("/voice/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    configured: !!GEMINI_API_KEY,
    provider: "gemini-live",
    model: GEMINI_LIVE_MODEL,
    stt: "native-audio",
    tts: "native-audio",
  });
});

function geminiVoiceTools() {
  return voiceToolDefinitions().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

app.post("/voice/live-token", async (req, res) => {
  try {
    if (!GEMINI_API_KEY)
      return res
        .status(503)
        .json({ ok: false, error: "GEMINI_API_KEY is not configured" });
    const now = Date.now();
    const body = {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
    };
    const r = await fetchWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      12000,
    );
    const text = await r.text();
    if (!r.ok)
      throw new Error(`Gemini token ${r.status}: ${text.slice(0, 400)}`);
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("Gemini token returned invalid data");
    }
    const token = String(data.name || "").trim();
    if (!token) throw new Error("Gemini did not return an ephemeral token");
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      token,
      model: GEMINI_LIVE_MODEL,
      instructions: voiceInstructions(),
      tools: geminiVoiceTools(),
      websocketUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`,
    });
  } catch (err) {
    console.error("Gemini Live token failed:", err.message || err);
    res.status(502).json({ ok: false, error: String(err.message || err) });
  }
});

// Kept for compatibility with older clients/tools.
app.post("/voice/tool", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await executeVoiceTool(
      String(body.name || ""),
      body.arguments || {},
      body.context || {},
    );
    const display = voiceResultDisplay(result);
    res.setHeader("Cache-Control", "no-store");
    res.json(
      display && result.kind !== "dynamic_ui" ? { ...result, display } : result,
    );
  } catch (err) {
    console.error("Voice tool failed:", err.message || err);
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

app.use(
  express.static(path.join(PROJECT_ROOT, "public"), {
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (
        /[\\/](?:index|remote)\.(?:css|js)$/i.test(filePath) ||
        /[\\/]js[\\/]index[\\/]/i.test(filePath)
      )
        res.setHeader("Cache-Control", "no-store");
    },
  }),
);

app.get("*", (req, res) => {
  if (req.accepts("html") && !path.extname(req.path))
    return res.sendFile(path.join(PROJECT_ROOT, "public", "index.html"));
  return res.status(404).json({ error: "Not found" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Smart display: http://0.0.0.0:${PORT}`);
  console.log(`Immich upstream: ${IMMICH_URL}`);
});
