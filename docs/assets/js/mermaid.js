(function () {
  "use strict";

  // Pinned: a mermaid release can never silently change how the docs render.
  var MERMAID_URL =
    "https://cdn.jsdelivr.net/npm/mermaid@11.16.1/dist/mermaid.esm.min.mjs";

  // kramdown emits `<pre><code class="language-mermaid">` for a fenced
  // ```mermaid block. The second selector covers the rouge-wrapped shape
  // (`div.language-mermaid > div.highlight > pre > code`) in case a future
  // highlighter config produces it — the two shapes never both match.
  var SELECTOR = "pre > code.language-mermaid, .language-mermaid pre > code";

  // The whole site is monospace (body font-family in site.css). Diagram labels
  // follow, or they read as a foreign element on the page.
  var FONT =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace';

  var diagrams = [];
  var mermaid = null;
  var pass = 0;

  function cssVar(name, fallback) {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  }

  // Diagrams are themed from the site's own custom properties rather than a
  // built-in mermaid theme, so light/dark stay in step with everything else.
  function themeVariables() {
    var bg = cssVar("--bg", "#fff");
    var fg = cssVar("--fg", "#111");
    var fill = cssVar("--code-bg", "rgba(0, 0, 0, 0.04)");
    var border = cssVar("--muted", "#5a5a5a");
    return {
      background: bg,
      primaryColor: fill,
      secondaryColor: fill,
      tertiaryColor: bg,
      primaryTextColor: fg,
      secondaryTextColor: fg,
      tertiaryTextColor: fg,
      primaryBorderColor: fg,
      secondaryBorderColor: fg,
      tertiaryBorderColor: border,
      nodeBorder: fg,
      mainBkg: fill,
      lineColor: fg,
      textColor: fg,
      titleColor: fg,
      clusterBkg: bg,
      clusterBorder: border,
      edgeLabelBackground: bg,
      fontFamily: FONT,
      fontSize: "13px"
    };
  }

  function collect() {
    var codes = document.querySelectorAll(SELECTOR);
    var found = [];
    for (var i = 0; i < codes.length; i++) {
      found.push({
        // textContent decodes the HTML-escaped `<br/>` and `<i>` tags in the
        // fenced source back to the markup mermaid expects in node labels.
        source: codes[i].textContent,
        pre: codes[i].parentNode,
        figure: null
      });
    }
    return found;
  }

  function mount() {
    diagrams.forEach(function (diagram) {
      var figure = document.createElement("figure");
      figure.className = "mermaid-figure";
      diagram.pre.parentNode.replaceChild(figure, diagram.pre);
      diagram.figure = figure;
    });
  }

  // Only a graph too wide for the prose column earns the breakout, and it grows
  // no wider than it needs; see .mermaid-figure.is-wide in site.css. The class
  // comes off before measuring, so the decision is made against the column
  // width and a re-render can never flip a borderline diagram back and forth.
  function fit(figure) {
    var width = figure.querySelector("svg").getBoundingClientRect().width;
    figure.style.setProperty("--diagram-width", Math.ceil(width) + "px");
    figure.classList.remove("is-wide");
    if (width > figure.clientWidth) {
      figure.classList.add("is-wide");
    }
  }

  function render() {
    if (!mermaid) {
      return;
    }
    // A re-render (theme switch) needs fresh ids: mermaid keys internal state
    // off them, so reusing an id from the previous pass collides.
    pass++;
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: themeVariables(),
      // useMaxWidth: false keeps each SVG at its natural size — scaling a graph
      // this large down to a phone's width makes the labels unreadable, so the
      // figure scrolls instead. Straight edges and tight spacing suit the
      // terminal aesthetic and keep the tall graphs from stretching further.
      flowchart: {
        htmlLabels: true,
        useMaxWidth: false,
        curve: "linear",
        nodeSpacing: 40,
        rankSpacing: 45
      },
      fontFamily: FONT
    });
    diagrams.forEach(function (diagram, index) {
      mermaid
        .render("mermaid-" + pass + "-" + index, diagram.source)
        .then(function (result) {
          diagram.figure.innerHTML = result.svg;
          fit(diagram.figure);
        })
        .catch(function (error) {
          // Fail loud but local: restore the source rather than leave an empty
          // box where a diagram should be.
          diagram.figure.innerHTML = "";
          diagram.figure.appendChild(diagram.pre);
          console.error("mermaid: diagram " + index + " failed to render", error);
        });
    });
  }

  // The toggle sets data-theme for a forced mode and removes it for "system";
  // an attributeFilter observer sees both. The media listener covers a system
  // mode change while no theme is forced.
  function watchTheme() {
    new MutationObserver(render).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", render);
  }

  function init() {
    diagrams = collect();
    if (diagrams.length === 0) {
      // No diagrams on this page: never pull ~1 MB of mermaid over the wire.
      return;
    }
    import(MERMAID_URL)
      .then(function (module) {
        mermaid = module.default;
        // Swap the markup only once mermaid is in hand, so a blocked CDN or an
        // offline reader keeps the diagrams readable as fenced source.
        mount();
        render();
        watchTheme();
      })
      .catch(function (error) {
        console.error("mermaid: failed to load " + MERMAID_URL, error);
      });
  }

  // The script tag uses `defer`, so the document is fully parsed before this
  // runs and every fenced block already exists. No readiness guard needed.
  init();
})();
