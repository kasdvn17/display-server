(function () {
  "use strict";
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
  try {
    tokenInput.value = localStorage.getItem("nestframe-camera-token") || "";
    nameInput.value =
      localStorage.getItem("nestframe-camera-name") || "Người xem từ xa";
  } catch (_) {}
  fetch("/frame/bootstrap", { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.json() : {};
    })
    .then(function (data) {
      var vars = (data && data.themeVariables) || {},
        root = document.documentElement.style;
      Object.keys(vars).forEach(function (key) {
        if (/^--theme-/.test(key)) root.setProperty(key, String(vars[key]));
      });
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
            throw new Error(data.error || "Yêu cầu thất bại: " + r.status);
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
          fail("Không thể thiết lập cuộc gọi camera: " + err.message);
        });
    } else if (message.type === "candidate") addCandidate(message.payload);
    else if (message.type === "ready")
      state("Màn hình đã trả lời", "Đang bảo mật kết nối trực tiếp…", false);
    else if (message.type === "connected")
      state("Camera trực tiếp", "Đã kết nối trực tiếp tới màn hình", true);
    else if (message.type === "error")
      fail(
        (message.payload && message.payload.message) ||
          "Màn hình không thể mở camera",
      );
    else if (message.type === "end") fail("Màn hình đã kết thúc cuộc gọi");
  }
  function schedulePoll(myEpoch) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(
      function () {
        poll(myEpoch);
      },
      document.hidden ? 1800 : 650,
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
        if (data.ended) throw new Error("Phiên camera đã kết thúc");
        schedulePoll(myEpoch);
      })
      .catch(function (err) {
        if (myEpoch === epoch) fail(err.message || "Mất kết nối camera");
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
          state("Chạm để nghe âm thanh", "Trình duyệt đã tạm dừng phát tự động", true);
        });
    };
    pc.onconnectionstatechange = function () {
      if (myEpoch !== epoch) return;
      var s = pc.connectionState || pc.iceConnectionState;
      if (s === "connected" || s === "completed") {
        clearTimeout(connectTimer);
        state("Camera trực tiếp", "Đã kết nối trực tiếp tới màn hình", true);
      } else if (s === "failed" || s === "closed" || s === "disconnected")
        fail("Đã mất kết nối camera trực tiếp");
    };
  }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (callId) return;
    showError("");
    token = tokenInput.value.trim();
    var viewerName = nameInput.value.trim() || "Người xem từ xa";
    if (!token) {
      showError("Hãy nhập CAMERA_REMOTE_TOKEN");
      return;
    }
    if (
      !window.isSecureContext ||
      !window.RTCPeerConnection ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showError("Hãy mở trang này qua HTTPS bằng trình duyệt hỗ trợ WebRTC");
      return;
    }
    try {
      localStorage.setItem("nestframe-camera-token", token);
      localStorage.setItem("nestframe-camera-name", viewerName);
    } catch (_) {}
    startBtn.disabled = true;
    stage.classList.add("calling");
    state("Đang mở microphone…", "Hãy cấp quyền khi trình duyệt yêu cầu", false);
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
        state("Đang gọi màn hình…", "Đang chờ màn hình phản hồi", false);
        poll(myEpoch);
        connectTimer = setTimeout(function () {
          if (myEpoch === epoch && !stage.classList.contains("live"))
            fail("Màn hình không trả lời trong vòng 30 giây");
        }, 30000);
      })
      .catch(function (err) {
        if (myEpoch === epoch)
          fail(err.message || "Không thể bắt đầu cuộc gọi camera");
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
        showError("Chưa cấu hình truy cập camera từ xa trên server");
    })
    .catch(function () {
      showError("Không thể kết nối tới dịch vụ camera");
    });
})();
