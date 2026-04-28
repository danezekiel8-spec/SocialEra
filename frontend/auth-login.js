(function () {
  var loginForm = document.getElementById('login-form');
  var loginButton = document.getElementById('login-button');
  var forgotPasswordButton = document.getElementById('forgot-password-button');
  var statusMessage = document.getElementById('status-message');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');

  if (!loginForm || !loginButton || !forgotPasswordButton || !statusMessage || !emailInput || !passwordInput) {
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

  function normalizeAuthErrorMessage(message) {
    var rawMessage = String(message || '').trim();
    var normalizedMessage = rawMessage.toLowerCase();

    if (
      normalizedMessage.indexOf('email rate limit exceeded') !== -1
      || normalizedMessage.indexOf('rate limit exceeded') !== -1
      || normalizedMessage.indexOf('too many requests') !== -1
    ) {
      return 'Too many reset or login emails were requested. Wait a few minutes, then try again.';
    }

    return rawMessage;
  }

  function getResetRedirectUrl() {
    try {
      return new URL('reset-password.html', window.location.href).toString();
    } catch (error) {
      return window.location.origin.replace(/\/+$/, '') + '/reset-password.html';
    }
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

  forgotPasswordButton.addEventListener('click', async function () {
    clearStatus();

    var email = emailInput.value.trim();

    if (!email) {
      showStatus('Enter your email address first, then request a password reset.', 'error');
      return;
    }

    if (!window.supabase || !window.supabase.auth) {
      showStatus('Supabase is not connected yet.', 'error');
      return;
    }

    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = 'Sending reset link...';

    try {
      var result = await window.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetRedirectUrl()
      });
      var error = result.error;

      if (error) {
        showStatus(normalizeAuthErrorMessage(error.message), 'error');
        return;
      }

      showStatus('Password reset link sent. Check your email, then open the link to choose a new password.', 'success');
    } catch (error) {
      showStatus('Something went wrong while requesting a password reset.', 'error');
      console.error(error);
    } finally {
      forgotPasswordButton.disabled = false;
      forgotPasswordButton.textContent = 'Forgot password?';
    }
  });

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
        var rawMessage = String(error.message || '').trim();
        var normalizedMessage = rawMessage.toLowerCase();

        if (
          normalizedMessage.indexOf('invalid login credentials') !== -1
          || normalizedMessage.indexOf('invalid email or password') !== -1
          || normalizedMessage.indexOf('email not confirmed') !== -1
        ) {
          showStatus('Login failed. Check your email and password, or use “Forgot password?” to reset access.', 'error');
          return;
        }

        showStatus(normalizeAuthErrorMessage(rawMessage), 'error');
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
