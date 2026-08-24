require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const Parser = require("rss-parser");
const { buildIndexStyleBundle } = require("./services/style-bundle");
const { buildIndexScriptBundle } = require("./services/script-bundle");
const {
  PROJECT_ROOT,
  PORT,
  IMMICH_URL,
  IMMICH_API_KEY,
  IMMICH_PUBLIC_URL,
  NEWS_RSS_URL,
  NEWS_LIMIT,
  NEWS_IMAGE_ENRICH_LIMIT,
  FRAME_CALENDAR_ICS_URL,
  FRAME_CALENDAR_NAME,
  FRAME_LANGUAGE,
  FRAME_TIMEZONE,
  FRAME_CALENDAR_LOOKAHEAD_HOURS,
  FRAME_HIDDEN_ASSETS_FILE,
  FRAME_CONFIG_FILE,
  FRAME_THEME_PRIMARY_COLOR,
  FRAME_STATE_FILE,
  FRAME_MORNING_BRIEF_START_HOUR,
  FRAME_MORNING_BRIEF_END_HOUR,
  FRAME_PHOTO_INTERVAL_MS,
  FRAME_NEWS_REFRESH_MS,
  FRAME_IDLE_TIMEOUT_MS,
  FRAME_REQUEST_TIMEOUT_MS,
  FRAME_AMBIENT_NOTICE_DURATION_MS,
  FRAME_AMBIENT_NOTICE_CYCLE_MS,
  FRAME_NEWS_CHANCE,
  FRAME_NEWS_DURATION_MS,
  FRAME_PHOTO_HISTORY_SIZE,
  ALARM_CONFIRM_INTERVAL_MS,
  FRAME_LATITUDE,
  FRAME_LONGITUDE,
  FRAME_LOCATION_NAME,
  FRAME_COMMUTE_TARGETS,
  AMBIENT_CONTEXT_REFRESH_MS,
  OSRM_BASE_URL,
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_EMAIL,
  ALARMS_FILE,
  ALARM_MAX_CONFIRMATIONS,
  REMOTE_CONTROL_TOKEN,
  FRAME_POOL_REFRESH_MS,
  FRAME_MAX_STORY_ASSETS,
  FRAME_MIN_EVENT_ASSETS,
  FRAME_MEMORY_WINDOW_DAYS,
  FRAME_UNALBUMED_LIMIT,
  FRAME_MAX_ALBUMS,
  FRAME_EXCLUDE_ALBUMS: FRAME_EXCLUDE_ALBUMS_CONFIG,
  FRAME_WEIGHTS,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_AFTER_LOGIN_URL,
  SPOTIFY_TOKEN_FILE,
  SPOTIFY_DEVICE_NAME,
  SPOTIFY_POLL_LOCAL_SDK_MS,
  SPOTIFY_POLL_REMOTE_ACTIVE_MS,
  SPOTIFY_POLL_IDLE_MS,
  SPOTIFY_POLL_HIDDEN_MS,
  SPOTIFY_LYRIC_SYNC_LEAD_SECONDS,
  SPOTIFY_LYRIC_SEEK_PREROLL_SECONDS,
  SPOTIFY_SCOPES,
  CAMERA_REMOTE_TOKEN,
  CAMERA_STUN_URL,
  CAMERA_TURN_URL,
  CAMERA_TURN_USERNAME,
  CAMERA_TURN_CREDENTIAL,
  CAMERA_CALL_TTL_MS,
  CAMERA_POLL_VISIBLE_MS,
  CAMERA_POLL_HIDDEN_MS,
  CAMERA_CONNECT_TIMEOUT_MS,
  REMOTE_REFRESH_INTERVAL_MS,
  REMOTE_TOAST_DURATION_MS,
  REMOTE_DEFAULT_ALARM_OFFSET_MINUTES,
  GEMINI_API_KEY,
  GEMINI_LIVE_MODEL,
  GEMINI_PROCESSING_TIMEOUT_MS,
  GEMINI_TOOL_TIMEOUT_MS,
  GEMINI_FOLLOWUP_WAIT_MS,
} = require("./config");

const app = express();
const indexStyleBundle = buildIndexStyleBundle(PROJECT_ROOT);
const indexScriptBundle = buildIndexScriptBundle(PROJECT_ROOT);
const lyricsCache = new Map();
const musicSearchCache = new Map();
const spotifyAuthStates = new Map();
const cameraCalls = new Map();
let cameraFrameSeq = 0;
const cameraFrameQueue = [];

function serverLocaleText(english, vietnamese) {
  return FRAME_LANGUAGE === "vi" ? vietnamese : english;
}

