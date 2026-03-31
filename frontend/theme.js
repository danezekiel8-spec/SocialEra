(function () {
  const STORAGE_KEY = 'socialera-theme';
  const APP_MANIFEST_PATH = 'manifest.webmanifest';
  const APP_ICON_PATH = 'assets/socialera-app-icon.svg';
  const SUPABASE_SCRIPT_PATH = 'supabase.js';
  const SUPABASE_WAIT_MS = 5000;
  const ACCOUNT_PUBLIC_PAGES = {
    'shop.html': true,
    'login.html': true,
    'signup.html': true,
    'register.html': true,
    'admin.html': true,
    'support.html': true
  };

  function getPageName() {
    var path = window.location.pathname || '';
    var name = path.split('/').pop();
    return name || 'index.html';
  }

  function isProtectedAccountPage() {
    return !ACCOUNT_PUBLIC_PAGES[getPageName()];
  }

  function getRequestedRedirectTarget() {
    return String(window.location.pathname || '/index.html')
      + String(window.location.search || '')
      + String(window.location.hash || '');
  }

  function getLoginRedirectUrl() {
    return 'login.html?redirect=' + encodeURIComponent(getRequestedRedirectTarget());
  }

  function redirectToLogin() {
    if (getPageName() === 'login.html') {
      return;
    }

    window.location.replace(getLoginRedirectUrl());
  }

  function releaseAccountPageLock() {
    document.documentElement.classList.remove('auth-gate-pending');
    document.documentElement.classList.add('auth-gate-ready');
  }

  function lockAccountPageUntilVerified() {
    if (!isProtectedAccountPage()) {
      document.documentElement.classList.add('auth-gate-ready');
      return;
    }

    document.documentElement.classList.add('auth-gate-pending');
    document.documentElement.classList.remove('auth-gate-ready');
  }

  function getStoredSupabaseSession() {
    var keys = [
      'sb-kfunqpatayfkscilhncx-auth-token',
      'supabase.auth.token'
    ];

    function parseStoredValue(raw) {
      if (!raw) {
        return null;
      }

      try {
        var parsed = JSON.parse(raw);

        if (Array.isArray(parsed) && parsed.length) {
          parsed = parsed[0];
        }

        if (parsed && typeof parsed === 'object') {
          if (parsed.currentSession && parsed.currentSession.access_token) {
            return parsed.currentSession;
          }

          if (parsed.access_token || parsed.refresh_token || parsed.user) {
            return parsed;
          }
        }
      } catch (error) {
        return null;
      }

      return null;
    }

    for (var index = 0; index < keys.length; index += 1) {
      try {
        var session = parseStoredValue(localStorage.getItem(keys[index]));

        if (session) {
          return session;
        }
      } catch (error) {
        return null;
      }
    }

    return null;
  }

  function ensureSupabaseLoaded() {
    if (window.__socialEraSupabasePromise) {
      return window.__socialEraSupabasePromise;
    }

    window.__socialEraSupabasePromise = new Promise(function (resolve, reject) {
      var startTime = Date.now();
      var script = document.querySelector('script[data-socialera-supabase-bootstrap="true"], script[src$="supabase.js"]');
      var readyDispatched = false;

      function dispatchReadyEvent() {
        if (readyDispatched || window.__socialEraSupabaseReadyDispatched) {
          return;
        }

        readyDispatched = true;
        window.__socialEraSupabaseReadyDispatched = true;
        window.dispatchEvent(new CustomEvent('socialera:supabase-ready', {
          detail: {
            supabase: window.supabase
          }
        }));
      }

      function dispatchErrorEvent(error) {
        window.dispatchEvent(new CustomEvent('socialera:supabase-error', {
          detail: {
            error: error
          }
        }));
      }

      function finishWithClient() {
        if (window.supabase && window.supabase.auth) {
          dispatchReadyEvent();
          resolve(window.supabase);
          return true;
        }

        return false;
      }

      function pollForClient() {
        if (finishWithClient()) {
          return;
        }

        if (Date.now() - startTime > SUPABASE_WAIT_MS) {
          var timeoutError = new Error('Supabase did not load in time.');
          dispatchErrorEvent(timeoutError);
          reject(timeoutError);
          return;
        }

        window.setTimeout(pollForClient, 60);
      }

      if (finishWithClient()) {
        return;
      }

      if (!script) {
        script = document.createElement('script');
        script.type = 'module';
        script.src = SUPABASE_SCRIPT_PATH;
        script.setAttribute('data-socialera-supabase-bootstrap', 'true');
        script.addEventListener('error', function () {
          var loadError = new Error('Supabase bootstrap failed to load.');
          dispatchErrorEvent(loadError);
          reject(loadError);
        }, { once: true });
        document.head.appendChild(script);
      }

      pollForClient();
    }).catch(function (error) {
      window.__socialEraSupabasePromise = null;
      throw error;
    });

    return window.__socialEraSupabasePromise;
  }

  function bootstrapSharedSupabase() {
    ensureSupabaseLoaded().catch(function (error) {
      console.warn('SocialEra Supabase bootstrap failed:', error);
    });
  }

  async function enforceAccountAccess() {
    var supabase;
    var sessionResult;
    var session;

    if (!isProtectedAccountPage()) {
      releaseAccountPageLock();
      return true;
    }

    if (!getStoredSupabaseSession()) {
      redirectToLogin();
      return false;
    }

    try {
      supabase = await ensureSupabaseLoaded();
      sessionResult = await supabase.auth.getSession();
      session = sessionResult && sessionResult.data ? sessionResult.data.session : null;

      if (!session || !session.user) {
        redirectToLogin();
        return false;
      }

      releaseAccountPageLock();
      return true;
    } catch (error) {
      console.warn('SocialEra account gate fallback triggered:', error);
      releaseAccountPageLock();
      return true;
    }
  }

  function ensureHeadLink(rel, href, extra) {
    var selector = 'link[rel="' + rel + '"]';
    var link = document.head.querySelector(selector);

    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }

    link.href = href;

    if (extra && extra.type) {
      link.type = extra.type;
    }

    if (extra && extra.sizes) {
      link.sizes = extra.sizes;
    }
  }

  function ensureHeadMeta(name, content) {
    var meta = document.head.querySelector('meta[name="' + name + '"]');

    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }

    meta.setAttribute('content', content);
  }

  function ensureAppMeta() {
    if (!document.head) {
      return;
    }

    ensureHeadLink('manifest', APP_MANIFEST_PATH, { type: 'application/manifest+json' });
    ensureHeadLink('icon', APP_ICON_PATH, { type: 'image/svg+xml' });
    ensureHeadLink('apple-touch-icon', APP_ICON_PATH);
    ensureHeadMeta('theme-color', '#111111');
    ensureHeadMeta('mobile-web-app-capable', 'yes');
    ensureHeadMeta('apple-mobile-web-app-capable', 'yes');
    ensureHeadMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    ensureHeadMeta('apple-mobile-web-app-title', 'SocialEra');
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function (error) {
        console.warn('SocialEra service worker registration failed:', error);
      });
    });
  }

  function initInstallPromptBridge() {
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      window.__socialEraInstallPrompt = event;
      document.documentElement.classList.add('socialera-install-ready');
      window.dispatchEvent(new CustomEvent('socialera:install-ready'));
      updateInstallButton();
    });

    window.addEventListener('appinstalled', function () {
      window.__socialEraInstallPrompt = null;
      document.documentElement.classList.remove('socialera-install-ready');
      window.dispatchEvent(new CustomEvent('socialera:installed'));
      updateInstallButton();
    });
  }

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
    button.setAttribute('data-hover-label', 'Dark mode');
    button.innerHTML = '<span class="theme-toggle-icon">◐</span><span class="theme-toggle-label">Dark</span>';
    button.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
    return button;
  }

  function createInstallButton() {
    var button = document.createElement('button');

    button.type = 'button';
    button.className = 'app-install-button';
    button.setAttribute('aria-label', 'Install app');
    button.setAttribute('data-hover-label', 'Install app');
    button.innerHTML = '<span class="app-install-icon" aria-hidden="true">↓</span><span class="app-install-label">Install</span>';
    button.addEventListener('click', handleInstallButtonClick);

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

  function updateInstallButton() {
    var isInstalled = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

    if (!isInstalled && typeof navigator.standalone === 'boolean') {
      isInstalled = navigator.standalone;
    }

    document.querySelectorAll('.app-install-button').forEach(function (button) {
      var promptReady = Boolean(window.__socialEraInstallPrompt);
      var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
      var label = button.querySelector('.app-install-label');

      button.classList.toggle('is-ready', promptReady);
      button.classList.toggle('is-installed', isInstalled);
      button.disabled = isInstalled;

      if (label) {
        label.textContent = isInstalled ? 'Installed' : 'Install';
      }

      if (isInstalled) {
        button.setAttribute('title', 'App already installed');
        return;
      }

      if (promptReady) {
        button.setAttribute('title', 'Install SocialEra');
        return;
      }

      if (isIos) {
        button.setAttribute('title', 'Use Share > Add to Home Screen');
        return;
      }

      button.setAttribute('title', 'Install becomes available in supported browsers');
    });
  }

  async function handleInstallButtonClick() {
    var installEvent = window.__socialEraInstallPrompt;
    var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');

    if (installEvent && typeof installEvent.prompt === 'function') {
      try {
        installEvent.prompt();
        await installEvent.userChoice;
      } catch (error) {
        console.warn('SocialEra install prompt failed:', error);
      } finally {
        window.__socialEraInstallPrompt = null;
        document.documentElement.classList.remove('socialera-install-ready');
        updateInstallButton();
      }
      return;
    }

    if (isIos) {
      window.alert('To install SocialEra on iPhone or iPad, tap Share and then choose "Add to Home Screen".');
      return;
    }

    window.alert('Install becomes available in supported browsers after a refresh and a little interaction with the site.');
  }

  function getToggleMount() {
    var nav = document.querySelector('body > header .top-nav');
    var cartButton = nav ? nav.querySelector('.header-cart-circle') : null;
    var slot = document.querySelector('.theme-toggle-slot');

    if (nav) {
      return {
        parent: nav,
        before: cartButton || null
      };
    }

    if (slot) {
      return {
        parent: slot,
        before: null
      };
    }

    return {
      parent: document.body,
      before: null
    };
  }

  function injectToggle() {
    var existing = document.querySelector('.theme-toggle');
    var mount = getToggleMount();
    var button = existing || createToggle();

    if (!mount.parent) {
      return;
    }

    if (mount.before) {
      mount.parent.insertBefore(button, mount.before);
    } else if (button.parentElement !== mount.parent) {
      mount.parent.appendChild(button);
    } else if (!button.isConnected) {
      mount.parent.appendChild(button);
    }

    updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
  }

  function injectInstallButton() {
    var existing = document.querySelector('.app-install-button');
    var mount = getToggleMount();
    var button = existing || createInstallButton();

    if (!mount.parent) {
      return;
    }

    if (mount.before) {
      mount.parent.insertBefore(button, mount.before);
    } else if (button.parentElement !== mount.parent) {
      mount.parent.appendChild(button);
    } else if (!button.isConnected) {
      mount.parent.appendChild(button);
    }

    updateInstallButton();
  }

  function initMobileHeaderSearch() {
    var mediaQuery = window.matchMedia('(max-width: 900px)');

    document.querySelectorAll('body > header').forEach(function (header) {
      var toggle = header.querySelector('.header-search-toggle');
      var search = header.querySelector('.header-search');
      var input = search ? search.querySelector('input') : null;

      if (!toggle || !search || !input || toggle.dataset.mobileSearchBound === 'true') {
        return;
      }

      toggle.dataset.mobileSearchBound = 'true';
      header.classList.add('has-mobile-search-toggle');
      toggle.setAttribute('aria-expanded', 'false');

      function closeMobileSearch() {
        header.classList.remove('mobile-search-open');
        toggle.setAttribute('aria-expanded', 'false');
      }

      function openMobileSearch() {
        header.classList.add('mobile-search-open');
        toggle.setAttribute('aria-expanded', 'true');
        window.setTimeout(function () {
          input.focus();
        }, 0);
      }

      toggle.addEventListener('click', function (event) {
        event.preventDefault();

        if (!mediaQuery.matches) {
          input.focus();
          return;
        }

        if (header.classList.contains('mobile-search-open')) {
          closeMobileSearch();
          toggle.focus();
          return;
        }

        openMobileSearch();
      });

      input.addEventListener('focus', function () {
        if (mediaQuery.matches) {
          header.classList.add('mobile-search-open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && mediaQuery.matches) {
          closeMobileSearch();
          toggle.focus();
        }
      });

      document.addEventListener('click', function (event) {
        if (!mediaQuery.matches) {
          return;
        }

        if (event.target.closest('.header-search-toggle') || event.target.closest('.header-search')) {
          return;
        }

        closeMobileSearch();
      });

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', function (event) {
          if (!event.matches) {
            closeMobileSearch();
          }
        });
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(function (event) {
          if (!event.matches) {
            closeMobileSearch();
          }
        });
      }
    });
  }

  function initHeaderHoverLabels() {
    var hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    var selector = [
      'body > header .header-search-toggle',
      'body > header .app-install-button',
      'body > header .header-utility-link',
      'body > header .header-profile-link',
      'body > header .header-cart-circle',
      'body > header .theme-toggle',
      'body > header .home-plus-button'
    ].join(', ');
    var tooltip = null;
    var activeTarget = null;

    function ensureTooltip() {
      if (tooltip) {
        return tooltip;
      }

      tooltip = document.createElement('div');
      tooltip.className = 'header-hover-tooltip';
      tooltip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltip);
      return tooltip;
    }

    function getTarget(node) {
      if (!node || !node.closest) {
        return null;
      }

      return node.closest(selector);
    }

    function getLabel(target) {
      if (!target) {
        return '';
      }

      if (target.dataset.hoverLabel) {
        return target.dataset.hoverLabel;
      }

      if (target.classList.contains('header-search-toggle')) {
        return 'Search';
      }

      if (target.classList.contains('header-utility-link')) {
        return target.getAttribute('aria-label') || 'Notifications';
      }

      if (target.classList.contains('header-profile-link')) {
        return 'Profile';
      }

      if (target.classList.contains('header-cart-circle')) {
        return target.getAttribute('aria-label') || 'Cart';
      }

      if (target.classList.contains('theme-toggle')) {
        return 'Dark mode';
      }

      if (target.classList.contains('home-plus-button')) {
        return target.getAttribute('aria-label') || 'Create post';
      }

      return target.getAttribute('aria-label') || '';
    }

    function suppressNativeTitle(target) {
      if (!target || !target.hasAttribute('title')) {
        return;
      }

      target.dataset.hoverTitle = target.getAttribute('title') || '';
      target.removeAttribute('title');
    }

    function restoreNativeTitle(target) {
      if (!target || !Object.prototype.hasOwnProperty.call(target.dataset, 'hoverTitle')) {
        return;
      }

      if (target.dataset.hoverTitle) {
        target.setAttribute('title', target.dataset.hoverTitle);
      }

      delete target.dataset.hoverTitle;
    }

    function positionTooltip(target) {
      var label = getLabel(target);
      var tip = ensureTooltip();
      var rect;
      var top;

      if (!label) {
        return;
      }

      tip.textContent = label;
      tip.classList.add('is-visible');

      rect = target.getBoundingClientRect();
      top = rect.bottom + 10;

      tip.style.left = (rect.left + (rect.width / 2)) + 'px';
      tip.style.top = top + 'px';
    }

    function hideTooltip(target) {
      if (target) {
        restoreNativeTitle(target);
      }

      activeTarget = null;

      if (!tooltip) {
        return;
      }

      tooltip.classList.remove('is-visible');
    }

    document.addEventListener('mouseover', function (event) {
      var target;

      if (!hoverQuery.matches) {
        return;
      }

      target = getTarget(event.target);

      if (!target || target === activeTarget) {
        return;
      }

      if (activeTarget) {
        restoreNativeTitle(activeTarget);
      }

      suppressNativeTitle(target);
      activeTarget = target;
      positionTooltip(target);
    });

    document.addEventListener('mouseout', function (event) {
      var target = getTarget(event.target);

      if (!target || target !== activeTarget) {
        return;
      }

      if (event.relatedTarget && target.contains(event.relatedTarget)) {
        return;
      }

      hideTooltip(target);
    });

    window.addEventListener('scroll', function () {
      if (!activeTarget) {
        return;
      }

      hideTooltip(activeTarget);
    }, true);

    window.addEventListener('resize', function () {
      if (!activeTarget) {
        return;
      }

      positionTooltip(activeTarget);
    });

    if (hoverQuery.addEventListener) {
      hoverQuery.addEventListener('change', function (event) {
        if (!event.matches) {
          hideTooltip(activeTarget);
        }
      });
    } else if (hoverQuery.addListener) {
      hoverQuery.addListener(function (event) {
        if (!event.matches) {
          hideTooltip(activeTarget);
        }
      });
    }
  }

  function initMessageWidget() {
    var pageName = (window.location.pathname || '').split('/').pop() || 'index.html';
    var existingStyles = document.querySelector('link[data-message-widget-styles="true"]');
    var existingHelpers = document.querySelector('script[data-message-widget-helpers="true"]');
    var existingTemplates = document.querySelector('script[data-message-widget-templates="true"]');
    var helpers;
    var styles;
    var script;
    var templates;

    if (pageName === 'messages.html') {
      return;
    }

    if (!existingStyles) {
      styles = document.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = 'messages-widget.css';
      styles.setAttribute('data-message-widget-styles', 'true');
      document.head.appendChild(styles);
    }

    function ensureMainScript() {
      if (window.__socialEraMessageWidgetLoaded || document.querySelector('script[data-message-widget-script="true"]')) {
        return;
      }

      script = document.createElement('script');
      script.src = 'messages-widget.js';
      script.async = false;
      script.setAttribute('data-message-widget-script', 'true');
      document.body.appendChild(script);
    }

    function ensureTemplateScript() {
      if (window.SocialEraMessageWidgetTemplates) {
        ensureMainScript();
        return;
      }

      if (existingTemplates) {
        existingTemplates.addEventListener('load', ensureMainScript, { once: true });
        return;
      }

      templates = document.createElement('script');
      templates.src = 'messages-widget-templates.js';
      templates.async = false;
      templates.setAttribute('data-message-widget-templates', 'true');
      templates.addEventListener('load', ensureMainScript, { once: true });
      document.body.appendChild(templates);
    }

    if (window.SocialEraMessageWidgetUtils) {
      ensureTemplateScript();
      return;
    }

    if (existingHelpers) {
      existingHelpers.addEventListener('load', ensureTemplateScript, { once: true });
      return;
    }

    helpers = document.createElement('script');
    helpers.src = 'messages-widget-helpers.js';
    helpers.async = false;
    helpers.setAttribute('data-message-widget-helpers', 'true');
    helpers.addEventListener('load', ensureTemplateScript, { once: true });
    document.body.appendChild(helpers);
  }

  window.ensureSocialEraSupabase = ensureSupabaseLoaded;
  lockAccountPageUntilVerified();
  ensureAppMeta();
  bootstrapSharedSupabase();
  registerServiceWorker();
  initInstallPromptBridge();
  setTheme(getPreferredTheme());
  enforceAccountAccess();

  document.addEventListener('DOMContentLoaded', function () {
    injectInstallButton();
    injectToggle();
    initMobileHeaderSearch();
    initHeaderHoverLabels();
    initMessageWidget();
    updateToggle(document.documentElement.getAttribute('data-theme') || 'light');
    updateInstallButton();
  });
})();
