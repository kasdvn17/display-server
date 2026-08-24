  /* ---------------- SPOTIFY PREMIUM MEDIA PLAYER ----------------
     Spotify Web API provides catalog, account and remote-device fallback
     state. The Web Playback SDK provides realtime state for this browser as a
     Spotify Connect device, avoiding continuous Web API polling.
  --------------------------------------------------------------- */
  var spotifyPlayer = null;
  var spotifySdkLoaded = false;
  var spotifySdkReady = false;
  var spotifyLocalDeviceId = "";
  var spotifyDeviceReadyWaiters = [];
  var spotifyTargetDeviceId = "";
  var spotifyConnected = false;
  var spotifyConfigured = false;
  var spotifyProfileName = "";
  var spotifyDevices = [];
  var spotifyState = {
    isPlaying: false,
    progressMs: 0,
    durationMs: 0,
    updatedAt: Date.now(),
    shuffle: false,
    repeat: "off",
    volumePercent: null,
    item: null,
    device: null,
  };
  var spotifyLastSdkStateAt = 0;
  var spotifyRefreshPromise = null;
  var spotifyCooldownUntil = 0;
  var SPOTIFY_POLL_LOCAL_SDK_MS = 60000;
  var SPOTIFY_POLL_REMOTE_ACTIVE_MS = 15000;
  var SPOTIFY_POLL_IDLE_MS = 60000;
  var SPOTIFY_POLL_HIDDEN_MS = 300000;
  var spotifyPollTimer = null;
  var spotifyTicker = null;
  var spotifySeeking = false;
  var spotifyPersonal = null;
  var currentTrack = null;
  var currentQueue = [];
  var currentQueueIndex = -1;
  var lyricLines = [];
  var lyricTimed = false;
  var activeLyricIndex = -1;
  var lyricTrackKey = "";
  var searchTimer = null;
  var searchController = null;
  // Visual lyric lead compensates for UI/render latency and typical LRCLIB timing.
  var LYRIC_SYNC_LEAD_SECONDS = 0.35;
  var LYRIC_SEEK_PREROLL_SECONDS = 0.18;

  var playBtn = document.getElementById("play-btn");
  var playIcon = document.getElementById("play-icon");
  var titleEl = document.getElementById("yt-title");
  var authorEl = document.getElementById("yt-author");
  var stateEl = document.getElementById("yt-state");
  var seekSlider = document.getElementById("yt-seek");
  var progressCurrent = document.getElementById("progress-current");
  var progressTotal = document.getElementById("progress-total");
  var lyricsScroll = document.getElementById("lyrics-scroll");
  var lyricsSource = document.getElementById("lyrics-source");
  var lyricsSyncNotice = document.getElementById("lyrics-sync-notice");
  var musicSearchForm = document.getElementById("music-search-form");
  var musicSearchInput = document.getElementById("music-search-input");
  var musicSearchClear = document.getElementById("music-search-clear");
  var musicSearchResults = document.getElementById("music-search-results");
  var spotifyArt = document.getElementById("spotify-art");
  var mediaAlbumBg = document.getElementById("media-album-bg");
  var spotifyArtCard = document.getElementById("spotify-art-card");
  var spotifyConnectCard = document.getElementById("spotify-connect-card");
  var spotifyConnectBtn = document.getElementById("spotify-connect-btn");
  var spotifyControls = document.getElementById("spotify-controls");
  var spotifyDeviceBtn = document.getElementById("spotify-device-btn");
  var spotifyDeviceMenu = document.getElementById("spotify-device-menu");
  var spotifyDeviceName = document.getElementById("spotify-device-name");
  var spotifySdkNote = document.getElementById("spotify-sdk-note");
  var shuffleBtn = document.getElementById("shuffle-btn");
  var repeatBtn = document.getElementById("repeat-btn");
  var spotifySleepWrap = document.getElementById("spotify-sleep-wrap");
  var spotifySleepBtn = document.getElementById("spotify-sleep-btn");
  var spotifySleepMenu = document.getElementById("spotify-sleep-menu");
  var spotifySleepBadge = document.getElementById("spotify-sleep-badge");
  var spotifySleepTimer = 0;
  var spotifySleepUntil = 0;
  var spotifySleepInitialized = false;
  var spotifyVolume = document.getElementById("spotify-volume");
  var spotifyVolumeValue = document.getElementById("spotify-volume-value");
  var spotifyVolumeTimer = 0,
    spotifyVolumeChangingUntil = 0;

  function spotifyT(key, fallback, variables) {
    return window.FrameI18n && window.FrameI18n.t
      ? window.FrameI18n.t(key, fallback, variables)
      : String(fallback || key);
  }

  function setMediaState(text) {
    if (stateEl) stateEl.textContent = String(text || "").toUpperCase();
  }
  function spotifyRepeatLabel(mode) {
    if (mode === "track")
      return spotifyT("SPOTIFY_REPEAT_TRACK", "Lặp lại một bài");
    if (mode === "context")
      return spotifyT("SPOTIFY_REPEAT_CONTEXT", "Lặp vô hạn");
    return spotifyT("SPOTIFY_REPEAT_OFF", "Tắt lặp lại");
  }
  function syncSpotifyRepeatButton(mode) {
    mode = ["off", "context", "track"].indexOf(mode) >= 0 ? mode : "off";
    spotifyState.repeat = mode;
    if (!repeatBtn) return;
    repeatBtn.classList.toggle("active", mode !== "off");
    repeatBtn.classList.toggle("repeat-off", mode === "off");
    repeatBtn.classList.toggle("repeat-context", mode === "context");
    repeatBtn.classList.toggle("repeat-track", mode === "track");
    repeatBtn.setAttribute("data-repeat", mode);
    repeatBtn.setAttribute("aria-label", spotifyRepeatLabel(mode));
    repeatBtn.setAttribute("title", spotifyRepeatLabel(mode));
  }
  function spotifyDeviceType(type) {
    var normalized = String(type || "").toLowerCase();
    if (normalized === "computer")
      return spotifyT("SPOTIFY_DEVICE_COMPUTER", "Máy tính");
    if (normalized === "smartphone")
      return spotifyT("SPOTIFY_DEVICE_SMARTPHONE", "Điện thoại");
    if (normalized === "speaker")
      return spotifyT("SPOTIFY_DEVICE_SPEAKER", "Loa");
    if (normalized === "tv") return spotifyT("SPOTIFY_DEVICE_TV", "TV");
    if (normalized === "tablet")
      return spotifyT("SPOTIFY_DEVICE_TABLET", "Máy tính bảng");
    return type || "Spotify Connect";
  }
  function setPlayIcon(playing) {
    if (idleNowPlaying) setTimeout(syncIdleMusic, 0);
    if (!playIcon) return;
    playIcon.innerHTML = playing
      ? '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'
      : '<path d="M7 5v14l12-7L7 5Z" fill="currentColor"/>';
    if (spotifyArtCard) spotifyArtCard.classList.toggle("playing", !!playing);
    syncSystemMediaPlayback();
  }
  function showSpotifyConnectedUI(connected) {
    spotifyConnected = !!connected;
    if (spotifyConnectCard)
      spotifyConnectCard.classList.toggle("show", !connected);
    if (spotifyControls)
      spotifyControls.style.opacity = connected ? "1" : ".45";
    if (musicSearchInput) musicSearchInput.disabled = !connected;
    if (!connected) {
      setMediaState(spotifyT("SPOTIFY_NOT_CONNECTED", "Chưa kết nối"));
      if (spotifyDeviceName)
        spotifyDeviceName.textContent = spotifyT(
          "SPOTIFY_CONNECT_FIRST",
          "Hãy kết nối Spotify trước",
        );
    }
  }
  function spotifyFetch(url, options) {
    options = options || {};
    var path = String(url || ""),
      cooldownExempt =
        /^\/spotify\/(?:status|token|logout|sleep-timer)(?:[/?]|$)/.test(path);
    if (!cooldownExempt && Date.now() < spotifyCooldownUntil) {
      var blocked = new Error(
        spotifyT(
          "SPOTIFY_RETRY_LATER",
          "Spotify đang giới hạn yêu cầu — hãy thử lại sau",
        ),
      );
      blocked.status = 429;
      blocked.retryAfterMs = spotifyCooldownUntil - Date.now();
      return Promise.reject(blocked);
    }
    if (options.body && typeof options.body !== "string") {
      options.headers = options.headers || {};
      options.headers["content-type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(url, options).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (_) {
          data = { error: text };
        }
        var retrySeconds = Math.max(
            0,
            Number(data.retryAfterSeconds) ||
              Number(r.headers.get("retry-after")) ||
              0,
          ),
          until = Math.max(
            Number(data.rateLimitedUntil) || 0,
            Date.now() + retrySeconds * 1000,
          );
        if (r.status === 429 || data.rateLimited) {
          spotifyCooldownUntil = Math.max(
            spotifyCooldownUntil,
            until || Date.now() + 30000,
          );
          if (spotifySdkNote)
            spotifySdkNote.textContent = spotifyT(
              "SPOTIFY_RATE_LIMITED",
              "Spotify đang giới hạn yêu cầu · sẽ tự thử lại sau",
            );
        }
        if (!r.ok) {
          var e = new Error(data.detail || data.error || "Spotify " + r.status);
          e.status = r.status;
          e.reason = data.reason || "";
          e.retryAfterMs = Math.max(0, spotifyCooldownUntil - Date.now());
          throw e;
        }
        return data;
      });
    });
  }
  function spotifyAccessToken() {
    return spotifyFetch("/spotify/token", { cache: "no-store" }).then(
      function (x) {
        return x.accessToken;
      },
    );
  }

  /* iOS / system media controls metadata.
     Spotify's Web Playback SDK may expose a generic "Spotify Embedded Player"
     title in Control Center. Keep Media Session metadata in sync with the
     actual Spotify track so iPad/iPhone lock-screen controls show title,
     artist, album and artwork instead. */
  var systemMediaSessionReady = false;
  var systemMediaPositionAt = 0;
  function syncSystemMediaMetadata(track) {
    if (
      !track ||
      !("mediaSession" in navigator) ||
      typeof MediaMetadata === "undefined"
    )
      return;
    var artwork = [];
    if (track.thumbnail) {
      artwork.push({
        src: String(track.thumbnail),
        sizes: "640x640",
        type: "image/jpeg",
      });
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Spotify",
        artist: track.artist || (track.artists || []).join(", ") || "",
        album: track.album || "",
        artwork: artwork,
      });
    } catch (_) {}
  }
  function syncSystemMediaPlayback() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = spotifyState.isPlaying
        ? "playing"
        : "paused";
    } catch (_) {}
  }
  function syncSystemMediaPosition(force) {
    if (
      !("mediaSession" in navigator) ||
      !navigator.mediaSession.setPositionState
    )
      return;
    var now = Date.now();
    if (!force && now - systemMediaPositionAt < 900) return;
    systemMediaPositionAt = now;
    var duration = Math.max(0, Number(spotifyState.durationMs) || 0);
    if (!(duration > 0)) return;
    var position = Math.max(0, Math.min(duration, currentSpotifyPositionMs()));
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0.001, duration / 1000),
        playbackRate: 1,
        position: Math.max(0, Math.min(duration - 0.001, position)) / 1000,
      });
    } catch (_) {}
  }
  function initSystemMediaSession() {
    if (systemMediaSessionReady || !("mediaSession" in navigator)) return;
    systemMediaSessionReady = true;
    function setAction(name, handler) {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch (_) {}
    }
    setAction("play", function () {
      resumeSpotify();
    });
    setAction("pause", function () {
      pauseSpotify();
    });
    setAction("previoustrack", function () {
      spotifyFetch("/spotify/previous", {
        method: "POST",
        body: { deviceId: targetDeviceId() },
      })
        .then(function () {
          setTimeout(refreshSpotifyPlayer, 180);
        })
        .catch(function () {});
    });
    setAction("nexttrack", function () {
      spotifyFetch("/spotify/next", {
        method: "POST",
        body: { deviceId: targetDeviceId() },
      })
        .then(function () {
          setTimeout(refreshSpotifyPlayer, 180);
        })
        .catch(function () {});
    });
    setAction("seekto", function (details) {
      if (details && isFinite(Number(details.seekTime)))
        seekSpotify(Number(details.seekTime) * 1000, false);
    });
    setAction("seekbackward", function (details) {
      var step = (details && Number(details.seekOffset)) || 10;
      seekSpotify(currentSpotifyPositionMs() - step * 1000, false);
    });
    setAction("seekforward", function (details) {
      var step = (details && Number(details.seekOffset)) || 10;
      seekSpotify(currentSpotifyPositionMs() + step * 1000, false);
    });
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && currentTrack) {
      initSystemMediaSession();
      syncSystemMediaMetadata(currentTrack);
      syncSystemMediaPlayback();
      syncSystemMediaPosition(true);
    }
  });

  function loadSpotifySdk() {
    if (spotifySdkLoaded) return;
    spotifySdkLoaded = true;
    window.onSpotifyWebPlaybackSDKReady = function () {
      initSpotifySdkPlayer();
    };
    if (window.Spotify) {
      initSpotifySdkPlayer();
      return;
    }
    var script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = function () {
      setMediaState(spotifyT("SPOTIFY_SDK_ERROR", "Lỗi SDK"));
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_SDK_LOAD_FAILED",
          "Không thể tải Spotify SDK",
        );
    };
    document.body.appendChild(script);
  }
  function initSpotifySdkPlayer() {
    if (!window.Spotify || spotifyPlayer || !spotifyConnected) return;
    spotifyPlayer = new Spotify.Player({
      name: SPOTIFY_BROWSER_DEVICE_NAME,
      getOAuthToken: function (cb) {
        spotifyAccessToken()
          .then(cb)
          .catch(function () {
            setMediaState(spotifyT("SPOTIFY_AUTH_ERROR", "Lỗi xác thực"));
          });
      },
      volume: 0.65,
    });
    spotifyPlayer.addListener("ready", function (data) {
      spotifySdkReady = true;
      spotifyLocalDeviceId = String((data && data.device_id) || "");
      while (spotifyDeviceReadyWaiters.length) {
        try {
          spotifyDeviceReadyWaiters.shift()(spotifyLocalDeviceId);
        } catch (_) {}
      }
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_IPAD_READY",
          "iPad này đã sẵn sàng trong Spotify Connect",
        );
      refreshSpotifyDevices();
    });
    spotifyPlayer.addListener("not_ready", function () {
      spotifySdkReady = false;
      if (
        spotifyTargetDeviceId &&
        String(spotifyTargetDeviceId) === String(spotifyLocalDeviceId)
      )
        spotifyTargetDeviceId = "";
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_IPAD_OFFLINE",
          "Trình phát trên iPad đang tạm thời ngoại tuyến",
        );
      scheduleSpotifyPoll(1000);
    });
    spotifyPlayer.addListener("initialization_error", function (e) {
      setMediaState(spotifyT("SPOTIFY_SDK_ERROR", "Lỗi SDK"));
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_SDK_INIT_FAILED",
          "Lỗi khởi tạo Spotify SDK",
        );
    });
    spotifyPlayer.addListener("authentication_error", function (e) {
      setMediaState(spotifyT("SPOTIFY_AUTH_ERROR", "Lỗi xác thực"));
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_AUTH_EXPIRED",
          "Xác thực Spotify đã hết hạn",
        );
    });
    spotifyPlayer.addListener("account_error", function (e) {
      setMediaState(spotifyT("SPOTIFY_PREMIUM_REQUIRED", "Cần Premium"));
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_PREMIUM_ACCOUNT_REQUIRED",
          "Cần tài khoản Spotify Premium",
        );
    });
    spotifyPlayer.addListener("playback_error", function (e) {
      setMediaState(spotifyT("SPOTIFY_PLAYBACK_ERROR", "Lỗi phát nhạc"));
      if (spotifySdkNote)
        spotifySdkNote.textContent = spotifyT(
          "SPOTIFY_PLAYBACK_FAILED",
          "Lỗi phát nhạc Spotify",
        );
    });
    spotifyPlayer.addListener("player_state_changed", function (state) {
      if (!state) return;
      var accepted = applySdkState(state);
      // SDK events already contain track, position and playback state. Keep the
      // Web API only as a slow safety net instead of reconciling every event.
      if (accepted) scheduleSpotifyPoll();
    });
    spotifyPlayer.connect().then(function (ok) {
      if (!ok) setMediaState(spotifyT("SPOTIFY_SDK_OFFLINE", "SDK ngoại tuyến"));
    });
  }
  function activateSpotifyElement() {
    if (spotifyPlayer && spotifyPlayer.activateElement) {
      try {
        return spotifyPlayer.activateElement();
      } catch (_) {}
    }
    return Promise.resolve();
  }

  function spotifyTrackKey(track) {
    return track
      ? String(
          track.id ||
            track.uri ||
            (track.title || "") + "|" + (track.artist || ""),
        )
      : "";
  }
  function applyTrack(track) {
    if (!track) return;
    var nextKey = spotifyTrackKey(track);
    var changed = nextKey !== spotifyTrackKey(currentTrack);
    var lyricsOutOfDate = !!nextKey && nextKey !== lyricTrackKey;
    currentTrack = track;
    initSystemMediaSession();

    syncSystemMediaMetadata(track);
    // Web Playback SDK on iOS can overwrite Media Session metadata with its
    // generic player label shortly after a state event, so assert it again.
    setTimeout(function () {
      if (currentTrack && spotifyTrackKey(currentTrack) === nextKey)
        syncSystemMediaMetadata(currentTrack);
    }, 120);
    setTimeout(function () {
      if (currentTrack && spotifyTrackKey(currentTrack) === nextKey)
        syncSystemMediaMetadata(currentTrack);
    }, 700);
    if (titleEl) titleEl.textContent = track.title || "Spotify";
    if (authorEl)
      authorEl.textContent =
        (track.artist || "") + (track.album ? " · " + track.album : "");
    if (spotifyArt) {
      spotifyArt.src = track.thumbnail || "";
      spotifyArt.alt = spotifyT(
        "SPOTIFY_ARTWORK_NAMED",
        "Ảnh bìa {NAME}",
        { NAME: track.album || track.title || "Spotify" },
      );
      if (changed) {
        spotifyArt.classList.remove("art-reveal");
        void spotifyArt.offsetWidth;
        spotifyArt.classList.add("art-reveal");
      }
    }
    if (mediaAlbumBg) {
      if (track.thumbnail) {
        var safeArt = String(track.thumbnail).replace(/"/g, "%22");
        mediaAlbumBg.style.setProperty(
          "--media-album-art",
          'url("' + safeArt + '")',
        );
        mediaAlbumBg.classList.add("has-art");
      } else {
        mediaAlbumBg.style.removeProperty("--media-album-art");
        mediaAlbumBg.classList.remove("has-art");
      }
    }
    if (spotifyArtCard)
      spotifyArtCard.classList.toggle("has-art", !!track.thumbnail);
    spotifyState.durationMs = Math.max(
      0,
      Number(
        track.durationMs ||
          track.durationSeconds * 1000 ||
          spotifyState.durationMs,
      ) || 0,
    );
    syncIdleMusic();
    // Lyrics are keyed independently from currentTrack. This matters when a track
    // is selected for an already-active remote Spotify Connect device: older code
    // could assign currentTrack before applyTrack(), making `changed` false and
    // leaving the previous song's lyrics on screen until a full page reload.
    if (changed || lyricsOutOfDate) loadLyricsForTrack(track);
  }
  function applySdkState(state) {
    if (
      spotifyTargetDeviceId &&
      spotifyLocalDeviceId &&
      String(spotifyTargetDeviceId) !== String(spotifyLocalDeviceId)
    )
      return false;
    var raw = state && state.track_window && state.track_window.current_track;
    var track = null;
    if (raw) {
      var artists = (raw.artists || [])
        .map(function (a) {
          return a.name;
        })
        .filter(Boolean);
      var images = (raw.album && raw.album.images) || [];
      track = {
        id: raw.id || "",
        uri: raw.uri || "",
        title: raw.name || "",
        artist: artists.join(", "),
        artists: artists,
        album: (raw.album && raw.album.name) || "",
        durationMs: Number(raw.duration_ms || 0),
        durationSeconds: Number(raw.duration_ms || 0) / 1000,
        thumbnail: (images[0] && images[0].url) || "",
        source: "spotify",
      };
    }
    spotifyLastSdkStateAt = Date.now();
    spotifyState.isPlaying = !state.paused;
    spotifyState.progressMs = Math.max(0, Number(state.position || 0));
    spotifyState.durationMs = Math.max(
      0,
      Number(state.duration || (track && track.durationMs) || 0),
    );
    spotifyState.updatedAt = Date.now();
    spotifyState.shuffle = !!state.shuffle;
    spotifyState.repeat = ["off", "context", "track"][
      Math.max(0, Math.min(2, Math.round(Number(state.repeat_mode) || 0)))
    ];
    if (spotifyLocalDeviceId) {
      spotifyTargetDeviceId = spotifyLocalDeviceId;
      spotifyState.device = {
        id: spotifyLocalDeviceId,
        name: "Nest Frame · iPad",
        type: "Computer",
        isActive: true,
        isRestricted: false,
        volumePercent: spotifyState.volumePercent,
      };
      if (spotifyDeviceName)
        spotifyDeviceName.textContent =
          "Nest Frame · iPad · " + spotifyT("SPOTIFY_THIS_IPAD", "iPad này");
    }
    if (track) applyTrack(track);
    if (spotifyPlayer && spotifyPlayer.getVolume)
      spotifyPlayer
        .getVolume()
        .then(function (volume) {
          renderSpotifyVolume(Number(volume) * 100);
        })
        .catch(function () {});
    setPlayIcon(spotifyState.isPlaying);
    setMediaState(
      spotifyState.isPlaying
        ? spotifyT("SPOTIFY_PLAYING", "Đang phát")
        : spotifyT("SPOTIFY_PAUSED", "Tạm dừng"),
    );
    if (shuffleBtn)
      shuffleBtn.classList.toggle("active", spotifyState.shuffle);
    syncSpotifyRepeatButton(spotifyState.repeat);
    updateSpotifyProgress();
    return true;
  }

  function currentSpotifyPositionMs() {
    var pos = Math.max(0, Number(spotifyState.progressMs) || 0);
    if (spotifyState.isPlaying)
      pos += Math.max(
        0,
        Date.now() - Number(spotifyState.updatedAt || Date.now()),
      );
    if (spotifyState.durationMs > 0)
      pos = Math.min(pos, spotifyState.durationMs);
    return pos;
  }
  function formatTime(s) {
    s = Math.max(0, Math.floor(Number(s) || 0));
    var h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
    return m + ":" + pad(sec);
  }
  function updateSpotifyProgress() {
    var cur = currentSpotifyPositionMs(),
      dur = Math.max(0, Number(spotifyState.durationMs) || 0);
    if (!spotifySeeking && seekSlider)
      seekSlider.value = dur ? Math.round((cur / dur) * 1000) : 0;
    if (progressCurrent) progressCurrent.textContent = formatTime(cur / 1000);
    if (progressTotal) progressTotal.textContent = formatTime(dur / 1000);
    syncLyrics(cur / 1000);
    syncSystemMediaPosition(false);
  }

  function renderSpotifyVolume(percent) {
    percent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    spotifyState.volumePercent = percent;
    if (spotifyVolume && Date.now() >= spotifyVolumeChangingUntil)
      spotifyVolume.value = percent;
    if (spotifyVolumeValue) spotifyVolumeValue.textContent = percent + "%";
  }
  function syncLocalSpotifyVolume(percent) {
    if (!spotifyPlayer || !spotifyPlayer.setVolume || !spotifyLocalDeviceId)
      return;
    var activeId = spotifyState.device && String(spotifyState.device.id || "");
    if (activeId !== String(spotifyLocalDeviceId)) return;
    percent = Math.max(0, Math.min(100, Number(percent) || 0));
    if (spotifyPlayer.getVolume) {
      spotifyPlayer
        .getVolume()
        .then(function (v) {
          if (Math.abs(v * 100 - percent) > 2)
            return spotifyPlayer.setVolume(percent / 100);
        })
        .catch(function () {});
    } else {
      try {
        spotifyPlayer.setVolume(percent / 100);
      } catch (_) {}
    }
  }
  function setSpotifyVolume(percent) {
    percent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    spotifyVolumeChangingUntil = Date.now() + 1500;
    spotifyState.volumePercent = percent;
    if (spotifyVolumeValue) spotifyVolumeValue.textContent = percent + "%";
    var id = targetDeviceId() || spotifyLocalDeviceId;
    if (
      id &&
      spotifyLocalDeviceId &&
      String(id) === String(spotifyLocalDeviceId) &&
      spotifyPlayer &&
      spotifyPlayer.setVolume
    ) {
      clearTimeout(spotifyVolumeTimer);
      try {
        Promise.resolve(spotifyPlayer.setVolume(percent / 100)).catch(
          function () {},
        );
      } catch (_) {}
      return;
    }
    clearTimeout(spotifyVolumeTimer);
    spotifyVolumeTimer = setTimeout(function () {
      spotifyFetch("/spotify/volume", {
        method: "PUT",
        body: { deviceId: id, volumePercent: percent },
      })
        .then(function () {
          setTimeout(refreshSpotifyPlayer, 180);
        })
        .catch(function () {});
    }, 300);
  }

  function applyRemotePlayerState(data) {
    data = data || {};
    spotifyState.isPlaying = !!data.isPlaying;
    spotifyState.progressMs = Math.max(0, Number(data.progressMs) || 0);
    spotifyState.updatedAt = Date.now();
    spotifyState.shuffle = !!data.shuffle;
    spotifyState.repeat = String(data.repeat || "off");
    spotifyState.device = data.device || null;
    if (
      data.device &&
      data.device.volumePercent != null &&
      isFinite(Number(data.device.volumePercent))
    ) {
      var remoteVolume = Math.max(
        0,
        Math.min(100, Number(data.device.volumePercent)),
      );
      renderSpotifyVolume(remoteVolume);
      syncLocalSpotifyVolume(remoteVolume);
    }
    if (data.item) {
      spotifyState.durationMs = Math.max(0, Number(data.item.durationMs) || 0);
      applyTrack(data.item);
    } else {
      if (!spotifyState.isPlaying && !currentTrack)
        setMediaState(spotifyT("SPOTIFY_READY", "Sẵn sàng"));
    }
    if (data.device) {
      spotifyTargetDeviceId = String(
        data.device.id || spotifyTargetDeviceId || "",
      );
      if (spotifyDeviceName)
        spotifyDeviceName.textContent =
          data.device.name || spotifyT("SPOTIFY_DEVICE", "Thiết bị Spotify");
    }
    setPlayIcon(spotifyState.isPlaying);
    if (currentTrack)
      setMediaState(
        spotifyState.isPlaying
          ? spotifyT("SPOTIFY_PLAYING", "Đang phát")
          : spotifyT("SPOTIFY_PAUSED", "Tạm dừng"),
      );
    if (shuffleBtn) shuffleBtn.classList.toggle("active", spotifyState.shuffle);
    syncSpotifyRepeatButton(spotifyState.repeat);
    updateSpotifyProgress();
  }
  function refreshSpotifyPlayer() {
    if (!spotifyConnected) return Promise.resolve();
    if (spotifyRefreshPromise) return spotifyRefreshPromise;
    spotifyRefreshPromise = spotifyFetch("/spotify/player?ts=" + Date.now(), {
      cache: "no-store",
    })
      .then(function (data) {
        applyRemotePlayerState(data);
        return data;
      })
      .catch(function (e) {
        if (e.status === 401) {
          showSpotifyConnectedUI(false);
        } else if (e.status === 429) {
          setMediaState(spotifyT("SPOTIFY_LIMITED", "Bị giới hạn"));
        } else if (window.console && console.warn)
          console.warn("Spotify state:", e.message || e);
      })
      .then(
        function (result) {
          spotifyRefreshPromise = null;
          return result;
        },
        function (err) {
          spotifyRefreshPromise = null;
          throw err;
        },
      );
    return spotifyRefreshPromise;
  }

  function escapeText(v) {
    return String(v == null ? "" : v);
  }
  function resultSubtitle(item) {
    var parts = [];
    if (item.artist) parts.push(item.artist);
    if (item.album) parts.push(item.album);
    if (item.duration) parts.push(item.duration);
    return parts.join(" · ");
  }
  function renderSpotifyResults(items, label) {
    if (!musicSearchResults) return;
    currentQueue = Array.isArray(items) ? items.slice() : [];
    if (!currentQueue.length) {
      musicSearchResults.innerHTML =
        '<div class="music-search-status">' +
        spotifyT("SPOTIFY_NO_TRACKS", "Không tìm thấy bài hát Spotify") +
        "</div>";
      musicSearchResults.classList.add("show");
      return;
    }
    musicSearchResults.innerHTML = "";
    if (label) {
      var section = document.createElement("div");
      section.className = "spotify-section-label";
      section.textContent = label;
      musicSearchResults.appendChild(section);
    }
    currentQueue.forEach(function (item, index) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "music-result spotify-result";
      row.setAttribute("role", "option");
      var thumb = document.createElement("img");
      thumb.className = "music-result-thumb";
      thumb.alt = "";
      thumb.src = item.thumbnail || "";
      thumb.width = 52;
      thumb.height = 52;
      thumb.style.width = "52px";
      thumb.style.height = "52px";
      thumb.style.maxWidth = "52px";
      thumb.style.maxHeight = "52px";
      thumb.style.objectFit = "cover";
      var copy = document.createElement("span");
      copy.className = "music-result-copy";
      var title = document.createElement("strong");
      title.className = "music-result-title";
      title.textContent = escapeText(
        item.title || spotifyT("SPOTIFY_TRACK", "Bài hát Spotify"),
      );
      var sub = document.createElement("span");
      sub.className = "music-result-sub";
      sub.textContent = escapeText(resultSubtitle(item));
      var duration = document.createElement("span");
      duration.className = "music-result-duration";
      duration.textContent = escapeText(item.duration || "");
      copy.appendChild(title);
      copy.appendChild(sub);
      row.appendChild(thumb);
      row.appendChild(copy);
      row.appendChild(duration);
      row.addEventListener("click", function () {
        activateSpotifyElement();
        currentQueueIndex = index;
        playSpotifyTrack(item, true);
        closeSearchResults();
      });
      musicSearchResults.appendChild(row);
    });
    musicSearchResults.classList.add("show");
  }
  function closeSearchResults() {
    if (musicSearchResults) musicSearchResults.classList.remove("show");
  }
  function loadSpotifyPersonal() {
    if (!spotifyConnected || spotifyPersonal)
      return Promise.resolve(spotifyPersonal);
    return spotifyFetch("/spotify/personal", { cache: "no-store" })
      .then(function (x) {
        spotifyPersonal = x;
        return x;
      })
      .catch(function () {
        return null;
      });
  }
  function showPersonalTracks() {
    if (!spotifyConnected) return;
    loadSpotifyPersonal().then(function (data) {
      if (!data) return;
      var list =
        (data.recent && data.recent.length ? data.recent : data.top) || [];
      renderSpotifyResults(
        list.slice(0, 10),
        data.recent && data.recent.length
          ? spotifyT("SPOTIFY_RECENTLY_PLAYED", "Đã phát gần đây")
          : spotifyT("SPOTIFY_YOUR_TOP_TRACKS", "Bài hát nổi bật của bạn"),
      );
    });
  }
  function performSpotifySearch(query) {
    query = String(query || "").trim();
    if (query.length < 2) {
      showPersonalTracks();
      return;
    }
    if (searchController && searchController.abort) searchController.abort();
    searchController =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    if (musicSearchResults) {
      musicSearchResults.innerHTML =
        '<div class="music-search-status">' +
        spotifyT("SPOTIFY_SEARCHING", "Đang tìm trên Spotify…") +
        "</div>";
      musicSearchResults.classList.add("show");
    }
    var opts = { cache: "no-store" };
    if (searchController) opts.signal = searchController.signal;
    spotifyFetch("/spotify/search?q=" + encodeURIComponent(query), opts)
      .then(function (data) {
        renderSpotifyResults(
          data.results || [],
          spotifyT("SPOTIFY_RESULTS", "Kết quả Spotify"),
        );
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (!musicSearchResults) return;
        var message = spotifyT(
          "SPOTIFY_SEARCH_FAILED",
          "Không thể tìm kiếm trên Spotify",
        );
        if (err && err.status === 401)
          message = spotifyT(
            "SPOTIFY_SESSION_EXPIRED",
            "Phiên Spotify đã hết hạn — hãy kết nối lại",
          );
        else if (err && err.status === 429)
          message = spotifyT(
            "SPOTIFY_RETRY_LATER",
            "Spotify đang giới hạn yêu cầu — hãy thử lại sau",
          );
        musicSearchResults.innerHTML = "";
        var status = document.createElement("div");
        status.className = "music-search-status";
        status.textContent = message;
        musicSearchResults.appendChild(status);
        musicSearchResults.classList.add("show");
      });
  }
  if (musicSearchForm)
    musicSearchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      performSpotifySearch(musicSearchInput.value);
    });
  if (musicSearchInput) {
    musicSearchInput.addEventListener("input", function () {
      var q = this.value;
      if (musicSearchClear) musicSearchClear.classList.toggle("show", !!q);
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        performSpotifySearch(q);
      }, 320);
    });
    musicSearchInput.addEventListener("focus", function () {
      if (!this.value.trim()) showPersonalTracks();
    });
  }
  if (musicSearchClear)
    musicSearchClear.addEventListener("click", function () {
      if (musicSearchInput) {
        musicSearchInput.value = "";
        musicSearchInput.focus();
      }
      musicSearchClear.classList.remove("show");
      showPersonalTracks();
    });
  document.addEventListener("click", function (e) {
    var wrap = document.getElementById("music-search-wrap");
    if (wrap && !wrap.contains(e.target)) closeSearchResults();
    if (
      spotifyDeviceMenu &&
      spotifyDeviceBtn &&
      !spotifyDeviceMenu.contains(e.target) &&
      !spotifyDeviceBtn.contains(e.target)
    )
      spotifyDeviceMenu.classList.remove("show");
  });

  function setLyricsSyncNotice(data) {
    if (!lyricsSyncNotice) return;
    var status = String((data && data.syncStatus) || "");
    lyricsSyncNotice.className = "lyrics-sync-notice";
    if (status === "timing-warning") {
      lyricsSyncNotice.textContent =
        "⚠ " +
        spotifyT(
          "SPOTIFY_LYRICS_TIMING_WARNING",
          "Thời gian lời bài hát có thể lệch so với bản thu này",
        );
      lyricsSyncNotice.classList.add("show", "warn");
    } else if (status === "unsynced") {
      lyricsSyncNotice.textContent =
        spotifyT("SPOTIFY_UNSYNCED", "Chưa đồng bộ");
      lyricsSyncNotice.classList.add("show", "unsynced");
    } else {
      lyricsSyncNotice.textContent = "";
    }
  }

  function loadLyricsForTrack(track) {
    if (!track || !track.title || !track.artist) return;
    var key = spotifyTrackKey(track);
    lyricTrackKey = key;
    lyricLines = [];
    lyricTimed = false;
    activeLyricIndex = -1;
    setLyricsSyncNotice(null);
    if (lyricsScroll)
      lyricsScroll.innerHTML =
        '<div class="lyrics-empty"><strong>' +
        spotifyT("SPOTIFY_FINDING_LYRICS", "Đang tìm lời bài hát…") +
        "</strong>" +
        spotifyT("SPOTIFY_MATCHING_RECORDING", "Đang khớp với bản thu Spotify.") +
        '<div class="lyrics-file">LRCLIB · lyrics.ovh</div></div>';
    var qs =
      "?title=" +
      encodeURIComponent(track.title) +
      "&artist=" +
      encodeURIComponent(track.artist) +
      "&album=" +
      encodeURIComponent(track.album || "") +
      "&duration=" +
      encodeURIComponent(Math.round((track.durationMs || 0) / 1000));
    fetch("/lyrics" + qs, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Lyrics " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (key !== lyricTrackKey) return;
        lyricLines = Array.isArray(data.lines) ? data.lines : [];
        lyricTimed = !!data.timed;
        if (lyricsSource) {
          var sourceLabel = data.source
            ? data.source +
              (lyricTimed
                ? " · " + spotifyT("SPOTIFY_LYRICS_SYNCED", "đã đồng bộ")
                : " · " + spotifyT("SPOTIFY_LYRICS_TEXT", "văn bản"))
            : spotifyT("SPOTIFY_NO_LYRICS", "Không có lời");
          if (data.durationDiff != null && isFinite(Number(data.durationDiff)))
            sourceLabel += " · Δ" + Math.round(Number(data.durationDiff)) + "s";
          lyricsSource.textContent = sourceLabel;
        }
        setLyricsSyncNotice(data);
        renderLyrics();
        syncLyrics(currentSpotifyPositionMs() / 1000);
      })
      .catch(function () {
        if (key !== lyricTrackKey) return;
        setLyricsSyncNotice(null);
        if (lyricsScroll)
          lyricsScroll.innerHTML =
            '<div class="lyrics-empty"><strong>' +
            spotifyT("SPOTIFY_LYRICS_UNAVAILABLE", "Lời bài hát không khả dụng") +
            "</strong>" +
            spotifyT(
              "SPOTIFY_LYRICS_SERVICE_FAILED",
              "Không thể kết nối tới dịch vụ lời bài hát.",
            ) +
            '<div class="lyrics-file">LRCLIB · lyrics.ovh</div></div>';
      });
  }
  function renderLyrics() {
    if (!lyricsScroll) return;
    if (!lyricLines.length) {
      lyricsScroll.innerHTML =
        '<div class="lyrics-empty"><strong>' +
        spotifyT("SPOTIFY_LYRICS_NOT_FOUND", "Không tìm thấy lời bài hát") +
        "</strong>" +
        spotifyT(
          "SPOTIFY_LYRICS_NOT_IN_SOURCES",
          "Bản thu Spotify này chưa có trong các nguồn lời đã cấu hình.",
        ) +
        '<div class="lyrics-file">LRCLIB · lyrics.ovh</div></div>';
      return;
    }
    lyricsScroll.innerHTML = "";
    lyricLines.forEach(function (line, index) {
      var div = document.createElement("div");
      div.className = "lyric-line" + (lyricTimed ? " timed" : "");
      div.textContent = line.text || "";
      div.setAttribute("data-index", index);
      if (lyricTimed) {
        div.tabIndex = 0;
        div.setAttribute("role", "button");
        div.setAttribute(
          "aria-label",
          spotifyT("SPOTIFY_PLAY_FROM", "Phát từ {TIME}", {
            TIME: formatTime(Number(line.time || 0)),
          }),
        );
      }
      lyricsScroll.appendChild(div);
    });
  }
  function syncLyrics(time) {
    if (!lyricTimed || !lyricLines.length || !lyricsScroll) return;
    var idx = -1;
    for (var i = 0; i < lyricLines.length; i++) {
      if (Number(lyricLines[i].time || 0) <= time + LYRIC_SYNC_LEAD_SECONDS)
        idx = i;
      else break;
    }
    if (idx === activeLyricIndex) return;
    activeLyricIndex = idx;
    var nodes = lyricsScroll.querySelectorAll(".lyric-line");
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].classList.toggle("active", j === idx);
      nodes[j].classList.toggle("near", j === idx - 1 || j === idx + 1);
    }
    if (idx >= 0 && nodes[idx])
      lyricsScroll.scrollTop = Math.max(
        0,
        nodes[idx].offsetTop - lyricsScroll.clientHeight * 0.38,
      );
  }
  function findLyricLineTarget(node) {
    while (node && node !== lyricsScroll) {
      if (
        node.classList &&
        node.classList.contains("lyric-line") &&
        node.classList.contains("timed")
      )
        return node;
      node = node.parentNode;
    }
    return null;
  }
  function seekToLyricLine(index) {
    index = Number(index);
    if (
      !lyricTimed ||
      !isFinite(index) ||
      index < 0 ||
      index >= lyricLines.length
    )
      return;
    activateSpotifyElement();
    seekSpotify(
      Math.max(
        0,
        (Number(lyricLines[index].time || 0) - LYRIC_SEEK_PREROLL_SECONDS) *
          1000,
      ),
      true,
    );
  }
  if (lyricsScroll) {
    lyricsScroll.addEventListener("click", function (e) {
      var line = findLyricLineTarget(e.target);
      if (line) seekToLyricLine(line.getAttribute("data-index"));
    });
    lyricsScroll.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var line = findLyricLineTarget(e.target);
      if (!line) return;
      e.preventDefault();
      seekToLyricLine(line.getAttribute("data-index"));
    });
  }

  function targetDeviceId() {
    if (spotifyDevices.length) {
      var selected = spotifyDevices.find(function (device) {
        return (
          String(device.id || "") === String(spotifyTargetDeviceId || "") &&
          !device.isRestricted
        );
      });
      if (selected) return String(selected.id || "");
      var active = spotifyDevices.find(function (device) {
          return device.isActive && !device.isRestricted;
        }),
        local = spotifyDevices.find(function (device) {
          return (
            spotifySdkReady &&
            spotifyLocalDeviceId &&
            String(device.id || "") === String(spotifyLocalDeviceId) &&
            !device.isRestricted
          );
        }),
        available = active || local || spotifyDevices.find(function (device) {
          return !device.isRestricted;
        });
      if (available) {
        spotifyTargetDeviceId = String(available.id || "");
        if (spotifyDeviceName)
          spotifyDeviceName.textContent = deviceLabel(available);
        return spotifyTargetDeviceId;
      }
      spotifyTargetDeviceId = "";
      return "";
    }
    return (
      (spotifyState.device && spotifyState.device.id) ||
      spotifyLocalDeviceId ||
      ""
    );
  }
  function waitForSpotifyLocalDevice(timeoutMs) {
    if (spotifySdkReady && spotifyLocalDeviceId)
      return Promise.resolve(spotifyLocalDeviceId);
    return new Promise(function (resolve) {
      var finished = false,
        waiter,
        complete = function (id) {
          if (finished) return;
          finished = true;
          var index = spotifyDeviceReadyWaiters.indexOf(waiter);
          if (index >= 0) spotifyDeviceReadyWaiters.splice(index, 1);
          resolve(String(id || ""));
        },
        timer = setTimeout(function () {
          complete("");
        }, Math.max(500, Number(timeoutMs) || 4500));
      waiter = function (id) {
        clearTimeout(timer);
        complete(id);
      };
      spotifyDeviceReadyWaiters.push(waiter);
    });
  }
  function ensureSpotifyPlaybackDevice() {
    return refreshSpotifyDevices()
      .then(function () {
        var id = targetDeviceId();
        if (id) return id;
        return waitForSpotifyLocalDevice(4500).then(function () {
          return refreshSpotifyDevices().then(function () {
            return targetDeviceId();
          });
        });
      })
      .then(function (id) {
        if (!id)
          throw new Error(
            spotifyT(
              "SPOTIFY_PLAYER_UNAVAILABLE",
              "Không có Spotify player nào khả dụng",
            ),
          );
        spotifyTargetDeviceId = String(id);
        return spotifyTargetDeviceId;
      });
  }
  function playSpotifyTrack(track, forcePlay) {
    if (!spotifyConnected || !track || !track.uri) return;
    // Let applyTrack() compare against the previous currentTrack before replacing it,
    // so metadata + lyrics both detect a real song change.
    applyTrack(track);
    spotifyState.progressMs = 0;
    spotifyState.updatedAt = Date.now();
    spotifyState.durationMs = track.durationMs || 0;
    updateSpotifyProgress();
    var begin = function (deviceId) {
      return spotifyFetch("/spotify/play", {
        method: "POST",
        body: { deviceId: deviceId, uris: [track.uri] },
      }).then(function (result) {
        if (result && result.deviceId)
          spotifyTargetDeviceId = String(result.deviceId);
        return result;
      });
    };
    ensureSpotifyPlaybackDevice()
      .then(function (deviceId) {
        if (
          spotifyLocalDeviceId &&
          String(deviceId) === String(spotifyLocalDeviceId)
        ) {
          return activateSpotifyElement()
            .then(function () {
              return spotifyFetch("/spotify/transfer", {
                method: "PUT",
                body: { deviceId: spotifyLocalDeviceId, play: false },
              });
            })
            .catch(function () {})
            .then(function () {
              return begin(deviceId);
            })
            .then(function () {
              if (forcePlay && spotifyPlayer && spotifyPlayer.resume)
                return spotifyPlayer.resume().catch(function () {});
            });
        }
        return begin(deviceId);
      })
      .catch(function (e) {
        setMediaState(spotifyT("SPOTIFY_PLAYBACK_ERROR", "Lỗi phát nhạc"));
        if (spotifySdkNote)
          spotifySdkNote.textContent = spotifyT(
            "SPOTIFY_PLAYBACK_FAILED",
            "Không thể phát Spotify",
          );
      });
  }
  function pauseSpotify() {
    if (!spotifyConnected) return Promise.resolve();
    var id = targetDeviceId();
    if (
      id &&
      spotifyLocalDeviceId &&
      id === spotifyLocalDeviceId &&
      spotifyPlayer &&
      spotifyPlayer.pause
    )
      return spotifyPlayer.pause().catch(function () {});
    return spotifyFetch("/spotify/pause", {
      method: "POST",
      body: { deviceId: id },
    }).catch(function () {});
  }
  function resumeSpotify() {
    if (!spotifyConnected) return;
    activateSpotifyElement();
    return ensureSpotifyPlaybackDevice()
      .then(function (id) {
        if (
          spotifyLocalDeviceId &&
          String(id) === String(spotifyLocalDeviceId) &&
          spotifyPlayer &&
          spotifyPlayer.resume
        )
          return activateSpotifyElement()
            .then(function () {
              return spotifyPlayer.resume();
            })
            .catch(function () {
              return spotifyFetch("/spotify/play", {
                method: "POST",
                body: { deviceId: id },
              });
            });
        return spotifyFetch("/spotify/play", {
          method: "POST",
          body: { deviceId: id },
        });
      })
      .then(function (result) {
        if (result && result.deviceId)
          spotifyTargetDeviceId = String(result.deviceId);
        return result;
      })
      .catch(function (e) {
        setMediaState(spotifyT("SPOTIFY_PLAYBACK_ERROR", "Lỗi phát nhạc"));
        if (spotifySdkNote)
          spotifySdkNote.textContent = spotifyT(
            "SPOTIFY_PLAYBACK_FAILED",
            "Không thể phát Spotify",
          );
      });
  }
  function seekSpotify(positionMs, resume) {
    var id = targetDeviceId();
    positionMs = Math.max(0, Math.round(Number(positionMs) || 0));
    var local = id && spotifyLocalDeviceId && id === spotifyLocalDeviceId;
    var p =
      local && spotifyPlayer && spotifyPlayer.seek
        ? spotifyPlayer.seek(positionMs)
        : spotifyFetch("/spotify/seek", {
            method: "PUT",
            body: { deviceId: id, positionMs: positionMs },
          });
    Promise.resolve(p)
      .then(function () {
        spotifyState.progressMs = positionMs;
        spotifyState.updatedAt = Date.now();
        if (resume) resumeSpotify();
        updateSpotifyProgress();
      })
      .catch(function () {});
  }

  if (playBtn)
    playBtn.addEventListener("click", function () {
      activateSpotifyElement();
      if (!spotifyConnected) {
        window.location.href = "/spotify/login";
        return;
      }
      spotifyState.isPlaying ? pauseSpotify() : resumeSpotify();
    });
  var prevBtn = document.getElementById("prev-btn"),
    nextBtn = document.getElementById("next-btn");
  if (prevBtn)
    prevBtn.addEventListener("click", function () {
      activateSpotifyElement();
      spotifyFetch("/spotify/previous", {
        method: "POST",
        body: { deviceId: targetDeviceId() },
      })
        .then(function () {
          setTimeout(refreshSpotifyPlayer, 250);
        })
        .catch(function () {});
    });
  if (nextBtn)
    nextBtn.addEventListener("click", function () {
      activateSpotifyElement();
      spotifyFetch("/spotify/next", {
        method: "POST",
        body: { deviceId: targetDeviceId() },
      })
        .then(function () {
          setTimeout(refreshSpotifyPlayer, 250);
        })
        .catch(function () {});
    });
  if (seekSlider) {
    seekSlider.addEventListener("input", function () {
      spotifySeeking = true;
    });
    seekSlider.addEventListener("change", function () {
      var dur = Math.max(0, Number(spotifyState.durationMs) || 0);
      var target = (dur * Number(seekSlider.value || 0)) / 1000;
      spotifySeeking = false;
      seekSpotify(target, false);
    });
  }
  if (shuffleBtn)
    shuffleBtn.addEventListener("click", function () {
      var next = !spotifyState.shuffle;
      spotifyFetch("/spotify/shuffle", {
        method: "PUT",
        body: { deviceId: targetDeviceId(), state: next },
      })
        .then(function () {
          spotifyState.shuffle = next;
          shuffleBtn.classList.toggle("active", next);
        })
        .catch(function () {});
    });
  if (repeatBtn)
    repeatBtn.addEventListener("click", function () {
      var next =
        spotifyState.repeat === "off"
          ? "context"
          : spotifyState.repeat === "context"
            ? "track"
            : "off";
      spotifyFetch("/spotify/repeat", {
        method: "PUT",
        body: { deviceId: targetDeviceId(), state: next },
      })
        .then(function () {
          syncSpotifyRepeatButton(next);
        })
        .catch(function () {});
    });
  if (spotifyVolume) {
    spotifyVolume.addEventListener("input", function () {
      spotifyVolumeChangingUntil = Date.now() + 1500;
      if (spotifyVolumeValue)
        spotifyVolumeValue.textContent =
          Math.round(Number(this.value) || 0) + "%";
      setSpotifyVolume(this.value);
    });
  }
  initSystemMediaSession();

  function closeSpotifySleepMenu() {
    if (spotifySleepMenu) spotifySleepMenu.classList.remove("show");
    if (spotifySleepBtn) spotifySleepBtn.setAttribute("aria-expanded", "false");
  }
  function positionSpotifySleepMenu() {
    if (!spotifySleepMenu || !spotifySleepBtn) return;
    var rect = spotifySleepBtn.getBoundingClientRect();
    var menuWidth = Math.min(210, Math.max(160, window.innerWidth - 20));
    var left = Math.max(
      10,
      Math.min(
        window.innerWidth - menuWidth - 10,
        rect.left + rect.width / 2 - menuWidth / 2,
      ),
    );
    spotifySleepMenu.style.width = menuWidth + "px";
    spotifySleepMenu.style.left = left + "px";
    spotifySleepMenu.style.bottom =
      Math.max(10, window.innerHeight - rect.top + 8) + "px";
  }
  function applySpotifySleepTimerStatus(data) {
    spotifySleepUntil =
      data && data.active ? Math.max(0, Number(data.sleepUntil) || 0) : 0;
    renderSpotifySleepTimer();
    scheduleSpotifySleepTick();
  }
  function formatSleepRemaining(ms) {
    var total = Math.max(0, Math.ceil(ms / 60000));
    if (total >= 60) {
      var h = Math.floor(total / 60),
        m = total % 60;
      return m ? h + "h" + m : h + "h";
    }
    return total + "m";
  }
  function renderSpotifySleepTimer() {
    var remaining = spotifySleepUntil - Date.now();
    var active = remaining > 0;
    if (spotifySleepBtn) {
      spotifySleepBtn.classList.toggle("active", active);
      spotifySleepBtn.setAttribute(
        "aria-label",
        active
          ? spotifyT("SPOTIFY_TIMER_REMAINING", "Hẹn giờ tắt · còn {TIME}", {
              TIME: formatSleepRemaining(remaining),
            })
          : spotifyT("SPOTIFY_SLEEP_TIMER", "Hẹn giờ tắt Spotify"),
      );
    }
    if (spotifySleepBadge)
      spotifySleepBadge.textContent = active
        ? formatSleepRemaining(remaining)
        : "";
    if (spotifySleepMenu) {
      var nodes = spotifySleepMenu.querySelectorAll("[data-sleep-minutes]");
      var selectedMinutes = active ? Math.round(remaining / 60000) : 0;
      for (var i = 0; i < nodes.length; i++) {
        var optionMinutes =
          Number(nodes[i].getAttribute("data-sleep-minutes")) || 0;
        nodes[i].classList.toggle("active", optionMinutes === selectedMinutes);
      }
    }
  }
  function stopSpotifySleepTimer(closeMenu) {
    clearTimeout(spotifySleepTimer);
    spotifySleepTimer = 0;
    return spotifyFetch("/spotify/sleep-timer", { method: "DELETE" })
      .then(function (data) {
        applySpotifySleepTimerStatus(data);
        if (closeMenu !== false) closeSpotifySleepMenu();
        return data;
      })
      .catch(function () {
        renderSpotifySleepTimer();
        scheduleSpotifySleepTick();
      });
  }
  function setSpotifySleepTimer(minutes) {
    minutes = Math.max(0, Number(minutes) || 0);
    if (!minutes) return stopSpotifySleepTimer(true);
    return spotifyFetch("/spotify/sleep-timer", {
      method: "PUT",
      body: { minutes: minutes },
    })
      .then(function (data) {
        applySpotifySleepTimerStatus(data);
        closeSpotifySleepMenu();
        return data;
      })
      .catch(function () {
        renderSpotifySleepTimer();
      });
  }
  function tickSpotifySleepTimer() {
    if (!spotifySleepUntil) {
      renderSpotifySleepTimer();
      return;
    }
    var remaining = spotifySleepUntil - Date.now();
    if (remaining <= 0) {
      spotifySleepUntil = 0;
      renderSpotifySleepTimer();
      spotifyFetch("/spotify/sleep-timer", { cache: "no-store" })
        .then(applySpotifySleepTimerStatus)
        .catch(function () {});
      return;
    }
    renderSpotifySleepTimer();
  }
  function scheduleSpotifySleepTick() {
    clearTimeout(spotifySleepTimer);
    spotifySleepTimer = 0;
    if (!spotifySleepUntil) return;
    var delay = Math.min(
      60000,
      Math.max(250, spotifySleepUntil - Date.now() + 80),
    );
    spotifySleepTimer = setTimeout(function () {
      tickSpotifySleepTimer();
      scheduleSpotifySleepTick();
    }, delay);
  }
  function initSpotifySleepTimer() {
    if (spotifySleepInitialized) return;
    spotifySleepInitialized = true;
    if (spotifySleepMenu && spotifySleepMenu.parentNode !== document.body)
      document.body.appendChild(spotifySleepMenu);
    if (spotifySleepBtn)
      spotifySleepBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!spotifySleepMenu) return;
        var show = !spotifySleepMenu.classList.contains("show");
        spotifySleepMenu.classList.toggle("show", show);
        spotifySleepBtn.setAttribute(
          "aria-expanded",
          show ? "true" : "false",
        );
        if (show) positionSpotifySleepMenu();
      });
    if (spotifySleepMenu)
      spotifySleepMenu.addEventListener("click", function (e) {
        e.stopPropagation();
        var b = e.target.closest
          ? e.target.closest("[data-sleep-minutes]")
          : null;
        if (!b) return;
        setSpotifySleepTimer(
          Number(b.getAttribute("data-sleep-minutes")) || 0,
        );
      });
    document.addEventListener("click", function (e) {
      if (
        spotifySleepWrap &&
        !spotifySleepWrap.contains(e.target) &&
        spotifySleepMenu &&
        !spotifySleepMenu.contains(e.target)
      )
        closeSpotifySleepMenu();
    });
    window.addEventListener("resize", function () {
      if (spotifySleepMenu && spotifySleepMenu.classList.contains("show"))
        positionSpotifySleepMenu();
    });
    spotifyFetch("/spotify/sleep-timer", { cache: "no-store" })
      .then(applySpotifySleepTimerStatus)
      .catch(function () {
        renderSpotifySleepTimer();
      });
    setInterval(function () {
      if (document.hidden) return;
      spotifyFetch("/spotify/sleep-timer", { cache: "no-store" })
        .then(applySpotifySleepTimerStatus)
        .catch(function () {});
    }, 15000);
  }

  function deviceLabel(d) {
    if (!d)
      return spotifyT(
        "SPOTIFY_NO_ACTIVE_DEVICE",
        "Không có thiết bị đang hoạt động",
      );
    return (
      (d.name || "Spotify") +
      (d.id === spotifyLocalDeviceId
        ? " · " + spotifyT("SPOTIFY_THIS_IPAD", "iPad này")
        : "")
    );
  }
  function refreshSpotifyDevices() {
    if (!spotifyConnected) return Promise.resolve([]);
    return spotifyFetch("/spotify/devices", { cache: "no-store" })
      .then(function (data) {
        spotifyDevices = data.devices || [];
        if (
          spotifyLocalDeviceId &&
          !spotifyDevices.some(function (d) {
            return d.id === spotifyLocalDeviceId;
          })
        )
          spotifyDevices.unshift({
            id: spotifyLocalDeviceId,
            name: SPOTIFY_BROWSER_DEVICE_NAME,
            type: "Computer",
            isActive: false,
            isRestricted: false,
            local: true,
          });
        targetDeviceId();
        renderSpotifyDevices();
        return spotifyDevices;
      })
      .catch(function () {
        return [];
      });
  }
  function renderSpotifyDevices() {
    if (!spotifyDeviceMenu) return;
    spotifyDeviceMenu.innerHTML = "";
    if (!spotifyDevices.length) {
      spotifyDeviceMenu.innerHTML =
        '<div class="music-search-status">' +
        spotifyT(
          "SPOTIFY_NO_CONNECT_DEVICES",
          "Không có thiết bị Spotify Connect",
        ) +
        "</div>";
      return;
    }
    spotifyDevices.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className =
        "spotify-device-option" +
        (String(d.id) === String(targetDeviceId()) ? " active" : "");
      var dot = document.createElement("span");
      dot.className = "device-dot";
      var c = document.createElement("span");
      c.style.minWidth = "0";
      c.style.flex = "1";
      var strong = document.createElement("strong");
      strong.textContent = deviceLabel(d);
      var small = document.createElement("small");
      small.textContent = spotifyDeviceType(d.type);
      c.appendChild(strong);
      c.appendChild(small);
      b.appendChild(dot);
      b.appendChild(c);
      b.addEventListener("click", function () {
        activateSpotifyElement();
        spotifyTargetDeviceId = d.id;
        if (spotifyDeviceName) spotifyDeviceName.textContent = deviceLabel(d);
        spotifyDeviceMenu.classList.remove("show");
        spotifyFetch("/spotify/transfer", {
          method: "PUT",
          body: { deviceId: d.id, play: false },
        })
          .then(function () {
            setTimeout(refreshSpotifyPlayer, 300);
          })
          .catch(function (e) {
            if (spotifySdkNote)
              spotifySdkNote.textContent = spotifyT(
                "SPOTIFY_TRANSFER_FAILED",
                "Không thể chuyển thiết bị phát",
              );
          });
      });
      spotifyDeviceMenu.appendChild(b);
    });
  }
  if (spotifyDeviceBtn)
    spotifyDeviceBtn.addEventListener("click", function () {
      if (!spotifyConnected) return;
      refreshSpotifyDevices().then(function () {
        spotifyDeviceMenu.classList.toggle("show");
      });
    });
  if (spotifyConnectBtn)
    spotifyConnectBtn.addEventListener("click", function () {
      window.location.href = "/spotify/login";
    });

  function reconcileSpotifyAfterResume() {
    if (!spotifyConnected) return;
    // iOS Safari may restore/suspend this page without doing a real reload. Force a
    // fresh Web API state read, then repair lyrics if the visible track and lyric key
    // ever diverged while the page was backgrounded.
    refreshSpotifyPlayer()
      .then(function () {
        var key = spotifyTrackKey(currentTrack);
        if (currentTrack && key && key !== lyricTrackKey)
          loadLyricsForTrack(currentTrack);
      })
      .catch(function () {})
      .then(function () {
        scheduleSpotifyPoll();
      });
  }
  function spotifyFallbackPollDelay() {
    if (document.hidden) return SPOTIFY_POLL_HIDDEN_MS;
    var activeDeviceId = String(
        (spotifyState.device && spotifyState.device.id) || "",
      ),
      localSdkIsCurrent = !!(
        spotifySdkReady &&
        spotifyLocalDeviceId &&
        activeDeviceId === String(spotifyLocalDeviceId) &&
        Date.now() - spotifyLastSdkStateAt < SPOTIFY_POLL_LOCAL_SDK_MS * 2
      );
    if (localSdkIsCurrent) return SPOTIFY_POLL_LOCAL_SDK_MS;
    if (currentView === "media" && spotifyState.isPlaying)
      return SPOTIFY_POLL_REMOTE_ACTIVE_MS;
    return SPOTIFY_POLL_IDLE_MS;
  }
  function scheduleSpotifyPoll(delay) {
    clearTimeout(spotifyPollTimer);
    if (!spotifyConnected) return;
    var next = Number(delay);
    if (!isFinite(next)) next = spotifyFallbackPollDelay();
    if (Date.now() < spotifyCooldownUntil)
      next = Math.max(next, spotifyCooldownUntil - Date.now() + 1000);
    spotifyPollTimer = setTimeout(
      function () {
        refreshSpotifyPlayer().then(function () {
          scheduleSpotifyPoll();
        });
      },
      Math.max(1000, next),
    );
  }
  function scheduleSpotifyTicker() {
    clearTimeout(spotifyTicker);
    if (!document.hidden) updateSpotifyProgress();
    spotifyTicker = setTimeout(
      scheduleSpotifyTicker,
      !document.hidden && currentView === "media" && spotifyState.isPlaying
        ? 160
        : 1000,
    );
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) reconcileSpotifyAfterResume();
    else scheduleSpotifyPoll();
  });
  window.addEventListener("pageshow", function () {
    setTimeout(reconcileSpotifyAfterResume, 80);
  });
  window.addEventListener("focus", function () {
    setTimeout(reconcileSpotifyAfterResume, 80);
  });

  function initSpotify() {
    syncSpotifyRepeatButton(spotifyState.repeat);
    initSpotifySleepTimer();
    spotifyFetch("/spotify/status", { cache: "no-store" })
      .then(function (status) {
        spotifyConfigured = !!status.configured;
        spotifyProfileName =
          (status.profile && status.profile.displayName) || "Spotify Premium";
        if (status.deviceName)
          SPOTIFY_BROWSER_DEVICE_NAME = String(status.deviceName);
        showSpotifyConnectedUI(!!status.connected);
        if (!status.configured) {
          if (spotifyConnectCard) {
            spotifyConnectCard.classList.add("show");
            spotifyConnectCard.querySelector("strong").textContent =
              spotifyT("SPOTIFY_CONFIGURE_FIRST", "Hãy cấu hình Spotify trước");
            spotifyConnectCard.querySelector("span").textContent =
              spotifyT(
                "SPOTIFY_CONFIGURE_HELP",
                "Điền thông tin ứng dụng Spotify trong .env, sau đó khởi động lại server.",
              );
          }
          return;
        }
        if (!status.connected) return;
        if (spotifySdkNote)
          spotifySdkNote.textContent = spotifyT(
            "SPOTIFY_CONNECTED_AS",
            "Đã kết nối với tư cách {NAME}",
            {
              NAME: spotifyProfileName,
            },
          );
        loadSpotifySdk();
        refreshSpotifyPlayer().then(function () {
          scheduleSpotifyPoll();
        });
      })
      .catch(function (e) {
        showSpotifyConnectedUI(false);
        if (spotifySdkNote)
          spotifySdkNote.textContent = spotifyT(
            "SPOTIFY_UNAVAILABLE",
            "Spotify không khả dụng",
          );
      });
    scheduleSpotifyTicker();
  }

  window.addEventListener("frame:languagechange", function () {
    if (!spotifyConnected) showSpotifyConnectedUI(false);
    if (!spotifyConfigured && spotifyConnectCard) {
      var heading = spotifyConnectCard.querySelector("strong");
      var help = spotifyConnectCard.querySelector("span");
      if (heading)
        heading.textContent = spotifyT(
          "SPOTIFY_CONFIGURE_FIRST",
          "Hãy cấu hình Spotify trước",
        );
      if (help)
        help.textContent = spotifyT(
          "SPOTIFY_CONFIGURE_HELP",
          "Điền thông tin ứng dụng Spotify trong .env, sau đó khởi động lại server.",
        );
    } else if (spotifyConnected && spotifySdkNote && spotifyProfileName) {
      spotifySdkNote.textContent = spotifyT(
        "SPOTIFY_CONNECTED_AS",
        "Đã kết nối với tư cách {NAME}",
        { NAME: spotifyProfileName },
      );
    }
    if (currentTrack) {
      setMediaState(
        spotifyState.isPlaying
          ? spotifyT("SPOTIFY_PLAYING", "Đang phát")
          : spotifyT("SPOTIFY_PAUSED", "Tạm dừng"),
      );
    }
    if (spotifyState.device && spotifyDeviceName)
      spotifyDeviceName.textContent = deviceLabel(spotifyState.device);
    syncSpotifyRepeatButton(spotifyState.repeat);
    if (spotifyArt && currentTrack)
      spotifyArt.alt = spotifyT(
        "SPOTIFY_ARTWORK_NAMED",
        "Ảnh bìa {NAME}",
        {
          NAME: currentTrack.album || currentTrack.title || "Spotify",
        },
      );
    if (lyricLines.length) renderLyrics();
    renderSpotifySleepTimer();
    if (spotifyDeviceMenu && spotifyDeviceMenu.classList.contains("show"))
      renderSpotifyDevices();
  });
