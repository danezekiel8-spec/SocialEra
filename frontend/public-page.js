(function () {
  var authAttemptCount = 0;
  var maxAuthAttempts = 8;
  function updateCartCount() {
    var cartCount = document.getElementById('cart-count');

    if (!cartCount) {
      return;
    }

    try {
      var cart = JSON.parse(localStorage.getItem('lovadaCart')) || [];
      var total = cart.reduce(function (sum, item) {
        return sum + Number(item.quantity || 0);
      }, 0);
      cartCount.textContent = String(total);
    } catch (error) {
      cartCount.textContent = '0';
    }
  }

  function updateAuthNavigation() {
    if (!window.supabase || !window.supabase.auth) {
      if (authAttemptCount < maxAuthAttempts) {
        authAttemptCount += 1;
        window.setTimeout(updateAuthNavigation, 250);
      }
      return;
    }

    var nav = document.querySelector('.top-nav') || document.querySelector('header nav') || document.querySelector('nav');

    if (!nav) {
      return;
    }

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

  document.addEventListener('DOMContentLoaded', function () {
    updateCartCount();
    enhanceFooter();
    window.setTimeout(updateAuthNavigation, 200);
  });
})();
