// ---------------- Ambient context: weather / air quality / commute ----------------
// Weather and air-quality data come from Open-Meteo. The browser may supply its
// current coordinates; FRAME_LATITUDE / FRAME_LONGITUDE are optional fallbacks.
let ambientContextCache = new Map();
let voiceGeocodeCache = new Map();
let nominatimQueue = Promise.resolve();
let nominatimLastRequestAt = 0;

function parseCommuteTargets() {
  const raw = FRAME_COMMUTE_TARGETS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x, index) => ({
        id: String(x.id || x.name || `commute-${index + 1}`).slice(0, 80),
        name: String(x.name || `Destination ${index + 1}`).slice(0, 80),
        latitude: Number(x.latitude ?? x.lat),
        longitude: Number(x.longitude ?? x.lon ?? x.lng),
        arrival: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x.arrival || ""))
          ? String(x.arrival)
          : "",
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || ""))
          ? String(x.date)
          : "",
        days: Array.isArray(x.days)
          ? [
              ...new Set(
                x.days
                  .map(Number)
                  .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
              ),
            ]
          : [],
        match: (Array.isArray(x.calendarMatch || x.match)
          ? x.calendarMatch || x.match
          : [x.calendarMatch || x.match || x.name]
        )
          .map((v) =>
            String(v || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
        bufferMinutes: Math.max(
          0,
          Math.min(120, Number(x.bufferMinutes || 0) || 0),
        ),
        mode:
          String(x.mode || "driving").toLowerCase() === "driving"
            ? "driving"
            : "driving",
      }))
      .filter(
        (x) =>
          Number.isFinite(x.latitude) &&
          Number.isFinite(x.longitude) &&
          (x.arrival || x.match.length),
      );
  } catch (err) {
    console.warn(
      "FRAME_COMMUTE_TARGETS is not valid JSON:",
      err.message || err,
    );
    return [];
  }
}

async function fetchJsonExternal(url, timeoutMs = 9000) {
  const r = await fetchWithTimeout(
    url,
    { headers: { accept: "application/json" } },
    timeoutMs,
  );
  if (!r.ok) {
    r.__releaseTimeout?.();
    throw new Error(`HTTP ${r.status}`);
  }
  return await r.json();
}

function finiteCoord(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function nextScheduledArrival(target, now) {
  const candidates = [];
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() + offset);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (target.date && target.date !== dateKey) continue;
    if (!target.date && target.days.length && !target.days.includes(d.getDay()))
      continue;
    const [hh, mm] = target.arrival.split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() < now.getTime() - 10 * 60 * 1000) continue;
    candidates.push(d);
    break;
  }
  return candidates[0] || null;
}

async function buildCommutes(originLat, originLon, calendarEvents = []) {
  const targets = parseCommuteTargets();
  if (!targets.length) return [];
  const now = new Date();
  const out = await mapLimit(targets.slice(0, 8), 4, async (target) => {
    const matchedEvent = (calendarEvents || []).find((ev) => {
      const start = new Date(ev.start);
      if (
        !Number.isFinite(start.getTime()) ||
        start < now ||
        start > new Date(now.getTime() + 36 * 3600000)
      )
        return false;
      const hay = String(
        (ev.title || "") + " " + (ev.location || ""),
      ).toLowerCase();
      return target.match.some((needle) => needle && hay.includes(needle));
    });
    const arrivalAt = matchedEvent
      ? new Date(matchedEvent.start)
      : target.arrival
        ? nextScheduledArrival(target, now)
        : null;
    if (!arrivalAt) return null;
    try {
      const routeUrl = `${OSRM_BASE_URL}/route/v1/driving/${originLon},${originLat};${target.longitude},${target.latitude}?overview=false&steps=false&alternatives=false`;
      const data = await fetchJsonExternal(routeUrl, 7000);
      const route = data && Array.isArray(data.routes) ? data.routes[0] : null;
      if (!route || !Number.isFinite(Number(route.duration))) return null;
      const durationMinutes = Math.max(
        1,
        Math.round(Number(route.duration) / 60),
      );
      const leaveAt = new Date(
        arrivalAt.getTime() -
          (durationMinutes + target.bufferMinutes) * 60 * 1000,
      );
      const leaveInMinutes = Math.round(
        (leaveAt.getTime() - now.getTime()) / 60000,
      );
      return {
        id: target.id,
        name: target.name,
        mode: target.mode,
        durationMinutes,
        bufferMinutes: target.bufferMinutes,
        distanceKm: Number.isFinite(Number(route.distance))
          ? Math.round(Number(route.distance) / 100) / 10
          : null,
        arrivalAt: arrivalAt.toISOString(),
        leaveAt: leaveAt.toISOString(),
        leaveInMinutes,
        calendarDriven: !!matchedEvent,
        eventId: matchedEvent ? matchedEvent.id : "",
        eventTitle: matchedEvent ? matchedEvent.title : "",
      };
    } catch (err) {
      console.warn(
        `Commute route failed for ${target.name}:`,
        err.message || err,
      );
      return null;
    }
  });
  return out.filter(Boolean);
}

