// Shared formatting and HTTP helpers used by Spotify metadata and lyric lookups.
function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "immich-digital-frame/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Upstream returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function loadSpotifyTokens() {
  try {
    const raw = fs.readFileSync(SPOTIFY_TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

let spotifyTokens = loadSpotifyTokens();

function persistSpotifyTokens(tokens) {
  spotifyTokens = tokens;
  try {
    fs.writeFileSync(SPOTIFY_TOKEN_FILE, JSON.stringify(tokens, null, 2), {
      mode: 0o600,
    });
    try {
      fs.chmodSync(SPOTIFY_TOKEN_FILE, 0o600);
    } catch (_) {}
  } catch (err) {
    console.error(
      "Could not persist Spotify token file:",
      err && err.message ? err.message : err,
    );
  }
}

function clearSpotifyTokens() {
  spotifyTokens = null;
  try {
    fs.unlinkSync(SPOTIFY_TOKEN_FILE);
  } catch (_) {}
}

function spotifyConfigured() {
  return !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI);
}

async function spotifyTokenRequest(params) {
  if (!spotifyConfigured()) {
    const err = new Error("Spotify is not configured");
    err.status = 503;
    throw err;
  }
  const response = await fetchWithTimeout(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization:
          "Basic " +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString(
            "base64",
          ),
      },
      body: new URLSearchParams(params),
    },
    10000,
  );
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { error_description: text };
  }
  if (!response.ok) {
    const err = new Error(
      payload.error_description ||
        payload.error ||
        `Spotify token request failed (${response.status})`,
    );
    err.status = response.status;
    err.spotifyError = payload.error || "";
    throw err;
  }
  return payload;
}

async function refreshSpotifyAccessToken() {
  if (spotifyTokenRefreshPromise) return spotifyTokenRefreshPromise;
  spotifyTokenRefreshPromise = (async () => {
    if (!spotifyTokens || !spotifyTokens.refreshToken) {
      const err = new Error("Spotify is not connected");
      err.status = 401;
      throw err;
    }
    try {
      const payload = await spotifyTokenRequest({
        grant_type: "refresh_token",
        refresh_token: spotifyTokens.refreshToken,
      });
      const now = Date.now();
      const next = {
        ...spotifyTokens,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token || spotifyTokens.refreshToken,
        scope: payload.scope || spotifyTokens.scope || SPOTIFY_SCOPES,
        expiresAt:
          now + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
      };
      persistSpotifyTokens(next);
      return next.accessToken;
    } catch (err) {
      if (err && err.spotifyError === "invalid_grant") clearSpotifyTokens();
      throw err;
    }
  })();
  try {
    return await spotifyTokenRefreshPromise;
  } finally {
    spotifyTokenRefreshPromise = null;
  }
}

async function getSpotifyAccessToken() {
  if (!spotifyTokens || !spotifyTokens.accessToken) {
    const err = new Error("Spotify is not connected");
    err.status = 401;
    throw err;
  }
  if (Number(spotifyTokens.expiresAt || 0) > Date.now() + 60 * 1000)
    return spotifyTokens.accessToken;
  return refreshSpotifyAccessToken();
}

function spotifyCooldownError() {
  const seconds = Math.max(
      1,
      Math.ceil((spotifyRateLimitUntil - Date.now()) / 1000),
    ),
    err = new Error(
      spotifyRateLimitReason === "QUOTA_EXCEEDED"
        ? "Spotify development quota exceeded"
        : "Spotify is rate limiting requests",
    );
  err.status = 429;
  err.retryAfter = String(seconds);
  err.reason = spotifyRateLimitReason || "RATE_LIMITED";
  err.rateLimitedUntil = spotifyRateLimitUntil;
  return err;
}

function noteSpotifyRateLimit(response, payload) {
  spotifyRateLimitStrikes = Math.min(6, spotifyRateLimitStrikes + 1);
  const reason = String(
      (payload &&
        ((payload.error && payload.error.reason) || payload.reason)) ||
        "RATE_LIMITED",
    ),
    headerSeconds = Math.max(
      0,
      Number(response.headers.get("retry-after")) || 0,
    );
  const fallbackSeconds =
      reason === "QUOTA_EXCEEDED"
        ? 15 * 60
        : Math.min(10 * 60, 15 * Math.pow(2, spotifyRateLimitStrikes - 1)),
    seconds = Math.max(5, headerSeconds || fallbackSeconds);
  spotifyRateLimitReason = reason;
  spotifyRateLimitUntil = Math.max(
    spotifyRateLimitUntil,
    Date.now() + seconds * 1000,
  );
  recordFrameNotification({
    id: "system:spotify-rate-limit",
    type: "spotify",
    priority: reason === "QUOTA_EXCEEDED" ? 86 : 66,
    title:
      reason === "QUOTA_EXCEEDED"
        ? "Spotify quota exceeded"
        : "Spotify is rate limiting requests",
    body: `The server will wait ${Math.ceil(seconds / 60)} minutes before retrying.`,
    icon: "music",
    action: "open-media",
  });
  return seconds;
}

async function spotifyApi(pathname, { method = "GET", query, body } = {}) {
  if (Date.now() < spotifyRateLimitUntil) throw spotifyCooldownError();
  const token = await getSpotifyAccessToken();
  const url = new URL("https://api.spotify.com/v1" + pathname);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    }
  }
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetchWithTimeout(url, init, 10000);
  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = text;
  }
  if (!response.ok) {
    const message =
      payload && payload.error && payload.error.message
        ? payload.error.message
        : typeof payload === "string" && payload
          ? payload
          : `Spotify API returned status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    if (response.status === 429) {
      const seconds = noteSpotifyRateLimit(response, payload);
      err.retryAfter = String(seconds);
      err.rateLimitedUntil = spotifyRateLimitUntil;
    } else err.retryAfter = response.headers.get("retry-after") || "";
    err.reason =
      (payload &&
        ((payload.error && payload.error.reason) || payload.reason)) ||
      "";
    throw err;
  }
  if (Date.now() >= spotifyRateLimitUntil) {
    spotifyRateLimitStrikes = 0;
    spotifyRateLimitReason = "";
  }
  return payload;
}

function spotifyTrackToResult(track) {
  if (!track || track.type !== "track") return null;
  const artists = Array.isArray(track.artists)
    ? track.artists.map((a) => a && a.name).filter(Boolean)
    : [];
  const images =
    track.album && Array.isArray(track.album.images) ? track.album.images : [];
  const image =
    (images.find((x) => x && x.width && x.width <= 640) || images[0] || {})
      .url || "";
  return {
    id: String(track.id || ""),
    uri: String(track.uri || ""),
    title: String(track.name || ""),
    artist: artists.join(", "),
    artists,
    album: String((track.album && track.album.name) || ""),
    durationMs: Math.max(0, Number(track.duration_ms || 0)),
    durationSeconds: Math.max(0, Number(track.duration_ms || 0)) / 1000,
    duration: formatDuration(
      Math.max(0, Number(track.duration_ms || 0)) / 1000,
    ),
    thumbnail: image,
    externalUrl: String(
      (track.external_urls && track.external_urls.spotify) || "",
    ),
    explicit: !!track.explicit,
    source: "spotify",
  };
}

function spotifyPlaybackItemToResult(item) {
  if (!item) return null;
  if (item.type === "track") return spotifyTrackToResult(item);
  if (item.type !== "episode") return null;
  const images = Array.isArray(item.images)
      ? item.images
      : item.show && Array.isArray(item.show.images)
        ? item.show.images
        : [],
    image =
      (images.find((entry) => entry && entry.width && entry.width <= 640) ||
        images[0] ||
        {}).url || "";
  return {
    id: String(item.id || ""),
    uri: String(item.uri || ""),
    type: "episode",
    title: String(item.name || ""),
    artist: String((item.show && item.show.name) || "Podcast"),
    artists: [],
    album: String((item.show && item.show.name) || ""),
    durationMs: Math.max(0, Number(item.duration_ms || 0)),
    durationSeconds: Math.max(0, Number(item.duration_ms || 0)) / 1000,
    duration: formatDuration(
      Math.max(0, Number(item.duration_ms || 0)) / 1000,
    ),
    thumbnail: image,
    externalUrl: String(
      (item.external_urls && item.external_urls.spotify) || "",
    ),
    explicit: !!item.explicit,
    source: "spotify",
  };
}

function spotifyPlayerStateToPayload(state) {
  if (!state)
    return {
      active: false,
      isPlaying: false,
      progressMs: 0,
      item: null,
      device: null,
    };
  const item = spotifyPlaybackItemToResult(state.item);
  return {
    active: !!state.device,
    isPlaying: !!state.is_playing,
    progressMs: Math.max(0, Number(state.progress_ms || 0)),
    shuffle: !!state.shuffle_state,
    repeat: String(state.repeat_state || "off"),
    context: state.context || null,
    item,
    device: state.device
      ? {
          id: String(state.device.id || ""),
          name: String(state.device.name || ""),
          type: String(state.device.type || ""),
          isActive: !!state.device.is_active,
          isRestricted: !!state.device.is_restricted,
          volumePercent:
            state.device.volume_percent == null
              ? null
              : Number(state.device.volume_percent),
        }
      : null,
  };
}

function spotifyRouteError(res, err, fallback) {
  const status = Number(err && err.status) || 502;
  const body = {
    error: fallback || "Spotify request failed",
    detail: err && err.message ? err.message : String(err),
  };
  if (err && err.reason) body.reason = err.reason;
  if (err && err.retryAfter) {
    res.setHeader("Retry-After", err.retryAfter);
    body.retryAfterSeconds = Math.max(1, Number(err.retryAfter) || 1);
    body.rateLimitedUntil = Number(
      err.rateLimitedUntil || spotifyRateLimitUntil || 0,
    );
  }
  return res.status(status >= 400 && status < 600 ? status : 502).json(body);
}

async function getSpotifyProfileCached() {
  if (spotifyProfileCache.payload && spotifyProfileCache.expires > Date.now())
    return spotifyProfileCache.payload;
  if (!spotifyProfileCache.pending) {
    const pending = spotifyApi("/me")
      .then((profile) => {
        if (spotifyProfileCache.pending === pending)
          spotifyProfileCache = {
            expires: Date.now() + 30 * 60 * 1000,
            payload: profile,
            pending: null,
          };
        return profile;
      })
      .catch((err) => {
        if (spotifyProfileCache.pending === pending)
          spotifyProfileCache.pending = null;
        throw err;
      });
    spotifyProfileCache.pending = pending;
  }
  return await spotifyProfileCache.pending;
}

app.use("/spotify", (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    spotifyPlayerCacheVersion++;
    spotifyPlayerCache = {
      expires: 0,
      payload: spotifyPlayerCache.payload,
      pending: null,
    };
    spotifyDevicesCache.expires = 0;
  }
  next();
});

app.get("/spotify/status", async (req, res) => {
  if (!spotifyConfigured()) {
    return res.json({
      configured: false,
      connected: false,
      deviceName: SPOTIFY_DEVICE_NAME,
      redirectUri: SPOTIFY_REDIRECT_URI || "",
      hint: "Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI.",
    });
  }
  if (!spotifyTokens || !spotifyTokens.refreshToken) {
    return res.json({
      configured: true,
      connected: false,
      deviceName: SPOTIFY_DEVICE_NAME,
      redirectUri: SPOTIFY_REDIRECT_URI,
    });
  }
  try {
    const profile = await getSpotifyProfileCached();
    return res.json({
      configured: true,
      connected: true,
      deviceName: SPOTIFY_DEVICE_NAME,
      redirectUri: SPOTIFY_REDIRECT_URI,
      reauthorizeBy: spotifyTokens.authorizedAt
        ? spotifyTokens.authorizedAt + 183 * 24 * 60 * 60 * 1000
        : null,
      profile: {
        displayName: String((profile && profile.display_name) || "Spotify"),
        id: String((profile && profile.id) || ""),
        accountId: String((profile && profile.account_id) || ""),
        image: String(
          (profile &&
            profile.images &&
            profile.images[0] &&
            profile.images[0].url) ||
            "",
        ),
        externalUrl: String(
          (profile && profile.external_urls && profile.external_urls.spotify) ||
            "",
        ),
      },
    });
  } catch (err) {
    if (Number(err && err.status) === 401) clearSpotifyTokens();
    if (Number(err && err.status) === 429)
      return res.json({
        configured: true,
        connected: true,
        deviceName: SPOTIFY_DEVICE_NAME,
        redirectUri: SPOTIFY_REDIRECT_URI,
        rateLimited: true,
        retryAfterSeconds: Math.max(1, Number(err.retryAfter) || 1),
        rateLimitedUntil: Number(
          err.rateLimitedUntil || spotifyRateLimitUntil || 0,
        ),
        profile: spotifyProfileCache.payload
          ? {
              displayName: String(
                spotifyProfileCache.payload.display_name || "Spotify",
              ),
              id: String(spotifyProfileCache.payload.id || ""),
              image: String(
                (spotifyProfileCache.payload.images &&
                  spotifyProfileCache.payload.images[0] &&
                  spotifyProfileCache.payload.images[0].url) ||
                  "",
              ),
            }
          : null,
      });
    return res.json({
      configured: true,
      connected: false,
      deviceName: SPOTIFY_DEVICE_NAME,
      redirectUri: SPOTIFY_REDIRECT_URI,
      error: err.message || String(err),
    });
  }
});

app.get("/spotify/login", (req, res) => {
  if (!spotifyConfigured())
    return res
      .status(503)
      .send(
        "Spotify is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI.",
      );
  const state = crypto.randomBytes(24).toString("hex");
  spotifyAuthStates.set(state, Date.now() + 10 * 60 * 1000);
  for (const [key, expires] of spotifyAuthStates)
    if (expires < Date.now()) spotifyAuthStates.delete(key);
  const auth = new URL("https://accounts.spotify.com/authorize");
  auth.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
  auth.searchParams.set("scope", SPOTIFY_SCOPES);
  auth.searchParams.set("state", state);
  auth.searchParams.set("show_dialog", "false");
  return res.redirect(auth.toString());
});

app.get("/spotify/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const error = String(req.query.error || "");
  const expires = spotifyAuthStates.get(state);
  spotifyAuthStates.delete(state);
  if (error)
    return res.status(400).send(`Spotify authentication failed: ${error}`);
  if (!code || !state || !expires || expires < Date.now())
    return res
      .status(400)
      .send(
        "Invalid or expired Spotify authorization state. Please start login again.",
      );
  try {
    const payload = await spotifyTokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    });
    const now = Date.now();
    persistSpotifyTokens({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      scope: payload.scope || SPOTIFY_SCOPES,
      expiresAt: now + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
      authorizedAt: now,
    });
    return res.redirect(SPOTIFY_AFTER_LOGIN_URL);
  } catch (err) {
    console.error(
      "Spotify callback failed:",
      err && err.message ? err.message : err,
    );
    return res
      .status(502)
      .send(
        "Spotify authorization exchange failed. Check server logs and redirect URI configuration.",
      );
  }
});

app.post("/spotify/logout", (req, res) => {
  clearSpotifyTokens();
  spotifyPersonalCache = { expires: 0, payload: null, pending: null };
  spotifyPlayerCache = { expires: 0, payload: null, pending: null };
  spotifyDevicesCache = { expires: 0, payload: null, pending: null };
  spotifyProfileCache = { expires: 0, payload: null, pending: null };
  spotifyRateLimitUntil = 0;
  spotifyRateLimitReason = "";
  spotifyRateLimitStrikes = 0;
  return res.json({ ok: true });
});

app.get("/spotify/token", async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      accessToken: token,
      expiresAt: Number((spotifyTokens && spotifyTokens.expiresAt) || 0),
      deviceName: SPOTIFY_DEVICE_NAME,
    });
  } catch (err) {
    return spotifyRouteError(res, err, "Spotify token is unavailable");
  }
});

app.get("/spotify/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2 || q.length > 160)
    return res
      .status(400)
      .json({ error: "Search query must contain between 2 and 160 characters" });
  const key = `spotify:${q.toLowerCase()}`;
  const cached = musicSearchCache.get(key);
  if (cached && cached.expires > Date.now())
    return res.json({ ...cached.payload, cached: true });
  try {
    const data = await spotifyApi("/search", {
      query: { q, type: "track", limit: 10 },
    });
    const results = (((data || {}).tracks || {}).items || [])
      .map(spotifyTrackToResult)
      .filter(Boolean);
    const payload = { query: q, results, source: "spotify" };
    boundedCacheSet(
      musicSearchCache,
      key,
      { expires: Date.now() + 5 * 60 * 1000, payload },
      120,
    );
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error(
      "Spotify search error:",
      err && err.message ? err.message : err,
    );
    return spotifyRouteError(res, err, "Spotify search failed");
  }
});

app.get("/spotify/personal", async (req, res) => {
  if (
    spotifyPersonalCache.payload &&
    spotifyPersonalCache.expires > Date.now()
  ) {
    return res.json({ ...spotifyPersonalCache.payload, cached: true });
  }
  try {
    if (!spotifyPersonalCache.pending) {
      const pending = Promise.allSettled([
        spotifyApi("/me/top/tracks", {
          query: { time_range: "short_term", limit: 10 },
        }),
        spotifyApi("/me/player/recently-played", { query: { limit: 10 } }),
        spotifyApi("/me/tracks", { query: { limit: 10 } }),
      ])
        .then((settled) => {
          if (!settled.some((x) => x.status === "fulfilled"))
            throw settled.find((x) => x.status === "rejected").reason;
          const top =
            settled[0].status === "fulfilled"
              ? ((settled[0].value || {}).items || [])
                  .map(spotifyTrackToResult)
                  .filter(Boolean)
              : [];
          const recent =
            settled[1].status === "fulfilled"
              ? ((settled[1].value || {}).items || [])
                  .map((x) => spotifyTrackToResult(x && x.track))
                  .filter(Boolean)
              : [];
          const saved =
            settled[2].status === "fulfilled"
              ? ((settled[2].value || {}).items || [])
                  .map((x) => spotifyTrackToResult(x && x.track))
                  .filter(Boolean)
              : [];
          const payload = { top, recent, saved };
          if (spotifyPersonalCache.pending === pending)
            spotifyPersonalCache = {
              expires: Date.now() + 5 * 60 * 1000,
              payload,
              pending: null,
            };
          return payload;
        })
        .catch((err) => {
          if (spotifyPersonalCache.pending === pending)
            spotifyPersonalCache.pending = null;
          throw err;
        });
      spotifyPersonalCache.pending = pending;
    }
    const payload = await spotifyPersonalCache.pending;
    return res.json({ ...payload, cached: false });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to load personal Spotify library");
  }
});

app.get("/spotify/player", async (req, res) => {
  if (Date.now() < spotifyRateLimitUntil && spotifyPlayerCache.payload)
    return res.json({
      ...spotifyPlayerCache.payload,
      cached: true,
      stale: true,
      rateLimited: true,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((spotifyRateLimitUntil - Date.now()) / 1000),
      ),
      rateLimitedUntil: spotifyRateLimitUntil,
    });
  if (
    req.query.refresh !== "1" &&
    spotifyPlayerCache.payload &&
    spotifyPlayerCache.expires > Date.now()
  )
    return res.json({ ...spotifyPlayerCache.payload, cached: true });
  try {
    if (!spotifyPlayerCache.pending) {
      const version = spotifyPlayerCacheVersion,
        pending = spotifyApi("/me/player")
          .then((state) => {
            const payload = spotifyPlayerStateToPayload(state);
            if (
              version === spotifyPlayerCacheVersion &&
              spotifyPlayerCache.pending === pending
            )
              spotifyPlayerCache = {
                expires: Date.now() + 10000,
                payload,
                pending: null,
              };
            return payload;
          })
          .catch((err) => {
            if (spotifyPlayerCache.pending === pending)
              spotifyPlayerCache.pending = null;
            throw err;
          });
      spotifyPlayerCache.pending = pending;
    }
    const payload = await spotifyPlayerCache.pending;
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ...payload, cached: false });
  } catch (err) {
    if (Number(err && err.status) === 429 && spotifyPlayerCache.payload)
      return res.json({
        ...spotifyPlayerCache.payload,
        cached: true,
        stale: true,
        rateLimited: true,
        retryAfterSeconds: Math.max(1, Number(err.retryAfter) || 1),
        rateLimitedUntil: Number(
          err.rateLimitedUntil || spotifyRateLimitUntil || 0,
        ),
      });
    return spotifyRouteError(res, err, "Unable to retrieve Spotify playback state");
  }
});

app.get("/spotify/devices", async (req, res) => {
  try {
    if (spotifyDevicesCache.payload && spotifyDevicesCache.expires > Date.now())
      return res.json({ ...spotifyDevicesCache.payload, cached: true });
    if (!spotifyDevicesCache.pending) {
      const pending = spotifyApi("/me/player/devices")
        .then((data) => {
          const devices = ((data || {}).devices || [])
              .map((d) => ({
                id: String(d.id || ""),
                name: String(d.name || ""),
                type: String(d.type || ""),
                isActive: !!d.is_active,
                isRestricted: !!d.is_restricted,
                volumePercent:
                  d.volume_percent == null ? null : Number(d.volume_percent),
              }))
              .filter((d) => d.id),
            payload = { devices };
          if (spotifyDevicesCache.pending === pending)
            spotifyDevicesCache = {
              expires: Date.now() + 30 * 1000,
              payload,
              pending: null,
            };
          return payload;
        })
        .catch((err) => {
          if (spotifyDevicesCache.pending === pending)
            spotifyDevicesCache.pending = null;
          throw err;
        });
      spotifyDevicesCache.pending = pending;
    }
    const payload = await spotifyDevicesCache.pending;
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ...payload, cached: false });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to load Spotify devices");
  }
});

app.post("/spotify/play", async (req, res) => {
  const body = req.body || {};
  let deviceId = String(body.deviceId || "").trim();
  const apiBody = {};
  if (Array.isArray(body.uris) && body.uris.length)
    apiBody.uris = body.uris.slice(0, 50).map(String);
  if (body.contextUri) apiBody.context_uri = String(body.contextUri);
  if (body.positionMs != null)
    apiBody.position_ms = Math.max(0, Math.round(Number(body.positionMs) || 0));
  const playOnDevice = (targetId) =>
    spotifyApi("/me/player/play", {
      method: "PUT",
      query: { device_id: targetId || undefined },
      body: Object.keys(apiBody).length ? apiBody : undefined,
    });
  let recovered = false;
  try {
    try {
      await playOnDevice(deviceId);
    } catch (firstError) {
      const status = Number(firstError && firstError.status) || 0;
      const message = String(
        (firstError && firstError.message) || "",
      ).toLowerCase();
      const canRecover =
        status === 404 ||
        status === 403 ||
        /device|player|active|thiết bị|trình phát/.test(message);
      if (!canRecover) throw firstError;

      spotifyDevicesCache.expires = 0;
      const devices = await getSpotifyDevicesForVoice();
      const usable = devices.filter((device) => !device.isRestricted);
      const fallback =
        usable.find(
          (device) => device.isActive && String(device.id) !== deviceId,
        ) ||
        usable.find((device) => String(device.id) !== deviceId) ||
        usable[0];
      if (!fallback || !fallback.id) throw firstError;

      deviceId = String(fallback.id);
      await playOnDevice(deviceId);
      recovered = true;
    }
    return res.json({ ok: true, deviceId, recovered });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to play Spotify");
  }
});

app.post("/spotify/pause", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  try {
    await spotifyApi("/me/player/pause", {
      method: "PUT",
      query: { device_id: deviceId || undefined },
    });
    return res.json({ ok: true });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to pause Spotify");
  }
});

app.post("/spotify/next", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  try {
    await spotifyApi("/me/player/next", {
      method: "POST",
      query: { device_id: deviceId || undefined },
    });
    return res.json({ ok: true });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to skip to the next track");
  }
});

app.post("/spotify/previous", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  try {
    await spotifyApi("/me/player/previous", {
      method: "POST",
      query: { device_id: deviceId || undefined },
    });
    return res.json({ ok: true });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to return to the previous track");
  }
});

app.put("/spotify/seek", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const positionMs = Math.max(
    0,
    Math.round(Number(req.body && req.body.positionMs) || 0),
  );
  try {
    await spotifyApi("/me/player/seek", {
      method: "PUT",
      query: { position_ms: positionMs, device_id: deviceId || undefined },
    });
    return res.json({ ok: true });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to seek Spotify playback");
  }
});

app.put("/spotify/volume", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const rawVolume = req.body && req.body.volumePercent;
  if (
    rawVolume === undefined ||
    rawVolume === null ||
    rawVolume === "" ||
    !Number.isFinite(Number(rawVolume))
  )
    return res
      .status(400)
      .json({ error: "Spotify volume from 0 to 100 is required" });
  const volumePercent = Math.max(
    0,
    Math.min(100, Math.round(Number(rawVolume))),
  );
  try {
    await spotifyApi("/me/player/volume", {
      method: "PUT",
      query: {
        volume_percent: volumePercent,
        device_id: deviceId || undefined,
      },
    });
    return res.json({ ok: true });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to change Spotify volume");
  }
});

app.put("/spotify/transfer", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
  try {
    const playerState = await spotifyApi("/me/player");
    const isPlaying = !!(playerState && playerState.is_playing);
    await spotifyApi("/me/player", {
      method: "PUT",
      body: { device_ids: [deviceId], play: isPlaying },
    });
    return res.json({ ok: true, continuedPlaying: isPlaying });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to transfer Spotify playback");
  }
});

app.put("/spotify/shuffle", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const state = !!(req.body && req.body.state);
  try {
    await spotifyApi("/me/player/shuffle", {
      method: "PUT",
      query: { state, device_id: deviceId || undefined },
    });
    return res.json({ ok: true, state });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to change Spotify shuffle mode");
  }
});

app.put("/spotify/repeat", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const state = String((req.body && req.body.state) || "off");
  if (!["off", "context", "track"].includes(state))
    return res
      .status(400)
      .json({ error: "Repeat mode must be off, context, or track" });
  try {
    await spotifyApi("/me/player/repeat", {
      method: "PUT",
      query: { state, device_id: deviceId || undefined },
    });
    return res.json({ ok: true, state });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to change Spotify repeat mode");
  }
});

app.post("/spotify/queue", async (req, res) => {
  const deviceId = String((req.body && req.body.deviceId) || "").trim();
  const uri = String((req.body && req.body.uri) || "").trim();
  if (!/^spotify:(track|episode):[A-Za-z0-9]+$/.test(uri))
    return res
      .status(400)
      .json({ error: "A Spotify track or episode URI is required" });
  try {
    await spotifyApi("/me/player/queue", {
      method: "POST",
      query: { uri, device_id: deviceId || undefined },
    });
    return res.json({ ok: true });
  } catch (err) {
    return spotifyRouteError(res, err, "Unable to update Spotify queue");
  }
});

function parseLrc(text) {
  const lines = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw) => {
      const matches = [
        ...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g),
      ];
      if (!matches.length) return;
      const lyricText = raw.replace(/\[[^\]]+\]/g, "").trim();
      if (!lyricText) return;
      for (const m of matches) {
        const minutes = Number(m[1] || 0);
        const seconds = Number(m[2] || 0);
        const fracRaw = String(m[3] || "0");
        const fraction =
          fracRaw.length === 1
            ? Number(fracRaw) / 10
            : fracRaw.length === 2
              ? Number(fracRaw) / 100
              : Number(fracRaw) / 1000;
        lines.push({
          time: minutes * 60 + seconds + fraction,
          text: lyricText,
        });
      }
    });
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function plainLyricsToLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function normalizeLyricsPayload(record, source, expectedDuration = 0) {
  if (!record) return null;
  const synced = String(record.syncedLyrics || "");
  const plain = String(record.plainLyrics || record.lyrics || "");
  const recordDuration = Math.max(0, Number(record.duration || 0));
  const durationDiff =
    expectedDuration > 0 && recordDuration > 0
      ? Math.abs(recordDuration - expectedDuration)
      : null;
  const timedLines = parseLrc(synced);
  if (timedLines.length) {
    const timingWarning = durationDiff != null && durationDiff > 3;
    return {
      found: true,
      timed: true,
      source,
      lines: timedLines,
      matchedDuration: recordDuration || null,
      durationDiff,
      syncStatus: timingWarning ? "timing-warning" : "synced",
      notice: timingWarning
        ? `Lyrics may be out of sync · recording differs by ${Math.round(durationDiff)} seconds`
        : "",
    };
  }
  const lines = plainLyricsToLines(plain);
  if (lines.length)
    return {
      found: true,
      timed: false,
      source,
      lines,
      matchedDuration: recordDuration || null,
      durationDiff,
      syncStatus: "unsynced",
      notice: "Not synchronized",
    };
  return null;
}

function uniqText(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function cleanLyricsTitle(value) {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  // Clean common presentation labels that lyrics databases may omit.
  text = text
    .replace(/\s*[\[(](?:official\s+)?(?:music\s+)?video[^\])]*[\])]/gi, "")
    .replace(/\s*[\[(](?:official\s+)?audio[^\])]*[\])]/gi, "")
    .replace(/\s*[\[(](?:lyric|lyrics)(?:\s+video)?[^\])]*[\])]/gi, "")
    .replace(/\s*[\[(](?:hd|hq|visuali[sz]er)[^\])]*[\])]/gi, "")
    .replace(/\s*[\[(](?:feat(?:uring)?\.?|ft\.?)\s+[^\])]+[\])]/gi, "")
    .replace(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+.+$/gi, "")
    .replace(/\s*[-–—]\s*(?:official\s+)?(?:music\s+)?video\s*$/gi, "")
    .replace(/\s*[-–—]\s*(?:official\s+)?audio\s*$/gi, "")
    .replace(/\s*[-–—]\s*(?:lyrics?|lyric\s+video)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function cleanLyricsArtist(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+.+$/gi, "")
    .replace(/^official\s+/i, "")
    .trim();
}

function splitArtistTitle(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/^(.{1,100}?)\s+[-–—]\s+(.{1,220})$/);
  if (!match) return null;
  return {
    artist: cleanLyricsArtist(match[1]),
    title: cleanLyricsTitle(match[2]),
  };
}

function lyricKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(lyricKey(value).split(" ").filter(Boolean));
}

function tokenSimilarity(a, b) {
  const A = tokenSet(a),
    B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const token of A) if (B.has(token)) common++;
  return common / Math.max(A.size, B.size);
}

function scoreLyricsRecord(record, meta) {
  if (!record) return -1e9;
  const rt = record.trackName || record.name || "";
  const ra = record.artistName || "";
  const ral = record.albumName || "";
  let score = 0;
  const titleSim = Math.max(
    ...meta.titles.map((x) => tokenSimilarity(x, rt)),
    0,
  );
  const artistSim = Math.max(
    ...meta.artists.map((x) => tokenSimilarity(x, ra)),
    0,
  );
  score += titleSim * 70 + artistSim * 45;
  if (meta.album && ral) score += tokenSimilarity(meta.album, ral) * 10;
  if (meta.duration > 0 && Number(record.duration) > 0) {
    const diff = Math.abs(Number(record.duration) - meta.duration);
    if (diff <= 2) score += 25;
    else if (diff <= 5) score += 18;
    else if (diff <= 12) score += 8;
    else if (diff > 40) score -= 12;
  }
  if (record.syncedLyrics) score += 6;
  if (record.instrumental) score -= 40;
  return score;
}

function lyricsDurationDiff(record, expectedDuration) {
  const actual = Math.max(0, Number((record && record.duration) || 0));
  if (!(expectedDuration > 0) || !(actual > 0)) return Infinity;
  return Math.abs(actual - expectedDuration);
}

function hasSyncedLyrics(record) {
  return parseLrc(String((record && record.syncedLyrics) || "")).length > 0;
}

function compareLyricsCandidates(a, b, meta) {
  const ad = lyricsDurationDiff(a, meta.duration);
  const bd = lyricsDurationDiff(b, meta.duration);
  const aClose = ad <= 3;
  const bClose = bd <= 3;
  if (aClose !== bClose) return aClose ? -1 : 1;

  // Inside the preferred ±3 second duration bucket, synced wins over plain.
  // Outside it, synced still wins so we can provide usable timed lyrics with
  // an explicit mismatch warning rather than silently presenting plain text.
  const aSynced = hasSyncedLyrics(a);
  const bSynced = hasSyncedLyrics(b);
  if (aSynced !== bSynced) return aSynced ? -1 : 1;

  const as = scoreLyricsRecord(a, meta);
  const bs = scoreLyricsRecord(b, meta);
  if (as !== bs) return bs - as;
  if (ad !== bd) return ad - bd;
  return 0;
}

function buildLyricsVariants({ title, artist }) {
  const splitTitle = splitArtistTitle(title);
  const splitArtist = splitArtistTitle(artist);
  const titleBase = cleanLyricsTitle(title);
  const artistBase = cleanLyricsArtist(artist);
  const titles = uniqText([
    title,
    titleBase,
    splitTitle && splitTitle.title,
    splitArtist && splitArtist.title,
  ]);
  const artists = uniqText([
    artist,
    artistBase,
    splitTitle && splitTitle.artist,
    splitArtist && splitArtist.artist,
    artistBase.split(/\s*(?:,|&|\bx\b)\s*/i)[0],
  ]);
  return { titles, artists };
}

async function lrclibGetExact(
  title,
  artist,
  album,
  duration,
  includeSignature,
) {
  const exact = new URL("https://lrclib.net/api/get");
  exact.searchParams.set("track_name", title);
  exact.searchParams.set("artist_name", artist);
  if (includeSignature && album) exact.searchParams.set("album_name", album);
  if (includeSignature && duration > 0)
    exact.searchParams.set("duration", String(Math.round(duration)));
  try {
    return await fetchJson(exact.toString(), 15000);
  } catch (err) {
    if (err && err.status !== 404)
      console.warn("LRCLIB exact lookup:", err.message || err);
    return null;
  }
}

async function lrclibSearchRecords(url) {
  try {
    const records = await fetchJson(url.toString(), 15000);
    return Array.isArray(records) ? records : [];
  } catch (err) {
    console.warn("LRCLIB search:", err && err.message ? err.message : err);
    return [];
  }
}

async function lookupLrclib({ title, artist, album, duration }) {
  const variants = buildLyricsVariants({ title, artist });
  const meta = {
    titles: variants.titles,
    artists: variants.artists,
    album,
    duration,
  };
  const titleCandidates = variants.titles.slice(0, 3);
  const artistCandidates = variants.artists.slice(0, 3);
  const collected = [];
  const seenIds = new Set();

  function addRecords(records) {
    for (const record of Array.isArray(records) ? records : [records]) {
      if (!record) continue;
      const id = String(
        record.id ||
          `${record.trackName}|${record.artistName}|${record.duration}|${record.syncedLyrics ? "s" : "p"}`,
      );
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      collected.push(record);
    }
  }

  // Exact endpoints are useful candidates, but do not return immediately: a
  // plain exact hit can coexist with a duration-matched synced search result.
  for (const t of titleCandidates) {
    for (const a of artistCandidates) {
      addRecords(await lrclibGetExact(t, a, album, duration, true));
      addRecords(await lrclibGetExact(t, a, "", 0, false));
      if (collected.length >= 16) break;
    }
    if (collected.length >= 16) break;
  }

  // Structured search gives us multiple recordings so duration can be treated
  // as the primary discriminator instead of relying on LRCLIB's first match.
  for (const t of titleCandidates) {
    for (const a of artistCandidates) {
      const search = new URL("https://lrclib.net/api/search");
      search.searchParams.set("track_name", t);
      search.searchParams.set("artist_name", a);
      addRecords(await lrclibSearchRecords(search));
      if (collected.length >= 32) break;
    }
    if (collected.length >= 32) break;
  }

  if (collected.length < 12) {
    for (const t of titleCandidates) {
      for (const a of artistCandidates) {
        const search = new URL("https://lrclib.net/api/search");
        search.searchParams.set("q", `${t} ${a}`);
        addRecords(await lrclibSearchRecords(search));
        if (collected.length >= 32) break;
      }
      if (collected.length >= 32) break;
    }
  }

  const eligible = collected.filter(
    (record) => scoreLyricsRecord(record, meta) >= 55,
  );
  eligible.sort((a, b) => compareLyricsCandidates(a, b, meta));

  for (const record of eligible.slice(0, 12)) {
    const normalized = normalizeLyricsPayload(
      record,
      "lrclib-search",
      duration,
    );
    if (normalized) return normalized;
  }
  return null;
}

async function lookupLyricsOvh({ title, artist }) {
  const variants = buildLyricsVariants({ title, artist });
  for (const t of variants.titles.slice(0, 4)) {
    for (const a of variants.artists.slice(0, 4)) {
      try {
        const data = await fetchJson(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
          10000,
        );
        const normalized = normalizeLyricsPayload(data, "lyrics.ovh");
        if (normalized) return normalized;
      } catch (_) {}
    }
  }
  return null;
}
