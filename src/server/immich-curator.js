// ---------------- Ambient photo curator ----------------
// Builds Google Photos / Apple Photos-like story pools from Immich:
// curated albums, location/time events from unalbumed photos, 1-3 year memories,
// and a small discovery pool. The result is cached server-side.
const BUILTIN_FRAME_EXCLUDE_ALBUMS = [
  "Bursts",
  "Portrait",
  "Slo-mo",
  "temp",
  "CamScanner",
  "Cinematic",
  "qr",
  "Videos",
  "Captured by Me",
  "Live Photos",
  "Selfies",
  "Screenshots",
  "Recents",
  "Recently Saved",
  "giấy tờ",
  "Instagram",
  "Favorites",
  "Screen Recordings",
  "Panoramas",
  "Wallpapers",
  "Frequently used images",
  "Ok",
  "TeraBox",
  "Profile Pictures",
  "Pinterest",
  "Time-lapse",
  "Downloads",
  "WhatsApp Images",
  "Camera",
  "Telegram",
];
const FRAME_EXCLUDE_ALBUMS = Array.from(
  new Set(
    BUILTIN_FRAME_EXCLUDE_ALBUMS.concat(
      FRAME_EXCLUDE_ALBUMS_CONFIG
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ),
);

let ambientCuratorCache = { expires: 0, building: null, payload: null };
const ambientAssetInfoCache = new Map();

async function immichRequest(pathname, { method = "GET", body } = {}) {
  const url = new URL("/api" + pathname, IMMICH_URL);
  const headers = { "x-api-key": IMMICH_API_KEY, accept: "application/json" };
  const init = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetchWithTimeout(url, init, 15000);
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(
      `Immich ${r.status} ${pathname}${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }
  if (r.status === 204) return null;
  return r.json();
}

function searchAssets(dto) {
  return immichRequest("/search/metadata", { method: "POST", body: dto }).then(
    (data) =>
      data && data.assets && Array.isArray(data.assets.items)
        ? data.assets.items
        : [],
  );
}

async function searchAssetsPaged(dto, limit) {
  const result = [];
  const pageSize = Math.min(1000, limit);
  for (let page = 1; result.length < limit; page++) {
    const data = await immichRequest("/search/metadata", {
      method: "POST",
      body: { ...dto, page, size: Math.min(pageSize, limit - result.length) },
    });
    const assets =
      data && data.assets && Array.isArray(data.assets.items)
        ? data.assets.items
        : [];
    result.push(...assets);
    if (!data || !data.assets || !data.assets.nextPage || assets.length === 0)
      break;
  }
  return result.slice(0, limit);
}

function assetDate(asset) {
  return asset.localDateTime || asset.fileCreatedAt || asset.createdAt || "";
}
function assetPlace(asset) {
  const e = asset.exifInfo || {};
  return [e.city, e.state, e.country]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
}
function normalizeAsset(asset, extra = {}) {
  const e = asset.exifInfo || {};
  return {
    id: asset.id,
    date: assetDate(asset),
    city: e.city || "",
    state: e.state || "",
    country: e.country || "",
    latitude:
      e.latitude !== null &&
      e.latitude !== undefined &&
      e.latitude !== "" &&
      Number.isFinite(Number(e.latitude))
        ? Number(e.latitude)
        : null,
    longitude:
      e.longitude !== null &&
      e.longitude !== undefined &&
      e.longitude !== "" &&
      Number.isFinite(Number(e.longitude))
        ? Number(e.longitude)
        : null,
    location: assetPlace(asset),
    favorite: !!asset.isFavorite,
    ...extra,
  };
}
function storyDateLabel(assets) {
  const dates = assets
    .map((a) => new Date(a.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (!dates.length) return "";
  const first = dates[0],
    last = dates[dates.length - 1];
  const opts = { month: "short", day: "numeric", year: "numeric" };
  if (first.toDateString() === last.toDateString())
    return first.toLocaleDateString("en-US", opts);
  if (
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth()
  ) {
    return `${first.toLocaleDateString("en-US", { month: "short" })} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
  }
  return `${first.toLocaleDateString("en-US", opts)} – ${last.toLocaleDateString("en-US", opts)}`;
}
function shuffleCopy(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleStoryAssets(assets, max = FRAME_MAX_STORY_ASSETS) {
  if (assets.length <= max) return assets.slice();
  const sorted = assets
    .slice()
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const start = Math.floor(
    Math.random() * Math.max(1, sorted.length - max + 1),
  );
  return sorted.slice(start, start + max);
}
function excludedAlbumName(name) {
  const n = String(name || "").toLowerCase();
  return FRAME_EXCLUDE_ALBUMS.some(
    (p) => n === p.toLowerCase() || n.includes(p.toLowerCase()),
  );
}

function locationCompatible(a, b) {
  const ta = new Date(a.date).getTime(),
    tb = new Date(b.date).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  const hours = Math.abs(tb - ta) / 3600000;
  if (hours > 18) return false;
  const cityA = (a.city || "").toLowerCase(),
    cityB = (b.city || "").toLowerCase();
  const countryA = (a.country || "").toLowerCase(),
    countryB = (b.country || "").toLowerCase();
  if (cityA && cityA === cityB) return true;
  if (countryA && countryA === countryB && hours <= 8) return true;
  // Temporal burst fallback catches parties at home where GPS/reverse geocoding is absent.
  if (!a.location && !b.location && hours <= 3) return true;
  return false;
}
function clusterLocationEvents(items) {
  const sorted = items
    .slice()
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const clusters = [];
  let current = [];
  for (const item of sorted) {
    if (
      !current.length ||
      locationCompatible(current[current.length - 1], item)
    )
      current.push(item);
    else {
      if (current.length >= FRAME_MIN_EVENT_ASSETS) clusters.push(current);
      current = [item];
    }
  }
  if (current.length >= FRAME_MIN_EVENT_ASSETS) clusters.push(current);
  return clusters.map((assets, index) => {
    const counts = new Map();
    for (const a of assets)
      if (a.location) counts.set(a.location, (counts.get(a.location) || 0) + 1);
    const location =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "A moment";
    const sampled = sampleStoryAssets(assets);
    return {
      id: `location:${index}:${sampled[0]?.id || ""}`,
      type: "location",
      title: location,
      subtitle: storyDateLabel(sampled),
      assets: sampled,
    };
  });
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function subYearsSafe(date, years) {
  const d = new Date(date);
  const m = d.getMonth();
  d.setFullYear(d.getFullYear() - years);
  if (d.getMonth() !== m) d.setDate(0); // Feb 29 -> Feb 28
  return d;
}

async function buildAmbientCuratorPool() {
  const hiddenAssetIds = readHiddenAssetIds();
  const albumsRaw = await immichRequest("/albums?isOwned=true");
  const albums = Array.isArray(albumsRaw) ? albumsRaw : [];
  const eligibleAlbums = albums
    .filter(
      (a) => !excludedAlbumName(a.albumName) && Number(a.assetCount || 0) > 0,
    )
    .slice(0, FRAME_MAX_ALBUMS);
  const excludedAlbums = albums.filter((a) => excludedAlbumName(a.albumName));
  const excludedAssetIds = new Set();
  const albumStories = [];
  const knownAlbumByAsset = new Map();

  // Fetch album samples. A random page prevents huge albums from always showing their newest photos.
  await mapLimit(eligibleAlbums, 8, async (album) => {
    try {
      const size = Math.min(250, Math.max(FRAME_MAX_STORY_ASSETS * 4, 60));
      const pages = Math.max(
        1,
        Math.ceil(Number(album.assetCount || size) / size),
      );
      const page = 1 + Math.floor(Math.random() * pages);
      let assets = await searchAssets({
        albumIds: [album.id],
        type: "IMAGE",
        order: "desc",
        page,
        size,
      });
      if (!assets.length && page !== 1)
        assets = await searchAssets({
          albumIds: [album.id],
          type: "IMAGE",
          order: "desc",
          page: 1,
          size,
        });
      const normalized = assets
        .map((a) =>
          normalizeAsset(a, { album: album.albumName, albumId: album.id }),
        )
        .filter((a) => !hiddenAssetIds.has(String(a.id)));
      normalized.forEach((a) =>
        knownAlbumByAsset.set(a.id, { name: album.albumName, id: album.id }),
      );
      const sampled = sampleStoryAssets(normalized);
      if (sampled.length)
        albumStories.push({
          id: `album:${album.id}`,
          type: "album",
          title: album.albumName,
          subtitle: storyDateLabel(sampled),
          album: album.albumName,
          assets: sampled,
        });
    } catch (err) {
      console.warn(
        `Album sample failed for ${album.albumName || album.id}:`,
        err.message || err,
      );
    }
  });

  // Keep obvious utility/default albums out of memories/discovery too (best effort, first 1000 images each).
  await mapLimit(excludedAlbums.slice(0, 20), 8, async (album) => {
    try {
      const assets = await searchAssets({
        albumIds: [album.id],
        type: "IMAGE",
        page: 1,
        size: 1000,
      });
      assets.forEach((a) => excludedAssetIds.add(a.id));
    } catch (_) {}
  });

  // Photos with no album -> automatically discovered event/party/trip stories.
  const unalbumedRaw = await searchAssetsPaged(
    { isNotInAlbum: true, type: "IMAGE", order: "desc" },
    FRAME_UNALBUMED_LIMIT,
  ).catch((err) => {
    console.warn("Unalbumed photo scan failed:", err.message || err);
    return [];
  });
  const unalbumed = unalbumedRaw
    .map((a) => normalizeAsset(a))
    .filter((a) => !hiddenAssetIds.has(String(a.id)));
  const locationStories = clusterLocationEvents(unalbumed);

  // On-this-week memories around 1, 2 and 3 years ago.
  const memoryStories = [];
  const now = new Date();
  await mapLimit([1, 2, 3], 3, async (yearsAgo) => {
    const target = subYearsSafe(now, yearsAgo);
    const from = addDays(target, -FRAME_MEMORY_WINDOW_DAYS);
    const to = addDays(target, FRAME_MEMORY_WINDOW_DAYS + 1);
    let raw = await searchAssetsPaged(
      {
        type: "IMAGE",
        order: "asc",
        takenAfter: from.toISOString(),
        takenBefore: to.toISOString(),
      },
      500,
    ).catch((err) => {
      console.warn(`Memory scan failed for ${yearsAgo}y:`, err.message || err);
      return [];
    });
    raw = raw.filter(
      (a) => !excludedAssetIds.has(a.id) && !hiddenAssetIds.has(String(a.id)),
    );
    const normalized = raw.map((a) => {
      const known = knownAlbumByAsset.get(a.id);
      return normalizeAsset(
        a,
        known ? { album: known.name, albumId: known.id } : {},
      );
    });
    if (normalized.length >= 3) {
      const sampled = sampleStoryAssets(normalized);
      memoryStories.push({
        id: `memory:${yearsAgo}:${target.toISOString().slice(0, 10)}`,
        type: "memory",
        yearsAgo,
        title: `${yearsAgo} năm trước`,
        subtitle: storyDateLabel(sampled),
        assets: sampled,
      });
    }
  });

  // Small discovery pool: random photos from the known unalbumed + eligible album samples.
  const discoveryCandidates = [
    ...unalbumed,
    ...albumStories.flatMap((s) => s.assets),
  ].filter(
    (a) => !excludedAssetIds.has(a.id) && !hiddenAssetIds.has(String(a.id)),
  );
  const discoveryAssets = shuffleCopy(discoveryCandidates).slice(
    0,
    Math.min(80, discoveryCandidates.length),
  );
  const discoveryStories = discoveryAssets.length
    ? [
        {
          id: "discovery:mix",
          type: "discovery",
          title: "Khám phá lại",
          subtitle: "Từ thư viện của bạn",
          assets: discoveryAssets,
        },
      ]
    : [];

  return {
    generatedAt: new Date().toISOString(),
    weights: FRAME_WEIGHTS,
    excludedAlbumNames: FRAME_EXCLUDE_ALBUMS,
    stories: {
      albums: shuffleCopy(albumStories),
      locations: shuffleCopy(locationStories),
      memories: shuffleCopy(memoryStories),
      discovery: discoveryStories,
    },
    stats: {
      albums: albumStories.length,
      locationEvents: locationStories.length,
      memories: memoryStories.length,
      unalbumedAssetsScanned: unalbumed.length,
    },
  };
}

async function getAmbientCuratorPool(force = false) {
  const now = Date.now();
  if (
    !force &&
    ambientCuratorCache.payload &&
    ambientCuratorCache.expires > now
  )
    return ambientCuratorCache.payload;
  if (ambientCuratorCache.building) return ambientCuratorCache.building;
  ambientCuratorCache.building = buildAmbientCuratorPool()
    .then((payload) => {
      ambientCuratorCache.payload = payload;
      ambientCuratorCache.expires = Date.now() + FRAME_POOL_REFRESH_MS;
      return payload;
    })
    .finally(() => {
      ambientCuratorCache.building = null;
    });
  return ambientCuratorCache.building;
}

function normalizedAssetHasLocation(asset) {
  if (!asset) return false;
  if (String(asset.location || "").trim()) return true;
  const lat = asset.latitude,
    lon = asset.longitude;
  if (
    lat === null ||
    lat === undefined ||
    lat === "" ||
    lon === null ||
    lon === undefined ||
    lon === ""
  )
    return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
}
async function getAmbientAssetInfo(assetId) {
  const cached = ambientAssetInfoCache.get(assetId);
  if (cached && cached.expires > Date.now()) return cached.payload;
  const [asset, albums] = await Promise.all([
    immichRequest("/assets/" + encodeURIComponent(assetId)),
    immichRequest("/albums?assetId=" + encodeURIComponent(assetId)),
  ]);
  const normalized = normalizeAsset(asset || {});
  normalized.albums = Array.isArray(albums)
    ? albums
        .map((a) => ({ id: a.id, name: a.albumName }))
        .filter((a) => !excludedAlbumName(a.name))
    : [];
  if (!normalized.album && normalized.albums.length)
    normalized.album = normalized.albums[0].name;
  boundedCacheSet(
    ambientAssetInfoCache,
    assetId,
    { expires: Date.now() + 6 * 60 * 60 * 1000, payload: normalized },
    500,
  );
  return normalized;
}
function pickWeightedStory(pool) {
  const options = [],
    weights = pool.weights || FRAME_WEIGHTS;
  let total = 0;
  for (const category of ["albums", "locations", "memories", "discovery"]) {
    const stories = (pool.stories && pool.stories[category]) || [],
      weight = Math.max(0, Number(weights[category] || 0));
    if (stories.length && weight) {
      options.push({ category, stories, weight });
      total += weight;
    }
  }
  if (!options.length || !total) return null;
  let cursor = Math.random() * total,
    choice = options[options.length - 1];
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) {
      choice = option;
      break;
    }
  }
  if (choice.category === "memories") {
    const weighted = choice.stories.map((story) => ({
      story,
      weight:
        Number(story.yearsAgo) === 1
          ? 50
          : Number(story.yearsAgo) === 2
            ? 30
            : Number(story.yearsAgo) === 3
              ? 20
              : 10,
    }));
    let sum = weighted.reduce((n, x) => n + x.weight, 0),
      n = Math.random() * sum;
    for (const x of weighted) {
      n -= x.weight;
      if (n <= 0) return x.story;
    }
    return weighted[weighted.length - 1].story;
  }
  return (
    choice.stories[Math.floor(Math.random() * choice.stories.length)] || null
  );
}
async function pickVerifiedAmbientPhoto(recentIds) {
  const pool = await getAmbientCuratorPool(false),
    recent = new Set(recentIds || []),
    tried = new Set();
  for (let attempt = 0; attempt < 28; attempt++) {
    const story = pickWeightedStory(pool);
    if (!story || !Array.isArray(story.assets) || !story.assets.length)
      continue;
    const candidates = shuffleCopy(story.assets).sort(
      (a, b) =>
        Number(recent.has(String(a.id))) - Number(recent.has(String(b.id))),
    );
    const candidate = candidates.find(
      (x) => x && x.id && !tried.has(String(x.id)),
    );
    if (!candidate) continue;
    tried.add(String(candidate.id));
    let details = candidate;
    try {
      if (!normalizedAssetHasLocation(candidate))
        details = {
          ...candidate,
          ...(await getAmbientAssetInfo(String(candidate.id))),
        };
    } catch (_) {
      continue;
    }
    if (!normalizedAssetHasLocation(details)) continue;
    return {
      ...details,
      storyTitle: story.title || "Khung ảnh",
      storySubtitle: story.subtitle || "",
      album: details.album || story.album || "",
    };
  }
  return null;
}

app.get("/ambient/curated", async (req, res) => {
  try {
    const payload = await getAmbientCuratorPool(req.query.refresh === "1");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json(payload);
  } catch (err) {
    console.error("Ambient curator error:", err.message || err);
    res
      .status(502)
      .json({
        error: "Không thể chuẩn bị ảnh nền",
        detail: String(err.message || err),
      });
  }
});

app.get("/ambient/next-photo", async (req, res) => {
  try {
    const recent = String(req.query.recent || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => /^[0-9a-f-]{30,40}$/i.test(x))
      .slice(-120);
    const item = await pickVerifiedAmbientPhoto(recent);
    res.setHeader("Cache-Control", "no-store");
    if (!item)
      return res.status(404).json({ error: "Không có ảnh theo địa điểm" });
    return res.json({ item });
  } catch (err) {
    console.error("Next ambient photo failed:", err.message || err);
    return res
      .status(502)
      .json({
        error: "Không thể chọn ảnh tiếp theo",
        detail: String(err.message || err),
      });
  }
});

// Accurate current-photo metadata, including album membership even for memory/event photos.
app.get("/ambient/asset-info/:assetId", async (req, res) => {
  const assetId = String(req.params.assetId || "");
  if (!/^[0-9a-fA-F-]{30,40}$/.test(assetId))
    return res.status(400).json({ error: "ID ảnh không hợp lệ" });
  try {
    const info = await getAmbientAssetInfo(assetId),
      e = info || {};
    res.json({
      id: assetId,
      date: info.date || "",
      city: e.city || "",
      state: e.state || "",
      country: e.country || "",
      latitude:
        e.latitude !== null &&
        e.latitude !== undefined &&
        e.latitude !== "" &&
        Number.isFinite(Number(e.latitude))
          ? Number(e.latitude)
          : null,
      longitude:
        e.longitude !== null &&
        e.longitude !== undefined &&
        e.longitude !== "" &&
        Number.isFinite(Number(e.longitude))
          ? Number(e.longitude)
          : null,
      location: [e.city, e.state, e.country]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", "),
      favorite: !!info.favorite,
      hidden: readHiddenAssetIds().has(assetId),
      albums: info.albums || [],
    });
  } catch (err) {
    console.error("Asset info error:", err.message || err);
    res.status(502).json({ error: "Không thể lấy thông tin ảnh" });
  }
});

