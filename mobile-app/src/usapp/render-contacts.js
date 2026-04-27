export function createUsappContactRenderService({
  escapeHtml,
  getContactProvider,
  getMessageRoleLabel,
  getRoleSlug,
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
        <strong>${escapeHtml(contact.displayName)}</strong>
        ${renderUsappPresenceBadge(contact, { compact: true })}
        <span class="usapp-role-pill role-${escapeHtml(getRoleSlug(contact))}">${escapeHtml(getMessageRoleLabel(contact))}</span>
      </button>
    `;
  }

  function renderUsappContactRowContent({
    selectedThread,
    visibleContacts,
    signedIn
  }) {
    const peopleEmptyTitle = signedIn ? 'No people available' : 'Sign in to view people';
    const peopleEmptyCopy = signedIn
      ? 'Open Usapp on your other signed-in member account, then refresh here.'
      : 'Sign in with your SocialEra account to load member contacts.';

    if (!visibleContacts.length) {
      return renderEmptyCard(peopleEmptyTitle, peopleEmptyCopy);
    }

    return visibleContacts.map((contact, index) => renderMessageContactChip(contact, selectedThread, index)).join('');
  }

  return {
    renderMessageContactChip,
    renderUsappContactRowContent
  };
}
