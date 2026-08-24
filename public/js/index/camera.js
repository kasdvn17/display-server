/* ---------------- FRONT CAMERA + TWO-WAY INTERCOM ----------------
   Remote viewer: https://display.example.com/camera
   Signaling is same-origin HTTP; camera/audio stay peer-to-peer over WebRTC.
   The frame auto-answers authorized viewer sessions. A one-time tap on the
   Home camera chip grants camera/mic permission and unlocks iOS audio.
------------------------------------------------------------------- */
var cameraHomeChip = document.getElementById("camera-home-chip");
var cameraChipCopy = document.getElementById("camera-chip-copy");
var cameraRemoteAudio = document.getElementById("camera-remote-audio");
var cameraRemoteVideo = document.getElementById("camera-remote-video");
var cameraCallScreen = document.getElementById("call-screen");
var cameraCallViewerName = document.getElementById("call-viewer-name");
var cameraCallHomeBtn = document.getElementById("call-home-btn");
var cameraCallEndBtn = document.getElementById("call-end-btn");
var cameraFrameCursor = 0;
var cameraFramePollTimer = null;
var cameraPc = null;
var cameraLocalStream = null;
var cameraCallId = "";
var cameraViewerName = "Người xem từ xa";
var cameraPendingCandidates = [];
var cameraConfigured = false;
var cameraCallEnding = false;
var cameraRemoteStream = null;
var cameraCallViewDismissed = false;

function cameraSetStatus(state, text) {
  syncIdleCamera(state, text);
  if (cameraHomeChip)
    cameraHomeChip.setAttribute("data-state", state || "ready");
  if (cameraChipCopy) cameraChipCopy.textContent = text || "Camera sẵn sàng";
  if (cameraHomeChip)
    cameraHomeChip.setAttribute("aria-label", text || "Camera sẵn sàng");
  var globalStatus = document.getElementById("top-status-text");
  if (globalStatus) {
    if (state === "live") globalStatus.textContent = "Camera trực tiếp";
    else if (state === "connecting")
      globalStatus.textContent = "Cuộc gọi đến";
    else globalStatus.textContent = "Trực tuyến";
  }
}

function cameraConstraints() {
  return {
    video: {
      facingMode: "user",
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 24, max: 30 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

function cameraStopLocal() {
  if (cameraLocalStream) {
    cameraLocalStream.getTracks().forEach(function (track) {
      try {
        track.stop();
      } catch (e) { }
    });
    cameraLocalStream = null;
  }
}

function cameraClosePeer(keepStatus) {
  if (cameraPc) {
    try {
      cameraPc.ontrack = null;
      cameraPc.onicecandidate = null;
      cameraPc.onconnectionstatechange = null;
      cameraPc.close();
    } catch (e) { }
    cameraPc = null;
  }
  cameraStopLocal();
  cameraPendingCandidates = [];
  cameraCallId = "";
  cameraCallEnding = false;
  if (cameraRemoteAudio) {
    cameraRemoteAudio.pause();
    cameraRemoteAudio.srcObject = null;
    cameraRemoteAudio.muted = false;
  }
  if (cameraRemoteVideo) {
    cameraRemoteVideo.pause();
    cameraRemoteVideo.srcObject = null;
  }
  cameraRemoteStream = null;
  cameraCallViewDismissed = false;
  if (cameraCallScreen) cameraCallScreen.classList.remove("has-video");
  if (
    typeof currentView !== "undefined" &&
    currentView === "call" &&
    typeof switchView === "function"
  )
    switchView("home");
  if (!keepStatus) {
    if (localStorage.getItem("nestframe-camera-enabled") === "1")
      cameraSetStatus("ready", "Camera sẵn sàng");
    else cameraSetStatus("setup", "Bật camera liên lạc");
  }
}

function cameraFrameSignal(type, payload) {
  if (!cameraCallId) return Promise.resolve();
  return fetch("/camera/frame/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callId: cameraCallId,
      type: type,
      payload: payload || null,
    }),
  }).then(function (r) {
    if (!r.ok) throw new Error("signal " + r.status);
    return r.json();
  });
}

function cameraAddCandidate(candidate) {
  if (!cameraPc || !candidate) return;
  if (cameraPc.remoteDescription && cameraPc.remoteDescription.type) {
    cameraPc
      .addIceCandidate(new RTCIceCandidate(candidate))
      .catch(function () { });
  } else cameraPendingCandidates.push(candidate);
}