function weatherCodeLabel(code) {
  code = Number(code);
  if (code === 0) return "Clear sky";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather";
}

function aqiLabel(aqi) {
  aqi = Number(aqi);
  if (!Number.isFinite(aqi)) return "";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

async function buildAmbientContext(latitude, longitude) {
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", latitude);
  weatherUrl.searchParams.set("longitude", longitude);
  weatherUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,precipitation,rain",
  );
  weatherUrl.searchParams.set(
    "hourly",
    "precipitation_probability,precipitation,rain,weather_code,temperature_2m",
  );
  weatherUrl.searchParams.set("forecast_days", "2");
  weatherUrl.searchParams.set("timezone", "auto");

  const airUrl = new URL(
    "https://air-quality-api.open-meteo.com/v1/air-quality",
  );
  airUrl.searchParams.set("latitude", latitude);
  airUrl.searchParams.set("longitude", longitude);
  airUrl.searchParams.set("current", "us_aqi,pm2_5,uv_index");
  airUrl.searchParams.set("hourly", "us_aqi,uv_index");
  airUrl.searchParams.set("forecast_days", "2");
  airUrl.searchParams.set("timezone", "auto");

  const [weather, air, calendar] = await Promise.all([
    fetchJsonExternal(weatherUrl.toString()),
    fetchJsonExternal(airUrl.toString()).catch(() => null),
    getCalendarEvents(false).catch(() => ({
      configured: false,
      name: FRAME_CALENDAR_NAME,
      events: [],
    })),
  ]);
  const commutes = await buildCommutes(
    latitude,
    longitude,
    calendar.events || [],
  ).catch(() => []);

  const current = (weather && weather.current) || {};
  const h = (weather && weather.hourly) || {};
  const times = Array.isArray(h.time) ? h.time : [];
  const now = Date.now();
  let rainStartMinutes = null,
    maxRainChanceNext3h = 0,
    maxRainChanceNext6h = 0;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (!Number.isFinite(t) || t < now - 30 * 60 * 1000) continue;
    const mins = Math.round((t - now) / 60000);
    const chance = Number((h.precipitation_probability || [])[i]) || 0;
    const rain = Number((h.rain || [])[i]) || 0;
    const precip = Number((h.precipitation || [])[i]) || 0;
    if (mins <= 180)
      maxRainChanceNext3h = Math.max(maxRainChanceNext3h, chance);
    if (mins <= 360)
      maxRainChanceNext6h = Math.max(maxRainChanceNext6h, chance);
    if (
      rainStartMinutes == null &&
      mins >= 0 &&
      mins <= 720 &&
      (rain > 0.05 || precip > 0.05 || chance >= 55)
    )
      rainStartMinutes = mins;
  }

  const airCurrent = (air && air.current) || {};
  const airHourly = (air && air.hourly) || {};
  const airTimes = Array.isArray(airHourly.time) ? airHourly.time : [];
  let maxUvNext12h = Number(airCurrent.uv_index) || 0;
  for (let i = 0; i < airTimes.length; i++) {
    const t = new Date(airTimes[i]).getTime();
    if (!Number.isFinite(t) || t < now || t > now + 12 * 3600 * 1000) continue;
    maxUvNext12h = Math.max(
      maxUvNext12h,
      Number((airHourly.uv_index || [])[i]) || 0,
    );
  }

  const aqi =
    airCurrent.us_aqi == null ? null : Math.round(Number(airCurrent.us_aqi));
  const uv =
    airCurrent.uv_index == null
      ? null
      : Math.round(Number(airCurrent.uv_index) * 10) / 10;
  const notifications = [];

  if (rainStartMinutes != null && rainStartMinutes <= 120) {
    notifications.push({
      id: "rain-soon",
      type: "weather",
      priority: 95,
      title:
        rainStartMinutes <= 5
          ? "Rain is starting"
          : `Rain in about ${Math.max(1, rainStartMinutes)} minutes`,
      body: `${maxRainChanceNext3h}% chance of rain nearby · ${weatherCodeLabel(current.weather_code)}`,
      icon: "rain",
    });
  } else if (maxRainChanceNext3h >= 65) {
    notifications.push({
      id: "rain-risk",
      type: "weather",
      priority: 82,
      title: "Rain may be approaching",
      body: `Up to ${maxRainChanceNext3h}% chance of rain in the next 3 hours`,
      icon: "rain",
    });
  }

  if (aqi != null && aqi >= 101)
    notifications.push({
      id: "aqi-high",
      type: "air",
      priority: 88,
      title: `Air quality: ${aqiLabel(aqi).toLowerCase()}`,
      body: `AQI ${aqi} · PM2.5 ${Math.round(Number(airCurrent.pm2_5) || 0)} µg/m³`,
      icon: "air",
    });
  else if (aqi != null && aqi >= 51)
    notifications.push({
      id: "aqi-moderate",
      type: "air",
      priority: 54,
      title: "Air quality is moderate",
      body: `AQI ${aqi} · ${aqiLabel(aqi)}`,
      icon: "air",
    });

  const localHour = new Date().getHours();
  if (maxUvNext12h >= 6 && localHour >= 5 && localHour <= 16)
    notifications.push({
      id: "uv-high",
      type: "uv",
      priority: maxUvNext12h >= 8 ? 80 : 60,
      title: `UV peaks at ${Math.round(maxUvNext12h)}`,
      body:
        maxUvNext12h >= 8
          ? "UV is very high today · sun protection is required"
          : "UV is high today · sun protection is recommended",
      icon: "sun",
    });

  const nextEvent = (calendar.events || []).find((ev) => {
    const t = new Date(ev.start).getTime();
    return Number.isFinite(t) && t >= now && t <= now + 6 * 3600000;
  });
  if (nextEvent) {
    const mins = Math.max(
      0,
      Math.round((new Date(nextEvent.start).getTime() - now) / 60000),
    );
    if (mins <= 90)
      notifications.push({
        id: `calendar:${nextEvent.id}`,
        type: "calendar",
        priority: mins <= 20 ? 92 : 72,
        title:
          mins <= 1
            ? `${nextEvent.title} starts now`
            : `${nextEvent.title} starts in ${mins} minutes`,
        body: nextEvent.location || FRAME_CALENDAR_NAME,
        icon: "calendar",
      });
  }

  for (const c of commutes) {
    if (c.leaveInMinutes <= 75 && c.leaveInMinutes >= -30) {
      const title =
        c.leaveInMinutes <= 0
          ? `Leave now for ${c.name}`
          : `Leave in ${c.leaveInMinutes} minutes`;
      notifications.push({
        id: `commute:${c.id}`,
        type: "commute",
        priority: c.leaveInMinutes <= 15 ? 100 : 86,
        title,
        body: `${c.name} · ${c.durationMinutes} minutes travel time${c.distanceKm != null ? ` · ${c.distanceKm} km` : ""}`,
        icon: "route",
        target: c.name,
      });
    }
  }

  notifications.sort((a, b) => b.priority - a.priority);
  if (notifications.length) recordFrameNotification(notifications);
  return {
    configured: true,
    generatedAt: new Date().toISOString(),
    location: { name: FRAME_LOCATION_NAME, latitude, longitude },
    weather: {
      temperature:
        current.temperature_2m == null
          ? null
          : Math.round(Number(current.temperature_2m)),
      apparentTemperature:
        current.apparent_temperature == null
          ? null
          : Math.round(Number(current.apparent_temperature)),
      code: Number(current.weather_code) || 0,
      label: weatherCodeLabel(current.weather_code),
      rainStartMinutes,
      maxRainChanceNext3h,
      maxRainChanceNext6h,
    },
    air: {
      aqi,
      aqiLabel: aqiLabel(aqi),
      pm25:
        airCurrent.pm2_5 == null
          ? null
          : Math.round(Number(airCurrent.pm2_5) * 10) / 10,
      uv,
      maxUvNext12h: Math.round(maxUvNext12h * 10) / 10,
    },
    calendar: {
      configured: !!calendar.configured,
      name: calendar.name || FRAME_CALENDAR_NAME,
      events: (calendar.events || []).slice(0, 8),
      error: calendar.error || "",
    },
    commutes,
    notifications,
  };
}

