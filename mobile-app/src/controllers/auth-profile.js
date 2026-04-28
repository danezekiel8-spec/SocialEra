export function createAuthProfileController({
  clearProfilePhoto,
  render,
  signOutAccount,
  state
}) {
  async function handleAuthProfileClick(event) {
    const authModeButton = event.target.closest('[data-set-auth-mode]');
    if (authModeButton) {
      state.authMode = authModeButton.dataset.setAuthMode === 'signup' ? 'signup' : 'login';
      state.authMessage = null;
      render();
      return true;
    }

    const authSignOutButton = event.target.closest('[data-auth-signout]');
    if (authSignOutButton) {
      await signOutAccount();
      return true;
    }

    const clearProfilePhotoButton = event.target.closest('[data-clear-profile-photo]');
    if (clearProfilePhotoButton) {
      await clearProfilePhoto();
      return true;
    }

    const profilePhotoPickButton = event.target.closest('[data-profile-photo-pick]');
    if (profilePhotoPickButton) {
      const fileInput = document.querySelector('[data-profile-photo-file-input]');

      if (fileInput) {
        fileInput.click();
      }

      return true;
    }

    return false;
  }

  return {
    handleAuthProfileClick
  };
}
