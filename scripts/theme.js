/**
 * Dark/Light theme — follows system preference by default
 * User override saved in cookie (ra-theme)
 */
(function(){try{var m=document.cookie.match(/(^|\s)ra-theme=([^;]+)/);var t=m&&m[2]?(m[2]):(typeof matchMedia!=='undefined'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();

(function() {
  const COOKIE_KEY = 'ra-theme';

  function getSystemTheme() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) { return 'dark'; }
  }

  function getStoredTheme() {
    try {
      var m = document.cookie.match(new RegExp('(^|\\s)' + COOKIE_KEY + '=([^;]+)'));
      return m && m[2];
    } catch (e) { return null; }
  }

  function getTheme() {
    return getStoredTheme() || getSystemTheme();
  }

  function setTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist !== false) {
      try {
        document.cookie = COOKIE_KEY + '=' + theme + '; path=/; max-age=31536000';
      } catch (e) {}
    }
    updateToggleButton();
    if (typeof onThemeChange === 'function') onThemeChange(theme);
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  function setRadiomapVersionDisplays(v) {
    if (v == null || v === '') return;
    var s = String(v);
    var h = document.getElementById('header-app-version');
    if (h) h.textContent = s;
    var a = document.getElementById('app-version');
    if (a) a.textContent = s;
  }

  function syncHeaderVersionFromCssQuery() {
    var link = document.querySelector('link[rel="stylesheet"][href*="theme.css"]');
    if (!link) return;
    try {
      var u = new URL(link.getAttribute('href'), window.location.href);
      var v = u.searchParams.get('v');
      if (v) setRadiomapVersionDisplays(v);
    } catch (e) {}
  }

  function updateToggleButton() {
    var dark = getTheme() === 'dark';
    var label = dark ? 'Modo claro' : 'Modo oscuro';
    var icon = dark ? 'light_mode' : 'dark_mode';
    var iconSpan = '<span class="material-symbols-outlined" aria-hidden="true">' + icon + '</span>';
    var main = document.getElementById('theme-toggle');
    if (main) {
      main.setAttribute('aria-label', label);
      main.innerHTML = iconSpan;
    }
    document.querySelectorAll('.menu-theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-label', label);
      btn.innerHTML = '<span class="menu-item-icon">' + iconSpan + '</span> Tema claro / oscuro';
    });
  }

  setTheme(getTheme(), false);

  function onDomReadyUi() {
    updateToggleButton();
    syncHeaderVersionFromCssQuery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReadyUi);
  } else {
    onDomReadyUi();
  }

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (!getStoredTheme()) setTheme(getSystemTheme(), false);
    });
  } catch (e) {}

  window.toggleTheme = toggleTheme;
  window.getTheme = getTheme;
  window.setRadiomapVersionDisplays = setRadiomapVersionDisplays;
})();
