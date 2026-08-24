"use strict";

const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function text(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function number(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const parsed = raw == null || String(raw).trim() === "" ? NaN : Number(raw);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function file(name, fallback) {
  return path.resolve(PROJECT_ROOT, text(name, fallback));
}

function timezone(name, fallback) {
  const value = text(name, fallback) || fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch (_) {
    console.warn(`Invalid ${name} "${value}"; falling back to ${fallback}`);
    return fallback;
  }
}

function coordinate(name, minimum, maximum) {
  const raw = text(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

const FRAME_MORNING_BRIEF_START_HOUR = number(
  "FRAME_MORNING_BRIEF_START_HOUR",
  6,
  0,
  23,
);

module.exports = Object.freeze({
  PROJECT_ROOT,
  PORT: number("PORT", 8080, 1, 65535),

  IMMICH_URL: text("IMMICH_URL").replace(/\/+$/, ""),
  IMMICH_API_KEY: text("IMMICH_API_KEY"),
  IMMICH_PUBLIC_URL: text(
    "IMMICH_PUBLIC_URL",
    text("IMMICH_URL"),
  ).replace(/\/+$/, ""),

  NEWS_RSS_URL: text(
    "NEWS_RSS_URL",
    "https://news.google.com/rss?hl=en&gl=VN&ceid=VN:en",
  ),
  NEWS_LIMIT: number("NEWS_LIMIT", 20, 1, 50),
  NEWS_IMAGE_ENRICH_LIMIT: number("NEWS_IMAGE_ENRICH_LIMIT", 12, 0, 20),

  FRAME_CALENDAR_ICS_URL: text("FRAME_CALENDAR_ICS_URL"),
  FRAME_CALENDAR_NAME: text("FRAME_CALENDAR_NAME", "Lịch") || "Lịch",
  FRAME_TIMEZONE: timezone("FRAME_TIMEZONE", "Asia/Ho_Chi_Minh"),
  FRAME_CALENDAR_LOOKAHEAD_HOURS: number(
    "FRAME_CALENDAR_LOOKAHEAD_HOURS",
    48,
    6,
    168,
  ),
  FRAME_HIDDEN_ASSETS_FILE: file(
    "FRAME_HIDDEN_ASSETS_FILE",
    ".frame-hidden-assets.json",
  ),
  FRAME_CONFIG_FILE: file("FRAME_CONFIG_FILE", "public/frame-config.json"),
  FRAME_THEME_PRIMARY_COLOR: text("FRAME_THEME_PRIMARY_COLOR"),
  FRAME_STATE_FILE: file("FRAME_STATE_FILE", ".frame-state.json"),
  FRAME_MORNING_BRIEF_START_HOUR,
  FRAME_MORNING_BRIEF_END_HOUR: number(
    "FRAME_MORNING_BRIEF_END_HOUR",
    10,
    FRAME_MORNING_BRIEF_START_HOUR,
    23,
  ),
  FRAME_PHOTO_INTERVAL_MS: number(
    "FRAME_PHOTO_INTERVAL_MS",
    12000,
    5000,
    5 * 60 * 1000,
  ),
  FRAME_NEWS_REFRESH_MS: number(
    "FRAME_NEWS_REFRESH_MS",
    10 * 60 * 1000,
    60 * 1000,
    60 * 60 * 1000,
  ),
  FRAME_IDLE_TIMEOUT_MS: number("FRAME_IDLE_TIMEOUT_MS", 90000, 10000, 3600000),
  FRAME_REQUEST_TIMEOUT_MS: number(
    "FRAME_REQUEST_TIMEOUT_MS",
    15000,
    1000,
    120000,
  ),
  FRAME_AMBIENT_NOTICE_DURATION_MS: number(
    "FRAME_AMBIENT_NOTICE_DURATION_MS",
    11000,
    1000,
    120000,
  ),
  FRAME_AMBIENT_NOTICE_CYCLE_MS: number(
    "FRAME_AMBIENT_NOTICE_CYCLE_MS",
    36000,
    5000,
    600000,
  ),
  FRAME_NEWS_CHANCE: number("FRAME_NEWS_CHANCE", 0.32, 0, 1),
  FRAME_NEWS_DURATION_MS: number(
    "FRAME_NEWS_DURATION_MS",
    14000,
    1000,
    300000,
  ),
  FRAME_PHOTO_HISTORY_SIZE: number(
    "FRAME_PHOTO_HISTORY_SIZE",
    10,
    0,
    100,
  ),
  ALARM_CONFIRM_INTERVAL_MS: number(
    "ALARM_CONFIRM_INTERVAL_MS",
    300000,
    10000,
    3600000,
  ),
  FRAME_LATITUDE: coordinate("FRAME_LATITUDE", -90, 90),
  FRAME_LONGITUDE: coordinate("FRAME_LONGITUDE", -180, 180),
  FRAME_LOCATION_NAME:
    text("FRAME_LOCATION_NAME", "Vị trí hiện tại") || "Vị trí hiện tại",
  FRAME_COMMUTE_TARGETS: text("FRAME_COMMUTE_TARGETS"),
  AMBIENT_CONTEXT_REFRESH_MS: number(
    "AMBIENT_CONTEXT_REFRESH_MS",
    5 * 60 * 1000,
    60 * 1000,
    24 * 60 * 60 * 1000,
  ),
  OSRM_BASE_URL: text(
    "OSRM_BASE_URL",
    "https://router.project-osrm.org",
  ).replace(/\/+$/, ""),
  NOMINATIM_BASE_URL: text(
    "NOMINATIM_BASE_URL",
    "https://nominatim.openstreetmap.org",
  ).replace(/\/+$/, ""),
  NOMINATIM_USER_AGENT:
    text("NOMINATIM_USER_AGENT", "NestFrame/1.0") || "NestFrame/1.0",
  NOMINATIM_EMAIL: text("NOMINATIM_EMAIL"),

  ALARMS_FILE: file("ALARMS_FILE", "alarms.json"),
  ALARM_MAX_CONFIRMATIONS: number("ALARM_MAX_CONFIRMATIONS", 5, 1, 20),
  REMOTE_CONTROL_TOKEN: text("REMOTE_CONTROL_TOKEN"),

  FRAME_POOL_REFRESH_MS: number(
    "FRAME_POOL_REFRESH_MS",
    30 * 60 * 1000,
    5 * 60 * 1000,
    24 * 60 * 60 * 1000,
  ),
  FRAME_MAX_STORY_ASSETS: number("FRAME_MAX_STORY_ASSETS", 12, 3, 30),
  FRAME_MIN_EVENT_ASSETS: number("FRAME_MIN_EVENT_ASSETS", 4, 3, 100),
  FRAME_MEMORY_WINDOW_DAYS: number("FRAME_MEMORY_WINDOW_DAYS", 3, 0, 14),
  FRAME_UNALBUMED_LIMIT: number("FRAME_UNALBUMED_LIMIT", 1500, 100, 5000),
  FRAME_MAX_ALBUMS: number("FRAME_MAX_ALBUMS", 60, 1, 200),
  FRAME_EXCLUDE_ALBUMS: text("FRAME_EXCLUDE_ALBUMS"),
  FRAME_WEIGHTS: Object.freeze({
    albums: number("FRAME_WEIGHT_ALBUMS", 45, 0, 10000),
    locations: number("FRAME_WEIGHT_LOCATIONS", 30, 0, 10000),
    memories: number("FRAME_WEIGHT_MEMORIES", 20, 0, 10000),
    discovery: number("FRAME_WEIGHT_DISCOVERY", 5, 0, 10000),
  }),

  SPOTIFY_CLIENT_ID: text("SPOTIFY_CLIENT_ID"),
  SPOTIFY_CLIENT_SECRET: text("SPOTIFY_CLIENT_SECRET"),
  SPOTIFY_REDIRECT_URI: text("SPOTIFY_REDIRECT_URI"),
  SPOTIFY_AFTER_LOGIN_URL:
    text("SPOTIFY_AFTER_LOGIN_URL", "/?spotify=connected") ||
    "/?spotify=connected",
  SPOTIFY_TOKEN_FILE: file("SPOTIFY_TOKEN_FILE", ".spotify-token.json"),
  SPOTIFY_DEVICE_NAME:
    text("SPOTIFY_DEVICE_NAME", "Nest Frame · iPad") || "Nest Frame · iPad",
  SPOTIFY_POLL_LOCAL_SDK_MS: number(
    "SPOTIFY_POLL_LOCAL_SDK_MS",
    60000,
    5000,
    900000,
  ),
  SPOTIFY_POLL_REMOTE_ACTIVE_MS: number(
    "SPOTIFY_POLL_REMOTE_ACTIVE_MS",
    15000,
    5000,
    900000,
  ),
  SPOTIFY_POLL_IDLE_MS: number(
    "SPOTIFY_POLL_IDLE_MS",
    60000,
    5000,
    1800000,
  ),
  SPOTIFY_POLL_HIDDEN_MS: number(
    "SPOTIFY_POLL_HIDDEN_MS",
    300000,
    10000,
    3600000,
  ),
  SPOTIFY_LYRIC_SYNC_LEAD_SECONDS: number(
    "SPOTIFY_LYRIC_SYNC_LEAD_SECONDS",
    0.35,
    0,
    5,
  ),
  SPOTIFY_LYRIC_SEEK_PREROLL_SECONDS: number(
    "SPOTIFY_LYRIC_SEEK_PREROLL_SECONDS",
    0.18,
    0,
    5,
  ),
  SPOTIFY_SCOPES: text(
    "SPOTIFY_SCOPES",
    "streaming user-read-private user-read-email user-read-playback-state user-read-currently-playing user-modify-playback-state user-read-recently-played user-top-read user-library-read playlist-read-private playlist-read-collaborative",
  )
    .split(/[\s,]+/)
    .filter(Boolean)
    .join(" "),

  CAMERA_REMOTE_TOKEN: text("CAMERA_REMOTE_TOKEN"),
  CAMERA_STUN_URL: text(
    "CAMERA_STUN_URL",
    "stun:stun.l.google.com:19302",
  ),
  CAMERA_TURN_URL: text("CAMERA_TURN_URL"),
  CAMERA_TURN_USERNAME: text("CAMERA_TURN_USERNAME"),
  CAMERA_TURN_CREDENTIAL: text("CAMERA_TURN_CREDENTIAL"),
  CAMERA_CALL_TTL_MS: Math.max(
    30000,
    Number(process.env.CAMERA_CALL_TTL_MS || 90000),
  ),
  CAMERA_POLL_VISIBLE_MS: number("CAMERA_POLL_VISIBLE_MS", 650, 250, 10000),
  CAMERA_POLL_HIDDEN_MS: number("CAMERA_POLL_HIDDEN_MS", 1800, 500, 30000),
  CAMERA_CONNECT_TIMEOUT_MS: number(
    "CAMERA_CONNECT_TIMEOUT_MS",
    30000,
    5000,
    180000,
  ),

  REMOTE_REFRESH_INTERVAL_MS: number(
    "REMOTE_REFRESH_INTERVAL_MS",
    5000,
    1000,
    300000,
  ),
  REMOTE_TOAST_DURATION_MS: number(
    "REMOTE_TOAST_DURATION_MS",
    1900,
    500,
    30000,
  ),
  REMOTE_DEFAULT_ALARM_OFFSET_MINUTES: number(
    "REMOTE_DEFAULT_ALARM_OFFSET_MINUTES",
    5,
    1,
    1440,
  ),

  GEMINI_API_KEY: text("GEMINI_API_KEY"),
  GEMINI_LIVE_MODEL:
    text("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview") ||
    "gemini-3.1-flash-live-preview",
  GEMINI_PROCESSING_TIMEOUT_MS: number(
    "GEMINI_PROCESSING_TIMEOUT_MS",
    35000,
    5000,
    180000,
  ),
  GEMINI_TOOL_TIMEOUT_MS: number(
    "GEMINI_TOOL_TIMEOUT_MS",
    22000,
    3000,
    120000,
  ),
  GEMINI_FOLLOWUP_WAIT_MS: number(
    "GEMINI_FOLLOWUP_WAIT_MS",
    12000,
    3000,
    60000,
  ),
});
