(function () {
  "use strict";

  var MODES = ["system", "light", "dark"];

  function readStored() {
    try {
      var t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") {
        return t;
      }
    } catch (e) {}
    return "system";
  }

  function persist(mode) {
    try {
      if (mode === "system") {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", mode);
      }
    } catch (e) {}
  }

  function apply(mode) {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
  }

  function next(mode) {
    var i = MODES.indexOf(mode);
    return MODES[(i + 1) % MODES.length];
  }

  function updateAria(button, mode) {
    var upcoming = next(mode);
    button.setAttribute(
      "aria-label",
      "Theme: " + mode + ". Activate to switch to " + upcoming + "."
    );
  }

  function init() {
    var button = document.querySelector(".theme-toggle");
    if (!button) {
      return;
    }

    var current = readStored();
    updateAria(button, current);

    button.addEventListener("click", function () {
      current = next(current);
      apply(current);
      persist(current);
      updateAria(button, current);
    });
  }

  // The script tag uses `defer`, so the browser guarantees the full document
  // is parsed before this runs — the toggle button always exists, and this
  // executes before DOMContentLoaded. No readiness guard needed.
  init();
})();
