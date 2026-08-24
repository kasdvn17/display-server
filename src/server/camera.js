// ---------------- WebRTC camera / intercom signaling ----------------
// Media flows peer-to-peer. The server only exchanges SDP/ICE messages and never
// receives camera/audio bytes. One remote viewer is allowed at a time.
app.get("/camera/config", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    enabled: !!CAMERA_REMOTE_TOKEN,
    secureContextRequired: true,
    iceServers: cameraIceServers(),
    viewerUrl: "/camera",
  });
});

app.post("/camera/call", (req, res) => {
  if (!cameraAuth(req.body && req.body.token))
    return res.status(401).json({ error: "Invalid camera token" });
  cameraCleanup();
  for (const call of cameraCalls.values()) {
    if (
      !call.ended &&
      ["ringing", "connecting", "connected"].includes(call.status)
    ) {
      return res
        .status(409)
        .json({ error: "Nest Frame is already in another camera session" });
    }
  }
  const now = Date.now();
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  const viewerName =
    String((req.body && req.body.name) || "Remote viewer")
      .trim()
      .slice(0, 60) || "Remote viewer";
  const call = {
    id,
    viewerName,
    status: "ringing",
    createdAt: now,
    updatedAt: now,
    viewerHeartbeat: now,
    frameHeartbeat: 0,
    viewerSeq: 0,
    viewerQueue: [],
    ended: false,
  };
  cameraCalls.set(id, call);
  cameraPushFrame({
    type: "start",
    callId: id,
    viewerName,
    iceServers: cameraIceServers(),
  });
  res
    .status(201)
    .json({ callId: id, viewerName, iceServers: cameraIceServers() });
});

app.get("/camera/frame/poll", (req, res) => {
  const after = Math.max(0, Number(req.query.after || 0) || 0);
  cameraCleanup();
  const messages = cameraFrameQueue
    .filter((m) => {
      if (m.seq <= after) return false;
      if (m.type === "end" || !m.callId) return true;
      const call = cameraCalls.get(String(m.callId));
      return !!(call && !call.ended);
    })
    .slice(0, 80);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    messages,
    cursor: messages.length
      ? messages[messages.length - 1].seq
      : Math.max(after, cameraFrameSeq),
  });
});

app.post("/camera/frame/signal", (req, res) => {
  const call = cameraCalls.get(String((req.body && req.body.callId) || ""));
  if (!call || call.ended)
    return res.status(404).json({ error: "Camera call not found" });
  const type = String(req.body.type || "");
  if (
    ![
      "offer",
      "candidate",
      "ready",
      "connected",
      "error",
      "end",
      "heartbeat",
    ].includes(type)
  )
    return res.status(400).json({ error: "Invalid camera signal" });
  call.frameHeartbeat = Date.now();
  call.updatedAt = Date.now();
  if (type === "ready") call.status = "connecting";
  if (type === "connected") call.status = "connected";
  if (type === "end") {
    cameraEndCall(call, "frame-ended");
    return res.json({ ok: true });
  }
  cameraPushViewer(call, {
    type,
    callId: call.id,
    payload: req.body.payload || null,
  });
  res.json({ ok: true });
});

function getViewerCall(req) {
  const token =
    req.method === "GET" ? req.query.token : req.body && req.body.token;
  if (!cameraAuth(token)) return null;
  const callId = String(
    req.method === "GET"
      ? req.query.callId
      : (req.body && req.body.callId) || "",
  );
  const call = cameraCalls.get(callId);
  return call && !call.ended ? call : null;
}

app.get("/camera/viewer/poll", (req, res) => {
  if (!cameraAuth(req.query.token))
    return res.status(401).json({ error: "Unauthorized" });
  const call = cameraCalls.get(String(req.query.callId || ""));
  if (!call) return res.status(404).json({ error: "Camera session not found" });
  const after = Math.max(0, Number(req.query.after || 0) || 0);
  if (!call.ended) {
    call.viewerHeartbeat = Date.now();
    call.updatedAt = Date.now();
  }
  const messages = call.viewerQueue.filter((m) => m.seq > after).slice(0, 80);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: call.status,
    ended: !!call.ended,
    messages,
    cursor: messages.length ? messages[messages.length - 1].seq : after,
  });
});

app.post("/camera/viewer/signal", (req, res) => {
  const call = getViewerCall(req);
  if (!call)
    return res
      .status(401)
      .json({ error: "Camera session not found or access denied" });
  const type = String(req.body.type || "");
  if (!["answer", "candidate", "end", "heartbeat"].includes(type))
    return res.status(400).json({ error: "Invalid camera signal" });
  call.viewerHeartbeat = Date.now();
  call.updatedAt = Date.now();
  if (type === "end") {
    cameraEndCall(call, "viewer-ended");
    return res.json({ ok: true });
  }
  cameraPushFrame({ type, callId: call.id, payload: req.body.payload || null });
  res.json({ ok: true });
});