function cameraFlushCandidates() {
  if (!cameraPc || !cameraPc.remoteDescription) return;
  var pending = cameraPendingCandidates.splice(0);
  pending.forEach(function (c) {
    cameraPc.addIceCandidate(new RTCIceCandidate(c)).catch(function () { });
  });
}

function cameraAutoAnswer(start) {
  exitIdle(false);
  if (
    !window.RTCPeerConnection ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    cameraSetStatus("error", "Không hỗ trợ camera");
    cameraCallId = start.callId || "";
    cameraFrameSignal("error", {
      message: "WebRTC hoặc getUserMedia không khả dụng",
    }).catch(function () { });
    return;
  }
  cameraClosePeer(true);
  cameraCallId = start.callId || "";
  cameraViewerName = start.viewerName || "Người xem từ xa";
  cameraCallViewDismissed = false;
  if (cameraCallViewerName)
    cameraCallViewerName.textContent = cameraViewerName;
  cameraSetStatus("connecting", "Đang kết nối · " + cameraViewerName);
  navigator.mediaDevices
    .getUserMedia(cameraConstraints())
    .then(function (stream) {
      cameraLocalStream = stream;
      localStorage.setItem("nestframe-camera-enabled", "1");
      var pc = new RTCPeerConnection({ iceServers: start.iceServers || [] });
      cameraPc = pc;
      stream.getTracks().forEach(function (track) {
        pc.addTrack(track, stream);
      });
      pc.ontrack = function (ev) {
        var remote = ev.streams && ev.streams[0];
        if (!remote) return;
        cameraRemoteStream = remote;
        var hasVideo =
          remote.getVideoTracks && remote.getVideoTracks().length > 0;
        if (hasVideo && cameraRemoteVideo) {
          cameraRemoteVideo.srcObject = remote;
          if (cameraCallScreen) cameraCallScreen.classList.add("has-video");
          if (cameraRemoteAudio) {
            cameraRemoteAudio.pause();
            cameraRemoteAudio.srcObject = null;
            cameraRemoteAudio.muted = true;
          }
          var vp = cameraRemoteVideo.play();
          if (vp && vp.catch)
            vp.catch(function () {
              cameraSetStatus("connecting", "Chạm nút camera để nghe âm thanh");
            });
          if (!cameraCallViewDismissed && typeof switchView === "function")
            switchView("call");
        } else if (cameraRemoteAudio) {
          cameraRemoteAudio.muted = false;
          cameraRemoteAudio.srcObject = remote;
          var playPromise = cameraRemoteAudio.play();
          if (playPromise && playPromise.catch)
            playPromise.catch(function () {
              cameraSetStatus("connecting", "Chạm nút camera để nghe âm thanh");
            });
        }
      };
      pc.onicecandidate = function (ev) {
        if (ev.candidate)
          cameraFrameSignal(
            "candidate",
            ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate,
          ).catch(function () { });
      };
      pc.onconnectionstatechange = function () {
        var st = pc.connectionState || pc.iceConnectionState;
        if (st === "connected" || st === "completed") {
          cameraSetStatus("live", "Camera trực tiếp · " + cameraViewerName);
          cameraFrameSignal("connected", {
            viewerName: cameraViewerName,
          }).catch(function () { });
        } else if (st === "failed" || st === "closed") {
          if (!cameraCallEnding)
            cameraSetStatus("error", "Camera đã ngắt kết nối");
          setTimeout(function () {
            cameraClosePeer(false);
          }, 1200);
        }
      };
      cameraFrameSignal("ready", { viewerName: cameraViewerName }).catch(
        function () { },
      );
      return pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
    })
    .then(function (offer) {
      if (!cameraPc) return;
      return cameraPc.setLocalDescription(offer).then(function () {
        return cameraFrameSignal("offer", cameraPc.localDescription);
      });
    })
    .catch(function (err) {
      cameraSetStatus(
        "error",
        err && err.name === "NotAllowedError"
          ? "Cần cấp quyền camera"
          : "Camera không khả dụng",
      );
      cameraFrameSignal("error", {
        message: (err && err.message) || "Không thể mở camera trước",
      }).catch(function () { });
      cameraClosePeer(true);
    });
}

