  /* ---------------- PHOTO SWIPE GESTURES ----------------
     Home only: swipe left = next, swipe right = previous.
     History keeps the current photo + at most 10 old photos.
  ---------------------------------------------------------------- */
  (function initPhotoSwipe() {
    var homeView = document.getElementById("view-home");
    if (!homeView) return;
    var startX = 0,
      startY = 0,
      startTime = 0,
      tracking = false;
    var MIN_SWIPE_X = 58;
    var MAX_SWIPE_MS = 900;
    function isInteractiveTarget(target) {
      if (!target || !target.closest) return false;
      return !!target.closest(
        "button,a,input,textarea,select,label,.news-card,.camera-home-chip,[data-goto]",
      );
    }
    homeView.addEventListener(
      "touchstart",
      function (ev) {
        if (
          currentView !== "home" ||
          !ev.touches ||
          ev.touches.length !== 1 ||
          isInteractiveTarget(ev.target)
        ) {
          tracking = false;
          return;
        }
        var t = ev.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startTime = Date.now();
        tracking = true;
      },
      { passive: true },
    );
    homeView.addEventListener(
      "touchend",
      function (ev) {
        if (!tracking || currentView !== "home") {
          tracking = false;
          return;
        }
        tracking = false;
        if (!ev.changedTouches || !ev.changedTouches.length) return;
        var t = ev.changedTouches[0];
        var dx = t.clientX - startX,
          dy = t.clientY - startY,
          elapsed = Date.now() - startTime;
        if (
          elapsed > MAX_SWIPE_MS ||
          Math.abs(dx) < MIN_SWIPE_X ||
          Math.abs(dx) <= Math.abs(dy) * 1.15
        )
          return;
        if (dx < 0) manualPhotoNext();
        else manualPhotoPrevious();
      },
      { passive: true },
    );
    homeView.addEventListener(
      "touchcancel",
      function () {
        tracking = false;
      },
      { passive: true },
    );
  })();

  function animateEntrance(name) {
    if (!hasGsap) return;
    if (name === "home") {
      gsap.fromTo(
        ".home-clock, .home-actions, .home-status",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.04, ease: "power2.out" },
      );
    } else if (name === "today") {
      gsap.fromTo(
        ".today-page-head, .routine-card, .notification-item",
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.03,
          ease: "power2.out",
        },
      );
    } else if (name === "news") {
      gsap.fromTo(
        ".news-page-head, .news-feed-card",
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.32,
          stagger: 0.035,
          ease: "power2.out",
        },
      );
    } else if (name === "alarm") {
      gsap.fromTo(
        ".alarm-page-head, .alarm-card",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.035, ease: "power2.out" },
      );
    }
  }
