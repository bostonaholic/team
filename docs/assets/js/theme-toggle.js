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
    button.setAttribute("aria-pressed", mode === "system" ? "false" : "true");
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
