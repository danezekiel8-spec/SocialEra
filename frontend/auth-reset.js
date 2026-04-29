(function () {
  var resetForm = document.getElementById('reset-password-form');
  var resetButton = document.getElementById('reset-password-button');
  var statusMessage = document.getElementById('status-message');
  var newPasswordInput = document.getElementById('new-password');
  var confirmPasswordInput = document.getElementById('confirm-password');

  if (!resetForm || !resetButton || !statusMessage || !newPasswordInput || !confirmPasswordInput) {
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

  async function waitForSupabaseClient() {
    var attempt = 0;

    while (attempt < 30) {
      if (window.supabase && window.supabase.auth) {
        return window.supabase;
      }

      attempt += 1;
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 100);
      });
    }

    return null;
  }

  async function getRecoverySession() {
    if (!window.supabase || !window.supabase.auth) {
      return null;
    }

    var result = await window.supabase.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    return result.data && result.data.session ? result.data.session : null;
  }

  window.setTimeout(async function () {
    var supabase = await waitForSupabaseClient();

    if (!supabase || !supabase.auth) {
      showStatus('Supabase is not connected yet.', 'error');
      resetButton.disabled = true;
      return;
    }

    try {
      var session = await getRecoverySession();

      if (!session) {
        showStatus('Open this page from the password reset email link to set a new password.', 'error');
        resetButton.disabled = true;
      }
    } catch (error) {
      showStatus('Could not validate the password reset session.', 'error');
      resetButton.disabled = true;
      console.error(error);
    }
  }, 0);

  resetForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearStatus();

    var newPassword = newPasswordInput.value;
    var confirmPassword = confirmPasswordInput.value;

    if (!newPassword || !confirmPassword) {
      showStatus('Enter and confirm your new password.', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showStatus('Password must be at least 6 characters long.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showStatus('The two password fields do not match.', 'error');
      return;
    }

    var supabase = await waitForSupabaseClient();

    if (!supabase || !supabase.auth) {
      showStatus('Supabase is not connected yet.', 'error');
      return;
    }

    resetButton.disabled = true;
    resetButton.textContent = 'Saving new password...';

    try {
      var session = await getRecoverySession();

      if (!session) {
        showStatus('This reset link is not active anymore. Request a new password reset from the login page.', 'error');
        return;
      }

      var result = await window.supabase.auth.updateUser({
        password: newPassword
      });
      var error = result.error;

      if (error) {
        showStatus(error.message, 'error');
        return;
      }

      showStatus('Password updated. Redirecting to log in...', 'success');
      resetForm.reset();

      window.setTimeout(function () {
        window.location.replace('login.html');
      }, 1000);
    } catch (error) {
      showStatus('Something went wrong while updating your password.', 'error');
      console.error(error);
    } finally {
      resetButton.disabled = false;
      resetButton.textContent = 'Save New Password';
    }
  });
})();