function cameraIceServers() {
  const servers = [];
  if (CAMERA_STUN_URL) servers.push({ urls: CAMERA_STUN_URL });
  if (CAMERA_TURN_URL) {
    const turn = { urls: CAMERA_TURN_URL };
    if (CAMERA_TURN_USERNAME) turn.username = CAMERA_TURN_USERNAME;
    if (CAMERA_TURN_CREDENTIAL) turn.credential = CAMERA_TURN_CREDENTIAL;
    servers.push(turn);
  }
  return servers;
}

function cameraAuth(token) {
  if (!CAMERA_REMOTE_TOKEN) return false;
  const a = Buffer.from(String(token || ""));
  const b = Buffer.from(CAMERA_REMOTE_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cameraPushFrame(message) {
  cameraFrameQueue.push({ seq: ++cameraFrameSeq, at: Date.now(), ...message });
  while (cameraFrameQueue.length > 250) cameraFrameQueue.shift();
}

function cameraPushViewer(call, message) {
  call.viewerSeq = (call.viewerSeq || 0) + 1;
  call.viewerQueue.push({ seq: call.viewerSeq, at: Date.now(), ...message });
  while (call.viewerQueue.length > 250) call.viewerQueue.shift();
  call.updatedAt = Date.now();
}

function cameraEndCall(call, reason) {
  if (!call || call.ended) return;
  call.ended = true;
  call.status = "ended";
  call.updatedAt = Date.now();
  cameraPushFrame({ type: "end", callId: call.id, reason: reason || "ended" });
  cameraPushViewer(call, {
    type: "end",
    callId: call.id,
    reason: reason || "ended",
  });
}

function cameraCleanup() {
  const now = Date.now();
  for (const [id, call] of cameraCalls) {
    if (
      !call.ended &&
      now -
        Math.max(
          call.updatedAt || 0,
          call.viewerHeartbeat || 0,
          call.frameHeartbeat || 0,
        ) >
        CAMERA_CALL_TTL_MS
    ) {
      cameraEndCall(call, "timeout");
    }
    if (call.ended && now - call.updatedAt > 5 * 60 * 1000)
      cameraCalls.delete(id);
  }
}
setInterval(cameraCleanup, 15000).unref?.();

let spotifyPersonalCache = { expires: 0, payload: null, pending: null };
let spotifyPlayerCache = { expires: 0, payload: null, pending: null };
let spotifyDevicesCache = { expires: 0, payload: null, pending: null };
let spotifyProfileCache = { expires: 0, payload: null, pending: null };
let spotifyPlayerCacheVersion = 0;
let spotifyTokenRefreshPromise = null;
let spotifyRateLimitUntil = 0;
let spotifyRateLimitReason = "";
let spotifyRateLimitStrikes = 0;
const rssParser = new Parser({ timeout: 10000 });
let newsCache = { expires: 0, items: [] };
let calendarCache = { expires: 0, items: [], configured: false };
let newsArticleMetaCache = new Map();
const systemDiagnostics = {
  calendar: { lastSuccess: "", lastError: "" },
  context: { lastSuccess: "", lastError: "" },
};

function emptyFrameState() {
  return {
    version: 1,
    notifications: [],
    morningBrief: { presentedDate: "", dismissedDate: "" },
  };
}

function readFrameState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FRAME_STATE_FILE, "utf8"));
    const fallback = emptyFrameState();
    return {
      version: 1,
      notifications: Array.isArray(parsed && parsed.notifications)
        ? parsed.notifications
        : [],
      morningBrief:
        parsed && parsed.morningBrief && typeof parsed.morningBrief === "object"
          ? { ...fallback.morningBrief, ...parsed.morningBrief }
          : fallback.morningBrief,
    };
  } catch (_) {
    return emptyFrameState();
  }
}

function writeFrameState(state) {
  fs.mkdirSync(path.dirname(FRAME_STATE_FILE), { recursive: true });
  const tmp = FRAME_STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, FRAME_STATE_FILE);
}

function cleanFrameNotification(input) {
  const now = new Date().toISOString();
  const rawId = String((input && input.id) || "").trim();
  const type = String((input && input.type) || "system").slice(0, 40);
  const transient = ["weather", "air", "uv", "calendar", "commute"].includes(
    type,
  );
  return {
    id:
      rawId.slice(0, 180) ||
      (typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString("hex")),
    type,
    priority: Math.max(
      0,
      Math.min(100, Math.round(Number(input && input.priority) || 50)),
    ),
    title: String((input && input.title) || "Notification")
      .trim()
      .slice(0, 180),
    body: String((input && input.body) || "").trim().slice(0, 800),
    icon: String((input && input.icon) || "info").trim().slice(0, 40),
    action: String((input && input.action) || "").trim().slice(0, 100),
    createdAt: String((input && input.createdAt) || now),
    updatedAt: now,
    expiresAt: String(
      (input && input.expiresAt) ||
        (transient ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() : ""),
    ),
    readAt: String((input && input.readAt) || ""),
    dismissedAt: String((input && input.dismissedAt) || ""),
  };
}

