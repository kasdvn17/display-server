(function (global) {
  "use strict";

  const SUPPORTED_LANGUAGES = ["vi", "en"];
  const FALLBACK_LANGUAGE = "en";
  const dictionaries = new Map();
  let currentLanguage = FALLBACK_LANGUAGE;
  let initPromise = null;

  function waitForDocument() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }

  function revealPage() {
    document.documentElement.classList.remove("i18n-loading");
    document.documentElement.classList.add("i18n-ready");
    const loader = document.getElementById("locale-loader");
    if (loader) loader.setAttribute("aria-hidden", "true");
  }

  function normalizeLanguage(value) {
    const language = String(value || "")
      .trim()
      .toLowerCase()
      .split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.includes(language)
      ? language
      : FALLBACK_LANGUAGE;
  }

  function interpolate(value, variables) {
    if (!variables) return value;
    return value.replace(/\{([A-Z0-9_]+)\}/gi, (_, key) =>
      Object.prototype.hasOwnProperty.call(variables, key)
        ? String(variables[key])
        : `{${key}}`,
    );
  }

  function t(key, fallback = "", variables) {
    const active = dictionaries.get(currentLanguage) || {};
    const base = dictionaries.get(FALLBACK_LANGUAGE) || {};
    const value = active[key] ?? base[key] ?? fallback ?? key;
    return interpolate(String(value), variables);
  }

  function translateAttribute(element, attribute, targetAttribute) {
    const key = element.getAttribute(attribute);
    if (!key) return;
    const existing = targetAttribute
      ? element.getAttribute(targetAttribute)
      : element.textContent.trim();
    const translated = t(key, existing);
    if (targetAttribute) element.setAttribute(targetAttribute, translated);
    else element.textContent = translated;
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((element) =>
      translateAttribute(element, "data-i18n"),
    );
    ["placeholder", "title", "aria-label", "value", "alt"].forEach(
      (attribute) => {
        root
          .querySelectorAll(`[data-i18n-${attribute}]`)
          .forEach((element) =>
            translateAttribute(
              element,
              `data-i18n-${attribute}`,
              attribute,
            ),
          );
      },
    );
    document.documentElement.lang = currentLanguage;
  }

  async function loadDictionary(language) {
    if (dictionaries.has(language)) return dictionaries.get(language);
    const response = await fetch(`/locales/${language}.json`, {
      cache: "no-cache",
    });
    if (!response.ok) throw new Error(`Cannot load locale ${language}`);
    const dictionary = await response.json();
    dictionaries.set(language, dictionary);
    return dictionary;
  }

  async function setLanguage(value, options = {}) {
    const language = normalizeLanguage(value);
    await loadDictionary(FALLBACK_LANGUAGE);
    if (language !== FALLBACK_LANGUAGE) await loadDictionary(language);
    currentLanguage = language;
    await waitForDocument();
    if (options.persist !== false) {
      try {
        localStorage.setItem("frame-language", language);
      } catch (_) {}
    }
    apply();
    revealPage();
    global.dispatchEvent(
      new CustomEvent("frame:languagechange", { detail: { language } }),
    );
    return language;
  }

  async function resolveLanguage() {
    const query = new URLSearchParams(global.location.search).get("lang");
    if (query) return normalizeLanguage(query);
    try {
      const stored = localStorage.getItem("frame-language");
      if (stored) return normalizeLanguage(stored);
    } catch (_) {}
    try {
      const response = await fetch("/frame/bootstrap", { cache: "no-cache" });
      if (response.ok) {
        const bootstrap = await response.json();
        if (bootstrap.language) return normalizeLanguage(bootstrap.language);
      }
    } catch (_) {}
    return normalizeLanguage(document.documentElement.lang);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = resolveLanguage()
      .then((language) => setLanguage(language, { persist: false }))
      .catch(async (error) => {
        console.warn("Translations could not be loaded:", error);
        await waitForDocument();
        document.documentElement.lang = FALLBACK_LANGUAGE;
        revealPage();
        return FALLBACK_LANGUAGE;
      });
    return initPromise;
  }

  global.FrameI18n = {
    apply,
    init,
    setLanguage,
    t,
    get language() {
      return currentLanguage;
    },
    supportedLanguages: [...SUPPORTED_LANGUAGES],
  };

  init();
})(window);