app.get("/ambient/context", async (req, res) => {
  const lat =
    finiteCoord(req.query.lat, -90, 90) ?? finiteCoord(FRAME_LATITUDE, -90, 90);
  const lon =
    finiteCoord(req.query.lon, -180, 180) ??
    finiteCoord(FRAME_LONGITUDE, -180, 180);
  if (lat == null || lon == null) {
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      configured: false,
      reason: "location-required",
      notifications: [],
      commutes: [],
    });
  }
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = ambientContextCache.get(key);
  if (cached && cached.expires > Date.now()) return res.json(cached.payload);
  try {
    const payload = await buildAmbientContext(lat, lon);
    boundedCacheSet(
      ambientContextCache,
      key,
      { expires: Date.now() + AMBIENT_CONTEXT_REFRESH_MS, payload },
      40,
    );
    systemDiagnostics.context.lastSuccess = new Date().toISOString();
    systemDiagnostics.context.lastError = "";
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.json(payload);
  } catch (err) {
    console.error("Ambient context error:", err.message || err);
    systemDiagnostics.context.lastError = String(err.message || err);
    recordFrameNotification({
      id: "system:ambient-context",
      type: "error",
      priority: 78,
      title: "Unable to update ambient information",
      body: String(err.message || err),
      icon: "error",
      action: "retry-context",
    });
    return res
      .status(502)
      .json({
        configured: true,
        error: "Unable to update ambient information",
        detail: String(err.message || err),
        notifications: [],
        commutes: [],
      });
  }
});

