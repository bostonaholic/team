// ─────────────────────────────────────────────────────────────────────────────
// TEAM site — main.js
// Theme toggle, mobile nav, scroll-reveal, copy-code buttons, TOC tracking
// All DOM construction uses safe createElement/textContent — no innerHTML.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Theme toggle ────────────────────────────────────────────────────────────
  var THEME_KEY = 'team-theme';

  function getTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    applyTheme(getTheme());
    themeBtn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'light' : 'dark');
    }
  });

  // ── Mobile nav ──────────────────────────────────────────────────────────────
  var mobileToggle = document.getElementById('mobile-nav-toggle');
  var mobileNav = document.getElementById('mobile-nav');

  if (mobileToggle && mobileNav) {
    mobileToggle.addEventListener('click', function () {
      var isOpen = mobileNav.classList.contains('is-open');
      mobileNav.classList.toggle('is-open', !isOpen);
      mobileToggle.setAttribute('aria-expanded', String(!isOpen));
    });

    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileNav.classList.remove('is-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
        mobileNav.classList.remove('is-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileToggle.focus();
      }
    });
  }

  // ── Scroll-reveal ────────────────────────────────────────────────────────────
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function revealAll() {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('revealed');
    });
  }

  if (!prefersReduced && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealAll();
  }

  // ── Copy SVG icon (constructed via DOM, not innerHTML) ───────────────────────
  function makeCopySvg() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.width = '12px';
    svg.style.height = '12px';

    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '9');
    rect.setAttribute('y', '9');
    rect.setAttribute('width', '13');
    rect.setAttribute('height', '13');
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');

    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
  }

  // ── Build code block header ──────────────────────────────────────────────────
  function buildHeader(lang) {
    var header = document.createElement('div');
    header.className = 'code-block-header';

    // macOS traffic-light dots
    var dots = document.createElement('div');
    dots.className = 'code-block-header__dots';
    dots.appendChild(document.createElement('span'));
    dots.appendChild(document.createElement('span'));
    dots.appendChild(document.createElement('span'));
    header.appendChild(dots);

    // Language label
    var langEl = document.createElement('span');
    langEl.className = 'code-block-header__lang';
    if (lang) langEl.textContent = lang;
    header.appendChild(langEl);

    // Actions container + copy button
    var actions = document.createElement('div');
    actions.className = 'code-block-header__actions';

    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code to clipboard');

    var btnLabel = document.createElement('span');
    btnLabel.textContent = 'Copy';

    btn.appendChild(makeCopySvg());
    btn.appendChild(btnLabel);
    actions.appendChild(btn);
    header.appendChild(actions);

    return { header: header, btn: btn };
  }

  // ── Detect language from element classes ─────────────────────────────────────
  function detectLang(el) {
    var classes = Array.from(el.classList);
    var lc = classes.find(function (c) { return c.startsWith('language-'); });
    return lc ? lc.replace('language-', '') : '';
  }

  // ── Wrap code blocks ─────────────────────────────────────────────────────────
  function wrapCodeBlocks() {
    // Wrap bare <pre> blocks
    var preBlocks = document.querySelectorAll('pre');
    preBlocks.forEach(function (pre) {
      if (pre.closest('.code-block-wrapper') || pre.closest('.highlight')) return;

      var code = pre.querySelector('code');
      var lang = code ? detectLang(code) : detectLang(pre);

      var wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      var built = buildHeader(lang);
      built.btn.addEventListener('click', function () {
        copyText(pre.textContent || '', built.btn);
      });

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(built.header);
      wrapper.appendChild(pre);
    });

    // Wrap Rouge div.highlight blocks
    var highlights = document.querySelectorAll('div.highlight');
    highlights.forEach(function (div) {
      if (div.closest('.code-block-wrapper')) return;

      var pre = div.querySelector('pre');
      var wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      var built = buildHeader('');
      built.btn.addEventListener('click', function () {
        var target = pre || div;
        copyText(target.textContent || '', built.btn);
      });

      div.parentNode.insertBefore(wrapper, div);
      wrapper.appendChild(built.header);
      wrapper.appendChild(div);
    });
  }

  function copyText(text, btn) {
    var label = btn.querySelector('span');

    function onSuccess() {
      btn.classList.add('copied');
      if (label) label.textContent = 'Copied!';
      setTimeout(function () {
        btn.classList.remove('copied');
        if (label) label.textContent = 'Copy';
      }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(function () {
        fallbackCopy(text, onSuccess);
      });
    } else {
      fallbackCopy(text, onSuccess);
    }
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { /* silent */ }
    document.body.removeChild(ta);
  }

  // ── TOC active tracking ──────────────────────────────────────────────────────
  function initToc() {
    var toc = document.querySelector('.toc');
    if (!toc || !('IntersectionObserver' in window)) return;

    var tocLinks = toc.querySelectorAll('a[href^="#"]');
    var headings = [];

    tocLinks.forEach(function (link) {
      var id = decodeURIComponent(link.getAttribute('href').slice(1));
      var heading = document.getElementById(id);
      if (heading) headings.push({ heading: heading, link: link });
    });

    if (!headings.length) return;

    var active = null;

    var tocObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var match = headings.find(function (h) { return h.heading === entry.target; });
        if (!match) return;
        if (entry.isIntersecting) {
          if (active) active.classList.remove('active');
          match.link.classList.add('active');
          active = match.link;
        }
      });
    }, {
      rootMargin: '-' + (64 + 24) + 'px 0px -70% 0px',
      threshold: 0
    });

    headings.forEach(function (h) { tocObs.observe(h.heading); });
  }

  // ── Progress bar (page load indicator) ───────────────────────────────────────
  function initProgressBar() {
    var bar = document.getElementById('progress-bar');
    if (!bar || prefersReduced) return;

    var pct = 0;

    function tick() {
      if (pct < 88) {
        pct += Math.random() * 14 + 4;
        if (pct > 88) pct = 88;
        bar.style.width = pct + '%';
        setTimeout(tick, 80 + Math.random() * 60);
      }
    }

    tick();

    window.addEventListener('load', function () {
      bar.style.width = '100%';
      setTimeout(function () {
        bar.classList.add('done');
        setTimeout(function () {
          bar.style.width = '0%';
          bar.classList.remove('done');
        }, 600);
      }, 200);
    });
  }

  // ── Heading anchor links ─────────────────────────────────────────────────────
  function addAnchorLinks() {
    var prose = document.querySelector('.prose');
    if (!prose) return;

    prose.querySelectorAll('h2[id], h3[id], h4[id]').forEach(function (h) {
      var anchor = document.createElement('a');
      anchor.className = 'anchor';
      anchor.href = '#' + h.id;
      anchor.setAttribute('aria-hidden', 'true');
      anchor.textContent = '#';
      h.appendChild(anchor);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    wrapCodeBlocks();
    initToc();
    initProgressBar();
    addAnchorLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
