// ==UserScript==
// @name         Pinterest Smooth
// @namespace    local.pinterest.smooth
// @version      0.1.0
// @description  Stop Pinterest autoplay, add real video volume controls, hide promoted clutter, and make browsing less jumpy.
// @match        https://www.pinterest.com/*
// @match        https://www.pinterest.co.uk/*
// @match        https://pinterest.com/*
// @match        https://pinterest.co.uk/*
// @homepageURL  https://github.com/PhadeDev/pinterest-smooth-userscript
// @supportURL   https://github.com/PhadeDev/pinterest-smooth-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/PhadeDev/pinterest-smooth-userscript/main/pinterest-smooth.user.js
// @updateURL    https://raw.githubusercontent.com/PhadeDev/pinterest-smooth-userscript/main/pinterest-smooth.user.js
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const SCRIPT = "psm";
  const PROCESSED = `data-${SCRIPT}-processed`;
  const AD_HIDDEN = `data-${SCRIPT}-ad-hidden`;
  const USER_PLAY = `data-${SCRIPT}-user-play`;
  const CONTROL_ID = `${SCRIPT}-panel`;

  const defaults = {
    blockAutoplay: true,
    addVideoControls: true,
    showVideoBadges: true,
    hidePromoted: true,
    directPinNavigation: true,
    reduceMotion: true,
    compactChrome: false,
    showPanel: true,
    defaultVolume: 35,
  };

  const settings = loadSettings();
  const userIntent = new WeakSet();
  let observer = null;
  let scanQueued = false;

  function gmGet(key, fallback) {
    try {
      return GM_getValue(key, fallback);
    } catch (_) {
      const stored = localStorage.getItem(`${SCRIPT}.${key}`);
      if (stored == null) return fallback;
      try {
        return JSON.parse(stored);
      } catch (__) {
        return stored;
      }
    }
  }

  function gmSet(key, value) {
    try {
      GM_setValue(key, value);
    } catch (_) {
      localStorage.setItem(`${SCRIPT}.${key}`, JSON.stringify(value));
    }
  }

  function loadSettings() {
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, gmGet(key, value)]),
    );
  }

  function saveSetting(key, value) {
    settings[key] = value;
    gmSet(key, value);
    if (key === "hidePromoted" && !value) unhidePromoted();
    if (key === "showVideoBadges" && !value) removeVideoBadges();
    if (key === "addVideoControls" && !value) removeVideoControls();
    queueScan();
    renderPanel();
  }

  function addStyle(css) {
    try {
      GM_addStyle(css);
    } catch (_) {
      const style = document.createElement("style");
      style.textContent = css;
      document.documentElement.appendChild(style);
    }
  }

  addStyle(`
    html.${SCRIPT}-reduce-motion *,
    html.${SCRIPT}-reduce-motion *::before,
    html.${SCRIPT}-reduce-motion *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }

    [${AD_HIDDEN}="true"] {
      display: none !important;
    }

    .${SCRIPT}-video-wrap {
      position: relative !important;
    }

    .${SCRIPT}-video-control {
      align-items: center;
      backdrop-filter: blur(8px);
      background: rgba(17, 17, 17, 0.78);
      border-radius: 999px;
      bottom: 10px;
      color: #fff;
      display: flex;
      font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      gap: 7px;
      left: 10px;
      max-width: calc(100% - 20px);
      opacity: 0;
      padding: 6px 8px;
      pointer-events: auto;
      position: absolute;
      transform: translateY(4px);
      transition: opacity 120ms ease, transform 120ms ease;
      z-index: 2147483000;
    }

    .${SCRIPT}-video-badge {
      align-items: center;
      background: rgba(17, 17, 17, 0.74);
      border-radius: 999px;
      color: #fff;
      display: inline-flex;
      font: 750 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      gap: 5px;
      left: 10px;
      letter-spacing: 0;
      padding: 6px 8px;
      pointer-events: none;
      position: absolute;
      top: 10px;
      z-index: 2147482999;
    }

    .${SCRIPT}-video-badge::before {
      border-bottom: 5px solid transparent;
      border-left: 8px solid #fff;
      border-top: 5px solid transparent;
      content: "";
      display: block;
      height: 0;
      width: 0;
    }

    .${SCRIPT}-quick-play {
      align-items: center;
      background: rgba(255, 255, 255, 0.94);
      border: 0;
      border-radius: 999px;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
      color: #111;
      cursor: pointer;
      display: flex;
      height: 44px;
      justify-content: center;
      left: 50%;
      opacity: 0.92;
      padding: 0;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      transition: opacity 120ms ease, transform 120ms ease;
      width: 44px;
      z-index: 2147483001;
    }

    .${SCRIPT}-quick-play:hover,
    .${SCRIPT}-quick-play:focus-visible {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.05);
    }

    .${SCRIPT}-quick-play::before {
      border-bottom: 10px solid transparent;
      border-left: 16px solid currentColor;
      border-top: 10px solid transparent;
      content: "";
      display: block;
      height: 0;
      margin-left: 4px;
      width: 0;
    }

    .${SCRIPT}-quick-play.${SCRIPT}-is-playing::before {
      border: 0;
      box-shadow: 8px 0 0 currentColor;
      height: 18px;
      margin-left: -8px;
      width: 6px;
      background: currentColor;
    }

    .${SCRIPT}-video-wrap:hover .${SCRIPT}-video-control,
    .${SCRIPT}-video-control:focus-within {
      opacity: 1;
      transform: translateY(0);
    }

    .${SCRIPT}-video-control button {
      align-items: center;
      background: #fff;
      border: 0;
      border-radius: 999px;
      color: #111;
      cursor: pointer;
      display: inline-flex;
      font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      height: 24px;
      justify-content: center;
      min-width: 34px;
      padding: 0 9px;
    }

    .${SCRIPT}-video-control input[type="range"] {
      accent-color: #e60023;
      height: 22px;
      max-width: 110px;
      width: 28vw;
    }

    #${CONTROL_ID} {
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
      color: #111;
      font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: min(310px, calc(100vw - 28px));
      padding: 10px;
      position: fixed;
      right: 14px;
      top: 74px;
      z-index: 2147483647;
    }

    #${CONTROL_ID}.${SCRIPT}-collapsed .${SCRIPT}-panel-body {
      display: none;
    }

    .${SCRIPT}-panel-head {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }

    .${SCRIPT}-panel-title {
      font-weight: 750;
    }

    .${SCRIPT}-panel-head button,
    .${SCRIPT}-panel-row button {
      background: #111;
      border: 0;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font: 700 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 6px 8px;
    }

    .${SCRIPT}-panel-body {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }

    .${SCRIPT}-panel-row {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }

    .${SCRIPT}-panel-row label {
      align-items: center;
      display: flex;
      gap: 7px;
      min-width: 0;
    }

    .${SCRIPT}-panel-row input[type="range"] {
      width: 115px;
    }

    html.${SCRIPT}-compact [data-test-id="floating-footer"],
    html.${SCRIPT}-compact [data-test-id="nags-container"] {
      display: none !important;
    }
  `);

  function setRootClasses() {
    const root = document.documentElement;
    root.classList.toggle(`${SCRIPT}-reduce-motion`, Boolean(settings.reduceMotion));
    root.classList.toggle(`${SCRIPT}-compact`, Boolean(settings.compactChrome));
  }

  function clampVolume(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return defaults.defaultVolume;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function isPinterestHost(hostname) {
    return /(^|\.)pinterest\.(com|co\.uk)$/i.test(hostname);
  }

  function patchMediaPlay() {
    const proto = HTMLMediaElement.prototype;
    if (proto.__psmPlayPatched) return;
    proto.__psmPlayPatched = true;
    const nativePlay = proto.play;

    proto.play = function patchedPlay(...args) {
      if (
        settings.blockAutoplay &&
        this instanceof HTMLVideoElement &&
        !userIntent.has(this) &&
        this.getAttribute(USER_PLAY) !== "true"
      ) {
        this.pause();
        this.muted = true;
        this.autoplay = false;
        this.removeAttribute("autoplay");
        return Promise.resolve();
      }

      return nativePlay.apply(this, args);
    };
  }

  function markUserIntent(video) {
    if (!video) return;
    userIntent.add(video);
    video.setAttribute(USER_PLAY, "true");
  }

  function hardStopVideo(video) {
    video.autoplay = false;
    video.defaultMuted = true;
    video.muted = true;
    video.preload = "metadata";
    video.removeAttribute("autoplay");
    video.removeAttribute("data-autoplay");

    if (!userIntent.has(video) && !video.paused) {
      video.pause();
    }
  }

  function ensureVideoControl(video) {
    const wrapper = findVideoWrapper(video);
    if (!wrapper) return;

    wrapper.classList.add(`${SCRIPT}-video-wrap`);
    ensureVideoBadges(video, wrapper);

    if (!settings.addVideoControls || video.dataset.psmControls === "true") return;

    const control = document.createElement("div");
    control.className = `${SCRIPT}-video-control`;
    control.innerHTML = `
      <button type="button" data-psm-action="play" title="Play or pause">Play</button>
      <button type="button" data-psm-action="mute" title="Mute or unmute">Mute</button>
      <input type="range" min="0" max="100" step="1" value="${clampVolume(settings.defaultVolume)}" title="Volume">
    `;

    const playButton = control.querySelector('[data-psm-action="play"]');
    const muteButton = control.querySelector('[data-psm-action="mute"]');
    const slider = control.querySelector('input[type="range"]');

    const sync = () => {
      playButton.textContent = video.paused ? "Play" : "Pause";
      muteButton.textContent = video.muted || video.volume === 0 ? "Muted" : "Mute";
      const current = Math.round((video.muted ? 0 : video.volume) * 100);
      if (document.activeElement !== slider) slider.value = String(current);
    };

    playButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      markUserIntent(video);
      if (video.paused) {
        video.muted = Number(slider.value) === 0;
        video.volume = clampVolume(slider.value) / 100;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      sync();
    }, true);

    muteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      markUserIntent(video);
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = clampVolume(settings.defaultVolume) / 100;
      sync();
    }, true);

    slider.addEventListener("input", (event) => {
      event.stopPropagation();
      markUserIntent(video);
      const volume = clampVolume(slider.value);
      saveSetting("defaultVolume", volume);
      video.volume = volume / 100;
      video.muted = volume === 0;
      sync();
    });

    ["play", "pause", "volumechange"].forEach((name) => video.addEventListener(name, sync));
    wrapper.appendChild(control);
    video.dataset.psmControls = "true";
    sync();
  }

  function removeVideoControls() {
    document.querySelectorAll(`.${SCRIPT}-video-control`).forEach((element) => element.remove());
    document.querySelectorAll("video[data-psm-controls]").forEach((video) => {
      delete video.dataset.psmControls;
    });
  }

  function ensureVideoBadges(video, wrapper) {
    if (!settings.showVideoBadges || video.dataset.psmBadges === "true") return;

    const badge = document.createElement("div");
    badge.className = `${SCRIPT}-video-badge`;
    badge.textContent = "Video";

    const quickPlay = document.createElement("button");
    quickPlay.className = `${SCRIPT}-quick-play`;
    quickPlay.type = "button";
    quickPlay.title = "Play video";
    quickPlay.setAttribute("aria-label", "Play video");

    const sync = () => {
      const isPlaying = !video.paused && !video.ended;
      quickPlay.classList.toggle(`${SCRIPT}-is-playing`, isPlaying);
      quickPlay.title = isPlaying ? "Pause video" : "Play video";
      quickPlay.setAttribute("aria-label", quickPlay.title);
    };

    quickPlay.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      markUserIntent(video);
      if (video.paused || video.ended) {
        video.volume = clampVolume(settings.defaultVolume) / 100;
        video.muted = video.volume === 0;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      sync();
    }, true);

    ["play", "pause", "ended"].forEach((name) => video.addEventListener(name, sync));
    wrapper.appendChild(badge);
    wrapper.appendChild(quickPlay);
    video.dataset.psmBadges = "true";
    sync();
  }

  function removeVideoBadges() {
    document.querySelectorAll(`.${SCRIPT}-video-badge, .${SCRIPT}-quick-play`).forEach((element) => element.remove());
    document.querySelectorAll("video[data-psm-badges]").forEach((video) => {
      delete video.dataset.psmBadges;
    });
  }

  function findVideoWrapper(video) {
    return (
      video.closest('[data-test-id="story-pin-video-block"]') ||
      video.closest('[data-blended-ui-video="true"]') ||
      video.parentElement
    );
  }

  function processVideos(root = document) {
    root.querySelectorAll("video").forEach((video) => {
      if (settings.blockAutoplay) hardStopVideo(video);
      if (!video.hasAttribute(PROCESSED)) {
        video.setAttribute(PROCESSED, "true");
        video.addEventListener("click", () => markUserIntent(video), true);
        video.addEventListener("pointerdown", () => markUserIntent(video), true);
      }
      ensureVideoControl(video);
    });
  }

  function cardFor(element) {
    return (
      element.closest('[data-grid-item="true"]') ||
      element.closest('[role="listitem"]') ||
      element.closest('[data-test-id*="pin" i]') ||
      element.closest("article") ||
      element.closest("section")
    );
  }

  function hasAdText(element) {
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    return /\b(promoted|sponsored|advertisement|ad by|paid partnership|shop now)\b/i.test(text);
  }

  function hasAdMetadata(element) {
    const html = element.outerHTML || "";
    return /"is_ad"\s*:\s*true|"is_promoted"\s*:\s*true|"promoted_is_lead_ad"\s*:\s*true|promoter|ad_destination|sponsor/i.test(html);
  }

  function hidePromoted(root = document) {
    if (!settings.hidePromoted) return;

    const candidates = new Set();
    root.querySelectorAll(
      [
        '[aria-label*="Promoted" i]',
        '[aria-label*="Sponsored" i]',
        '[title*="Promoted" i]',
        '[title*="Sponsored" i]',
        'a[href*="/ads/"]',
        'a[href*="adclick"]',
        'a[href*="promoted"]',
        'a[href*="epik="]',
        'a[href*="utm_campaign"]',
      ].join(","),
    ).forEach((element) => candidates.add(element));

    root.querySelectorAll('[data-grid-item="true"], [role="listitem"], article, section').forEach((element) => {
      if (hasAdText(element) || hasAdMetadata(element)) candidates.add(element);
    });

    candidates.forEach((element) => {
      const card = cardFor(element) || element;
      if (card && card !== document.body && card !== document.documentElement) {
        card.setAttribute(AD_HIDDEN, "true");
      }
    });
  }

  function unhidePromoted() {
    document.querySelectorAll(`[${AD_HIDDEN}="true"]`).forEach((element) => {
      element.removeAttribute(AD_HIDDEN);
    });
  }

  function patchNavigation() {
    document.addEventListener("click", (event) => {
      if (!settings.directPinNavigation) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest?.("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (!/^\/pin\/\d+\/?/.test(href) && !/^https?:\/\/[^/]*pinterest\.(com|co\.uk)\/pin\/\d+\/?/i.test(href)) return;
      if (event.target.closest("button, input, textarea, select, [role='button'], [aria-haspopup='true']")) return;

      const url = new URL(link.href, location.href);
      if (!isPinterestHost(url.hostname)) return;

      event.preventDefault();
      event.stopPropagation();
      location.assign(url.href);
    }, true);
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("Pinterest Smooth: toggle panel", () => {
      saveSetting("showPanel", !settings.showPanel);
    });
    GM_registerMenuCommand("Pinterest Smooth: toggle autoplay block", () => {
      saveSetting("blockAutoplay", !settings.blockAutoplay);
    });
    GM_registerMenuCommand("Pinterest Smooth: toggle promoted hiding", () => {
      saveSetting("hidePromoted", !settings.hidePromoted);
    });
  }

  function makeCheckbox(key, label) {
    const checked = settings[key] ? "checked" : "";
    return `<label><input type="checkbox" data-psm-setting="${key}" ${checked}> ${label}</label>`;
  }

  function renderPanel() {
    const existing = document.getElementById(CONTROL_ID);
    if (!settings.showPanel) {
      existing?.remove();
      return;
    }
    if (!document.body) return;

    let panel = existing;
    if (!panel) {
      panel = document.createElement("div");
      panel.id = CONTROL_ID;
      document.body.appendChild(panel);
    }

    const collapsed = gmGet("panelCollapsed", false);
    panel.classList.toggle(`${SCRIPT}-collapsed`, Boolean(collapsed));
    panel.innerHTML = `
      <div class="${SCRIPT}-panel-head">
        <div class="${SCRIPT}-panel-title">Pinterest Smooth</div>
        <button type="button" data-psm-collapse>${collapsed ? "Open" : "Hide"}</button>
      </div>
      <div class="${SCRIPT}-panel-body">
        <div class="${SCRIPT}-panel-row">${makeCheckbox("blockAutoplay", "Stop autoplay")}</div>
        <div class="${SCRIPT}-panel-row">${makeCheckbox("addVideoControls", "Volume controls")}</div>
        <div class="${SCRIPT}-panel-row">${makeCheckbox("showVideoBadges", "Video play badges")}</div>
        <div class="${SCRIPT}-panel-row">${makeCheckbox("hidePromoted", "Hide promoted")}</div>
        <div class="${SCRIPT}-panel-row">${makeCheckbox("directPinNavigation", "Direct pin clicks")}</div>
        <div class="${SCRIPT}-panel-row">${makeCheckbox("reduceMotion", "Reduce motion")}</div>
        <div class="${SCRIPT}-panel-row">${makeCheckbox("compactChrome", "Less page clutter")}</div>
        <div class="${SCRIPT}-panel-row">
          <label>Default volume</label>
          <input type="range" min="0" max="100" step="1" data-psm-volume value="${clampVolume(settings.defaultVolume)}">
        </div>
      </div>
    `;

    panel.querySelector("[data-psm-collapse]").addEventListener("click", () => {
      gmSet("panelCollapsed", !collapsed);
      renderPanel();
    });

    panel.querySelectorAll("[data-psm-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        saveSetting(input.dataset.psmSetting, input.checked);
        setRootClasses();
      });
    });

    panel.querySelector("[data-psm-volume]").addEventListener("input", (event) => {
      saveSetting("defaultVolume", clampVolume(event.target.value));
    });
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      setRootClasses();
      processVideos(document);
      hidePromoted(document);
      renderPanel();
    });
  }

  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.("video") || node.querySelector?.("video")) {
            processVideos(node);
          }
          if (settings.hidePromoted) {
            hidePromoted(node);
          }
        }
      }
      queueScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    patchMediaPlay();
    patchNavigation();
    registerMenu();
    setRootClasses();
    startObserver();
    queueScan();
    window.addEventListener("pageshow", queueScan);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        document.querySelectorAll("video").forEach((video) => video.pause());
      } else {
        queueScan();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    patchMediaPlay();
    startObserver();
  } else {
    init();
  }
})();
