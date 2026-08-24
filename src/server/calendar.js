// ---------------- Calendar / photo preferences / news enrichment ----------------
function readHiddenAssetIds() {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(FRAME_HIDDEN_ASSETS_FILE, "utf8"),
    );
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch (_) {
    return new Set();
  }
}
function writeHiddenAssetIds(set) {
  const tmp = FRAME_HIDDEN_ASSETS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify([...set], null, 2));
  fs.renameSync(tmp, FRAME_HIDDEN_ASSETS_FILE);
}
function unfoldIcs(text) {
  return String(text || "").replace(/\r?\n[ \t]/g, "");
}
function unescapeIcs(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}
function parseIcsDate(raw, tzid) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    return parseIcsDate(raw + "T000000", tzid || FRAME_TIMEZONE);
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const parts = {
    y: +m[1],
    mo: +m[2],
    d: +m[3],
    h: +m[4],
    mi: +m[5],
    s: +m[6] || 0,
  };
  if (m[7])
    return new Date(
      Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s),
    );
  if (!tzid)
    return new Date(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s);
  try {
    let guess = Date.UTC(
      parts.y,
      parts.mo - 1,
      parts.d,
      parts.h,
      parts.mi,
      parts.s,
    );
    for (let i = 0; i < 2; i++) {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: tzid,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const q = {};
      for (const x of f.formatToParts(new Date(guess)))
        if (x.type !== "literal") q[x.type] = x.value;
      const represented = Date.UTC(
        +q.year,
        +q.month - 1,
        +q.day,
        +q.hour % 24,
        +q.minute,
        +q.second,
      );
      guess +=
        Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s) -
        represented;
    }
    return new Date(guess);
  } catch (_) {
    return new Date(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s);
  }
}
function parseRrule(text) {
  const out = {};
  String(text || "")
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
    });
  return out;
}
const ICS_WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function datePartsInZone(date, tz) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || FRAME_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const q = {};
    for (const x of f.formatToParts(date))
      if (x.type !== "literal") q[x.type] = x.value;
    return {
      y: +q.year,
      mo: +q.month,
      d: +q.day,
      h: +q.hour % 24,
      mi: +q.minute,
      s: +q.second,
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        q.weekday,
      ),
    };
  } catch (_) {
    return {
      y: date.getFullYear(),
      mo: date.getMonth() + 1,
      d: date.getDate(),
      h: date.getHours(),
      mi: date.getMinutes(),
      s: date.getSeconds(),
      weekday: date.getDay(),
    };
  }
}
function compactLocalDate(parts, timeParts) {
  return (
    String(parts.y).padStart(4, "0") +
    String(parts.mo).padStart(2, "0") +
    String(parts.d).padStart(2, "0") +
    "T" +
    String(timeParts.h).padStart(2, "0") +
    String(timeParts.mi).padStart(2, "0") +
    String(timeParts.s || 0).padStart(2, "0")
  );
}
function expandCalendarEvent(base, now, horizon) {
  if (!base.start) return [];
  if (!base.rrule)
    return base.end && base.end < now
      ? []
      : base.start <= horizon && (base.end || base.start) >= now
        ? [base]
        : [];
  const rule = parseRrule(base.rrule),
    freq = String(rule.FREQ || "").toUpperCase(),
    interval = Math.max(1, Number(rule.INTERVAL) || 1);
  if (!["DAILY", "WEEKLY"].includes(freq))
    return base.start <= horizon && (base.end || base.start) >= now
      ? [base]
      : [];
  const duration = Math.max(
      0,
      (base.end || base.start).getTime() - base.start.getTime(),
    ),
    tz = base.tzid || FRAME_TIMEZONE;
  const byDays = String(rule.BYDAY || "")
    .split(",")
    .map((x) => ICS_WEEKDAY[x.replace(/^[-+]?\d+/, "")])
    .filter((x) => x != null);
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL, tz) : null,
    ex = new Set((base.exdates || []).map((d) => d.getTime()));
  const localBase = base.localStartParts || datePartsInZone(base.start, tz),
    localNow = datePartsInZone(now, tz),
    localHorizon = datePartsInZone(horizon, tz);
  const baseDay = Date.UTC(localBase.y, localBase.mo - 1, localBase.d),
    nowDay = Date.UTC(localNow.y, localNow.mo - 1, localNow.d),
    horizonDay = Date.UTC(localHorizon.y, localHorizon.mo - 1, localHorizon.d);
  const startDelta = Math.max(0, Math.floor((nowDay - baseDay) / 86400000) - 1),
    endDelta = Math.max(
      startDelta,
      Math.floor((horizonDay - baseDay) / 86400000) + 1,
    ),
    out = [];
  for (let delta = startDelta; delta <= endDelta; delta++) {
    const dayUtc = new Date(baseDay + delta * 86400000),
      weekday = dayUtc.getUTCDay();
    let ok =
      freq === "DAILY"
        ? delta % interval === 0
        : Math.floor(delta / 7) % interval === 0 &&
          (byDays.length
            ? byDays.includes(weekday)
            : weekday === new Date(baseDay).getUTCDay());
    if (!ok) continue;
    const dayParts = {
      y: dayUtc.getUTCFullYear(),
      mo: dayUtc.getUTCMonth() + 1,
      d: dayUtc.getUTCDate(),
    };
    const start = parseIcsDate(compactLocalDate(dayParts, localBase), tz);
    if (
      !start ||
      start < base.start ||
      (until && start > until) ||
      ex.has(start.getTime())
    )
      continue;
    const end = new Date(start.getTime() + duration);
    if (end < now || start > horizon) continue;
    out.push({ ...base, start, end, recurrenceId: start.toISOString() });
  }
  return out;
}
function parseIcsEvents(text) {
  const unfolded = unfoldIcs(text),
    blocks = unfolded
      .split("BEGIN:VEVENT")
      .slice(1)
      .map((x) => x.split("END:VEVENT")[0]);
  const bases = [];
  for (const block of blocks) {
    const fields = { exdates: [] };
    for (const line of block.split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const left = line.slice(0, i),
        value = line.slice(i + 1);
      const parts = left.split(";"),
        key = parts.shift().toUpperCase();
      const params = {};
      parts.forEach((p) => {
        const j = p.indexOf("=");
        if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1);
      });
      if (key === "DTSTART") {
        fields.tzid = params.TZID || FRAME_TIMEZONE;
        fields.allDay =
          params.VALUE === "DATE" || /^\d{8}$/.test(String(value));
        const lm = String(value).match(
          /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/,
        );
        if (lm)
          fields.localStartParts = {
            y: +lm[1],
            mo: +lm[2],
            d: +lm[3],
            h: +lm[4] || 0,
            mi: +lm[5] || 0,
            s: +lm[6] || 0,
          };
        fields.start = parseIcsDate(value, fields.tzid);
      } else if (key === "DTEND")
        fields.end = parseIcsDate(value, params.TZID || fields.tzid);
      else if (key === "SUMMARY") fields.title = unescapeIcs(value);
      else if (key === "LOCATION") fields.location = unescapeIcs(value);
      else if (key === "DESCRIPTION") fields.description = unescapeIcs(value);
      else if (key === "UID") fields.id = unescapeIcs(value);
      else if (key === "URL") fields.url = unescapeIcs(value);
      else if (key === "RRULE") fields.rrule = value.trim();
      else if (key === "EXDATE")
        value.split(",").forEach((v) => {
          const d = parseIcsDate(v, params.TZID || fields.tzid);
          if (d) fields.exdates.push(d);
        });
    }
    if (fields.start) bases.push(fields);
  }
  const now = new Date(),
    primaryHorizon = new Date(
      now.getTime() + FRAME_CALENDAR_LOOKAHEAD_HOURS * 3600000,
    ),
    searchHorizon = new Date(
      now.getTime() +
        Math.max(FRAME_CALENDAR_LOOKAHEAD_HOURS, 24 * 365) * 3600000,
    );
  const upcoming = bases
    .flatMap((b) => expandCalendarEvent(b, now, searchHorizon))
    .sort((a, b) => a.start - b.start)
    .slice(0, 120);
  const withinWindow = upcoming.filter((event) => event.start <= primaryHorizon);
  return (withinWindow.length ? withinWindow.slice(0, 30) : upcoming.slice(0, 3))
    .map((e) => ({
      id: String(e.id || crypto.randomUUID()).slice(0, 220),
      title: cleanExternalText(e.title || "Event", 220),
      location: cleanExternalText(e.location || "", 260),
      description: cleanExternalText(e.description || "", 1200),
      url: safePublicMediaUrl(e.url),
      start: e.start.toISOString(),
      end: (e.end || e.start).toISOString(),
      allDay: !!e.allDay,
    }));
}
async function fetchTextExternal(url, timeoutMs = 9000) {
  const r = await fetchWithTimeout(
    url,
    {
      headers: {
        accept: "text/calendar,text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "user-agent": "NestFrame/1.0",
      },
    },
    timeoutMs,
  );
  if (!r.ok) {
    r.__releaseTimeout?.();
    throw new Error(`HTTP ${r.status}`);
  }
  return await readTextLimited(r, 3 * 1024 * 1024);
}
async function getCalendarEvents(force = false) {
  if (!FRAME_CALENDAR_ICS_URL)
    return { configured: false, name: FRAME_CALENDAR_NAME, events: [] };
  if (!force && calendarCache.expires > Date.now())
    return {
      configured: true,
      name: FRAME_CALENDAR_NAME,
      events: calendarCache.items,
    };
  try {
    const text = await fetchTextExternal(FRAME_CALENDAR_ICS_URL, 10000);
    const items = parseIcsEvents(text);
    calendarCache = {
      expires: Date.now() + 5 * 60 * 1000,
      items,
      configured: true,
    };
    systemDiagnostics.calendar.lastSuccess = new Date().toISOString();
    systemDiagnostics.calendar.lastError = "";
    return { configured: true, name: FRAME_CALENDAR_NAME, events: items };
  } catch (err) {
    console.warn("Calendar fetch failed:", err.message || err);
    systemDiagnostics.calendar.lastError = String(err.message || err);
    return {
      configured: true,
      name: FRAME_CALENDAR_NAME,
      events: calendarCache.items || [],
      error: String(err.message || err),
    };
  }
}
function htmlEntityDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function firstHtmlImage(html) {
  const m = String(html || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? htmlEntityDecode(m[1]) : "";
}
function metaContent(html, key) {
  const safe = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = String(html || "");
  const re1 = new RegExp(
    "<meta[^>]+(?:property|name)=[\"']" +
      safe +
      "[\"'][^>]+content=[\"']([^\"']+)[\"']",
    "i",
  );
  const re2 = new RegExp(
    "<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']" +
      safe +
      "[\"']",
    "i",
  );
  const m = source.match(re1) || source.match(re2);
  return m ? htmlEntityDecode(m[1]) : "";
}
async function enrichNewsItem(item) {
  if (!item) return item;
  item = {
    ...item,
    link: safePublicMediaUrl(item.link),
    image: safePublicMediaUrl(item.image),
  };
  if (!item.link || item.image) return item;
  const cached = newsArticleMetaCache.get(item.link);
  if (cached && cached.expires > Date.now()) return { ...item, ...cached.meta };
  try {
    const html = await fetchPublicText(item.link, 6500);
    const image = safePublicMediaUrl(
      item.image ||
        metaContent(html, "og:image") ||
        metaContent(html, "twitter:image") ||
        firstHtmlImage(html),
    );
    const summary =
      item.summary ||
      metaContent(html, "og:description") ||
      metaContent(html, "description");
    const meta = {
      image,
      summary: String(summary || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240),
    };
    boundedCacheSet(
      newsArticleMetaCache,
      item.link,
      { expires: Date.now() + 60 * 60 * 1000, meta },
      300,
    );
    return { ...item, ...meta };
  } catch (_) {
    return { ...item, image: safePublicMediaUrl(item.image) };
  }
}
async function enrichNewsItems(items, limit) {
  const out = items.slice(),
    queue = out.slice(0, limit).map((item, index) => ({ item, index }));
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const job = queue[cursor++];
      out[job.index] = await enrichNewsItem(job.item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  return out;
}

