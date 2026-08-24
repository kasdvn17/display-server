  /* ---------------- view / tab switching ---------------- */
  var views = {};
  ["home", "today", "media", "news", "alarm", "call"].forEach(function (name) {
    views[name] = document.getElementById("view-" + name);
  });
  var tabs = document.querySelectorAll(".nav-tab");
  var currentView = "home";
  var previousView = "home";

  function switchView(name) {
    if (name === "call") exitIdle(false);
    else if (!idleActive) resetIdleTimer();
    if (name === currentView) return;
    var outEl = views[currentView];
    var inEl = views[name];
    if (!inEl) return;

    tabs.forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-view") === name);
    });
    var screenEl = document.querySelector(".screen");
    if (screenEl) screenEl.classList.toggle("media-mode", name === "media");

    if (hasGsap) {
      gsap.killTweensOf(outEl);
      gsap.killTweensOf(inEl);
      gsap.set(outEl, { clearProps: "opacity,transform" });
      gsap.set(inEl, { clearProps: "opacity,transform" });
    }
    outEl.classList.remove("active");
    inEl.classList.add("active");
    inEl.classList.remove("view-entering");
    void inEl.offsetWidth;
    inEl.classList.add("view-entering");
    setTimeout(function () {
      inEl.classList.remove("view-entering");
    }, 380);
    animateEntrance(name);
    previousView = currentView;
    currentView = name;
    if (name !== "home") hideNews();
    if (name === "home") resumeHomeIndicator();
    if (name === "today") refreshTodayData();
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchView(tab.getAttribute("data-view"));
    });
  });
  document.querySelectorAll("[data-goto]").forEach(function (el) {
    el.addEventListener("click", function () {
      switchView(el.getAttribute("data-goto"));
    });
  });
