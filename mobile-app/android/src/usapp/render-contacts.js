export function createUsappContactRenderService({
  escapeHtml,
  getContactProvider,
  renderAvatarMedia,
  renderEmptyCard,
  renderUsappPresenceBadge
}) {
  function renderMessageContactChip(contact, selectedThread, index = 0) {
    const selected = Boolean(
      selectedThread
        && selectedThread.contact
        && selectedThread.contact.actorId === contact.actorId
        && selectedThread.provider === getContactProvider(contact)
    );
    const motionOrder = Math.max(0, Math.min(Number(index) || 0, 9));

    return `
      <button
        class="usapp-contact-chip ${selected ? 'active' : ''}"
        type="button"
        data-start-thread="${escapeHtml(contact.actorId)}"
        style="--usapp-order:${motionOrder}"
      >
        <span class="usapp-contact-avatar">${renderAvatarMedia(contact)}</span>
        <span class="usapp-contact-copy">
          <strong>${escapeHtml(contact.displayName)}</strong>
          ${renderUsappPresenceBadge(contact, { compact: true })}
        </span>
      </button>
    `;
  }

  function renderUsappContactRowContent({
    selectedThread,
    visibleContacts,
    signedIn
  }) {
    const peopleEmptyTitle = signedIn ? 'No people available' : 'Sign in to view people';

    if (!visibleContacts.length) {
      return renderEmptyCard(peopleEmptyTitle, '');
    }

    return visibleContacts.map((contact, index) => renderMessageContactChip(contact, selectedThread, index)).join('');
  }

  return {
    renderMessageContactChip,
    renderUsappContactRowContent
  };
}
