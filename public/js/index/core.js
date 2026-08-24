(function () {
  "use strict";

  function tr(key, fallback, variables) {
    return window.FrameI18n && window.FrameI18n.t
      ? window.FrameI18n.t(key, fallback, variables)
      : String(fallback || key);
  }
  function frameLocale() {
    return window.FrameI18n && window.FrameI18n.language === "vi"
      ? "vi-VN"
      : "en-US";
  }

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
  var IDLE_AFTER_MS = 90000;
  var CLIENT_FETCH_TIMEOUT_MS = 15000;
  var idleTimer = 0;
  var idleActive = false;
  var lastInteractionAt = Date.now();
  if (topReloadButton) {
    topReloadButton.addEventListener("click", function () {
      if (topReloadButton.classList.contains("reloading")) return;
      topReloadButton.classList.add("reloading");
      topReloadButton.setAttribute(
        "aria-label",
        tr("RELOADING_SCREEN", "Đang tải lại màn hình"),
      );
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
      if (state === "live")
        idleCameraText.textContent = text || tr("CAMERA_LIVE", "Camera trực tiếp");
      else if (state === "connecting")
        idleCameraText.textContent =
          text || tr("CAMERA_CONNECTING", "Camera đang kết nối");
      else if (state === "ready")
        idleCameraText.textContent = tr("CAMERA_READY", "Camera sẵn sàng");
      else if (state === "error")
        idleCameraText.textContent =
          text || tr("CAMERA_UNAVAILABLE", "Camera không khả dụng");
      else
        idleCameraText.textContent = tr(
          "CAMERA_NOT_CONNECTED",
          "Camera chưa kết nối",
        );
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

  var TIMEZONE = "Asia/Ho_Chi_Minh"; // replaced by the server bootstrap when configured
  var IMMICH_PUBLIC_URL = "";
  var SPOTIFY_BROWSER_DEVICE_NAME = "Nest Frame · iPad";
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
            Math.max(500, Number(timeoutMs) || CLIENT_FETCH_TIMEOUT_MS),
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
              throw new Error(
                data.error || tr("REQUEST_FAILED_STATUS", "Yêu cầu thất bại: {STATUS}", { STATUS: r.status }),
              );
            return data;
          });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError")
          throw new Error(tr("REQUEST_TIMED_OUT", "Yêu cầu đã quá thời gian chờ"));
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
    SPOTIFY_BROWSER_DEVICE_NAME = String(
      data.spotifyDeviceName || SPOTIFY_BROWSER_DEVICE_NAME,
    );
    var vars = data.themeVariables || {},
      style = document.documentElement.style;
    Object.keys(vars).forEach(function (key) {
      if (/^--theme-/.test(key)) style.setProperty(key, String(vars[key]));
    });
    var timing = data.timing || {};
    if (isFinite(Number(timing.ambientRefreshMs)))
      AMBIENT_CONTEXT_REFRESH_MS = Number(timing.ambientRefreshMs);
    if (isFinite(Number(timing.idleTimeoutMs)))
      IDLE_AFTER_MS = Number(timing.idleTimeoutMs);
    if (isFinite(Number(timing.requestTimeoutMs)))
      CLIENT_FETCH_TIMEOUT_MS = Number(timing.requestTimeoutMs);
    if (isFinite(Number(timing.noticeDurationMs)))
      AMBIENT_NOTICE_DURATION_MS = Number(timing.noticeDurationMs);
    if (isFinite(Number(timing.noticeCycleMs)))
      AMBIENT_NOTICE_CYCLE_MS = Number(timing.noticeCycleMs);
    if (isFinite(Number(timing.photoHistorySize)))
      PHOTO_HISTORY_MAX_OLD = Number(timing.photoHistorySize);
    if (isFinite(Number(timing.alarmConfirmIntervalMs)))
      ALARM_CONFIRM_INTERVAL_MS = Number(timing.alarmConfirmIntervalMs);
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
    if (typeof AMBIENT === "object" && AMBIENT) {
      if (isFinite(Number(timing.newsChance)))
        AMBIENT.newsChance = Number(timing.newsChance);
      if (isFinite(Number(timing.newsDurationMs)))
        AMBIENT.newsDurationMs = Number(timing.newsDurationMs);
    }
    if (isFinite(Number(timing.spotifyPollLocalSdkMs)))
      SPOTIFY_POLL_LOCAL_SDK_MS = Number(timing.spotifyPollLocalSdkMs);
    if (isFinite(Number(timing.spotifyPollRemoteActiveMs)))
      SPOTIFY_POLL_REMOTE_ACTIVE_MS = Number(timing.spotifyPollRemoteActiveMs);
    if (isFinite(Number(timing.spotifyPollIdleMs)))
      SPOTIFY_POLL_IDLE_MS = Number(timing.spotifyPollIdleMs);
    if (isFinite(Number(timing.spotifyPollHiddenMs)))
      SPOTIFY_POLL_HIDDEN_MS = Number(timing.spotifyPollHiddenMs);
    if (isFinite(Number(timing.spotifyLyricSyncLeadSeconds)))
      LYRIC_SYNC_LEAD_SECONDS = Number(timing.spotifyLyricSyncLeadSeconds);
    if (isFinite(Number(timing.spotifyLyricSeekPrerollSeconds)))
      LYRIC_SEEK_PREROLL_SECONDS = Number(
        timing.spotifyLyricSeekPrerollSeconds,
      );
    if (isFinite(Number(timing.geminiProcessingTimeoutMs)))
      VOICE_PROCESSING_TIMEOUT_MS = Number(timing.geminiProcessingTimeoutMs);
    if (isFinite(Number(timing.geminiToolTimeoutMs)))
      VOICE_TOOL_TIMEOUT_MS = Number(timing.geminiToolTimeoutMs);
    if (isFinite(Number(timing.geminiFollowupWaitMs)))
      VOICE_FOLLOWUP_WAIT_MS = Number(timing.geminiFollowupWaitMs);
    resetIdleTimer();
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