app.post("/ambient/photo-action", async (req, res) => {
  const assetId = String((req.body && req.body.assetId) || "").trim();
  const action = String((req.body && req.body.action) || "").trim();
  if (!/^[0-9a-fA-F-]{30,40}$/.test(assetId))
    return res.status(400).json({ error: "ID ảnh không hợp lệ" });
  try {
    if (action === "favorite") {
      const value =
        req.body && req.body.value !== undefined ? !!req.body.value : true;
      await immichRequest("/assets/" + encodeURIComponent(assetId), {
        method: "PUT",
        body: { isFavorite: value },
      });
      ambientAssetInfoCache.delete(assetId);
      ambientCuratorCache.expires = 0;
      return res.json({ ok: true, action, assetId, favorite: value });
    }
    if (action === "hide") {
      const hidden = readHiddenAssetIds();
      hidden.add(assetId);
      writeHiddenAssetIds(hidden);
      ambientCuratorCache.expires = 0;
      ambientCuratorCache.payload = null;
      return res.json({ ok: true, action, assetId, hidden: true });
    }
    if (action === "unhide") {
      const hidden = readHiddenAssetIds();
      hidden.delete(assetId);
      writeHiddenAssetIds(hidden);
      ambientCuratorCache.expires = 0;
      ambientCuratorCache.payload = null;
      return res.json({ ok: true, action, assetId, hidden: false });
    }
    return res.status(400).json({ error: "Thao tác ảnh không xác định" });
  } catch (err) {
    console.error("Photo action failed:", err.message || err);
    return res
      .status(502)
      .json({
        error: "Thao tác ảnh thất bại",
        detail: String(err.message || err),
      });
  }
});

