(function () {
  "use strict";

  function init() {
    document.querySelectorAll("main h3[id]").forEach(function (heading) {
      var anchor = document.createElement("a");
      anchor.className = "heading-anchor";
      anchor.href = "#" + heading.id;
      anchor.setAttribute("aria-label", "Link to this section");
      anchor.title = "Link to this section";
      anchor.textContent = "#";
      heading.appendChild(document.createTextNode(" "));
      heading.appendChild(anchor);
    });
  }

  init();
})();
