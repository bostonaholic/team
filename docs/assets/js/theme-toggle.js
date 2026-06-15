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

  // The <script> tag is at the end of <body>, so the toggle button already
  // exists when this runs — initialize synchronously so the descriptive
  // aria-label upgrades from the generic server label immediately, with no
  // stale window for assistive tech. The DOMContentLoaded fallback only
  // matters if this script is ever moved ahead of the button.
  if (document.querySelector(".theme-toggle")) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