function upsertFrameNotifications(incoming) {
  const state = readFrameState();
  const byId = new Map(
    state.notifications.map((item) => [String(item.id || ""), item]),
  );
  for (const raw of Array.isArray(incoming) ? incoming : [incoming]) {
    if (!raw || typeof raw !== "object") continue;
    const item = cleanFrameNotification(raw);
    const existing = byId.get(item.id);
    if (existing) {
      item.createdAt = existing.createdAt || item.createdAt;
      item.readAt = existing.readAt || "";
      item.dismissedAt = existing.dismissedAt || "";
    }
    byId.set(item.id, item);
  }
  const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
  state.notifications = [...byId.values()]
    .filter((item) => {
      const stamp = new Date(item.updatedAt || item.createdAt || 0).getTime();
      return !Number.isFinite(stamp) || stamp >= cutoff;
    })
    .sort(
      (a, b) =>
        Number(b.priority || 0) - Number(a.priority || 0) ||
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    )
    .slice(0, 120);
  writeFrameState(state);
  return state;
}

function recordFrameNotification(input) {
  try {
    return upsertFrameNotifications(input);
  } catch (err) {
    console.error("Could not persist frame notification:", err.message || err);
    return null;
  }
}

function boundedCacheSet(map, key, value, maxEntries) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maxEntries) map.delete(map.keys().next().value);
}

async function mapLimit(items, limit, mapper) {
  const values = Array.from(items || []),
    results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker),
  );
  return results;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () =>
    controller.abort(externalSignal && externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else
      externalSignal.addEventListener("abort", abortFromExternal, {
        once: true,
      });
  }
  let released = false,
    timer;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    if (externalSignal)
      externalSignal.removeEventListener("abort", abortFromExternal);
  };
  timer = setTimeout(
    () => {
      controller.abort(new Error("Data source timed out"));
      release();
    },
    Math.max(250, timeoutMs),
  );
  timer.unref?.();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    Object.defineProperty(response, "__releaseTimeout", {
      value: release,
      enumerable: false,
    });
    for (const method of ["text", "json", "arrayBuffer", "blob", "formData"]) {
      const original =
        typeof response[method] === "function"
          ? response[method].bind(response)
          : null;
      if (!original) continue;
      response[method] = async (...args) => {
        try {
          return await original(...args);
        } finally {
          release();
        }
      };
    }
    if (!response.body) release();
    return response;
  } catch (err) {
    release();
    throw err;
  }
}

function isPrivateAddress(value) {
  const address = String(value || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (net.isIPv4(address)) {
    const p = address.split(".").map(Number);
    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    );
  }
  if (net.isIPv6(address)) {
    const dotted = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const mapped = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
      const hi = parseInt(mapped[1], 16),
        lo = parseInt(mapped[2], 16);
      return isPrivateAddress([hi >> 8, hi & 255, lo >> 8, lo & 255].join("."));
    }
    return (
      address === "::" ||
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      /^fe[89ab]/.test(address)
    );
  }
  return false;
}
function publicHttpUrl(value) {
  const url = new URL(String(value || ""));
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Unsafe external address");
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateAddress(host)
  )
    throw new Error("External private network address blocked");
  return url;
}
async function assertPublicDns(url) {
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, ""))) return;
  const addresses = await Promise.race([
    dns.lookup(url.hostname, { all: true, verbatim: true }),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("DNS lookup timed out")),
        2000,
      );
      timer.unref?.();
    }),
  ]);
  if (
    !addresses.length ||
    addresses.some((entry) => isPrivateAddress(entry.address))
  )
    throw new Error("Private DNS address blocked");
}
async function readTextLimited(response, maxBytes = 3 * 1024 * 1024) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.__releaseTimeout?.();
    throw new Error("External response is too large");
  }
  if (!response.body) return "";
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) {
        response.body.cancel().catch(() => {});
        throw new Error("External response is too large");
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    response.__releaseTimeout?.();
  }
}
async function fetchPublicText(
  value,
  timeoutMs = 6500,
  maxBytes = 2 * 1024 * 1024,
) {
  let url = publicHttpUrl(value);
  for (let redirect = 0; redirect <= 4; redirect++) {
    await assertPublicDns(url);
    const response = await fetchWithTimeout(
      url,
      {
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.4",
          "user-agent": "NestFrame/1.0",
        },
      },
      timeoutMs,
    );
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      response.__releaseTimeout?.();
      url = publicHttpUrl(new URL(response.headers.get("location"), url).href);
      continue;
    }
    if (!response.ok) {
      response.__releaseTimeout?.();
      throw new Error(`HTTP ${response.status}`);
    }
    return await readTextLimited(response, maxBytes);
  }
  throw new Error("Too many external redirects");
}
function safePublicMediaUrl(value) {
  try {
    return publicHttpUrl(value).href;
  } catch (_) {
    return "";
  }
}
