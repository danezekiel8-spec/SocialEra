export function createUsappPresenceRenderService({
  escapeHtml,
  formatRelativeTime,
  isMemberMessageContact,
  onlineWindowMs = 5 * 60 * 1000
}) {
  function getUsappPresenceTimestamp(contact) {
    const timestamp = String(
      contact && (
        contact.lastActiveAt
        || contact.last_active_at
        || contact.updatedAt
        || contact.updated_at
      )
        ? contact.lastActiveAt || contact.last_active_at || contact.updatedAt || contact.updated_at
        : ''
    ).trim();

    return timestamp;
  }

  function isUsappContactOnline(contact) {
    const timestamp = getUsappPresenceTimestamp(contact);

    if (!timestamp) {
      return false;
    }

    const time = Date.parse(timestamp);

    if (!Number.isFinite(time)) {
      return false;
    }

    return (Date.now() - time) <= onlineWindowMs;
  }

  function getUsappPresenceLabel(contact) {
    const timestamp = getUsappPresenceTimestamp(contact);

    if (isUsappContactOnline(contact)) {
      return 'Online now';
    }

    if (!timestamp) {
      return 'Away';
    }

    return `Active ${formatRelativeTime(timestamp)}`;
  }

  function renderUsappPresenceBadge(contact, { compact = false } = {}) {
    if (!contact || !isMemberMessageContact(contact)) {
      return '';
    }

    const online = isUsappContactOnline(contact);

    return `
      <span class="usapp-presence ${online ? 'online' : 'idle'}${compact ? ' compact' : ''}">
        <span class="usapp-presence-dot" aria-hidden="true"></span>
        <span>${escapeHtml(getUsappPresenceLabel(contact))}</span>
      </span>
    `;
  }

  return {
    getUsappPresenceLabel,
    getUsappPresenceTimestamp,
    isUsappContactOnline,
    renderUsappPresenceBadge
  };
}
