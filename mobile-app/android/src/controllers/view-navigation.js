export function createViewNavigationController({
  openUsappSheet,
  setActiveView
}) {
  function handleViewNavigationClick(event) {
    const navButton = event.target.closest('[data-nav-view]');
    if (navButton) {
      setActiveView(navButton.dataset.navView);
      return true;
    }

    const openUsappButton = event.target.closest('[data-toggle-usapp]');
    if (openUsappButton) {
      openUsappSheet({ mode: openUsappButton.dataset.toggleUsapp === 'thread' ? 'thread' : 'inbox' });
      return true;
    }

    const openViewButton = event.target.closest('[data-open-view]');
    if (openViewButton) {
      if (openViewButton.dataset.openView === 'inbox') {
        openUsappSheet({ mode: 'inbox' });
        return true;
      }

      setActiveView(openViewButton.dataset.openView);
      return true;
    }

    return false;
  }

  function handleProfileShortcutClick() {
    setActiveView('profile');
  }

  return {
    handleProfileShortcutClick,
    handleViewNavigationClick
  };
}
