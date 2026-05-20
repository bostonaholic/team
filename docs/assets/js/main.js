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
    initToc();
    addAnchorLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
