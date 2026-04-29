(function () {
  var signupForm = document.getElementById('signup-form');
  var signupButton = document.getElementById('signup-button');
  var statusMessage = document.getElementById('status-message');
  var fullNameInput = document.getElementById('full-name');
  var usernameInput = document.getElementById('username');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var addressLine1Input = document.getElementById('address-line-1');
  var addressLine2Input = document.getElementById('address-line-2');
  var cityInput = document.getElementById('city');
  var stateRegionInput = document.getElementById('state-region');
  var postalCodeInput = document.getElementById('postal-code');
  var countryInput = document.getElementById('country');

  if (
    !signupForm || !signupButton || !statusMessage || !fullNameInput || !usernameInput
    || !emailInput || !passwordInput || !addressLine1Input || !addressLine2Input
    || !cityInput || !stateRegionInput || !postalCodeInput || !countryInput
  ) {
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

  function normalizeUsername(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9._-]/g, '');
  }

  function getConfiguredPublicAuthOrigin() {
    try {
      return String(
        window.SOCIALERA_SUPABASE_CONFIG
        && window.SOCIALERA_SUPABASE_CONFIG.publicAuthOrigin
        ? window.SOCIALERA_SUPABASE_CONFIG.publicAuthOrigin
        : ''
      ).trim().replace(/\/+$/, '');
    } catch (error) {
      return '';
    }
  }

  function buildAuthPageUrl(pathname) {
    var cleanPathname = String(pathname || '').trim().replace(/^\/+/, '');
    var configuredOrigin = getConfiguredPublicAuthOrigin();

    if (configuredOrigin && cleanPathname) {
      return configuredOrigin + '/' + cleanPathname;
    }

    try {
      return new URL(cleanPathname, window.location.href).toString();
    } catch (error) {
      return window.location.origin.replace(/\/+$/, '') + '/' + cleanPathname;
    }
  }

  signupForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearStatus();

    var fullName = fullNameInput.value.trim();
    var username = normalizeUsername(usernameInput.value);
    var email = emailInput.value.trim();
    var password = passwordInput.value;
    var shippingAddress = {
      address_line_1: addressLine1Input.value.trim(),
      address_line_2: addressLine2Input.value.trim(),
      city: cityInput.value.trim(),
      state_region: stateRegionInput.value.trim(),
      postal_code: postalCodeInput.value.trim(),
      country: countryInput.value.trim()
    };
    var hasShippingAddress = Object.values(shippingAddress).some(Boolean);

    if (!fullName || !username || !email || !password) {
      showStatus('Please fill in all fields.', 'error');
      return;
    }

    if (password.length < 6) {
      showStatus('Password must be at least 6 characters long.', 'error');
      return;
    }

    if (!window.supabase) {
      showStatus('Supabase is not connected yet.', 'error');
      return;
    }

    signupButton.disabled = true;
    signupButton.textContent = 'Creating Account...';

    try {
      var result = await window.supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: buildAuthPageUrl('reset-password.html'),
          data: {
            full_name: fullName,
            username: username,
            shipping_address: hasShippingAddress ? shippingAddress : null
          }
        }
      });
      var data = result.data;
      var error = result.error;

      if (error) {
        showStatus(error.message, 'error');
        return;
      }

      if (data && data.user) {
        showStatus(
          'Account created successfully. Check your email for a confirmation link if Supabase asks you to verify your address.',
          'success'
        );
        signupForm.reset();
        return;
      }

      showStatus('Signup completed, but no user details were returned.', 'success');
    } catch (error) {
      showStatus('Something went wrong while creating your account.', 'error');
      console.error(error);
    } finally {
      signupButton.disabled = false;
      signupButton.textContent = 'Create Account';
    }
  });
})();
