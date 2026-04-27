export function renderUsappSearchIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="4.75"></circle>
      <path d="M12.2 12.2 16 16"></path>
    </svg>
  `;
}

export function renderUsappCloseIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5L15 15"></path>
      <path d="M15 5L5 15"></path>
    </svg>
  `;
}

export function renderRefreshIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.2 7.2A6.2 6.2 0 1 0 16 10.4"></path>
      <path d="M15.3 3.8v4h-4"></path>
    </svg>
  `;
}

export function renderSettingsIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="2.5"></circle>
      <path d="M10 3.4v1.6"></path>
      <path d="M10 15v1.6"></path>
      <path d="M15.2 4.8 14 6"></path>
      <path d="M6 14 4.8 15.2"></path>
      <path d="M16.6 10H15"></path>
      <path d="M5 10H3.4"></path>
      <path d="M15.2 15.2 14 14"></path>
      <path d="M6 6 4.8 4.8"></path>
    </svg>
  `;
}

export function renderUsappBackIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.8 4.8 6.6 10l5.2 5.2"></path>
      <path d="M7.2 10H14"></path>
    </svg>
  `;
}

export function renderUsappEmojiIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7"></circle>
      <circle class="usapp-inline-icon-dot" cx="7.2" cy="8" r="1"></circle>
      <circle class="usapp-inline-icon-dot" cx="12.8" cy="8" r="1"></circle>
      <path d="M6.7 11.8c.8 1.1 1.9 1.7 3.3 1.7s2.5-.6 3.3-1.7"></path>
    </svg>
  `;
}

export function renderUsappAttachIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.4 10.9 12 6.3a2.4 2.4 0 1 1 3.4 3.4l-5.8 5.8a4 4 0 1 1-5.7-5.6L10 3.8"></path>
    </svg>
  `;
}

export function renderUsappMicIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7.2" y="3.4" width="5.6" height="8.6" rx="2.8"></rect>
      <path d="M5.6 9.6a4.4 4.4 0 0 0 8.8 0"></path>
      <path d="M10 14v2.6"></path>
      <path d="M7.4 16.6h5.2"></path>
    </svg>
  `;
}

export function renderUsappReplyIcon() {
  return `
    <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.6 6.4 4.6 9.4l3 3"></path>
      <path d="M5.1 9.4h6.1a4.2 4.2 0 0 1 4.2 4.2"></path>
    </svg>
  `;
}

export function renderThreadSettingIcon(type) {
  const icons = {
    mute: `
      <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M8 7 11.6 4v12L8 13H5.4A1.4 1.4 0 0 1 4 11.6V8.4A1.4 1.4 0 0 1 5.4 7Z"></path>
        <path d="M14.2 7.2 16.8 9.8"></path>
        <path d="M16.8 7.2 14.2 9.8"></path>
      </svg>
    `,
    unread: `
      <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3.8 6.4A2.4 2.4 0 0 1 6.2 4h7.6a2.4 2.4 0 0 1 2.4 2.4v6.2A2.4 2.4 0 0 1 13.8 15H9.8L6.2 17.6V15H6.2A2.4 2.4 0 0 1 3.8 12.6Z"></path>
        <circle class="usapp-inline-icon-dot" cx="14.8" cy="5.2" r="1.1"></circle>
      </svg>
    `,
    read: `
      <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3.8 6.4A2.4 2.4 0 0 1 6.2 4h7.6a2.4 2.4 0 0 1 2.4 2.4v6.2A2.4 2.4 0 0 1 13.8 15H9.8L6.2 17.6V15H6.2A2.4 2.4 0 0 1 3.8 12.6Z"></path>
        <path d="M7 9.8 8.8 11.4 12.8 7.8"></path>
      </svg>
    `,
    post: `
      <svg class="usapp-inline-icon" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.8" y="4" width="12.4" height="12" rx="2.2"></rect>
        <path d="M6.6 12.4 9 10l2.2 2.2 2.2-2.4 2 2.6"></path>
      </svg>
    `,
    close: renderUsappCloseIcon()
  };

  return icons[type] || renderUsappCloseIcon();
}
