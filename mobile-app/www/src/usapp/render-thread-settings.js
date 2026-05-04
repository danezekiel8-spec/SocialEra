export function createUsappThreadSettingsRenderService({
  escapeHtml,
  isThreadMuted,
  isThreadUnread,
  renderThreadSettingIcon
}) {
  function renderThreadSettingsMenu(thread, {
    threadSettingsOpen = false
  } = {}) {
    if (!threadSettingsOpen || !thread) {
      return '';
    }

    const muted = isThreadMuted(thread.id);
    const unread = isThreadUnread(thread);

    return `
      <div class="usapp-thread-settings">
        <button class="usapp-thread-settings-action" type="button" data-thread-setting-action="mute">
          <span class="usapp-thread-settings-icon" aria-hidden="true">${renderThreadSettingIcon('mute')}</span>
          <span>${escapeHtml(muted ? 'Unmute thread' : 'Mute thread')}</span>
        </button>
        <button class="usapp-thread-settings-action" type="button" data-thread-setting-action="unread">
          <span class="usapp-thread-settings-icon" aria-hidden="true">${renderThreadSettingIcon(unread ? 'read' : 'unread')}</span>
          <span>${escapeHtml(unread ? 'Mark read' : 'Mark unread')}</span>
        </button>
        ${thread.contact && thread.contact.sourcePostId ? `
          <button class="usapp-thread-settings-action" type="button" data-thread-setting-action="post" data-post-id="${escapeHtml(thread.contact.sourcePostId)}">
            <span class="usapp-thread-settings-icon" aria-hidden="true">${renderThreadSettingIcon('post')}</span>
            <span>Open related post</span>
          </button>
        ` : ''}
        <button class="usapp-thread-settings-action danger" type="button" data-thread-setting-action="close">
          <span class="usapp-thread-settings-icon" aria-hidden="true">${renderThreadSettingIcon('close')}</span>
          <span>Close chat</span>
        </button>
      </div>
    `;
  }

  return {
    renderThreadSettingsMenu
  };
}