// Same-origin proxy for the browser. The API key never reaches client-side JS.
app.use("/immich", async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Proxy media Immich chỉ cho phép đọc" });
  }
  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  req.once("aborted", abortUpstream);
  res.once("close", abortUpstream);
  try {
    const upstream = new URL(
      "/api" + req.originalUrl.replace(/^\/immich/, ""),
      IMMICH_URL,
    );

    const headers = {
      "x-api-key": IMMICH_API_KEY,
      accept: req.headers.accept || "*/*",
      "user-agent": req.headers["user-agent"] || "immich-display-proxy",
    };

    // Forward range requests if Immich ever returns ranged media.
    if (req.headers.range) headers.range = req.headers.range;

    const init = {
      method: req.method,
      headers,
      redirect: "manual",
      signal: controller.signal,
    };

    const upstreamRes = await fetchWithTimeout(upstream, init, 30000);

    res.status(upstreamRes.status);
    for (const [key, value] of upstreamRes.headers) {
      const k = key.toLowerCase();
      if (["connection", "transfer-encoding", "content-encoding"].includes(k))
        continue;
      res.setHeader(key, value);
    }

    if (!upstreamRes.body || req.method === "HEAD") {
      upstreamRes.__releaseTimeout?.();
      return res.end();
    }

    try {
      await pipeline(Readable.fromWeb(upstreamRes.body), res);
    } finally {
      upstreamRes.__releaseTimeout?.();
    }
  } catch (err) {
    if (!controller.signal.aborted) console.error("Immich proxy error:", err);
    if (!res.headersSent)
      res.status(502).json({ error: "Proxy Immich thất bại" });
    else res.end();
  } finally {
    req.removeListener("aborted", abortUpstream);
    res.removeListener("close", abortUpstream);
  }
});