if (!IMMICH_URL) {
  console.error("Missing IMMICH_URL");
  process.exit(1);
}
if (!IMMICH_API_KEY) {
  console.error("Missing IMMICH_API_KEY");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self)",
  );
  next();
});
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = String(req.get("origin") || "").trim();
  if (!origin) return next();
  try {
    if (new URL(origin).host === String(req.get("host") || "")) return next();
  } catch (_) {}
  return res.status(403).json({ error: "Cross-origin state change blocked" });
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}
function parseThemeHex(value) {
  let hex = String(value || "")
    .trim()
    .replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((x) => x + x)
      .join("");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}
function themeHex(color) {
  return (
    "#" +
    [color.r, color.g, color.b]
      .map((x) => clampByte(x).toString(16).padStart(2, "0"))
      .join("")
  );
}
function mixThemeColor(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}
function themeLuminance(color) {
  const linear = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * linear(color.r) +
    0.7152 * linear(color.g) +
    0.0722 * linear(color.b)
  );
}
function buildThemeVariables(primaryValue) {
  const color = parseThemeHex(primaryValue) || parseThemeHex("#E5484D"),
    white = { r: 255, g: 255, b: 255 },
    black = { r: 0, g: 0, b: 0 },
    luma = themeLuminance(color);
  const secondary = mixThemeColor(color, white, 0.24),
    tertiary = mixThemeColor(color, white, 0.42);
  return {
    "--theme-primary": themeHex(color),
    "--theme-rgb": [color.r, color.g, color.b].join(","),
    "--theme-on-primary": luma > 0.43 ? "#101418" : "#ffffff",
    "--theme-container": themeHex(
      mixThemeColor(color, black, luma > 0.43 ? 0.48 : 0.28),
    ),
    "--theme-on-container": themeHex(
      mixThemeColor(color, white, luma > 0.43 ? 0.68 : 0.78),
    ),
    "--theme-secondary": themeHex(secondary),
    "--theme-secondary-rgb": [
      clampByte(secondary.r),
      clampByte(secondary.g),
      clampByte(secondary.b),
    ].join(","),
    "--theme-tertiary": themeHex(tertiary),
    "--theme-tertiary-rgb": [
      clampByte(tertiary.r),
      clampByte(tertiary.g),
      clampByte(tertiary.b),
    ].join(","),
  };
}
function readFrameConfig() {
  try {
    const value = JSON.parse(fs.readFileSync(FRAME_CONFIG_FILE, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

app.get("/frame/bootstrap", (req, res) => {
  const config = readFrameConfig(),
    primary =
      FRAME_THEME_PRIMARY_COLOR ||
      (config &&
        config.theme &&
        (config.theme.primaryColor || config.theme.primary));
  res.setHeader("Cache-Control", "private, max-age=60");
  res.json({
    language: FRAME_LANGUAGE,
    timezone: FRAME_TIMEZONE,
    immichPublicUrl: IMMICH_PUBLIC_URL,
    spotifyDeviceName: SPOTIFY_DEVICE_NAME,
    themeVariables: buildThemeVariables(primary),
    timing: {
      ambientRefreshMs: AMBIENT_CONTEXT_REFRESH_MS,
      photoIntervalMs: FRAME_PHOTO_INTERVAL_MS,
      poolRefreshMs: FRAME_POOL_REFRESH_MS,
      newsRefreshMs: FRAME_NEWS_REFRESH_MS,
      idleTimeoutMs: FRAME_IDLE_TIMEOUT_MS,
      requestTimeoutMs: FRAME_REQUEST_TIMEOUT_MS,
      noticeDurationMs: FRAME_AMBIENT_NOTICE_DURATION_MS,
      noticeCycleMs: FRAME_AMBIENT_NOTICE_CYCLE_MS,
      newsChance: FRAME_NEWS_CHANCE,
      newsDurationMs: FRAME_NEWS_DURATION_MS,
      photoHistorySize: FRAME_PHOTO_HISTORY_SIZE,
      alarmConfirmIntervalMs: ALARM_CONFIRM_INTERVAL_MS,
      spotifyPollLocalSdkMs: SPOTIFY_POLL_LOCAL_SDK_MS,
      spotifyPollRemoteActiveMs: SPOTIFY_POLL_REMOTE_ACTIVE_MS,
      spotifyPollIdleMs: SPOTIFY_POLL_IDLE_MS,
      spotifyPollHiddenMs: SPOTIFY_POLL_HIDDEN_MS,
      spotifyLyricSyncLeadSeconds: SPOTIFY_LYRIC_SYNC_LEAD_SECONDS,
      spotifyLyricSeekPrerollSeconds: SPOTIFY_LYRIC_SEEK_PREROLL_SECONDS,
      geminiProcessingTimeoutMs: GEMINI_PROCESSING_TIMEOUT_MS,
      geminiToolTimeoutMs: GEMINI_TOOL_TIMEOUT_MS,
      geminiFollowupWaitMs: GEMINI_FOLLOWUP_WAIT_MS,
      cameraPollVisibleMs: CAMERA_POLL_VISIBLE_MS,
      cameraPollHiddenMs: CAMERA_POLL_HIDDEN_MS,
      cameraConnectTimeoutMs: CAMERA_CONNECT_TIMEOUT_MS,
      remoteRefreshIntervalMs: REMOTE_REFRESH_INTERVAL_MS,
      remoteToastDurationMs: REMOTE_TOAST_DURATION_MS,
      remoteDefaultAlarmOffsetMinutes: REMOTE_DEFAULT_ALARM_OFFSET_MINUTES,
    },
  });
});