function cameraHandleFrameMessage(msg) {
  if (!msg) return;
  if (msg.type === "start") {
    if (cameraCallId && cameraCallId !== msg.callId)
      cameraFrameSignal("end", { reason: "replaced" }).catch(function () { });
    cameraAutoAnswer(msg);
    return;
  }
  if (!cameraCallId || msg.callId !== cameraCallId) return;
  if (msg.type === "answer" && msg.payload && cameraPc) {
    cameraPc
      .setRemoteDescription(new RTCSessionDescription(msg.payload))
      .then(cameraFlushCandidates)
      .catch(function () {
        cameraSetStatus("error", "Không thể thiết lập cuộc gọi");
      });
  } else if (msg.type === "candidate" && msg.payload) {
    cameraAddCandidate(msg.payload);
  } else if (msg.type === "end") {
    cameraCallEnding = true;
    cameraClosePeer(false);
  }
}

function cameraPollFrame() {
  fetch("/camera/frame/poll?after=" + encodeURIComponent(cameraFrameCursor), {
    cache: "no-store",
  })
    .then(function (r) {
      if (!r.ok) throw new Error("poll " + r.status);
      return r.json();
    })
    .then(function (data) {
      if (data && typeof data.cursor === "number")
        cameraFrameCursor = data.cursor;
      ((data && data.messages) || []).forEach(cameraHandleFrameMessage);
    })
    .catch(function () { })
    .then(function () {
      cameraFramePollTimer = setTimeout(cameraPollFrame, 650);
    });
}

function cameraEnableOnce() {
  if (cameraCallId) {
    cameraCallViewDismissed = false;
    if (
      cameraRemoteStream &&
      cameraRemoteStream.getVideoTracks &&
      cameraRemoteStream.getVideoTracks().length &&
      typeof switchView === "function"
    )
      switchView("call");
    if (cameraRemoteVideo && cameraRemoteVideo.srcObject) {
      var vp = cameraRemoteVideo.play();
      if (vp && vp.catch) vp.catch(function () { });
    } else if (cameraRemoteAudio) {
      var pp = cameraRemoteAudio.play();
      if (pp && pp.catch) pp.catch(function () { });
    }
    return;
  }
  if (!window.isSecureContext) {
    cameraSetStatus("error", "Cần sử dụng HTTPS");
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraSetStatus("error", "Không hỗ trợ camera");
    return;
  }
  cameraSetStatus("connecting", "Enabling camera…");
  navigator.mediaDevices
    .getUserMedia(cameraConstraints())
    .then(function (stream) {
      localStorage.setItem("nestframe-camera-enabled", "1");
      stream.getTracks().forEach(function (t) {
        t.stop();
      });
      cameraSetStatus("ready", "Camera sẵn sàng");
      if (cameraRemoteAudio) {
        var pp = cameraRemoteAudio.play();
        if (pp && pp.catch) pp.catch(function () { });
      }
    })
    .catch(function (err) {
      cameraSetStatus(
        "error",
        err && err.name === "NotAllowedError"
          ? "Quyền camera bị từ chối"
          : "Camera không khả dụng",
      );
    });
}

if (cameraHomeChip)
  cameraHomeChip.addEventListener("click", cameraEnableOnce);
if (cameraCallHomeBtn)
  cameraCallHomeBtn.addEventListener("click", function () {
    cameraCallViewDismissed = true;
    if (typeof switchView === "function") switchView("home");
  });
if (cameraCallEndBtn)
  cameraCallEndBtn.addEventListener("click", function () {
    if (!cameraCallId) return;
    cameraCallEnding = true;
    cameraFrameSignal("end", { reason: "frame" })
      .catch(function () { })
      .then(function () {
        cameraClosePeer(false);
      });
  });
fetch("/camera/config", { cache: "no-store" })
  .then(function (r) {
    return r.json();
  })
  .then(function (cfg) {
    cameraConfigured = !!(cfg && cfg.enabled);
    if (!cameraConfigured) cameraSetStatus("error", "Chưa cấu hình camera");
    else if (!window.isSecureContext)
      cameraSetStatus("error", "Cần sử dụng HTTPS");
    else if (localStorage.getItem("nestframe-camera-enabled") === "1")
      cameraSetStatus("ready", "Camera sẵn sàng");
    else cameraSetStatus("setup", "Bật camera liên lạc");
    if (cameraConfigured) cameraPollFrame();
  })
  .catch(function () {
    cameraSetStatus("error", "Dịch vụ camera ngoại tuyến");
  });
