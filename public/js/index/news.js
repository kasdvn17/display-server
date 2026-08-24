  /* ---------------- AMBIENT NEWS ---------------- */
  var AMBIENT = {
    newsChance: 0.32, // probability that an ambient cycle shows news instead of only a photo
    newsDurationMs: 14000,
    newsRefreshMs: 10 * 60 * 1000,
  };
  var newsItems = [];
  var newsIndex = -1;
  var newsHideTimer = null;
  var newsProgressTimer = null;
  var newsRefreshTimer = 0;

  function relativeNewsTime(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    var sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return "Vừa xong";
    if (sec < 3600) return Math.floor(sec / 60) + " phút trước";
    if (sec < 86400) return Math.floor(sec / 3600) + " giờ trước";
    return Math.floor(sec / 86400) + " ngày trước";
  }
  function loadNews() {
    return fetchFrameJson("/news", { cache: "no-store" }, 20000)
      .then(function (data) {
        newsItems = data && data.items ? data.items : [];
        renderNewsFeed();
        return newsItems;
      })
      .catch(function (err) {
        if (window.console && console.info)
          console.info("News unavailable:", err.message || err);
        renderNewsFeed(err);
        return [];
      });
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(
      /[&<>"']/g,
      function (ch) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[ch];
      },
    );
  }
  function renderNewsFeed(error) {
    var feed = document.getElementById("news-feed");
    var subtitle = document.getElementById("news-page-subtitle");
    if (!feed) return;
    if (error) {
      feed.innerHTML =
        '<div class="news-feed-empty"><strong>Tin tức không khả dụng</strong>Nhấn Làm mới để thử lại.</div>';
      if (subtitle) subtitle.textContent = "Không thể cập nhật nguồn tin";
      return;
    }
    if (!newsItems.length) {
      feed.innerHTML =
        '<div class="news-feed-empty"><strong>Chưa có tiêu đề</strong>Nguồn RSS đã cấu hình không trả về bài viết.</div>';
      if (subtitle) subtitle.textContent = "Không có bài viết";
      return;
    }
    var html = [];
    for (var i = 0; i < newsItems.length; i++) {
      var item = newsItems[i] || {};
      var image = item.image || "";
      var cls =
        "news-feed-card" +
        (image ? "" : " no-image") +
        (i === 0 && image ? " hero" : "");
      var imageHtml = image
        ? '<img src="' +
          escapeHtml(image) +
          '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentNode.parentNode.classList.add(\'no-image\')">'
        : "";
      var summary = item.summary
        ? '<p class="news-feed-summary">' + escapeHtml(item.summary) + "</p>"
        : "";
      html.push(
        '<article class="' +
          cls +
          '" tabindex="0" role="link" data-news-index="' +
          i +
          '"><div class="news-feed-image">' +
          imageHtml +
          '</div><div class="news-feed-body"><div class="news-feed-meta"><span class="news-feed-source">' +
          escapeHtml(item.source || "Tin tức") +
          '</span><span class="news-feed-dot"></span><span>' +
          escapeHtml(relativeNewsTime(item.publishedAt) || "Mới nhất") +
          '</span></div><h2 class="news-feed-title">' +
          escapeHtml(item.title || "Bài viết chưa có tiêu đề") +
          "</h2>" +
          summary +
          '<div class="news-feed-open">Đọc bài <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 16 16 8M10 8h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div></article>',
      );
    }
    feed.innerHTML = html.join("");
    if (subtitle)
      subtitle.textContent =
        newsItems.length + " bài mới nhất · vừa cập nhật";
  }
  function openNewsItem(index) {
    var item = newsItems[index];
    if (item && item.link) window.open(item.link, "_blank");
  }
  function hideNews() {
    var panel = document.getElementById("news-ambient");
    var frame = document.querySelector(".home-frame");
    if (panel) panel.classList.remove("show");
    if (frame) frame.classList.remove("news-mode");
    clearTimeout(newsHideTimer);
    clearInterval(newsProgressTimer);
    var progress = document.getElementById("news-progress");
    if (progress) progress.style.width = "0%";
  }
  function showNews(durationMs) {
    if (!newsItems.length || currentView !== "home") return false;
    durationMs = Math.max(1500, Number(durationMs || AMBIENT.newsDurationMs));
    newsIndex = (newsIndex + 1) % newsItems.length;
    var item = newsItems[newsIndex];
    var panel = document.getElementById("news-ambient");
    var frame = document.querySelector(".home-frame");
    var headline = document.getElementById("news-headline");
    var source = document.getElementById("news-source");
    var time = document.getElementById("news-time");
    var progress = document.getElementById("news-progress");
    if (!panel || !headline) return false;
    headline.textContent = item.title || "Tin mới nhất";
    if (source) source.textContent = item.source || "Tin tức";
    if (time) time.textContent = relativeNewsTime(item.publishedAt);
    panel.setAttribute("data-link", item.link || "");
    panel.classList.add("show");
    if (frame) frame.classList.add("news-mode");
    if (progress) {
      clearInterval(newsProgressTimer);
      newsProgressTimer = null;
      progress.style.transition = "none";
      progress.style.width = "0%";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          progress.style.transition = "width " + durationMs + "ms linear";
          progress.style.width = "100%";
        });
      });
    }
    clearTimeout(newsHideTimer);
    newsHideTimer = setTimeout(hideNews, durationMs);
    return true;
  }
  function ambientTick() {
    // The photo cadence is fixed. News is only an overlay, so the bottom countdown
    // always represents the real time until the next background image.
    hideNews();
    nextCuratedPhoto();
    if (
      currentView === "home" &&
      newsItems.length &&
      Math.random() < AMBIENT.newsChance
    ) {
      showNews(
        Math.min(
          AMBIENT.newsDurationMs,
          Math.max(2500, IMMICH.intervalMs - 1500),
        ),
      );
    }
    scheduleAmbient(IMMICH.intervalMs, "Ảnh tiếp theo");
  }
  var newsPanel = document.getElementById("news-ambient");
  if (newsPanel) {
    var newsCard = newsPanel.querySelector(".news-card");
    if (newsCard) {
      newsCard.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var link = newsPanel.getAttribute("data-link");
        if (link) window.open(link, "_blank");
      });
    }
    document.addEventListener("click", function (ev) {
      if (!newsPanel.classList.contains("show")) return;
      if (newsCard && newsCard.contains(ev.target)) return;
      hideNews();
    });
  }
  var newsFeed = document.getElementById("news-feed");
  if (newsFeed) {
    newsFeed.addEventListener("click", function (ev) {
      var card = ev.target;
      while (card && card !== newsFeed && !card.getAttribute("data-news-index"))
        card = card.parentNode;
      if (card && card !== newsFeed)
        openNewsItem(parseInt(card.getAttribute("data-news-index"), 10));
    });
    newsFeed.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var card = ev.target;
      if (card && card.getAttribute("data-news-index")) {
        ev.preventDefault();
        openNewsItem(parseInt(card.getAttribute("data-news-index"), 10));
      }
    });
  }
  var newsRefreshBtn = document.getElementById("news-refresh-btn");
  if (newsRefreshBtn) {
    newsRefreshBtn.addEventListener("click", function () {
      if (newsRefreshBtn.classList.contains("loading")) return;
      newsRefreshBtn.classList.add("loading");
      loadNews().then(function () {
        setTimeout(function () {
          newsRefreshBtn.classList.remove("loading");
        }, 250);
      });
    });
  }
  function scheduleNewsRefresh() {
    clearTimeout(newsRefreshTimer);
    newsRefreshTimer = setTimeout(function () {
      if (document.hidden) {
        scheduleNewsRefresh();
        return;
      }
      loadNews().then(scheduleNewsRefresh);
    }, AMBIENT.newsRefreshMs);
  }
  frameBootstrapPromise
    .then(function () {
      return loadNews();
    })
    .then(scheduleNewsRefresh);

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }
