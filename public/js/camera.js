(function () {
  "use strict";
  function cameraT(key, fallback, variables) {
    return window.FrameI18n
      ? window.FrameI18n.t(key, fallback, variables)
      : String(fallback || key);
  }
  var stage = document.getElementById("stage"),
    form = document.getElementById("form"),
    tokenInput = document.getElementById("token"),
    nameInput = document.getElementById("name"),
    shareVideo = document.getElementById("share-video"),
    startBtn = document.getElementById("start"),
    endBtn = document.getElementById("end"),
    errorEl = document.getElementById("error"),
    stateTitle = document.getElementById("state-title"),
    stateDetail = document.getElementById("state-detail"),
    remoteVideo = document.getElementById("remote-video"),
    localVideo = document.getElementById("local-video");
  var token = "",
    callId = "",
    pc = null,
    localStream = null,
    remoteStream = null,
    cursor = 0,
    pollTimer = 0,
    connectTimer = 0,
    pendingCandidates = [],
    epoch = 0,
    ending = false;
  var CAMERA_POLL_VISIBLE_MS = 650,
    CAMERA_POLL_HIDDEN_MS = 1800,
    CAMERA_CONNECT_TIMEOUT_MS = 30000;
  try {
    tokenInput.value = localStorage.getItem("nestframe-camera-token") || "";
    nameInput.value =
      localStorage.getItem("nestframe-camera-name") || cameraT("REMOTE_VIEWER", "Remote viewer");
  } catch (_) {}
  fetch("/frame/bootstrap", { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.json() : {};
    })
    .then(function (data) {
      var vars = (data && data.themeVariables) || {},
        timing = (data && data.timing) || {},
        root = document.documentElement.style;
      Object.keys(vars).forEach(function (key) {
        if (/^--theme-/.test(key)) root.setProperty(key, String(vars[key]));
      });
      if (isFinite(Number(timing.cameraPollVisibleMs)))
        CAMERA_POLL_VISIBLE_MS = Number(timing.cameraPollVisibleMs);
      if (isFinite(Number(timing.cameraPollHiddenMs)))
        CAMERA_POLL_HIDDEN_MS = Number(timing.cameraPollHiddenMs);
      if (isFinite(Number(timing.cameraConnectTimeoutMs)))
        CAMERA_CONNECT_TIMEOUT_MS = Number(timing.cameraConnectTimeoutMs);
    })
    .catch(function () {});
  function showError(value) {
    errorEl.textContent = String(value || "");
    errorEl.classList.toggle("show", !!value);
  }
  function state(title, detail, live) {
    stateTitle.textContent = title;
    stateDetail.textContent = detail || "";
    stage.classList.toggle("live", !!live);
  }
  function jsonFetch(url, init) {
    init = init || {};
    init.headers = Object.assign(
      { Accept: "application/json" },
      init.headers || {},
    );
    if (init.body && typeof init.body !== "string") {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.body);
    }
    return fetch(url, init).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!r.ok)
            throw new Error(data.error || cameraT("REQUEST_FAILED_STATUS", "Request failed: {STATUS}", { STATUS: r.status }));
          return data;
        });
    });
  }
  function signal(type, payload) {
    if (!callId) return Promise.resolve();
    return jsonFetch("/camera/viewer/signal", {
      method: "POST",
      body: {
        token: token,
        callId: callId,
        type: type,
        payload: payload || null,
      },
    });
  }
  function stopTracks() {
    if (localStream) {
      localStream.getTracks().forEach(function (track) {
        try {
          track.stop();
        } catch (_) {}
      });
      localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    remoteStream = null;
  }
  function cleanup(keepError) {
    epoch++;
    clearTimeout(pollTimer);
    clearTimeout(connectTimer);
    pollTimer = connectTimer = 0;
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch (_) {}
      pc = null;
    }
    stopTracks();
    callId = "";
    cursor = 0;
    pendingCandidates = [];
    ending = false;
    stage.classList.remove("calling", "live", "sharing");
    startBtn.disabled = false;
    if (!keepError) showError("");
  }
  function endCall() {
    if (ending) return;
    ending = true;
    var id = callId;
    if (id)
      signal("end", { reason: "viewer" })
        .catch(function () {})
        .then(function () {
          cleanup(false);
        });
    else cleanup(false);
  }
  function addCandidate(candidate) {
    if (!candidate || !pc) return;
    if (pc.remoteDescription && pc.remoteDescription.type)
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function () {});
    else pendingCandidates.push(candidate);
  }
  function flushCandidates() {
    var list = pendingCandidates.splice(0);
    list.forEach(addCandidate);
  }
  function handleMessage(message) {
    if (!message) return;
    if (message.type === "offer" && message.payload && pc) {
      pc.setRemoteDescription(new RTCSessionDescription(message.payload))
        .then(flushCandidates)
        .then(function () {
          return pc.createAnswer();
        })
        .then(function (answer) {
          return pc.setLocalDescription(answer);
        })
        .then(function () {
          return signal("answer", pc.localDescription);
        })
        .catch(function (err) {
          fail(cameraT("CALL_SETUP_FAILED_DETAIL", "Unable to set up the camera call: {ERROR}", { ERROR: err.message }));
        });
    } else if (message.type === "candidate") addCandidate(message.payload);
    else if (message.type === "ready")
      state(cameraT("DISPLAY_ANSWERED", "The display answered"), cameraT("SECURING_DIRECT_CONNECTION", "Securing the direct connection…"), false);
    else if (message.type === "connected")
      state(cameraT("CAMERA_LIVE", "Live camera"), cameraT("CONNECTED_DIRECTLY", "Connected directly to the display"), true);
    else if (message.type === "error")
      fail(
        (message.payload && message.payload.message) ||
          cameraT("DISPLAY_CAMERA_FAILED", "The display could not open its camera"),
      );
    else if (message.type === "end") fail(cameraT("DISPLAY_ENDED_CALL", "The display ended the call"));
  }
  function schedulePoll(myEpoch) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(
      function () {
        poll(myEpoch);
      },
      document.hidden ? CAMERA_POLL_HIDDEN_MS : CAMERA_POLL_VISIBLE_MS,
    );
  }
  function poll(myEpoch) {
    if (myEpoch !== epoch || !callId) return;
    jsonFetch(
      "/camera/viewer/poll?token=" +
        encodeURIComponent(token) +
        "&callId=" +
        encodeURIComponent(callId) +
        "&after=" +
        cursor,
      { cache: "no-store" },
    )
      .then(function (data) {
        if (myEpoch !== epoch) return;
        if (typeof data.cursor === "number") cursor = data.cursor;
        (data.messages || []).forEach(handleMessage);
        if (data.ended) throw new Error(cameraT("CAMERA_SESSION_ENDED", "The camera session has ended"));
        schedulePoll(myEpoch);
      })
      .catch(function (err) {
        if (myEpoch === epoch) fail(err.message || cameraT("CAMERA_CONNECTION_LOST", "The camera connection was lost"));
      });
  }
  function fail(message) {
    var id = callId;
    if (id && !ending) {
      ending = true;
      signal("end", { reason: "viewer-error" }).catch(function () {});
    }
    cleanup(true);
    showError(message);
  }
  function createPeer(iceServers, myEpoch) {
    pc = new RTCPeerConnection({ iceServers: iceServers || [] });
    localStream.getTracks().forEach(function (track) {
      pc.addTrack(track, localStream);
    });
    pc.onicecandidate = function (ev) {
      if (ev.candidate && myEpoch === epoch)
        signal(
          "candidate",
          ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate,
        ).catch(function () {});
    };
    pc.ontrack = function (ev) {
      if (myEpoch !== epoch) return;
      remoteStream =
        (ev.streams && ev.streams[0]) || remoteStream || new MediaStream();
      if (!ev.streams || !ev.streams[0]) remoteStream.addTrack(ev.track);
      remoteVideo.srcObject = remoteStream;
      var play = remoteVideo.play();
      if (play && play.catch)
        play.catch(function () {
          state(cameraT("TAP_TO_HEAR_AUDIO", "Tap to hear audio"), cameraT("AUTOPLAY_PAUSED", "The browser paused autoplay"), true);
        });
    };
    pc.onconnectionstatechange = function () {
      if (myEpoch !== epoch) return;
      var s = pc.connectionState || pc.iceConnectionState;
      if (s === "connected" || s === "completed") {
        clearTimeout(connectTimer);
        state(cameraT("CAMERA_LIVE", "Live camera"), cameraT("CONNECTED_DIRECTLY", "Connected directly to the display"), true);
      } else if (s === "failed" || s === "closed" || s === "disconnected")
        fail(cameraT("DIRECT_CAMERA_LOST", "The direct camera connection was lost"));
    };
  }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (callId) return;
    showError("");
    token = tokenInput.value.trim();
    var viewerName = nameInput.value.trim() || cameraT("REMOTE_VIEWER", "Remote viewer");
    if (!token) {
      showError(cameraT("ENTER_CAMERA_TOKEN", "Enter CAMERA_REMOTE_TOKEN"));
      return;
    }
    if (
      !window.isSecureContext ||
      !window.RTCPeerConnection ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showError(cameraT("OPEN_WITH_HTTPS_WEBRTC", "Open this page over HTTPS in a WebRTC-capable browser"));
      return;
    }
    try {
      localStorage.setItem("nestframe-camera-token", token);
      localStorage.setItem("nestframe-camera-name", viewerName);
    } catch (_) {}
    startBtn.disabled = true;
    stage.classList.add("calling");
    state(cameraT("OPENING_MICROPHONE", "Opening microphone…"), cameraT("GRANT_PERMISSION", "Grant permission when the browser asks"), false);
    var myEpoch = ++epoch;
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: shareVideo.checked
          ? {
              facingMode: "user",
              width: { ideal: 720 },
              height: { ideal: 960 },
            }
          : false,
      })
      .then(function (stream) {
        if (myEpoch !== epoch) {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          return;
        }
        localStream = stream;
        if (shareVideo.checked) {
          localVideo.srcObject = stream;
          stage.classList.add("sharing");
        }
        return jsonFetch("/camera/call", {
          method: "POST",
          body: { token: token, name: viewerName },
        });
      })
      .then(function (data) {
        if (!data || myEpoch !== epoch) return;
        callId = data.callId;
        createPeer(data.iceServers, myEpoch);
        state(cameraT("CALLING_DISPLAY", "Calling display…"), cameraT("WAITING_FOR_DISPLAY", "Waiting for the display to respond"), false);
        poll(myEpoch);
        connectTimer = setTimeout(function () {
          if (myEpoch === epoch && !stage.classList.contains("live"))
            fail(cameraT("DISPLAY_CALL_TIMEOUT", "The display did not answer before the call timed out"));
        }, CAMERA_CONNECT_TIMEOUT_MS);
      })
      .catch(function (err) {
        if (myEpoch === epoch)
          fail(err.message || cameraT("CAMERA_CALL_START_FAILED", "Unable to start the camera call"));
      });
  });
  endBtn.addEventListener("click", endCall);
  stage.addEventListener("click", function (ev) {
    if (stage.classList.contains("live") && ev.target !== endBtn) {
      var p = remoteVideo.play();
      if (p && p.catch) p.catch(function () {});
    }
  });
  window.addEventListener("beforeunload", function () {
    if (callId)
      fetch("/camera/viewer/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          callId: callId,
          type: "end",
          payload: { reason: "page-closed" },
        }),
        keepalive: true,
      }).catch(function () {});
  });
  fetch("/camera/config", { cache: "no-store" })
    .then(function (r) {
      return r.json();
    })
    .then(function (cfg) {
      if (!cfg.enabled)
        showError(cameraT("CAMERA_NOT_CONFIGURED", "Remote camera access is not configured on the server"));
    })
    .catch(function () {
      showError(cameraT("CAMERA_SERVICE_UNAVAILABLE", "Unable to connect to the camera service"));
    });
})();
