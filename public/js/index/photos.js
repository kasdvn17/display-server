  /* ---------------- CURATED IMMICH PHOTO FRAME ----------------
     The backend builds story pools: albums, discovered location/time events,
     1-3 year memories, and rediscovery. The iPad only chooses and renders stories.
  --------------------------------------------------------------- */
  var IMMICH = {
    enabled: true,
    intervalMs: 12000,
    refreshEveryMs: 30 * 60 * 1000,
  };

  var curatedPool = null;
  var currentStory = null;
  var currentStoryIndex = -1;
  var recentAssetIds = [];
  // Keep the current photo plus at most 10 previously viewed photos.
  var PHOTO_HISTORY_MAX_OLD = 10;
  var photoHistory = [];
  var photoHistoryIndex = -1;
  var slideRenderToken = 0;
  var slideFront = "a";
  var slideTimer = null;
  var slideRefreshTimer = null;
  var indicatorTimer = null;
  var nextDeadline = 0;
  var nextDelayMs = IMMICH.intervalMs;
  var ambientLabel = "Ảnh tiếp theo";
  var categoryCursor = { albums: 0, locations: 0, memories: 0, discovery: 0 };

  function assetThumbUrl(id) {
    return (
      "/immich/assets/" + encodeURIComponent(id) + "/thumbnail?size=preview"
    );
  }
  function shuffleArray(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  var photoActionSheet = document.getElementById("photo-action-sheet");
  var photoFavoriteBtn = document.getElementById("photo-favorite-btn");
  var photoFavoriteLabel = document.getElementById("photo-favorite-label");
  var photoHideBtn = document.getElementById("photo-hide-btn");
  var photoOpenBtn = document.getElementById("photo-open-btn");
  var photoActionTitle = document.getElementById("photo-action-title");
  var currentPhotoFavorite = false;
  var photoLongPressTimer = 0,
    photoLongPressTriggered = false;
  function closePhotoActions() {
    if (photoActionSheet) {
      photoActionSheet.classList.remove("show");
      photoActionSheet.setAttribute("aria-hidden", "true");
    }
  }
  function openPhotoActions() {
    if (!currentDisplayedAssetId || !photoActionSheet) return;
    photoLongPressTriggered = true;
    if (photoActionTitle)
      photoActionTitle.textContent =
        (document.getElementById("photo-info-place") &&
          document.getElementById("photo-info-place").textContent) ||
        "Thao tác với ảnh";
    if (photoFavoriteLabel)
      photoFavoriteLabel.textContent = currentPhotoFavorite
        ? "Xóa khỏi mục Yêu thích"
        : "Yêu thích trong Immich";
    photoActionSheet.classList.add("show");
    photoActionSheet.setAttribute("aria-hidden", "false");
  }
  function photoAction(action, value) {
    if (!currentDisplayedAssetId) return Promise.reject(new Error("Không có ảnh"));
    var id = currentDisplayedAssetId;
    return fetchFrameJson(
      "/ambient/photo-action",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: id, action: action, value: value }),
      },
      18000,
    );
  }
  function bindPhotoActionGestures() {
    var card = document.getElementById("photo-info-card");
    if (!card) return;
    function begin() {
      clearTimeout(photoLongPressTimer);
      photoLongPressTriggered = false;
      photoLongPressTimer = setTimeout(openPhotoActions, 560);
    }
    function cancel() {
      clearTimeout(photoLongPressTimer);
      photoLongPressTimer = 0;
    }
    card.addEventListener("touchstart", begin, { passive: true });
    card.addEventListener("touchend", cancel, { passive: true });
    card.addEventListener("touchcancel", cancel, { passive: true });
    card.addEventListener("mousedown", begin);
    card.addEventListener("mouseup", cancel);
    card.addEventListener("mouseleave", cancel);
    card.addEventListener("click", function (e) {
      if (photoLongPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        photoLongPressTriggered = false;
      }
    });
  }
  if (photoActionSheet)
    photoActionSheet.addEventListener("click", function (e) {
      if (e.target === photoActionSheet) closePhotoActions();
    });
  if (photoFavoriteBtn)
    photoFavoriteBtn.addEventListener("click", function () {
      var next = !currentPhotoFavorite;
      photoAction("favorite", next)
        .then(function () {
          currentPhotoFavorite = next;
          if (photoFavoriteLabel)
            photoFavoriteLabel.textContent = next
              ? "Xóa khỏi mục Yêu thích"
              : "Yêu thích trong Immich";
          showAmbientNotice(
            {
              type: "update",
              title: next ? "Đã thêm vào mục Yêu thích" : "Đã xóa khỏi mục Yêu thích",
              body: "Đã cập nhật trong Immich",
            },
            3500,
          );
          closePhotoActions();
        })
        .catch(function () {
          closePhotoActions();
        });
    });
  if (photoHideBtn)
    photoHideBtn.addEventListener("click", function () {
      var id = currentDisplayedAssetId;
      photoAction("hide", true)
        .then(function () {
          photoHistory = photoHistory.filter(function (x) {
            return String(x.id) !== String(id);
          });
          photoHistoryIndex = photoHistory.length - 1;
          if (curatedPool && curatedPool.stories) {
            Object.keys(curatedPool.stories).forEach(function (k) {
              (curatedPool.stories[k] || []).forEach(function (story) {
                if (story && Array.isArray(story.assets))
                  story.assets = story.assets.filter(function (x) {
                    return String(x.id) !== String(id);
                  });
              });
              curatedPool.stories[k] = (curatedPool.stories[k] || []).filter(
                function (story) {
                  return story && story.assets && story.assets.length;
                },
              );
            });
          }
          closePhotoActions();
          showAmbientNotice(
            {
              type: "update",
              title: "Đã ẩn khỏi khung ảnh",
              body: "Ảnh này sẽ không còn xuất hiện trong trình chiếu",
            },
            4200,
          );
          manualPhotoNext();
        })
        .catch(function () {
          closePhotoActions();
        });
    });
  if (photoOpenBtn)
    photoOpenBtn.addEventListener("click", function () {
      if (currentDisplayedAssetId && IMMICH_PUBLIC_URL)
        window.open(
          IMMICH_PUBLIC_URL +
            "/photos/" +
            encodeURIComponent(currentDisplayedAssetId),
          "_blank",
          "noopener",
        );
      closePhotoActions();
    });
  bindPhotoActionGestures();

  function formatPhotoDate(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: TIMEZONE,
      }).format(d);
    } catch (e) {
      return d.toDateString();
    }
  }
  function updatePhotoInfo(item) {
    var place = document.getElementById("photo-info-place");
    var details = document.getElementById("photo-info-details");
    var source = document.getElementById("photo-source");
    var photoCard = document.getElementById("photo-info-card");
    if (!item) return;
    if (photoCard && item.id) {
      if (IMMICH_PUBLIC_URL) {
        photoCard.href =
          IMMICH_PUBLIC_URL + "/photos/" + encodeURIComponent(item.id);
        photoCard.setAttribute("aria-label", "Mở ảnh này trong Immich");
      } else {
        photoCard.removeAttribute("href");
        photoCard.setAttribute("aria-label", "Thông tin ảnh hiện tại");
      }
    }
    var location = item.location || "Thư viện ảnh của bạn";
    var date = formatPhotoDate(item.date);
    var album = item.album || "";
    var detailParts = [];
    if (date) detailParts.push(date);
    if (album) detailParts.push(album);
    if (place) place.textContent = location;
    if (details)
      details.textContent = detailParts[0] || item.storySubtitle || "Immich";
    if (source) source.textContent = item.storyTitle || "Khung ảnh";

    // Album membership for memory/event photos is resolved accurately on demand.
    if (item.id) {
      fetchFrameJson(
        "/ambient/asset-info/" + encodeURIComponent(item.id),
        { cache: "force-cache" },
        18000,
      )
        .then(function (info) {
          if (!info || item.id !== currentDisplayedAssetId) return;
          var p = info.location || location;
          var albums = info.albums || [];
          currentPhotoFavorite = !!info.favorite;
          if (photoFavoriteLabel)
            photoFavoriteLabel.textContent = currentPhotoFavorite
              ? "Xóa khỏi mục Yêu thích"
              : "Yêu thích trong Immich";
          var ds = formatPhotoDate(info.date || item.date);
          var pieces = [];
          if (ds) pieces.push(ds);
          if (albums.length) pieces.push(albums[0].name);
          if (place) place.textContent = p || "Thư viện ảnh của bạn";
          if (details)
            details.textContent = pieces[0] || item.storySubtitle || "Immich";
        })
        .catch(function () {});
    }
  }
  var currentDisplayedAssetId = "";
  function showSlide(item, immediate) {
    var incoming = document.getElementById(
      slideFront === "a" ? "ambient-photo-b" : "ambient-photo-a",
    );
    var outgoing = document.getElementById(
      slideFront === "a" ? "ambient-photo-a" : "ambient-photo-b",
    );
    if (!incoming || !outgoing || !item) return;
    var url = item.url || (item.id ? assetThumbUrl(item.id) : "");
    if (!url) return;
    var renderToken = ++slideRenderToken;
    var img = new Image();
    img.onload = function () {
      // Ignore a stale image load if the user swiped again before it completed.
      if (renderToken !== slideRenderToken) return;
      incoming.style.backgroundImage =
        'url("' + url.replace(/"/g, "%22") + '")';
      if (immediate) {
        outgoing.classList.remove("active");
        incoming.classList.add("active");
      } else {
        incoming.classList.add("active");
        outgoing.classList.remove("active");
      }
      slideFront = slideFront === "a" ? "b" : "a";
      currentDisplayedAssetId = item.id || "";
      currentPhotoFavorite = !!item.favorite;
      updatePhotoInfo(item);
    };
    img.onerror = function () {
      if (renderToken === slideRenderToken) scheduleAmbient(800, "Đang thử lại");
    };
    img.src = url;
  }
  function pushPhotoHistory(item) {
    if (!item) return;
    // Showing a genuinely new photo after going back creates a new forward path.
    if (photoHistoryIndex < photoHistory.length - 1)
      photoHistory = photoHistory.slice(0, photoHistoryIndex + 1);
    photoHistory.push(item);
    var maxTotal = PHOTO_HISTORY_MAX_OLD + 1;
    if (photoHistory.length > maxTotal)
      photoHistory.splice(0, photoHistory.length - maxTotal);
    photoHistoryIndex = photoHistory.length - 1;
  }
  function showPhotoHistoryAt(index) {
    if (index < 0 || index >= photoHistory.length) return false;
    photoHistoryIndex = index;
    showSlide(photoHistory[photoHistoryIndex], false);
    return true;
  }
  function previousCuratedPhoto() {
    if (photoHistoryIndex <= 0) return false;
    return showPhotoHistoryAt(photoHistoryIndex - 1);
  }
  function poolStories(category) {
    if (!curatedPool || !curatedPool.stories) return [];
    return curatedPool.stories[category] || [];
  }
  function assetHasLocation(asset) {
    if (!asset) return false;
    if (String(asset.location || "").trim()) return true;
    var rawLat = asset.latitude,
      rawLng = asset.longitude;
    if (
      rawLat === null ||
      rawLat === undefined ||
      rawLat === "" ||
      rawLng === null ||
      rawLng === undefined ||
      rawLng === ""
    )
      return false;
    var lat = Number(rawLat),
      lng = Number(rawLng);
    return (
      isFinite(lat) &&
      isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }
  function storyHasLocationBucket(story, wantsLocation) {
    if (!story || !story.assets || !story.assets.length) return false;
    for (var i = 0; i < story.assets.length; i++) {
      if (assetHasLocation(story.assets[i]) === wantsLocation) return true;
    }
    return false;
  }
  function storiesForLocationBucket(category, wantsLocation) {
    return poolStories(category).filter(function (story) {
      return storyHasLocationBucket(story, wantsLocation);
    });
  }
  function weightedCategoryForLocation(wantsLocation) {
    if (!curatedPool) return "";
    var weights = curatedPool.weights || {
      albums: 45,
      locations: 30,
      memories: 20,
      discovery: 5,
    };
    var options = [];
    var total = 0;
    ["albums", "locations", "memories", "discovery"].forEach(function (k) {
      if (storiesForLocationBucket(k, wantsLocation).length) {
        var w = Math.max(0, Number(weights[k] || 0));
        if (w > 0) {
          options.push({ key: k, w: w });
          total += w;
        }
      }
    });
    if (!options.length) return "";
    var r = Math.random() * total;
    for (var i = 0; i < options.length; i++) {
      r -= options[i].w;
      if (r <= 0) return options[i].key;
    }
    return options[options.length - 1].key;
  }
  function chooseMemoryStory(stories) {
    if (!stories.length) return null;
    var weighted = [];
    for (var i = 0; i < stories.length; i++) {
      var y = Number(stories[i].yearsAgo || 0);
      var w = y === 1 ? 50 : y === 2 ? 30 : y === 3 ? 20 : 10;
      weighted.push({ story: stories[i], w: w });
    }
    var total = weighted.reduce(function (a, x) {
      return a + x.w;
    }, 0);
    var r = Math.random() * total;
    for (var j = 0; j < weighted.length; j++) {
      r -= weighted[j].w;
      if (r <= 0) return weighted[j].story;
    }
    return weighted[weighted.length - 1].story;
  }
  function chooseNextStoryForLocation(wantsLocation) {
    var category = weightedCategoryForLocation(wantsLocation);
    if (!category) return null;
    var stories = storiesForLocationBucket(category, wantsLocation);
    if (!stories.length) return null;
    var story;
    if (category === "memories") story = chooseMemoryStory(stories);
    else {
      categoryCursor[category] =
        (categoryCursor[category] || 0) % stories.length;
      story = stories[categoryCursor[category]++];
    }
    return story;
  }
  function wasRecentlyShown(id) {
    return !!id && recentAssetIds.indexOf(id) !== -1;
  }
  function rememberAsset(id) {
    if (!id) return;
    recentAssetIds.push(id);
    if (recentAssetIds.length > 120) recentAssetIds.shift();
  }

  // Pick from the curator without trusting the compact search payload to contain EXIF.
  // Immich may omit exifInfo from /search/metadata even though the asset itself has GPS.
  function chooseAnyCuratedCandidate() {
    if (!curatedPool || !curatedPool.stories) return null;
    var weights = curatedPool.weights || {
      albums: 45,
      locations: 30,
      memories: 20,
      discovery: 5,
    };
    var options = [],
      total = 0;
    ["albums", "locations", "memories", "discovery"].forEach(function (k) {
      var stories = poolStories(k);
      if (!stories.length) return;
      var w = Math.max(0, Number(weights[k] || 0));
      if (w > 0) {
        options.push({ key: k, w: w, stories: stories });
        total += w;
      }
    });
    if (!options.length || total <= 0) return null;
    var r = Math.random() * total,
      choice = options[options.length - 1];
    for (var i = 0; i < options.length; i++) {
      r -= options[i].w;
      if (r <= 0) {
        choice = options[i];
        break;
      }
    }
    var story;
    if (choice.key === "memories") story = chooseMemoryStory(choice.stories);
    else {
      categoryCursor[choice.key] =
        (categoryCursor[choice.key] || 0) % choice.stories.length;
      story = choice.stories[categoryCursor[choice.key]++];
    }
    if (!story || !story.assets || !story.assets.length) return null;
    var candidates = shuffleArray(story.assets.slice());
    var candidate = null;
    for (var j = 0; j < candidates.length; j++) {
      if (!wasRecentlyShown(candidates[j].id)) {
        candidate = candidates[j];
        break;
      }
    }
    if (!candidate) candidate = candidates[0];
    if (!candidate) return null;
    var item = {};
    for (var key in candidate) item[key] = candidate[key];
    item.storyTitle = story.title || "Khung ảnh";
    item.storySubtitle = story.subtitle || "";
    if (!item.album && story.album) item.album = story.album;
    return item;
  }

  function verifyCandidateLocation(item) {
    if (!item || !item.id) return Promise.resolve(null);
    if (assetHasLocation(item)) return Promise.resolve(item);
    return fetch("/ambient/asset-info/" + encodeURIComponent(item.id), {
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("asset info " + r.status);
        return r.json();
      })
      .then(function (info) {
        if (!info || !assetHasLocation(info)) return null;
        item.city = info.city || item.city || "";
        item.state = info.state || item.state || "";
        item.country = info.country || item.country || "";
        item.location = info.location || item.location || "";
        if (info.latitude !== null && info.latitude !== undefined)
          item.latitude = info.latitude;
        if (info.longitude !== null && info.longitude !== undefined)
          item.longitude = info.longitude;
        if (info.date) item.date = info.date;
        if (info.albums && info.albums.length && !item.album)
          item.album = info.albums[0].name || "";
        return item;
      })
      .catch(function () {
        return null;
      });
  }

  var locationPickBusy = false,
    photoRetryCount = 0;
  function schedulePhotoRetry(label) {
    photoRetryCount = Math.min(6, photoRetryCount + 1);
    var delay = Math.min(60000, 2200 * Math.pow(1.8, photoRetryCount - 1));
    scheduleAmbient(Math.round(delay), label || "Đang thử lại ảnh theo địa điểm");
  }
  function chooseVerifiedLocationPhoto(maxAttempts) {
    maxAttempts = Math.max(1, Number(maxAttempts || 24));
    function attempt(left) {
      if (left <= 0) return Promise.resolve(null);
      var item = chooseAnyCuratedCandidate();
      if (!item) return Promise.resolve(null);
      return verifyCandidateLocation(item).then(function (valid) {
        if (valid) return valid;
        rememberAsset(item.id); // avoid probing the same locationless asset repeatedly
        return attempt(left - 1);
      });
    }
    return attempt(maxAttempts);
  }

  function choosePhotoForLocation(wantsLocation) {
    var attempts = 0;
    while (attempts++ < 36) {
      var story = chooseNextStoryForLocation(wantsLocation);
      if (!story || !story.assets || !story.assets.length) continue;
      var candidates = shuffleArray(
        story.assets.filter(function (asset) {
          return assetHasLocation(asset) === wantsLocation;
        }),
      );
      if (!candidates.length) continue;
      var candidate = null;
      for (var i = 0; i < candidates.length; i++) {
        if (!wasRecentlyShown(candidates[i].id)) {
          candidate = candidates[i];
          break;
        }
      }
      if (!candidate && attempts >= 24) candidate = candidates[0];
      if (!candidate) continue;
      var item = {};
      for (var k in candidate) item[k] = candidate[k];
      item.storyTitle = story.title || "Khung ảnh";
      item.storySubtitle = story.subtitle || "";
      if (!item.album && story.album) item.album = story.album;
      return item;
    }
    return null;
  }
  function nextCuratedPhoto() {
    // If the user went back, move forward through already-viewed photos first.
    if (photoHistoryIndex >= 0 && photoHistoryIndex < photoHistory.length - 1) {
      return showPhotoHistoryAt(photoHistoryIndex + 1);
    }
    if (locationPickBusy) return false;
    locationPickBusy = true;

    // Selection, weighting and EXIF verification run on the server. The display
    // only preloads and paints the chosen image.
    var recent = recentAssetIds.slice(-80).join(",");
    fetchFrameJson(
      "/ambient/next-photo?recent=" + encodeURIComponent(recent),
      { cache: "no-store" },
      35000,
    )
      .then(function (data) {
        return data.item;
      })
      .then(function (item) {
        locationPickBusy = false;
        if (!item) {
          schedulePhotoRetry("Đang tìm ảnh theo địa điểm");
          return;
        }
        photoRetryCount = 0;
        rememberAsset(item.id);
        pushPhotoHistory(item);
        showSlide(item, currentDisplayedAssetId === "");
      })
      .catch(function () {
        locationPickBusy = false;
        schedulePhotoRetry("Đang thử lại ảnh theo địa điểm");
      });
    return true;
  }
  function manualPhotoNext() {
    hideNews();
    nextCuratedPhoto();
    scheduleAmbient(IMMICH.intervalMs, "Ảnh tiếp theo");
  }
  function manualPhotoPrevious() {
    hideNews();
    if (previousCuratedPhoto())
      scheduleAmbient(IMMICH.intervalMs, "Ảnh tiếp theo");
  }
  function loadCuratedPool(force) {
    return fetch("/ambient/curated" + (force ? "?refresh=1" : ""), {
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Curator " + r.status);
        return r.json();
      })
      .then(function (data) {
        curatedPool = data;
        currentStory = null;
        currentStoryIndex = -1;
        ["albums", "locations", "memories"].forEach(function (k) {
          if (data.stories && data.stories[k]) shuffleArray(data.stories[k]);
        });
        return data;
      });
  }
  function updateNextIndicator() {
    var bar = document.getElementById("next-photo-progress");
    var sec = document.getElementById("next-photo-seconds");
    var label = document.getElementById("next-photo-label");
    if (!bar) return;
    var remaining = Math.max(0, nextDeadline - Date.now());
    var pct =
      nextDelayMs > 0
        ? Math.max(0, Math.min(100, (remaining / nextDelayMs) * 100))
        : 0;
    var scale = pct / 100;
    bar.style.transition = "transform 320ms linear";
    bar.style.webkitTransition = "-webkit-transform 320ms linear";
    bar.style.transform = "scaleX(" + scale + ")";
    bar.style.webkitTransform = "scaleX(" + scale + ")";
    if (sec) sec.textContent = Math.ceil(remaining / 1000) + "s";
    if (label) label.textContent = ambientLabel;
  }
  function animateNextIndicator() {
    clearInterval(indicatorTimer);
    updateNextIndicator();
    indicatorTimer = setInterval(updateNextIndicator, 250);
  }
  function resumeHomeIndicator() {
    if (!nextDeadline) return;
    if (Date.now() >= nextDeadline) {
      clearTimeout(slideTimer);
      ambientTick();
      return;
    }
    animateNextIndicator();
  }
  function scheduleAmbient(delay, label) {
    clearTimeout(slideTimer);
    nextDelayMs = Math.max(500, delay);
    nextDeadline = Date.now() + nextDelayMs;
    ambientLabel = label || "Ảnh tiếp theo";
    animateNextIndicator();
    slideTimer = setTimeout(ambientTick, nextDelayMs);
  }
  function initPhotoFrame() {
    nextCuratedPhoto();
    scheduleAmbient(IMMICH.intervalMs, "Ảnh tiếp theo");
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && currentView === "home") resumeHomeIndicator();
  });
