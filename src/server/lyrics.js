// Lyrics are now matched purely from track metadata: LRCLIB first (synced when available),
// then lyrics.ovh as a plain-lyrics fallback. This removes ytmusicapi/Python completely.
app.get("/lyrics", async (req, res) => {
  const title = String(req.query.title || "").trim();
  const artist = String(req.query.artist || "").trim();
  const album = String(req.query.album || "").trim();
  const duration = Math.max(0, Math.min(3600, Number(req.query.duration || 0)));
  if (
    !title ||
    !artist ||
    title.length > 200 ||
    artist.length > 200 ||
    album.length > 250
  ) {
    return res.status(400).json({ error: "Cần tên bài hát và nghệ sĩ" });
  }

  const key = [title, artist, album, Math.round(duration)]
    .join("\u0001")
    .toLowerCase();
  const cached = lyricsCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return res.json({ ...cached.payload, cached: true });
  }

  try {
    let payload = await lookupLrclib({ title, artist, album, duration });
    if (!payload) payload = await lookupLyricsOvh({ title, artist });
    if (!payload)
      payload = { found: false, timed: false, source: null, lines: [] };
    payload = { ...payload, title, artist, album };

    boundedCacheSet(
      lyricsCache,
      key,
      {
        expires:
          Date.now() + (payload.found ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000),
        payload,
      },
      250,
    );
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error(
      "Lyrics lookup failed:",
      err && err.message ? err.message : err,
    );
    return res.status(502).json({ error: "Không thể tìm lời bài hát" });
  }
});

