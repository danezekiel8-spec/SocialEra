(function () {
  var loginForm = document.getElementById('login-form');
  var loginButton = document.getElementById('login-button');
  var statusMessage = document.getElementById('status-message');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');

  if (!loginForm || !loginButton || !statusMessage || !emailInput || !passwordInput) {
    return;
  }

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'status show ' + type;
  }

  function clearStatus() {
    statusMessage.textContent = '';
    statusMessage.className = 'status';
  }

  function markRecentLoginAttempt() {
    try {
      sessionStorage.setItem('socialera-login-handoff', String(Date.now()));
    } catch (error) {
      // no-op
    }
  }

  async function waitForStoredSession() {
    var attempt = 0;
    var lastSession = null;

    while (attempt < 10) {
      try {
        var result = await window.supabase.auth.getSession();
        lastSession = result && result.data ? result.data.session : null;

        if (lastSession && lastSession.user) {
          return lastSession;
        }
      } catch (error) {
        console.warn('Login session handoff check failed:', error);
      }

      attempt += 1;
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 150);
      });
    }

    return lastSession;
  }

  function getSafeRedirectTarget() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var target = String(params.get('redirect') || '').trim();

      if (!target) {
        return 'account.html';
      }

      if (target.indexOf('http://') === 0 || target.indexOf('https://') === 0 || target.indexOf('//') === 0) {
        return 'account.html';
      }

      if (target.charAt(0) !== '/') {
        return target;
      }

      return target;
    } catch (error) {
      return 'account.html';
    }
  }

  async function redirectIfAlreadySignedIn() {
    if (!window.supabase || !window.supabase.auth) {
      return;
    }

    try {
      var result = await window.supabase.auth.getSession();
      var session = result && result.data ? result.data.session : null;

      if (session && session.user) {
        window.location.replace(getSafeRedirectTarget());
      }
    } catch (error) {
      console.warn('Login session check failed:', error);
    }
  }

  window.setTimeout(redirectIfAlreadySignedIn, 0);

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearStatus();

    var email = emailInput.value.trim();
    var password = passwordInput.value;

    if (!email || !password) {
      showStatus('Please enter your email and password.', 'error');
      return;
    }

    if (!window.supabase) {
      showStatus('Supabase is not connected yet.', 'error');
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Logging In...';

    try {
      var result = await window.supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
      var data = result.data;
      var error = result.error;

      if (error) {
        showStatus(error.message, 'error');
        return;
      }

      if (data && data.user) {
        markRecentLoginAttempt();
        var session = data.session && data.session.user ? data.session : await waitForStoredSession();

        if (!session || !session.user) {
          showStatus('Login was accepted, but this browser did not store the session. Please refresh and try again.', 'error');
          return;
        }

        showStatus('Login successful. Redirecting...', 'success');
        window.setTimeout(function () {
          window.location.replace(getSafeRedirectTarget());
        }, 900);
        return;
      }

      showStatus('Login completed, but no user details were returned.', 'error');
    } catch (error) {
      showStatus('Something went wrong while logging in.', 'error');
      console.error(error);
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Log In';
    }
  });
})();
