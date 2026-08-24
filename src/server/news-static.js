// Same-origin news feed for the ambient Home screen. Cached to avoid hammering RSS providers.
app.get("/news", async (req, res) => {
  try {
    const now = Date.now();
    if (newsCache.items.length && newsCache.expires > now) {
      return res.json({ items: newsCache.items, cached: true });
    }

    const feed = await rssParser.parseURL(NEWS_RSS_URL);
    const items = (feed.items || [])
      .slice(0, NEWS_LIMIT)
      .map((item, index) => {
        let source = "";
        if (item.source && typeof item.source === "string")
          source = item.source;
        if (!source && item.creator) source = item.creator;

        // Google News titles commonly end in " - Publisher". Preserve title but split publisher for UI.
        let title = (item.title || "").trim();
        if (!source) {
          const m = title.match(/\s+-\s+([^\-]+)$/);
          if (m) {
            source = m[1].trim();
            title = title.slice(0, m.index).trim();
          }
        }

        let image = "";
        if (item.enclosure && item.enclosure.url) image = item.enclosure.url;
        if (
          !image &&
          item["media:content"] &&
          item["media:content"].$ &&
          item["media:content"].$.url
        )
          image = item["media:content"].$.url;
        if (!image)
          image = firstHtmlImage(item.content || item.contentSnippet || "");
        const summary = String(item.contentSnippet || item.summary || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240);

        return {
          id: item.guid || item.id || String(index),
          title,
          source: source || feed.title || "News",
          link: safePublicMediaUrl(item.link),
          publishedAt: item.isoDate || item.pubDate || "",
          image: safePublicMediaUrl(image),
          summary,
        };
      })
      .filter((item) => item.title);

    const enrichedItems = await enrichNewsItems(items, NEWS_IMAGE_ENRICH_LIMIT);
    newsCache = { expires: now + 5 * 60 * 1000, items: enrichedItems };
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ items: enrichedItems, cached: false });
  } catch (err) {
    console.error("News feed error:", err.message || err);
    res
      .status(502)
      .json({ error: "Unable to load news feed", items: newsCache.items || [] });
  }
});

app.get("/camera", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PROJECT_ROOT, "public", "camera.html"));
});

app.get("/css/index.css", (_req, res) => {
  res.type("text/css");
  res.setHeader("Cache-Control", "no-store");
  res.send(indexStyleBundle);
});

app.get("/js/index.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-store");
  res.send(indexScriptBundle);
});

app.get(["/", "/index.html"], (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PROJECT_ROOT, "public", "index.html"));
});

app.get("/remote", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PROJECT_ROOT, "public", "remote.html"));
});

app.get("/remote.html", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(PROJECT_ROOT, "public", "remote.html"));
});

function buildAlarmWav() {
  const sampleRate = 22050,
    durationSeconds = 2,
    samples = sampleRate * durationSeconds,
    dataSize = samples * 2,
    buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate,
      cycle = t % 1,
      envelope = Math.min(1, t * 8) * Math.min(1, (durationSeconds - t) * 5),
      pulse = cycle < 0.72 ? 1 : 0.18,
      tone =
        0.58 * Math.sin(2 * Math.PI * 880 * t) +
        0.3 * Math.sin(2 * Math.PI * 660 * t);
    buffer.writeInt16LE(
      Math.max(
        -32767,
        Math.min(32767, Math.round(tone * pulse * envelope * 18000)),
      ),
      44 + i * 2,
    );
  }
  return buffer;
}
const ALARM_WAV = buildAlarmWav();
app.get("/alarm.wav", (req, res) => {
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("Content-Length", String(ALARM_WAV.length));
  res.end(ALARM_WAV);
});
