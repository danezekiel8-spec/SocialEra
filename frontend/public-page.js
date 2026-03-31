(function () {
  var authAttemptCount = 0;
  var maxAuthAttempts = 8;
  var authNavSubscriptionBound = false;
  var authNavWaitBound = false;
  var RECENT_SEARCHES_KEY = 'socialeraRecentSearches';
  var STORE_HEADER_SKIP_PAGES = {
    'index.html': true
  };
  var SHOP_ACTIVE_PAGES = {
    'shop.html': true,
    'product.html': true,
    'cart.html': true,
    'checkout.html': true,
    'order-success.html': true
  };

  function getPageName() {
    var path = window.location.pathname || '';
    var name = path.split('/').pop();
    return name || 'index.html';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getInitials(value) {
    var text = String(value || '').trim();

    if (!text) {
      return 'SE';
    }

    var parts = text.split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('') || text.charAt(0).toUpperCase() || 'SE').slice(0, 2);
  }

  function getHeaderConfig(pageName) {
    if (STORE_HEADER_SKIP_PAGES[pageName]) {
      return null;
    }

    return {
      role: 'storefront',
      activeChannel: SHOP_ACTIVE_PAGES[pageName] ? 'shop' : 'all'
    };
  }

  function getBellIcon() {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">',
      '<path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/>',
      '</svg>'
    ].join('');
  }

  function getCartIcon() {
    return [
      '<svg class="cart-icon" viewBox="0 0 16 16" aria-hidden="true">',
      '<path d="M.5 1a.5.5 0 0 0 0 1h1.11l.401 1.607 1.498 7.985A.5.5 0 0 0 4 12h1a2 2 0 1 0 0 4 2 2 0 0 0 0-4h7a2 2 0 1 0 0 4 2 2 0 0 0 0-4h1a.5.5 0 0 0 .491-.408l1.5-8A.5.5 0 0 0 14.5 3H2.89l-.405-1.621A.5.5 0 0 0 2 1zM6 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0m7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-1.646-7.646-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L8 8.293l2.646-2.647a.5.5 0 0 1 .708.708"/>',
      '</svg>'
    ].join('');
  }

  function getSearchIcon() {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">',
      '<circle cx="11" cy="11" r="6"/>',
      '<path d="M20 20l-4.35-4.35"/>',
      '</svg>'
    ].join('');
  }

  function getChannelIcon(name) {
    if (name === 'home') {
      return [
        '<span class="channel-pill-icon" aria-hidden="true">',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
        '<path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L8 2.207l6.646 6.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293z"/>',
        '<path d="m8 3.293 6 6V13.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5V9.293z"/>',
        '</svg>',
        '</span>'
      ].join('');
    }

    if (name === 'videos') {
      return [
        '<span class="channel-pill-icon" aria-hidden="true">',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
        '<path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814z"/>',
        '</svg>',
        '</span>'
      ].join('');
    }

    if (name === 'shop') {
      return [
        '<span class="channel-pill-icon" aria-hidden="true">',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
        '<path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1m3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4z"/>',
        '</svg>',
        '</span>'
      ].join('');
    }

    if (name === 'sell') {
      return [
        '<span class="channel-pill-icon" aria-hidden="true">',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
        '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3.793a1.5 1.5 0 0 1 1.06.44l4.207 4.207a1.5 1.5 0 0 1 0 2.121l-3.793 3.793a1.5 1.5 0 0 1-2.121 0L2.44 8.354A1.5 1.5 0 0 1 2 7.293z"/>',
        '<path d="M5.25 4.75a1 1 0 1 0 0 2a1 1 0 0 0 0-2"/>',
        '</svg>',
        '</span>'
      ].join('');
    }

    return '';
  }

  function buildChannelPill(item, activeChannel) {
    var classes = ['channel-pill'];
    var channelValue = item.key === 'home' ? 'all' : item.key;

    if (channelValue === activeChannel) {
      classes.push('active');
    }

    return [
      '<a href="', item.href, '" class="', classes.join(' '), '" data-label="', escapeHtml(item.label),
      '" data-channel="', escapeHtml(channelValue), '" aria-label="', escapeHtml(item.label), '" title="', escapeHtml(item.label), '">',
      getChannelIcon(item.key),
      item.iconOnly ? '' : escapeHtml(item.label),
      '</a>'
    ].join('');
  }

  function getStoreHeaderMarkup(config) {
    var channels = config.channels || [
      { key: 'home', label: 'Home', href: 'index.html', iconOnly: true },
      { key: 'videos', label: 'Videos', href: 'index.html', iconOnly: true },
      { key: 'shop', label: 'Shop', href: 'shop.html', iconOnly: true },
      { key: 'sell', label: 'Sell', href: 'index.html', iconOnly: true }
    ];

    return [
      '<div class="header-main">',
      '<a href="index.html" class="logo" aria-label="SocialEra Home">',
      '<div>',
      '<h1 class="logo-word"><span>S</span><span>o</span><span>c</span><span>i</span><span>a</span><span>l</span><span>E</span><span>r</span><span>a</span></h1>',
      '<p>Social Shopping</p>',
      '</div>',
      '<img src="assets/SocialEra-Logo.png" alt="SocialEra logo" class="logo-mark-image">',
      '</a>',
      '<button type="button" class="header-search-toggle" aria-label="Open search" aria-expanded="false">', getSearchIcon(), '</button>',
      '<div class="header-search">',
      '<input type="search" id="shared-header-search-input" placeholder="Search" aria-label="Search store">',
      '<button type="button" id="shared-header-search-clear" class="header-search-clear" aria-label="Clear search">×</button>',
      '<div id="shared-header-suggestions" class="search-suggestions"></div>',
      '</div>',
      '<nav class="top-nav">',
      '<a href="#" class="header-utility-link" aria-label="Notifications" title="Notifications">', getBellIcon(), '</a>',
      '<a href="login.html" class="header-profile-link" id="header-profile-link" aria-label="Profile">Profile</a>',
      '<a href="cart.html" class="cart-button header-cart-circle" aria-label="Cart">', getCartIcon(), '<span id="cart-count" class="cart-count">0</span></a>',
      '</nav>',
      '<div class="channels-inner header-channels" id="channel-pills">',
      channels.map(function (item) {
        return buildChannelPill(item, config.activeChannel);
      }).join(''),
      '<a href="index.html" id="home-plus-button" class="home-plus-button" aria-label="Create post" title="Create post">&plus;</a>',
      '</div>',
      '</div>'
    ].join('');
  }

  function upgradeLegacyHeader() {
    var header = document.querySelector('body > header');
    var pageName = getPageName();
    var config = getHeaderConfig(pageName);

    if (!header || !config) {
      return;
    }

    header.setAttribute('data-shared-header-role', config.role);
    header.innerHTML = getStoreHeaderMarkup(config);
  }

  function getCartTotal() {
    try {
      var cart = JSON.parse(localStorage.getItem('lovadaCart')) || [];
      return cart.reduce(function (sum, item) {
        return sum + Number(item.quantity || 0);
      }, 0);
    } catch (error) {
      return 0;
    }
  }

  function updateCartCount() {
    var total = String(getCartTotal());
    var seen = [];

    document.querySelectorAll('#cart-count, #header-cart-count, .cart-count').forEach(function (node) {
      if (seen.indexOf(node) !== -1) {
        return;
      }

      seen.push(node);
      node.textContent = total;
    });
  }

  function getRecentSearches() {
    try {
      var parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
    } catch (error) {
      return [];
    }
  }

  function saveRecentSearch(term) {
    var value = String(term || '').trim();

    if (!value) {
      return;
    }

    var deduped = [value].concat(getRecentSearches().filter(function (item) {
      return normalizeText(item) !== normalizeText(value);
    })).slice(0, 5);

    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(deduped));
  }

  function getSearchQuickLinks() {
    return [
      { label: 'Shop', description: 'Browse curated products', href: 'shop.html' },
      { label: 'About', description: 'Learn about SocialEra', href: 'about.html' },
      { label: 'Contact', description: 'Reach support', href: 'contact.html' },
      { label: 'Cart', description: 'Review your saved items', href: 'cart.html' }
    ];
  }

  function setSearchSuggestionsVisibility(visible) {
    var suggestionsBox = document.getElementById('shared-header-suggestions');

    if (!suggestionsBox) {
      return;
    }

    suggestionsBox.classList.toggle('show', visible);
  }

  function updateSearchClearButton() {
    var input = document.getElementById('shared-header-search-input');
    var clearButton = document.getElementById('shared-header-search-clear');

    if (!input || !clearButton) {
      return;
    }

    clearButton.classList.toggle('show', Boolean(input.value.trim()));
  }

  function buildSuggestionItem(icon, title, description, href, term) {
    if (term) {
      return [
        '<button class="search-suggestion-item" type="button" data-search-term="', escapeHtml(term), '">',
        '<div class="search-suggestion-avatar">', icon, '</div>',
        '<div class="search-suggestion-text"><strong>', escapeHtml(title), '</strong><span>', escapeHtml(description), '</span></div>',
        '</button>'
      ].join('');
    }

    return [
      '<a class="search-suggestion-item" href="', href, '">',
      '<div class="search-suggestion-avatar">', icon, '</div>',
      '<div class="search-suggestion-text"><strong>', escapeHtml(title), '</strong><span>', escapeHtml(description), '</span></div>',
      '</a>'
    ].join('');
  }

  function renderSearchSuggestions() {
    var input = document.getElementById('shared-header-search-input');
    var suggestionsBox = document.getElementById('shared-header-suggestions');

    if (!input || !suggestionsBox) {
      return;
    }

    var query = String(input.value || '').trim();
    var normalizedQuery = normalizeText(query);
    var quickLinks = getSearchQuickLinks();

    if (!normalizedQuery) {
      var recentMarkup = getRecentSearches().map(function (term) {
        return buildSuggestionItem('↺', term, 'Search in Shop', '', term);
      }).join('');
      var quickMarkup = quickLinks.map(function (item) {
        return buildSuggestionItem('↗', item.label, item.description, item.href);
      }).join('');

      suggestionsBox.innerHTML = recentMarkup + quickMarkup;
      setSearchSuggestionsVisibility(Boolean(recentMarkup || quickMarkup));
      return;
    }

    var matches = quickLinks.filter(function (item) {
      return normalizeText(item.label + ' ' + item.description).indexOf(normalizedQuery) !== -1;
    }).slice(0, 4);

    suggestionsBox.innerHTML = [
      buildSuggestionItem('⌕', 'Search for "' + query + '"', 'Open results in Shop', 'shop.html?search=' + encodeURIComponent(query)),
      matches.map(function (item) {
        return buildSuggestionItem('↗', item.label, item.description, item.href);
      }).join('')
    ].join('');

    setSearchSuggestionsVisibility(true);
  }

  function submitSharedSearch(term) {
    var value = String(term || '').trim();

    if (!value) {
      return;
    }

    saveRecentSearch(value);
    window.location.href = 'shop.html?search=' + encodeURIComponent(value);
  }

  function initSharedHeaderSearch() {
    var input = document.getElementById('shared-header-search-input');
    var clearButton = document.getElementById('shared-header-search-clear');
    var suggestionsBox = document.getElementById('shared-header-suggestions');

    if (!input || !clearButton || !suggestionsBox) {
      return;
    }

    input.addEventListener('focus', function () {
      renderSearchSuggestions();
    });

    input.addEventListener('input', function () {
      updateSearchClearButton();
      renderSearchSuggestions();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitSharedSearch(input.value);
      }

      if (event.key === 'Escape') {
        setSearchSuggestionsVisibility(false);
      }
    });

    clearButton.addEventListener('click', function () {
      input.value = '';
      updateSearchClearButton();
      renderSearchSuggestions();
      input.focus();
    });

    suggestionsBox.addEventListener('click', function (event) {
      var trigger = event.target.closest('.search-suggestion-item');

      if (!trigger) {
        return;
      }

      if (trigger.hasAttribute('data-search-term')) {
        event.preventDefault();
        submitSharedSearch(trigger.getAttribute('data-search-term'));
      } else {
        setSearchSuggestionsVisibility(false);
      }
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.header-search')) {
        setSearchSuggestionsVisibility(false);
      }
    });

    updateSearchClearButton();
  }

  function renderModernHeaderProfile(profileLink, displayName, photoUrl) {
    var safeName = String(displayName || 'SocialEra Member').trim() || 'SocialEra Member';
    var safePhoto = String(photoUrl || '').trim().replace(/"/g, '&quot;');

    profileLink.setAttribute('title', safeName);
    profileLink.setAttribute('aria-label', safeName);
    profileLink.innerHTML = safePhoto
      ? '<img src="' + safePhoto + '" alt="' + escapeHtml(safeName) + '" class="header-profile-avatar-image">'
      : '<span class="header-profile-avatar-fallback">' + escapeHtml(getInitials(safeName)) + '</span>';
  }

  function updateLegacyAuthNavigation(nav) {
    var cartButton = nav.querySelector('.cart-button');
    var authSelectors = [
      'a[href="login.html"]',
      'a[href="signup.html"]',
      'a[href="register.html"]',
      'a[href="account.html"]'
    ];

    authSelectors.forEach(function (selector) {
      nav.querySelectorAll(selector).forEach(function (link) {
        link.remove();
      });
    });

    window.supabase.auth.getUser()
      .then(function (result) {
        var user = result && result.data ? result.data.user : null;

        if (user) {
          var accountLink = document.createElement('a');
          accountLink.href = 'account.html';
          accountLink.textContent = 'Account';
          if (cartButton) {
            nav.insertBefore(accountLink, cartButton);
          } else {
            nav.appendChild(accountLink);
          }
          return;
        }

        var loginLink = document.createElement('a');
        loginLink.href = 'login.html';
        loginLink.textContent = 'Login';

        var signupLink = document.createElement('a');
        signupLink.href = 'signup.html';
        signupLink.textContent = 'Sign Up';

        if (cartButton) {
          nav.insertBefore(loginLink, cartButton);
          nav.insertBefore(signupLink, cartButton);
        } else {
          nav.appendChild(loginLink);
          nav.appendChild(signupLink);
        }
      })
      .catch(function (error) {
        console.warn('Auth navigation update failed:', error);
      });
  }

  function bindAuthNavigationSync() {
    if (authNavSubscriptionBound || !window.supabase || !window.supabase.auth || typeof window.supabase.auth.onAuthStateChange !== 'function') {
      return;
    }

    authNavSubscriptionBound = true;
    window.supabase.auth.onAuthStateChange(function () {
      updateAuthNavigation();
    });
  }

  function waitForSupabaseAuth() {
    if (authNavWaitBound) {
      return;
    }

    authNavWaitBound = true;
    var resolved = false;

    function retry() {
      if (resolved) {
        return;
      }

      resolved = true;
      authNavWaitBound = false;
      updateAuthNavigation();
    }

    window.addEventListener('socialera:supabase-ready', retry, { once: true });

    if (typeof window.ensureSocialEraSupabase === 'function') {
      window.ensureSocialEraSupabase()
        .then(function () {
          retry();
        })
        .catch(function (error) {
          authNavWaitBound = false;
          console.warn('Supabase auth wait failed:', error);
        });
    }
  }

  function updateAuthNavigation() {
    var nav = document.querySelector('.top-nav') || document.querySelector('header nav') || document.querySelector('nav');
    var sharedHeaderRole = document.querySelector('body > header') ? document.querySelector('body > header').getAttribute('data-shared-header-role') : '';
    var profileLink = document.getElementById('header-profile-link');

    if (!nav) {
      return;
    }

    if (!window.supabase || !window.supabase.auth) {
      waitForSupabaseAuth();

      if (profileLink) {
        profileLink.href = 'login.html';
        renderModernHeaderProfile(profileLink, 'SocialEra Member');
      } else if (!sharedHeaderRole && authAttemptCount < maxAuthAttempts) {
        authAttemptCount += 1;
        window.setTimeout(updateAuthNavigation, 250);
      }
      return;
    }

    bindAuthNavigationSync();

    if (profileLink) {
      window.supabase.auth.getUser()
        .then(function (result) {
          var user = result && result.data ? result.data.user : null;

          if (user) {
            var meta = user.user_metadata || {};
            var fullName = String(meta.full_name || meta.display_name || user.email || 'SocialEra Member').trim();
            var photoUrl = String(meta.avatar_url || meta.picture || meta.avatar || '').trim();
            profileLink.href = 'account.html';
            renderModernHeaderProfile(profileLink, fullName, photoUrl);
            return;
          }

          profileLink.href = 'login.html';
          renderModernHeaderProfile(profileLink, 'SocialEra Member');
        })
        .catch(function (error) {
          console.warn('Auth navigation update failed:', error);
          profileLink.href = 'login.html';
          renderModernHeaderProfile(profileLink, 'SocialEra Member');
        });
      return;
    }

    if (!sharedHeaderRole) {
      updateLegacyAuthNavigation(nav);
    }
  }

  function enhanceFooter() {
    var footer = document.querySelector('footer');

    if (!footer || footer.querySelector('.footer-links')) {
      return;
    }

    var links = document.createElement('p');
    links.className = 'footer-links';
    links.innerHTML = [
      '<a href="about.html">About Us</a>',
      '<a href="contact.html">Contact</a>',
      '<a href="shipping-policy.html">Shipping Policy</a>',
      '<a href="returns-policy.html">Returns Policy</a>',
      '<a href="privacy-policy.html">Privacy Policy</a>',
      '<a href="terms.html">Terms</a>'
    ].join(' · ');

    footer.appendChild(links);
  }

  upgradeLegacyHeader();

  document.addEventListener('DOMContentLoaded', function () {
    updateCartCount();
    initSharedHeaderSearch();
    enhanceFooter();
    updateAuthNavigation();
  });
})();
