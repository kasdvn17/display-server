  /* ---------------- Gemini Live Vietnamese voice assistant ---------------- */
  var voiceButton = document.getElementById("top-voice"),
    voiceShell = document.getElementById("voice-shell"),
    voiceStateEl = document.getElementById("voice-state"),
    voiceTranscript = document.getElementById("voice-transcript"),
    voiceHint = document.getElementById("voice-hint"),
    voiceClose = document.getElementById("voice-close"),
    voiceBackdrop = document.getElementById("voice-backdrop"),
    voiceAudio = document.getElementById("voice-audio");
  var assistantPage = document.getElementById("assistant-page"),
    assistantPageTitle = document.getElementById("assistant-page-title"),
    assistantPageSub = document.getElementById("assistant-page-sub"),
    assistantPageKicker = document.getElementById("assistant-page-kicker"),
    assistantPageContent = document.getElementById("assistant-page-content");
  var voiceStream = null,
    voiceAudioContext = null,
    voiceInputSource = null,
    voiceProcessor = null,
    voiceSilentGain = null,
    voiceSocket = null,
    voicePlayhead = 0,
    voiceSources = [],
    voiceStarting = false,
    voiceBusy = false,
    voiceSessionReady = false,
    voiceWasSpotifyPlaying = false,
    voiceTouchedSpotify = false,
    voiceLastUserText = "",
    voiceOutputText = "",
    voiceSpeechSeen = false,
    voiceLastLoud = 0,
    voiceInputStartedAt = 0,
    voiceTurnEndTimer = 0,
    voiceProcessingTimer = 0,
    voiceCaptureTimer = 0,
    voiceTurnEnding = false,
    voiceTurnCompleted = false,
    voiceCaptureIsFollowup = false,
    voiceFollowupRequested = false,
    voiceFollowupQuestion = "",
    voiceHandledToolCalls = {},
    voiceVisualCandidate = null,
    voiceVisualScore = -1,
    voiceVisualCommitted = false,
    voicePendingRemoteText = "",
    voiceLastError = "",
    voiceEpoch = 0;
  var VOICE_PROCESSING_TIMEOUT_MS = 35000,
    VOICE_TOOL_TIMEOUT_MS = 22000,
    VOICE_FOLLOWUP_WAIT_MS = 12000;
  function escVoice(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function safeVoiceUrl(u) {
    var raw = String(u || "").trim();
    if (!/^https?:\/\//i.test(raw)) return "";
    try {
      var x = new URL(raw);
      return x.protocol === "http:" || x.protocol === "https:" ? x.href : "";
    } catch (_) {
      return "";
    }
  }
  function setVoiceState(state, label, text, hint) {
    if (voiceShell) voiceShell.setAttribute("data-state", state || "idle");
    if (voiceStateEl) voiceStateEl.textContent = label || "";
    if (text != null && voiceTranscript) voiceTranscript.textContent = text;
    if (hint != null && voiceHint) voiceHint.textContent = hint;
  }
  function showVoiceShell() {
    if (typeof exitIdle === "function") exitIdle("voice");
    if (voiceShell) {
      voiceShell.classList.add("show");
      voiceShell.setAttribute("aria-hidden", "false");
    }
    if (voiceClose) {
      voiceClose.setAttribute(
        "aria-label",
        tr("CLOSE_ASSISTANT", "Close assistant"),
      );
      voiceClose.setAttribute("title", tr("CLOSE_ASSISTANT", "Close assistant"));
    }
    if (voiceButton) voiceButton.classList.add("active");
  }
  function hideAssistantPage() {
    if (assistantPage) {
      assistantPage.classList.remove("show");
      assistantPage.classList.remove("broadcast-page");
      assistantPage.setAttribute("aria-hidden", "true");
    }
  }
  function resetVoiceVisualState(keepCurrentPage) {
    voiceVisualCandidate = null;
    voiceVisualScore = -1;
    voiceVisualCommitted = false;
    if (!keepCurrentPage) hideAssistantPage();
  }
  function voiceVisualPriority(result, toolName) {
    var kind = String((result && result.kind) || ""),
      name = String(toolName || "");
    if (
      kind &&
      kind !== "dynamic_ui" &&
      kind !== "followup" &&
      kind !== "action"
    )
      return 100;
    if (name === "render_dynamic_ui" || kind === "dynamic_ui") return 50;
    return 10;
  }
  function commitVoiceVisual() {
    if (voiceVisualCommitted || !voiceVisualCandidate) return;
    voiceVisualCommitted = true;
    showVoiceShell();
    showAssistantPage(voiceVisualCandidate);
    voiceVisualCandidate = null;
  }
  function queueVoiceVisual(display, result, toolName) {
    if (voiceVisualCommitted || !display || display.kind !== "dynamic_ui")
      return;
    var score = voiceVisualPriority(result, toolName);
    if (score >= voiceVisualScore) {
      voiceVisualCandidate = display;
      voiceVisualScore = score;
    }
  }
  function clearVoiceProcessingTimer() {
    if (voiceProcessingTimer) {
      clearTimeout(voiceProcessingTimer);
      voiceProcessingTimer = 0;
    }
  }
  function speakVoiceNotice(text) {
    try {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text || ""));
      u.lang = frameLocale();
      u.rate = 0.96;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }
  function stopVoiceNotice() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (_) {}
  }
  function finishVoiceSessionKeepUi() {
    commitVoiceVisual();
    var keepPageControls = !!(
      assistantPage && assistantPage.classList.contains("show")
    );
    voiceEpoch++;
    clearVoiceProcessingTimer();
    if (voiceTurnEndTimer) {
      clearTimeout(voiceTurnEndTimer);
      voiceTurnEndTimer = 0;
    }
    voiceTurnEnding = false;
    closeVoiceInput();
    if (voiceSocket) {
      try {
        voiceSocket.close(1000, "session-complete");
      } catch (_) {}
    }
    voiceSocket = null;
    voiceSessionReady = false;
    closeVoiceAudioContext();
    voiceStarting = false;
    voiceBusy = false;
    if (voiceShell) {
      voiceShell.classList.toggle("show", keepPageControls);
      voiceShell.setAttribute(
        "aria-hidden",
        keepPageControls ? "false" : "true",
      );
    }
    if (keepPageControls)
      setVoiceState(
        "idle",
        tr("DONE", "Đã xong"),
        voiceOutputText.trim() ||
          (assistantPageTitle && assistantPageTitle.textContent) ||
          tr("CONTENT_DISPLAYED", "Nội dung đang hiển thị"),
        tr("PRESS_CLOSE_RETURN", "Nhấn × để quay lại trang trước"),
      );
    if (voiceButton) voiceButton.classList.remove("active");
    var shouldResume = voiceWasSpotifyPlaying && !voiceTouchedSpotify;
    if (shouldResume && typeof resumeSpotify === "function")
      setTimeout(function () {
        resumeSpotify();
      }, 180);
    voiceWasSpotifyPlaying = false;
    voiceTouchedSpotify = false;
  }
  function failVoiceAssistant(message, detail) {
    var title = String(message || tr("REQUEST_FAILED", "Không thể xử lý yêu cầu")),
      info = String(detail || "").trim(),
      spoken = info ? title + ". " + info : title;
    voiceLastError = spoken;
    clearVoiceProcessingTimer();
    stopVoicePlayback();
    finishVoiceSessionKeepUi();
    showVoiceShell();
    setVoiceState(
      "idle",
      tr("UNABLE_TO_PROCESS", "Không thể xử lý"),
      spoken,
      tr("TAP_MIC_TO_RETRY", "Chạm mic để thử lại"),
    );
    speakVoiceNotice(spoken);
    pushClientNotification(
      "client:gemini-live",
      title,
      info || tr("GEMINI_COULD_NOT_COMPLETE", "Gemini Live không thể hoàn tất yêu cầu."),
    ).then(loadNotifications);
  }
  function armVoiceProcessingTimeout(context) {
    clearVoiceProcessingTimer();
    var epoch = voiceEpoch;
    voiceProcessingTimer = setTimeout(function () {
      voiceProcessingTimer = 0;
      if (epoch === voiceEpoch)
        failVoiceAssistant(
          tr("REQUEST_FAILED", "Không thể xử lý yêu cầu"),
          tr("TIMED_OUT_CONTEXT", "Đã quá thời gian chờ{CONTEXT}.", {
            CONTEXT: context ? " " + tr("WHILE_CONTEXT", "khi {CONTEXT}", { CONTEXT: context }) : "",
          }),
        );
    }, VOICE_PROCESSING_TIMEOUT_MS);
  }
  function dynamicItemText(item) {
    return String(
      (item && (item.value || item.title || item.text || item.label || "")) ||
        "",
    );
  }
  function dynamicLink(url, label, cls) {
    var u = safeVoiceUrl(url);
    if (!u) return "";
    return (
      '<a class="' +
      (cls || "dynamic-source") +
      '" href="' +
      escVoice(u) +
      '" target="_blank" rel="noopener noreferrer">' +
      escVoice(label || tr("OPEN_SOURCE", "Mở nguồn")) +
      " ↗</a>"
    );
  }
  function formatDynamicCalendarDay(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) return String(value || "");
    try {
      return new Intl.DateTimeFormat(frameLocale(), {
        day: "2-digit",
        month: "2-digit",
        timeZone: TIMEZONE,
      }).format(date);
    } catch (_) {
      return (
        String(date.getDate()).padStart(2, "0") +
        "/" +
        String(date.getMonth() + 1).padStart(2, "0")
      );
    }
  }
  function renderDynamicWidget(widget) {
    widget = widget || {};
    var type = String(widget.type || "text"),
      items = Array.isArray(widget.items) ? widget.items : [],
      title = escVoice(widget.title || ""),
      sub = escVoice(widget.subtitle || ""),
      text = escVoice(widget.text || ""),
      value = escVoice(widget.value || ""),
      image = safeVoiceUrl(widget.image),
      url = safeVoiceUrl(widget.url || widget.href || widget.link),
      icon = escVoice(widget.icon || "");
    var head =
      (title ? '<div class="dynamic-widget-title">' + title + "</div>" : "") +
      (sub ? '<div class="dynamic-widget-subtitle">' + sub + "</div>" : "");
    if (type === "hero")
      return (
        '<div class="dynamic-hero"><div class="dynamic-hero-copy">' +
        (icon ? '<div class="dynamic-widget-kicker">' + icon + "</div>" : "") +
        head +
        (text ? '<div class="dynamic-widget-text">' + text + "</div>" : "") +
        (url
          ? '<div class="dynamic-sources">' +
            dynamicLink(url, tr("OPEN_DETAILS", "Mở chi tiết")) +
            "</div>"
          : "") +
        "</div>" +
        (image
          ? '<div class="dynamic-hero-media"><img src="' +
            escVoice(image) +
            '" alt="" onerror="this.parentNode.style.display=\'none\'"></div>'
          : "") +
        "</div>"
      );
    if (type === "image")
      return (
        '<div class="dynamic-image">' +
        (image
          ? '<img src="' +
            escVoice(image) +
            '" alt="' +
            title +
            '" onerror="this.style.display=\'none\'">'
          : "") +
        (title || sub
          ? '<div class="dynamic-image-caption">' + (title || sub) + "</div>"
          : "") +
        "</div>"
      );
    if (type === "profile")
      return (
        '<div class="dynamic-profile">' +
        (image
          ? '<div class="dynamic-profile-image"><img src="' +
            escVoice(image) +
            '" alt="' +
            title +
            '" onerror="this.parentNode.style.display=\'none\'"></div>'
          : "") +
        '<div class="dynamic-profile-copy">' +
        head +
        (text ? '<div class="dynamic-widget-text">' + text + "</div>" : "") +
        (url
          ? '<div class="dynamic-sources">' +
            dynamicLink(url, tr("PROFILE", "Hồ sơ")) +
            "</div>"
          : "") +
        "</div></div>"
      );
    if (type === "broadcast")
      return (
        '<div class="dynamic-broadcast ' +
        (text ? "has-description" : "no-description") +
        '"><div class="dynamic-broadcast-signal" aria-hidden="true">' +
        frameIconSvg(widget.icon || "announcement") +
        '</div><div class="dynamic-broadcast-copy"><div class="dynamic-broadcast-kicker">' +
        tr("BROADCAST", "Broadcast") +
        '</div><div class="dynamic-broadcast-title">' +
        (title || tr("REMOTE_MESSAGE", "Remote message")) +
        "</div>" +
        (text ? '<div class="dynamic-broadcast-text">' + text + "</div>" : "") +
        "</div></div>"
      );
    var body = '<div class="dynamic-widget-body">' + head;
    if (type === "weather") {
      body +=
        (value
          ? '<div class="dynamic-weather-value">' + value + "</div>"
          : "") +
        (text ? '<div class="dynamic-widget-text">' + text + "</div>" : "");
    } else if (type === "forecast") {
      body +=
        '<div class="dynamic-forecast">' +
        items
          .map(function (x) {
            return (
              '<div class="dynamic-forecast-item"><small>' +
              escVoice(x.time || x.date || x.label || "") +
              "</small><strong>" +
              escVoice(x.value || x.title || "-") +
              "</strong><span>" +
              escVoice(x.detail || x.subtitle || "") +
              "</span></div>"
            );
          })
          .join("") +
        "</div>";
    } else if (type === "stats" || type === "facts") {
      var cls = type === "stats" ? "dynamic-stat" : "dynamic-fact";
      body +=
        '<div class="' +
        (type === "stats" ? "dynamic-stat-grid" : "dynamic-fact-grid") +
        '">' +
        items
          .map(function (x) {
            return (
              '<div class="' +
              cls +
              '"><small>' +
              escVoice(x.label || x.title || "") +
              "</small><strong>" +
              escVoice(x.value || x.text || x.subtitle || "") +
              "</strong>" +
              (x.detail ? "<p>" + escVoice(x.detail) + "</p>" : "") +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    } else if (type === "chips") {
      body +=
        '<div class="dynamic-chips">' +
        items
          .map(function (x) {
            return (
              '<span class="dynamic-chip">' +
              escVoice(dynamicItemText(x)) +
              "</span>"
            );
          })
          .join("") +
        "</div>";
    } else if (type === "list" || type === "recipe") {
      body +=
        (text ? '<div class="dynamic-widget-text">' + text + "</div>" : "") +
        '<div class="dynamic-list">' +
        items
          .map(function (x, i) {
            var primary = String(x.title || x.value || x.text || ""),
              secondary = String(
                x.detail ||
                  x.subtitle ||
                  (x.text && String(x.text) !== primary ? x.text : "") ||
                  (x.value && String(x.value) !== primary ? x.value : "") ||
                  "",
              );
            if (
              type === "recipe" &&
              /^bước\s*\d+\s*[:.-]?$/i.test(primary) &&
              secondary
            ) {
              primary = secondary;
              secondary = "";
            }
            return (
              '<div class="dynamic-list-row"><div class="dynamic-row-mark">' +
              escVoice(x.label || String(i + 1)) +
              '</div><div class="dynamic-row-copy"><strong>' +
              escVoice(primary) +
              "</strong>" +
              (secondary ? "<span>" + escVoice(secondary) + "</span>" : "") +
              "</div></div>"
            );
          })
          .join("") +
        "</div>";
    } else if (type === "timeline" || type === "calendar") {
      body +=
        '<div class="dynamic-timeline">' +
        items
          .map(function (x) {
            var rawTime = x.time || x.date || x.label || "";
            return (
              '<div class="dynamic-timeline-row"><div class="dynamic-timeline-time">' +
              escVoice(
                type === "calendar"
                  ? formatDynamicCalendarDay(rawTime)
                  : rawTime,
              ) +
              '</div><div class="dynamic-row-copy"><strong>' +
              escVoice(x.title || x.value || "") +
              "</strong>" +
              (x.detail || x.subtitle
                ? "<span>" + escVoice(x.detail || x.subtitle) + "</span>"
                : "") +
              "</div></div>"
            );
          })
          .join("") +
        "</div>";
    } else if (type === "news") {
      body +=
        '<div class="dynamic-news-grid">' +
        items
          .map(function (x) {
            var u = safeVoiceUrl(x.url || x.href || x.link),
              im = safeVoiceUrl(x.image);
            var tag = u ? "a" : "div";
            return (
              "<" +
              tag +
              ' class="dynamic-news-card"' +
              (u
                ? ' href="' +
                  escVoice(u) +
                  '" target="_blank" rel="noopener noreferrer"'
                : "") +
              ">" +
              (im
                ? '<div class="dynamic-news-image"><img src="' +
                  escVoice(im) +
                  '" alt="" onerror="this.parentNode.style.display=\'none\'"></div>'
                : "") +
              '<div class="dynamic-news-copy"><div class="dynamic-news-meta">' +
              escVoice(x.source || x.label || x.time || "") +
              "</div><strong>" +
              escVoice(x.title || x.value || "") +
              "</strong>" +
              (x.detail || x.text
                ? "<p>" + escVoice(x.detail || x.text) + "</p>"
                : "") +
              "</div></" +
              tag +
              ">"
            );
          })
          .join("") +
        "</div>";
    } else if (type === "gallery") {
      body +=
        '<div class="dynamic-gallery">' +
        items
          .map(function (x) {
            var im = safeVoiceUrl(x.image);
            return im
              ? '<div class="dynamic-gallery-item"><img src="' +
                  escVoice(im) +
                  '" alt="' +
                  escVoice(x.title || "") +
                  '" onerror="this.parentNode.style.display=\'none\'"></div>'
              : "";
          })
          .join("") +
        "</div>";
    } else if (type === "sources") {
      body +=
        '<div class="dynamic-sources">' +
        items
          .map(function (x) {
            return dynamicLink(
              x.url || x.href || x.link,
              x.title || x.source || x.label || tr("SOURCE", "Nguồn"),
            );
          })
          .join("") +
        "</div>";
    } else {
      body +=
        (value
          ? '<div class="dynamic-widget-title" style="margin-top:10px">' +
            value +
            "</div>"
          : "") +
        (text ? '<div class="dynamic-widget-text">' + text + "</div>" : "") +
        (items.length
          ? '<div class="dynamic-list">' +
            items
              .map(function (x, i) {
                var primary = String(x.title || x.value || x.text || ""),
                  secondary = String(
                    x.detail ||
                      x.subtitle ||
                      (x.text && String(x.text) !== primary ? x.text : "") ||
                      (x.value && String(x.value) !== primary ? x.value : "") ||
                      "",
                  );
                return (
                  '<div class="dynamic-list-row"><div class="dynamic-row-mark' +
                  (x.icon ? " has-icon" : "") +
                  '">' +
                  (x.icon
                    ? frameIconSvg(x.icon)
                    : escVoice(x.label || String(i + 1))) +
                  '</div><div class="dynamic-row-copy"><strong>' +
                  escVoice(primary) +
                  "</strong>" +
                  (secondary
                    ? "<span>" + escVoice(secondary) + "</span>"
                    : "") +
                  "</div></div>"
                );
              })
              .join("") +
            "</div>"
          : "");
    }
    if (url && type !== "sources")
      body +=
        '<div class="dynamic-sources">' +
        dynamicLink(url, tr("OPEN_DETAILS", "Mở chi tiết")) +
        "</div>";
    return body + "</div>";
  }
  function showAssistantPage(data) {
    if (
      !assistantPage ||
      !assistantPageContent ||
      !data ||
      data.kind !== "dynamic_ui"
    )
      return;
    assistantPage.classList.toggle(
      "broadcast-page",
      data.presentation === "broadcast",
    );
    assistantPage.classList.add("show");
    assistantPage.setAttribute("aria-hidden", "false");
    assistantPageKicker.textContent = data.kicker || tr("NEST_ASSISTANT", "Trợ lý Nest");
    assistantPageTitle.textContent = data.title || tr("INFORMATION", "Thông tin");
    assistantPageSub.textContent = data.subtitle || "";
    var layout = data.layout || {},
      widgets = Array.isArray(data.widgets) ? data.widgets.slice() : [];
    widgets.sort(function (a, b) {
      return Number((a && a.order) || 0) - Number((b && b.order) || 0);
    });
    var gap = Math.max(0, Math.min(32, Number(layout.gap) || 14)),
      density =
        ["compact", "comfortable", "spacious"].indexOf(
          String(layout.density || ""),
        ) >= 0
          ? String(layout.density)
          : "comfortable";
    var columns = Math.max(
      1,
      Math.min(12, Math.round(Number(layout.columns) || 12)),
    );
    var html =
      '<div class="dynamic-ui-grid" data-density="' +
      escVoice(density) +
      '" style="--dynamic-gap:' +
      gap +
      "px;--dynamic-columns:" +
      columns +
      '">';
    widgets.slice(0, 10).forEach(function (w) {
      var span = Math.max(1, Math.min(columns, Number(w && w.span) || columns)),
        mobileSpan = Math.max(1, Math.min(6, Math.round((span * 6) / columns))),
        em =
          ["hero", "normal", "subtle"].indexOf(
            String((w && w.emphasis) || ""),
          ) >= 0
            ? String(w.emphasis)
            : "normal";
      html +=
        '<section class="dynamic-widget" data-type="' +
        escVoice(w.type || "text") +
        '" data-emphasis="' +
        escVoice(em) +
        '" style="--dynamic-span:' +
        span +
        ";--dynamic-mobile-span:" +
        mobileSpan +
        '">' +
        renderDynamicWidget(w) +
        "</section>";
    });
    html +=
      (widgets.length
        ? ""
        : '<div class="dynamic-empty">' + tr("NO_VISUAL_CONTENT", "Không có nội dung trực quan để hiển thị.") + "</div>") +
      "</div>";
    assistantPageContent.innerHTML = html;
    var grid = assistantPageContent.querySelector(".dynamic-ui-grid");
    if (grid)
      requestAnimationFrame(function () {
        grid.classList.add("ready");
      });
  }
  function closeVoiceInput() {
    if (voiceCaptureTimer) {
      clearTimeout(voiceCaptureTimer);
      voiceCaptureTimer = 0;
    }
    if (voiceProcessor) {
      try {
        voiceProcessor.disconnect();
      } catch (_) {}
      voiceProcessor.onaudioprocess = null;
      voiceProcessor = null;
    }
    if (voiceInputSource) {
      try {
        voiceInputSource.disconnect();
      } catch (_) {}
      voiceInputSource = null;
    }
    if (voiceSilentGain) {
      try {
        voiceSilentGain.disconnect();
      } catch (_) {}
      voiceSilentGain = null;
    }
    if (voiceStream) {
      voiceStream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (_) {}
      });
    }
    voiceStream = null;
  }
  function stopVoicePlayback() {
    for (var i = 0; i < voiceSources.length; i++) {
      try {
        voiceSources[i].stop();
      } catch (_) {}
    }
    voiceSources = [];
    if (voiceAudioContext) voicePlayhead = voiceAudioContext.currentTime;
  }
  function closeVoiceAudioContext() {
    if (voiceAudioContext) {
      try {
        voiceAudioContext.close();
      } catch (_) {}
      voiceAudioContext = null;
    }
    voicePlayhead = 0;
  }
  function endVoiceAssistant(restoreSpotify) {
    voiceEpoch++;
    voicePendingRemoteText = "";
    var shouldResume =
      restoreSpotify !== false &&
      voiceWasSpotifyPlaying &&
      !voiceTouchedSpotify;
    clearVoiceProcessingTimer();
    if (voiceTurnEndTimer) {
      clearTimeout(voiceTurnEndTimer);
      voiceTurnEndTimer = 0;
    }
    closeVoiceInput();
    stopVoicePlayback();
    stopVoiceNotice();
    if (voiceSocket) {
      try {
        voiceSocket.close(1000, "done");
      } catch (_) {}
    }
    voiceSocket = null;
    voiceSessionReady = false;
    closeVoiceAudioContext();
    voiceStarting = false;
    voiceBusy = false;
    if (voiceShell) {
      voiceShell.classList.remove("show");
      voiceShell.setAttribute("aria-hidden", "true");
    }
    if (voiceButton) voiceButton.classList.remove("active");
    resetVoiceVisualState(false);
    if (shouldResume && typeof resumeSpotify === "function")
      setTimeout(function () {
        resumeSpotify();
      }, 180);
    voiceWasSpotifyPlaying = false;
    voiceTouchedSpotify = false;
  }
  function listenForVoiceFollowup() {
    var followupQuestion =
      String(voiceFollowupQuestion || voiceOutputText || "").trim() ||
      tr("FOLLOWUP_HINT", "Bạn có thể nói thêm thông tin cần thiết");
    clearVoiceProcessingTimer();
    voiceTurnEnding = false;
    voiceTurnCompleted = false;
    voiceBusy = false;
    voiceOutputText = "";
    voiceLastUserText = "";
    voiceFollowupQuestion = "";
    voiceHandledToolCalls = {};
    resetVoiceVisualState(true);
    if (
      !voiceSocket ||
      voiceSocket.readyState !== WebSocket.OPEN ||
      !voiceAudioContext
    ) {
      finishVoiceSessionKeepUi();
      return;
    }
    var epoch = voiceEpoch;
    setVoiceState(
      "listening",
      tr("LISTENING_FOR_FOLLOWUP", "Đang nghe tiếp…"),
      followupQuestion,
      tr("FOLLOWUP_TIMEOUT_HINT", "Phiên sẽ tự đóng nếu không có phản hồi"),
    );
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then(function (stream) {
        if (
          epoch !== voiceEpoch ||
          !voiceSocket ||
          voiceSocket.readyState !== WebSocket.OPEN
        ) {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          return;
        }
        startLiveCapture(stream, true);
      })
      .catch(function (err) {
        if (epoch === voiceEpoch)
          failVoiceAssistant(
            tr("FOLLOWUP_LISTEN_FAILED", "Không thể nghe câu trả lời tiếp theo"),
            (err && err.message) || tr("MICROPHONE_OPEN_FAILED", "Không mở được microphone"),
          );
      });
  }
  function base64FromBytes(bytes) {
    var out = "",
      step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      var part = bytes.subarray(i, Math.min(bytes.length, i + step));
      out += String.fromCharCode.apply(null, part);
    }
    return btoa(out);
  }
  function bytesFromBase64(text) {
    var raw = atob(String(text || "")),
      out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function resamplePcm16(input, inputRate, targetRate) {
    if (!input || !input.length) return new Int16Array(0);
    targetRate = targetRate || 16000;
    var ratio = inputRate / targetRate,
      outLen = Math.max(1, Math.round(input.length / ratio)),
      out = new Int16Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var a = Math.floor(i * ratio),
        b = Math.min(input.length, Math.floor((i + 1) * ratio));
      if (b <= a) b = Math.min(input.length, a + 1);
      var sum = 0,
        n = 0;
      for (var j = a; j < b; j++) {
        sum += input[j];
        n++;
      }
      var x = n ? sum / n : 0;
      x = Math.max(-1, Math.min(1, x));
      out[i] = x < 0 ? Math.round(x * 32768) : Math.round(x * 32767);
    }
    return out;
  }
  function sendVoiceJson(obj) {
    if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
      try {
        voiceSocket.send(JSON.stringify(obj));
        return true;
      } catch (err) {
        console.warn("Gemini Live send failed", err);
      }
    }
    return false;
  }
  function finishLiveInput() {
    if (!voiceProcessor) return;
    setVoiceState(
      "thinking",
      tr("PROCESSING", "Đang xử lý…"),
      voiceLastUserText || tr("UNDERSTANDING_REQUEST", "Đang hiểu yêu cầu…"),
      "",
    );
    if (!sendVoiceJson({ realtimeInput: { audioStreamEnd: true } })) {
      failVoiceAssistant(
        tr("REQUEST_FAILED", "Không thể xử lý yêu cầu"),
        tr("GEMINI_CONNECTION_LOST", "Mất kết nối tới Gemini."),
      );
      return;
    }
    closeVoiceInput();
    voiceBusy = true;
    armVoiceProcessingTimeout(tr("GEMINI_RESPONSE", "Gemini phản hồi"));
  }
  function startLiveCapture(stream, isFollowup) {
    voiceStream = stream;
    voiceCaptureIsFollowup = !!isFollowup;
    voiceSpeechSeen = false;
    voiceTurnCompleted = false;
    voiceTurnEnding = false;
    voiceLastLoud = Date.now();
    voiceInputStartedAt = Date.now();
    var captureEpoch = voiceEpoch;
    clearTimeout(voiceCaptureTimer);
    voiceCaptureTimer = setTimeout(
      function () {
        voiceCaptureTimer = 0;
        if (captureEpoch !== voiceEpoch || !voiceProcessor) return;
        if (voiceSpeechSeen) finishLiveInput();
        else if (voiceCaptureIsFollowup) finishVoiceSessionKeepUi();
        else
          failVoiceAssistant(
            tr("NO_REQUEST_HEARD", "Không nghe thấy yêu cầu"),
            tr("TAP_MIC_TRY_AGAIN", "Hãy chạm mic và thử nói lại."),
          );
      },
      voiceCaptureIsFollowup ? VOICE_FOLLOWUP_WAIT_MS : 14000,
    );
    var ctx = voiceAudioContext;
    voiceInputSource = ctx.createMediaStreamSource(stream);
    voiceProcessor = ctx.createScriptProcessor(4096, 1, 1);
    voiceSilentGain = ctx.createGain();
    voiceSilentGain.gain.value = 0;
    voiceInputSource.connect(voiceProcessor);
    voiceProcessor.connect(voiceSilentGain);
    voiceSilentGain.connect(ctx.destination);
    voiceProcessor.onaudioprocess = function (ev) {
      if (
        !voiceSocket ||
        voiceSocket.readyState !== WebSocket.OPEN ||
        !voiceSessionReady
      )
        return;
      var input = ev.inputBuffer.getChannelData(0),
        sum = 0;
      for (var i = 0; i < input.length; i++) sum += input[i] * input[i];
      var rms = Math.sqrt(sum / input.length),
        now = Date.now();
      if (rms > 0.024) {
        voiceSpeechSeen = true;
        voiceLastLoud = now;
      }
      var pcm = resamplePcm16(input, ctx.sampleRate, 16000);
      if (pcm.length)
        sendVoiceJson({
          realtimeInput: {
            audio: {
              data: base64FromBytes(new Uint8Array(pcm.buffer)),
              mimeType: "audio/pcm;rate=16000",
            },
          },
        });
      if (
        voiceSpeechSeen &&
        ((now - voiceLastLoud > 900 && now - voiceInputStartedAt > 800) ||
          now - voiceInputStartedAt > 14000)
      )
        setTimeout(finishLiveInput, 0);
      else if (
        !voiceSpeechSeen &&
        now - voiceInputStartedAt >
          (voiceCaptureIsFollowup ? VOICE_FOLLOWUP_WAIT_MS : 14000)
      ) {
        if (voiceCaptureIsFollowup) finishVoiceSessionKeepUi();
        else
          failVoiceAssistant(
            tr("NO_REQUEST_HEARD", "Không nghe thấy yêu cầu"),
            tr("TAP_MIC_TRY_AGAIN", "Hãy chạm mic và thử nói lại."),
          );
      }
    };
    voiceStarting = false;
    voiceBusy = false;
    setVoiceState(
      "listening",
      tr("LISTENING", "Đang nghe…"),
      tr("WHAT_WOULD_YOU_LIKE", "Bạn muốn hỏi gì?"),
      tr(
        "VOICE_AUTO_SEND_HINT",
        "Tự gửi khi bạn ngừng nói · chạm mic lần nữa để gửi",
      ),
    );
  }
  function queueGeminiAudio(base64) {
    if (!voiceAudioContext || !base64) return;
    var bytes = bytesFromBase64(base64);
    if (bytes.byteLength < 2) return;
    var len = Math.floor(bytes.byteLength / 2),
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      buf = voiceAudioContext.createBuffer(1, len, 24000),
      ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
    var src = voiceAudioContext.createBufferSource();
    src.buffer = buf;
    src.connect(voiceAudioContext.destination);
    var start = Math.max(
      voiceAudioContext.currentTime + 0.025,
      voicePlayhead || 0,
    );
    voicePlayhead = start + buf.duration;
    voiceSources.push(src);
    src.onended = function () {
      var k = voiceSources.indexOf(src);
      if (k >= 0) voiceSources.splice(k, 1);
    };
    src.start(start);
  }
  function voiceCompareWords(value) {
    var text = String(value || "").toLocaleLowerCase("vi");
    try {
      text = text.normalize("NFD");
    } catch (_) {}
    return text
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }
  function voiceSentenceSimilarity(a, b) {
    var left = voiceCompareWords(a),
      right = voiceCompareWords(b);
    if (left.length < 4 || right.length < 4) return 0;
    var lead = 0,
      limit = Math.min(left.length, right.length);
    while (lead < limit && left[lead] === right[lead]) lead++;
    if (lead < 4) return 0;
    var seen = {},
      common = 0;
    left.forEach(function (word) {
      seen[word] = true;
    });
    right.forEach(function (word) {
      if (seen[word]) common++;
    });
    return common / Math.max(left.length, right.length);
  }
  function dedupeVoiceText(value) {
    var parts = String(value || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [],
      out = [];
    parts.forEach(function (part) {
      var clean = part.trim();
      if (!clean) return;
      if (
        out.length &&
        voiceSentenceSimilarity(out[out.length - 1], clean) >= 0.62
      )
        out[out.length - 1] = clean;
      else out.push(clean);
    });
    return out.join(" ");
  }
  function voiceOutputRequestsFollowup(value) {
    var text = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("vi");
    if (!text) return false;
    if (
      /(?:bạn có cần (?:gì|tôi).*thêm|tôi có thể giúp gì thêm|cần tôi .* thêm không)[?.!…]*$/.test(
        text,
      )
    )
      return false;
    if (/[?？]\s*$/.test(text)) return true;
    return /(?:bạn muốn|bạn định|bạn cần|vui lòng|hãy cho (?:tôi|mình) biết|cụ thể là|tên .* là gì|ở đâu|khi nào|bao nhiêu|món (?:gì|nào)|loại (?:gì|nào))[\s\S]{0,180}[.!…]*$/.test(
      text,
    );
  }
  function mergeVoiceTranscript(current, next) {
    current = String(current || "");
    next = String(next || "");
    if (!next) return dedupeVoiceText(current);
    if (!current) return dedupeVoiceText(next);
    if (next.indexOf(current) === 0) return dedupeVoiceText(next);
    if (current.slice(-next.length) === next) return dedupeVoiceText(current);
    var common = 0,
      shortest = Math.min(current.length, next.length);
    while (common < shortest && current.charAt(common) === next.charAt(common))
      common++;
    if (common >= 12 && common / shortest >= 0.28) return dedupeVoiceText(next);
    for (var i = shortest; i > 0; i--)
      if (current.slice(-i) === next.slice(0, i))
        return dedupeVoiceText(current + next.slice(i));
    var spacer = /\s$/.test(current) || /^[\s.,!?]/.test(next) ? "" : " ";
    return dedupeVoiceText(current + spacer + next);
  }
  function currentVoiceToolContext(toolName) {
    var name = String(toolName || "");
    if (name === "add_alarm") return { userText: voiceLastUserText || "" };
    if (name.indexOf("spotify_") === 0)
      return {
        clientSpotify: {
          wasPlaying: !!voiceWasSpotifyPlaying,
          track: currentTrack
            ? {
                title: String(currentTrack.title || ""),
                artist: String(currentTrack.artist || ""),
                uri: String(currentTrack.uri || ""),
              }
            : null,
          device:
            spotifyState && spotifyState.device
              ? {
                  id: String(spotifyState.device.id || ""),
                  name: String(spotifyState.device.name || ""),
                }
              : null,
        },
      };
    if (
      [
        "get_directions",
        "run_routine",
        "get_ambient_context",
        "list_routines",
        "get_morning_briefing",
      ].indexOf(name) < 0
    )
      return {};
    var c =
      typeof ambientContextCoords === "object" && ambientContextCoords
        ? ambientContextCoords
        : null;
    if (!c || !isFinite(Number(c.latitude)) || !isFinite(Number(c.longitude)))
      return {};
    return {
      currentLocation: {
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
      },
    };
  }
  function handleGeminiToolCall(toolCall) {
    if (voiceTurnCompleted) return;
    var calls =
      toolCall && Array.isArray(toolCall.functionCalls)
        ? toolCall.functionCalls
        : [];
    if (!calls.length) return;
    var epoch = voiceEpoch;
    armVoiceProcessingTimeout(tr("RUNNING_TOOL", "thực hiện công cụ"));
    Promise.all(
      calls.map(function (fc) {
        var key =
            String((fc && fc.id) || "") ||
            String((fc && fc.name) || "") +
              ":" +
              JSON.stringify((fc && fc.args) || {}),
          task = voiceHandledToolCalls[key];
        if (!task) {
          task = (function () {
            var controller =
                typeof AbortController !== "undefined"
                  ? new AbortController()
                  : null,
              timer = controller
                ? setTimeout(function () {
                    controller.abort();
                  }, VOICE_TOOL_TIMEOUT_MS)
                : 0;
            return fetch("/voice/tool", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: fc.name,
                arguments: fc.args || {},
                context: currentVoiceToolContext(fc.name),
              }),
              signal: controller ? controller.signal : undefined,
            })
              .then(function (r) {
                return r.json().then(function (d) {
                  if (!r.ok)
                    throw new Error(d.error || tr("TOOL_FAILED", "Công cụ thất bại"));
                  return d;
                });
              })
              .then(function (result) {
                var display =
                    result && result.kind === "dynamic_ui"
                      ? result
                      : result && result.display,
                  modelResult = result;
                if (result && result.display) {
                  modelResult = {};
                  Object.keys(result).forEach(function (name) {
                    if (name !== "display") modelResult[name] = result[name];
                  });
                }
                return {
                  result: result,
                  display: display,
                  response: { result: modelResult },
                };
              })
              .catch(function (err) {
                var detail =
                  err && err.name === "AbortError"
                    ? tr("TOOL_TIMED_OUT", "Quá thời gian chờ công cụ")
                    : String((err && err.message) || err);
                return { error: detail, response: { error: detail } };
              })
              .then(function (value) {
                if (timer) clearTimeout(timer);
                return value;
              });
          })();
          voiceHandledToolCalls[key] = task;
        }
        return task.then(function (value) {
          return { fc: fc, value: value };
        });
      }),
    )
      .then(function (entries) {
        if (epoch !== voiceEpoch) return;
        var functionResponses = [];
        entries.forEach(function (entry) {
          var fc = entry.fc,
            value = entry.value || {},
            result = value.result,
            display = value.display;
          if (result && result.kind === "followup") {
            voiceFollowupRequested = true;
            voiceFollowupQuestion = String(result.question || "").trim();
          }
          if (
            [
              "spotify_control",
              "spotify_play_search",
              "spotify_queue_search",
              "spotify_select_player",
              "spotify_transfer",
            ].indexOf(String(fc.name || "")) >= 0
          )
            voiceTouchedSpotify = true;
          if (
            (fc.name === "add_alarm" || fc.name === "manage_alarms") &&
            typeof loadAlarms === "function"
          )
            setTimeout(loadAlarms, 120);
          if (
            fc.name === "manage_notifications" &&
            typeof loadNotifications === "function"
          )
            setTimeout(loadNotifications, 120);
          if (display && display.kind === "dynamic_ui")
            queueVoiceVisual(display, result, fc.name);
          if (value.error)
            setVoiceState(
              "thinking",
              tr("TOOL_ERROR", "Công cụ gặp lỗi"),
              String(fc.name || "Tool") + ": " + value.error,
              tr("SENDING_ERROR_TO_GEMINI", "Đang gửi lỗi cho Gemini"),
            );
          functionResponses.push({
            name: fc.name,
            id: fc.id,
            response: value.response,
          });
        });
        if (
          !sendVoiceJson({
            toolResponse: { functionResponses: functionResponses },
          })
        ) {
          failVoiceAssistant(
            tr("SEND_TOOL_RESULT_FAILED", "Không thể gửi kết quả công cụ"),
            tr("GEMINI_CONNECTION_LOST", "Mất kết nối tới Gemini."),
          );
          return;
        }
        armVoiceProcessingTimeout(
          tr("WAITING_AFTER_TOOL", "chờ câu trả lời sau công cụ"),
        );
      })
      .catch(function (err) {
        if (epoch === voiceEpoch)
          failVoiceAssistant(
            tr("RUN_TOOL_FAILED", "Không thể thực hiện công cụ"),
            (err && err.message) || String(err),
          );
      });
  }
  function scheduleVoiceEndAfterPlayback() {
    if (voiceTurnEnding) return;
    voiceTurnEnding = true;
    if (voiceTurnEndTimer) clearTimeout(voiceTurnEndTimer);
    var delay = 350;
    if (voiceAudioContext)
      delay = Math.max(
        delay,
        Math.round(
          Math.max(0, voicePlayhead - voiceAudioContext.currentTime) * 1000,
        ) + 220,
      );
    voiceTurnEndTimer = setTimeout(function () {
      voiceTurnEndTimer = 0;
      if (voiceFollowupRequested) {
        voiceFollowupRequested = false;
        listenForVoiceFollowup();
      } else finishVoiceSessionKeepUi();
    }, delay);
  }
  function processGeminiLiveMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.error) {
      failVoiceAssistant(
        tr("GEMINI_RETURNED_ERROR", "Gemini returned an error"),
        msg.error.message || msg.error.status || JSON.stringify(msg.error),
      );
      return;
    }
    if (msg.goAway) {
      failVoiceAssistant(
        tr("GEMINI_SESSION_ENDED", "The Gemini session has ended"),
        msg.goAway.timeLeft
          ? tr("TIME_REMAINING", "Time remaining: {TIME}", { TIME: msg.goAway.timeLeft })
          : tr("SERVER_REQUESTED_CLOSE", "The server requested that the connection close."),
      );
      return;
    }
    if (msg.setupComplete) {
      clearVoiceProcessingTimer();
      voiceSessionReady = true;
      if (voicePendingRemoteText) {
        var remoteText = voicePendingRemoteText;
        voicePendingRemoteText = "";
        voiceStarting = false;
        voiceBusy = true;
        voiceLastUserText = remoteText;
        setVoiceState("thinking", tr("PROCESSING", "Processing…"), remoteText, tr("REMOTE_REQUEST", "Remote request"));
        if (
          !sendVoiceJson({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: remoteText }] }],
              turnComplete: true,
            },
          })
        )
          failVoiceAssistant(tr("REQUEST_SEND_FAILED", "Unable to send request"), tr("GEMINI_CONNECTION_LOST", "Connection to Gemini was lost."));
        else armVoiceProcessingTimeout(tr("REMOTE_GEMINI_RESPONSE", "Gemini response to the remote request"));
      } else if (voiceStream) startLiveCapture(voiceStream);
      return;
    }
    if (msg.toolCall && !voiceTurnCompleted) handleGeminiToolCall(msg.toolCall);
    var sc = msg.serverContent;
    if (!sc) return;
    if (voiceTurnCompleted) return;
    if (sc.interrupted) {
      stopVoicePlayback();
      voiceOutputText = "";
      setVoiceState(
        "listening",
        tr("LISTENING", "Listening…"),
        voiceLastUserText || tr("WHAT_ELSE_TO_ADD", "What else would you like to add?"),
        "",
      );
    }
    if (sc.inputTranscription && sc.inputTranscription.text) {
      voiceLastUserText = mergeVoiceTranscript(
        voiceLastUserText,
        String(sc.inputTranscription.text),
      ).trim();
      setVoiceState(
        voiceProcessor ? "listening" : "thinking",
        voiceProcessor ? tr("LISTENING", "Listening…") : tr("PROCESSING", "Processing…"),
        voiceLastUserText,
        "",
      );
    }
    if (sc.outputTranscription && sc.outputTranscription.text) {
      if (voiceProcessor) closeVoiceInput();
      voiceBusy = true;
      commitVoiceVisual();
      voiceOutputText = mergeVoiceTranscript(
        voiceOutputText,
        String(sc.outputTranscription.text),
      );
      setVoiceState("speaking", tr("ASSISTANT", "Assistant"), "" + voiceOutputText.trim(), "");
      armVoiceProcessingTimeout(tr("FINISHING_RESPONSE", "finishing the response"));
    }
    if (sc.modelTurn && Array.isArray(sc.modelTurn.parts)) {
      for (var i = 0; i < sc.modelTurn.parts.length; i++) {
        var part = sc.modelTurn.parts[i];
        if (part && part.inlineData && part.inlineData.data) {
          if (voiceProcessor) closeVoiceInput();
          voiceBusy = true;
          commitVoiceVisual();
          setVoiceState(
            "speaking",
            tr("ASSISTANT", "Assistant"),
            voiceOutputText.trim() || tr("RESPONDING", "Responding…"),
            "",
          );
          queueGeminiAudio(part.inlineData.data);
          armVoiceProcessingTimeout(tr("FINISHING_AUDIO", "finishing audio"));
        }
      }
    }
    if (sc.turnComplete) {
      if (
        !voiceFollowupRequested &&
        voiceOutputRequestsFollowup(voiceOutputText)
      ) {
        voiceFollowupRequested = true;
        voiceFollowupQuestion = voiceOutputText.trim();
      }
      voiceTurnCompleted = true;
      commitVoiceVisual();
      clearVoiceProcessingTimer();
      scheduleVoiceEndAfterPlayback();
    }
  }
  function openGeminiLive(stream, session, epoch) {
    voiceStream = stream;
    var ws = new WebSocket(session.websocketUrl);
    voiceSocket = ws;
    ws.onopen = function () {
      if (epoch !== voiceEpoch) {
        try {
          ws.close(1000, "stale");
        } catch (_) {}
        return;
      }
      var setup = {
        setup: {
          model: "models/" + session.model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { languageCode: frameLocale() },
          },
          systemInstruction: { parts: [{ text: session.instructions }] },
          tools: [{ functionDeclarations: session.tools || [] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              prefixPaddingMs: 120,
              silenceDurationMs: 700,
            },
          },
        },
      };
      sendVoiceJson(setup);
    };
    ws.onmessage = function (ev) {
      if (epoch !== voiceEpoch) return;
      try {
        if (typeof ev.data === "string")
          processGeminiLiveMessage(JSON.parse(ev.data));
        else if (ev.data && typeof ev.data.text === "function")
          ev.data.text().then(function (t) {
            if (epoch === voiceEpoch) processGeminiLiveMessage(JSON.parse(t));
          });
      } catch (err) {
        console.warn("Gemini Live message failed", err);
      }
    };
    ws.onerror = function () {
      if (voiceSocket === ws)
        failVoiceAssistant(tr("CONNECTION_LOST", "Connection lost"), tr("GEMINI_CONNECT_FAILED", "Unable to connect to Gemini Live."));
    };
    ws.onclose = function (ev) {
      if (voiceSocket === ws) voiceSocket = null;
      if (
        voiceShell &&
        voiceShell.classList.contains("show") &&
        ev.code !== 1000
      )
        failVoiceAssistant(
          tr("GEMINI_DISCONNECTED", "Gemini Live disconnected"),
          ev.reason || tr("ERROR_CODE", "Error code {CODE}", { CODE: ev.code }),
        );
    };
  }
  function startVoiceAssistant() {
    if (voiceProcessor) {
      finishLiveInput();
      return;
    }
    if (voiceBusy && voiceSocket) {
      endVoiceAssistant(true);
      return;
    }
    if (voiceStarting || voiceBusy) return;
    var epoch = ++voiceEpoch;
    voiceStarting = true;
    voicePendingRemoteText = "";
    voiceLastError = "";
    showVoiceShell();
    resetVoiceVisualState(false);
    voiceLastUserText = "";
    voiceOutputText = "";
    voiceTouchedSpotify = false;
    voiceSessionReady = false;
    voiceTurnEnding = false;
    voiceTurnCompleted = false;
    voiceFollowupRequested = false;
    voiceFollowupQuestion = "";
    voiceHandledToolCalls = {};
    if (!ambientContextCoords && typeof refreshAmbientContext === "function")
      refreshAmbientContext();
    voiceWasSpotifyPlaying = !!(spotifyState && spotifyState.isPlaying);
    if (voiceWasSpotifyPlaying && typeof pauseSpotify === "function")
      pauseSpotify();
    setVoiceState(
      "thinking",
      tr("PREPARING", "Preparing"),
      tr("CONNECTING_ASSISTANT", "Connecting to the assistant…"),
      tr("ALLOW_MIC_SAFARI", "Allow microphone access if Safari asks"),
    );
    armVoiceProcessingTimeout(tr("CONNECTING_GEMINI", "connecting to Gemini"));
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      failVoiceAssistant(
        tr("ASSISTANT_START_FAILED", "Unable to start the assistant"),
        tr("WEB_AUDIO_UNAVAILABLE", "Web Audio API is unavailable in this browser"),
      );
      return;
    }
    try {
      voiceAudioContext = new AC();
      if (voiceAudioContext.state === "suspended") voiceAudioContext.resume();
      voicePlayhead = voiceAudioContext.currentTime;
    } catch (err) {
      failVoiceAssistant(
        tr("AUDIO_OPEN_FAILED", "Unable to open audio"),
        err.message || tr("AUDIO_CONTEXT_ERROR", "AudioContext error"),
      );
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      failVoiceAssistant(tr("MICROPHONE_UNSUPPORTED", "Microphone is not supported"), tr("OPEN_FRAME_HTTPS", "Open the frame over HTTPS"));
      return;
    }
    Promise.all([
      fetch("/voice/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok)
            throw new Error(d.error || tr("GEMINI_TOKEN_FAILED", "Unable to get a Gemini Live token"));
          return d;
        });
      }),
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }),
    ])
      .then(function (v) {
        if (epoch !== voiceEpoch) {
          v[1].getTracks().forEach(function (t) {
            t.stop();
          });
          return;
        }
        openGeminiLive(v[1], v[0], epoch);
      })
      .catch(function (err) {
        console.error("Gemini Live start failed", err);
        if (epoch === voiceEpoch)
          failVoiceAssistant(
            tr("ASSISTANT_START_FAILED", "Unable to start the assistant"),
            (err && err.message) || tr("GEMINI_UNAVAILABLE", "Gemini Live is unavailable"),
          );
      });
  }
  function startRemoteAssistantQuery(text) {
    text = String(text || "").trim();
    if (!text) return;
    if (voiceStarting || voiceBusy || voiceSocket) endVoiceAssistant(true);
    var epoch = ++voiceEpoch;
    voiceStarting = true;
    voiceLastError = "";
    showVoiceShell();
    resetVoiceVisualState(false);
    voiceLastUserText = text;
    voiceOutputText = "";
    voicePendingRemoteText = text;
    voiceTouchedSpotify = false;
    voiceSessionReady = false;
    voiceTurnEnding = false;
    voiceTurnCompleted = false;
    voiceFollowupRequested = false;
    voiceFollowupQuestion = "";
    voiceHandledToolCalls = {};
    setVoiceState(
      "thinking",
      tr("REMOTE_REQUEST", "Remote request"),
      text,
      tr("CONNECTING_ASSISTANT", "Connecting to the assistant…"),
    );
    armVoiceProcessingTimeout(tr("CONNECTING_GEMINI_REMOTE", "connecting to Gemini for a remote request"));
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        voiceAudioContext = new AC();
        if (voiceAudioContext.state === "suspended") voiceAudioContext.resume();
        voicePlayhead = voiceAudioContext.currentTime;
      } catch (_) {
        voiceAudioContext = null;
      }
    }
    fetch("/voice/live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || tr("GEMINI_TOKEN_FAILED", "Unable to get a Gemini Live token"));
          return data;
        });
      })
      .then(function (session) {
        if (epoch === voiceEpoch) openGeminiLive(null, session, epoch);
      })
      .catch(function (err) {
        if (epoch === voiceEpoch)
          failVoiceAssistant(
            tr("REMOTE_REQUEST_FAILED", "Unable to process the remote request"),
            (err && err.message) || tr("GEMINI_UNAVAILABLE", "Gemini Live is unavailable"),
          );
      });
  }
  if (voiceButton) voiceButton.addEventListener("click", startVoiceAssistant);
  if (voiceClose)
    voiceClose.addEventListener("click", function () {
      endVoiceAssistant(true);
    });

  initSpotify();
  initSpotifySleepTimer();
  frameBootstrapPromise.then(function () {
    initAlarms();
    initAmbientContext();
  });
