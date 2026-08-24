(function () {
  "use strict";

  // Kiosk interaction guard: block pinch/double-tap zoom and text selection
  // everywhere except editable controls.
  function isEditableTarget(node) {
    while (node && node !== document) {
      if (node.nodeType === 1) {
        var tag = String(node.tagName || "").toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          node.isContentEditable
        )
          return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
    document.addEventListener(
      type,
      function (e) {
        if (e && e.preventDefault) e.preventDefault();
      },
      { passive: false },
    );
  });
  document.addEventListener(
    "touchmove",
    function (e) {
      if (e.touches && e.touches.length > 1 && e.preventDefault)
        e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "dblclick",
    function (e) {
      if (!isEditableTarget(e.target) && e.preventDefault) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener("selectstart", function (e) {
    if (!isEditableTarget(e.target) && e.preventDefault) e.preventDefault();
  });

  var topReloadButton = document.getElementById("top-reload");
  var topIdleButton = document.getElementById("top-idle");
  var idleScreen = document.getElementById("idle-screen");
  var idleTimeEl = document.getElementById("idle-time");
  var idleCamera = document.getElementById("idle-camera");
  var idleCameraText = document.getElementById("idle-camera-text");
  var idleNowPlaying = document.getElementById("idle-now-playing");
  var idleArt = document.getElementById("idle-art");
  var idleSong = document.getElementById("idle-song");
  var idleArtist = document.getElementById("idle-artist");
  var IDLE_AFTER_MS = 90 * 1000;
  var idleTimer = 0;
  var idleActive = false;
  var lastInteractionAt = Date.now();
  if (topReloadButton) {
    topReloadButton.addEventListener("click", function () {
      if (topReloadButton.classList.contains("reloading")) return;
      topReloadButton.classList.add("reloading");
      topReloadButton.setAttribute("aria-label", "Đang tải lại màn hình");
      /* Cache-bust the document URL so kiosk mode reliably picks up a new build. */
      try {
        var reloadUrl = new URL(window.location.href);
        reloadUrl.searchParams.set("_reload", String(Date.now()));
        window.location.replace(reloadUrl.toString());
      } catch (e) {
        window.location.reload();
      }
    });
  }

  function syncIdleCamera(state, text) {
    if (idleCamera) idleCamera.setAttribute("data-state", state || "setup");
    if (idleCameraText) {
      if (state === "live") idleCameraText.textContent = text || "Camera trực tiếp";
      else if (state === "connecting")
        idleCameraText.textContent = text || "Camera đang kết nối";
      else if (state === "ready") idleCameraText.textContent = "Camera sẵn sàng";
      else if (state === "error")
        idleCameraText.textContent = text || "Camera không khả dụng";
      else idleCameraText.textContent = "Camera chưa kết nối";
    }
  }
  function syncIdleMusic() {
    if (!idleNowPlaying) return;
    var playing =
      typeof spotifyState !== "undefined" &&
      spotifyState &&
      spotifyState.isPlaying &&
      typeof currentTrack !== "undefined" &&
      currentTrack;
    idleNowPlaying.classList.toggle("show", !!playing);
    if (!playing) return;
    if (idleSong) idleSong.textContent = currentTrack.title || "Spotify";
    if (idleArtist)
      idleArtist.textContent =
        (currentTrack.artist || "") +
        (currentTrack.album ? " · " + currentTrack.album : "");
    if (idleArt) {
      var art = currentTrack.thumbnail || "";
      if (art) {
        idleArt.src = art;
        idleArt.style.visibility = "visible";
      } else {
        idleArt.removeAttribute("src");
        idleArt.style.visibility = "hidden";
      }
    }
  }
  function enterIdle() {
    if (idleActive || !idleScreen) return;
    if (
      typeof activeAlarmCycle !== "undefined" &&
      activeAlarmCycle &&
      activeAlarmCycle.ringing
    )
      return;
    if (typeof currentView !== "undefined" && currentView === "call") return;
    idleActive = true;
    syncIdleMusic();
    idleScreen.classList.add("show");
    idleScreen.setAttribute("aria-hidden", "false");
  }
  function exitIdle(resetTimer) {
    if (idleActive && idleScreen) {
      idleActive = false;
      idleScreen.classList.remove("show");
      idleScreen.setAttribute("aria-hidden", "true");
    }
    if (resetTimer !== false) resetIdleTimer();
  }
  function resetIdleTimer() {
    lastInteractionAt = Date.now();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (Date.now() - lastInteractionAt >= IDLE_AFTER_MS) enterIdle();
    }, IDLE_AFTER_MS + 50);
  }
  function idleUserActivity(e) {
    if (idleActive) {
      if (e && e.type === "touchmove") return;
      exitIdle(true);
      return;
    }
    resetIdleTimer();
  }
  ["touchstart", "mousedown", "keydown", "pointerdown"].forEach(
    function (type) {
      document.addEventListener(type, idleUserActivity, { passive: true });
    },
  );
  if (topIdleButton)
    topIdleButton.addEventListener("click", function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      clearTimeout(idleTimer);
      enterIdle();
    });
  if (idleScreen)
    idleScreen.addEventListener("click", function () {
      exitIdle(true);
    });
  resetIdleTimer();

  var TIMEZONE = "Asia/Bangkok"; // replaced by the server bootstrap when configured
  var IMMICH_PUBLIC_URL = "";
  var hasGsap = typeof gsap !== "undefined";
  function fetchFrameJson(url, init, timeoutMs) {
    init = init || {};
    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null,
      timer = controller
        ? setTimeout(
          function () {
            controller.abort();
          },
          Math.max(500, Number(timeoutMs) || 15000),
        )
        : 0;
    if (controller) init.signal = controller.signal;
    return fetch(url, init)
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!r.ok)
              throw new Error(data.error || "Yêu cầu thất bại: " + r.status);
            return data;
          });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError")
          throw new Error("Yêu cầu đã quá thời gian chờ");
        throw err;
      })
      .then(
        function (value) {
          if (timer) clearTimeout(timer);
          return value;
        },
        function (err) {
          if (timer) clearTimeout(timer);
          throw err;
        },
      );
  }
  function applyServerBootstrap(data) {
    data = data || {};
    if (data.timezone) TIMEZONE = String(data.timezone);
    IMMICH_PUBLIC_URL = String(data.immichPublicUrl || "");
    var vars = data.themeVariables || {},
      style = document.documentElement.style;
    Object.keys(vars).forEach(function (key) {
      if (/^--theme-/.test(key)) style.setProperty(key, String(vars[key]));
    });
    var timing = data.timing || {};
    if (isFinite(Number(timing.ambientRefreshMs)))
      AMBIENT_CONTEXT_REFRESH_MS = Number(timing.ambientRefreshMs);
    if (typeof IMMICH === "object" && IMMICH) {
      if (isFinite(Number(timing.photoIntervalMs)))
        IMMICH.intervalMs = Number(timing.photoIntervalMs);
      if (isFinite(Number(timing.poolRefreshMs)))
        IMMICH.refreshEveryMs = Number(timing.poolRefreshMs);
    }
    if (
      typeof AMBIENT === "object" &&
      AMBIENT &&
      isFinite(Number(timing.newsRefreshMs))
    )
      AMBIENT.newsRefreshMs = Number(timing.newsRefreshMs);
    return data;
  }
  var frameBootstrapPromise = fetchFrameJson(
    "/frame/bootstrap",
    { cache: "no-store" },
    5000,
  )
    .then(applyServerBootstrap)
    .catch(function (err) {
      console.warn("Frame bootstrap unavailable; using defaults.", err);
      return {};
    });
})();
