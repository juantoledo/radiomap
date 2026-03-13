/**
 * Dark/Light theme — follows system preference by default
 * User override saved in cookie (ra-theme)
 */
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

  function updateToggleButton() {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', getTheme() === 'dark' ? 'Modo claro' : 'Modo oscuro');
      btn.innerHTML = getTheme() === 'dark' ? '☀' : '☽';
    }
  }

  // Apply on load — use stored override or system preference
  setTheme(getTheme(), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateToggleButton);
  } else {
    updateToggleButton();
  }

  // React to system preference changes when user hasn't overridden
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (!getStoredTheme()) setTheme(getSystemTheme(), false);
    });
  } catch (e) {}

  window.toggleTheme = toggleTheme;
  window.getTheme = getTheme;
})();
