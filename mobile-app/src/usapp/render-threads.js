export function createUsappThreadRenderService({
  escapeHtml,
  formatRelativeTime,
  getMessageRoleLabel,
  getMessageThreadPreview,
  getRoleSlug,
  getUsappThreadLiveClass,
  isThreadMuted,
  isThreadUnread,
  renderAvatarMedia,
  renderEmptyCard,
  renderUsappPresenceBadge
}) {
  function renderThreadRow(thread, {
    activeThreadId = '',
    index = 0
  } = {}) {
    const active = thread.id === activeThreadId;
    const unread = isThreadUnread(thread);
    const muted = isThreadMuted(thread.id);
    const preview = getMessageThreadPreview(thread);
    const statusLabel = muted ? 'Muted' : unread ? 'Unread' : 'Seen';
    const motionOrder = Math.max(0, Math.min(Number(index) || 0, 11));
    const liveClass = getUsappThreadLiveClass(thread.id);

    return `
      <article class="card ${active ? 'thread-row active' : 'thread-row'} ${unread ? 'unread' : ''} ${muted ? 'muted' : ''} ${liveClass}" style="--usapp-order:${motionOrder}">
        <button class="thread-select" type="button" data-select-thread="${escapeHtml(thread.id)}">
          <div class="thread-body">
            <div class="thread-avatar">${renderAvatarMedia(thread.contact)}</div>
            <div class="thread-copy">
              <div class="thread-meta">
                <div class="usapp-thread-identity">
                  <h3>${escapeHtml(thread.contact.displayName)}</h3>
                  <span class="usapp-role-pill role-${escapeHtml(getRoleSlug(thread.contact))}">${escapeHtml(getMessageRoleLabel(thread.contact))}</span>
                  ${renderUsappPresenceBadge(thread.contact, { compact: true })}
                </div>
                <span class="thread-meta-side">
                  ${muted ? '<span class="thread-muted-mark">Muted</span>' : ''}
                  ${unread ? '<span class="thread-unread-dot" aria-hidden="true"></span>' : ''}
                  <span class="helper-text">${escapeHtml(formatRelativeTime(thread.updatedAt))}</span>
                </span>
              </div>
              <div class="usapp-thread-subline">
                <p>${escapeHtml(preview)}</p>
                <span class="usapp-thread-status ${muted ? 'muted' : unread ? 'unread' : 'read'}">
                  <span class="usapp-thread-status-dot" aria-hidden="true"></span>
                  ${escapeHtml(statusLabel)}
                </span>
              </div>
            </div>
          </div>
        </button>
      </article>
    `;
  }

  function renderUsappThreadListContent(threads, {
    activeThreadId = ''
  } = {}) {
    if (!threads.length) {
      return renderEmptyCard('No chats yet', 'Start a direct member conversation from your live SocialEra account.');
    }

    return threads.map((thread, index) => renderThreadRow(thread, {
      activeThreadId,
      index
    })).join('');
  }

  return {
    renderThreadRow,
    renderUsappThreadListContent
  };
}
