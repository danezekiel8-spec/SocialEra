(function () {
  const STORAGE_KEY = 'socialera-theme';

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // no-op
    }
    updateToggle(theme);
  }

  function getPreferredTheme() {
    const saved = getSavedTheme();
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  }

  function createToggle() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.setAttribute('aria-label', 'Toggle dark mode');
    button.innerHTML = '<span class="theme-toggle-icon">◐</span><span class="theme-toggle-label">Dark</span>';
    button.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
    return button;
  }

  function updateToggle(theme) {
    document.querySelectorAll('.theme-toggle').forEach((button) => {
      const label = button.querySelector('.theme-toggle-label');
      if (label) {
        label.textContent = theme === 'dark' ? 'Light' : 'Dark';
      }
      button.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  function injectToggle() {
    if (document.querySelector('.theme-toggle')) {
      updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
      return;
    }

    const toggleSlot = document.querySelector('.theme-toggle-slot');
    if (toggleSlot) {
      toggleSlot.appendChild(createToggle());
      updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
      return;
    }

    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
      headerRight.insertBefore(createToggle(), headerRight.firstChild);
      updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
      return;
    }

    const topNav = document.querySelector('.top-nav');
    if (topNav) {
      topNav.appendChild(createToggle());
      updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
      return;
    }

    const nav = document.querySelector('header nav');
    if (nav) {
      nav.appendChild(createToggle());
      updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
      return;
    }
  }

  setTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', function () {
    injectToggle();
    updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
  });
})();
