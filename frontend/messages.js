(function () {
  const CONTACTS_ENDPOINT = '/api/messages/contacts';
  const THREADS_ENDPOINT = '/api/messages/threads';
  const state = {
    identity: null,
    contacts: [],
    threads: [],
    activeThreadId: '',
    sending: false,
    loading: false
  };

  const statusNode = document.getElementById('messages-status');
  const syncPill = document.getElementById('messages-sync-pill');
  const syncName = document.getElementById('messages-sync-name');
  const syncCopy = document.getElementById('messages-sync-copy');
  const refreshButton = document.getElementById('messages-refresh-button');
  const contactGrid = document.getElementById('messages-contact-grid');
  const threadList = document.getElementById('messages-thread-list');
  const emptyState = document.getElementById('messages-empty-state');
  const threadView = document.getElementById('messages-thread-view');
  const activeAvatar = document.getElementById('messages-active-avatar');
  const activeName = document.getElementById('messages-active-name');
  const activeCopy = document.getElementById('messages-active-copy');
  const activeLink = document.getElementById('messages-active-link');
  const feed = document.getElementById('messages-feed');
  const form = document.getElementById('messages-form');
  const input = document.getElementById('messages-input');
  const sendButton = document.getElementById('messages-send-button');
  const characterCount = document.getElementById('messages-character-count');

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getInitials(value) {
    const parts = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) {
      return 'SE';
    }

    return parts.map((part) => part.charAt(0).toUpperCase()).join('').slice(0, 2) || 'SE';
  }

  function getLocalActorId() {
    const existing = localStorage.getItem('socialeraActorId') || localStorage.getItem('socialeraLocalActorId');

    if (existing) {
      localStorage.setItem('socialeraActorId', existing);
      localStorage.setItem('socialeraLocalActorId', existing);
      return existing;
    }

    const created = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('socialeraActorId', created);
    localStorage.setItem('socialeraLocalActorId', created);
    return created;
  }

  async function loadIdentity() {
    const fallback = {
      actorId: getLocalActorId(),
      displayName: 'SocialEra Member',
      userName: '@socialera.member',
      avatar: 'SE',
      photoUrl: '',
      mode: 'local'
    };

    if (!window.supabase || !window.supabase.auth) {
      return fallback;
    }

    try {
      const { data } = await window.supabase.auth.getUser();
      const user = data && data.user;

      if (!user) {
        return fallback;
      }

      const meta = user.user_metadata || {};
      const displayName = String(meta.full_name || meta.display_name || user.email || 'SocialEra Member').trim() || 'SocialEra Member';
      const userNameBase = String(meta.username || user.email || 'socialera.member')
        .split('@')[0]
        .trim()
        .replace(/^@+/, '') || 'socialera.member';

      return {
        actorId: `user-${user.id}`,
        displayName,
        userName: `@${userNameBase}`,
        avatar: getInitials(displayName),
        photoUrl: String(meta.avatar_url || meta.picture || meta.avatar || '').trim(),
        mode: 'account'
      };
    } catch (error) {
      console.warn('Failed to load messaging identity:', error);
      return fallback;
    }
  }

  function renderIdentity() {
    if (!state.identity) {
      return;
    }

    const isAccountMode = state.identity.mode === 'account';
    syncPill.textContent = isAccountMode ? 'Supabase account connected' : 'Device-only inbox';
    syncPill.className = `messages-sync-pill${isAccountMode ? ' account' : ''}`;
    syncName.textContent = state.identity.displayName;
    syncCopy.textContent = isAccountMode
      ? 'Usapp Chats is tied to your signed-in SocialEra identity for this prototype session.'
      : 'You are using Usapp Chats as a local SocialEra guest. Sign in later if you want the identity layer to feel more personal.';
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    return data;
  }

  function setStatus(message, type) {
    if (!statusNode) {
      return;
    }

    statusNode.textContent = message || '';
    statusNode.className = `messages-status${type ? ` ${type}` : ''}`;
  }

  function getThreadPreview(thread) {
    const lastMessage = Array.isArray(thread.messages) && thread.messages.length
      ? thread.messages[thread.messages.length - 1]
      : null;

    if (lastMessage && lastMessage.text) {
      return lastMessage.text;
    }

    if (lastMessage && Array.isArray(lastMessage.attachments) && lastMessage.attachments.length) {
      const firstAttachment = lastMessage.attachments[0];
      return firstAttachment.kind === 'image'
        ? 'Sent a photo'
        : `Sent ${String(firstAttachment.name || 'a file')}`;
    }

    return thread.contact && thread.contact.intro
      ? thread.contact.intro
      : 'Start the conversation here.';
  }

  function formatShortTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Now';
    }

    const diff = Date.now() - date.getTime();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    if (diff < day) {
      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    });
  }

  function formatLongTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Just now';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function getReadStateKey() {
    return state.identity ? `socialeraMessageReadState::${state.identity.actorId}` : '';
  }

  function readJsonStorage(key) {
    if (!key) {
      return {};
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeJsonStorage(key, value) {
    if (!key) {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // no-op
    }
  }

  function getReadState() {
    return readJsonStorage(getReadStateKey());
  }

  function markThreadRead(thread) {
    if (!thread || !state.identity) {
      return;
    }

    const readState = getReadState();
    readState[thread.id] = thread.updatedAt || new Date().toISOString();
    writeJsonStorage(getReadStateKey(), readState);
  }

  function isThreadUnread(thread) {
    if (!thread || !state.identity) {
      return false;
    }

    const readState = getReadState();
    const seenAt = String(readState[thread.id] || '').trim();
    return !seenAt || new Date(thread.updatedAt).getTime() > new Date(seenAt).getTime();
  }

  function sortThreads() {
    state.threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function upsertThread(thread) {
    const index = state.threads.findIndex((entry) => entry.id === thread.id);

    if (index === -1) {
      state.threads.unshift(thread);
    } else {
      state.threads[index] = thread;
    }

    sortThreads();
  }

  function getActiveThread() {
    return state.threads.find((thread) => thread.id === state.activeThreadId) || null;
  }

  function createAvatarMarkup(contact) {
    const photoUrl = String(contact && contact.photoUrl || '').trim();
    const initials = escapeHtml(String(contact && contact.avatar || getInitials(contact && contact.displayName)).slice(0, 2).toUpperCase());

    return photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(contact.displayName || 'Contact')}">`
      : initials;
  }

  function renderContacts() {
    if (!contactGrid) {
      return;
    }

    if (!state.contacts.length) {
      contactGrid.innerHTML = '<div class="messages-status">No contacts are ready yet.</div>';
      return;
    }

    contactGrid.innerHTML = state.contacts.map((contact) => `
      <button class="messages-contact-card" type="button" data-contact-id="${escapeHtml(contact.actorId)}">
        <div class="messages-contact-head">
          <div class="messages-contact-main">
            <div class="messages-avatar">${createAvatarMarkup(contact)}</div>
            <div class="messages-contact-meta">
              <strong>${escapeHtml(contact.displayName)}</strong>
              <span>${escapeHtml(contact.role === 'support' ? 'Support' : contact.role === 'creator' ? 'Creator' : 'Member')}</span>
            </div>
          </div>
          <span class="messages-contact-role">${escapeHtml(contact.role === 'support' ? 'Support' : 'Creator')}</span>
        </div>
        <p>${escapeHtml(contact.intro || 'Open a conversation.')}</p>
      </button>
    `).join('');

    contactGrid.querySelectorAll('[data-contact-id]').forEach((button) => {
      button.addEventListener('click', () => {
        openThreadForContact(button.getAttribute('data-contact-id'));
      });
    });
  }

  function renderThreads() {
    if (!threadList) {
      return;
    }

    if (!state.threads.length) {
      threadList.innerHTML = '<div class="messages-status">No threads yet. Start with support or message a creator.</div>';
      return;
    }

    threadList.innerHTML = state.threads.map((thread) => {
      const activeClass = thread.id === state.activeThreadId ? ' active' : '';
      const unread = isThreadUnread(thread);
      const stateClass = unread ? ' unread' : ' read';
      const preview = getThreadPreview(thread);

      return `
        <button class="messages-thread-item${activeClass}${stateClass}" type="button" data-thread-id="${escapeHtml(thread.id)}">
          <div class="messages-thread-contact">
            <div class="messages-avatar">${createAvatarMarkup(thread.contact)}</div>
            <div class="messages-thread-main">
              <div class="messages-thread-top">
                <strong>${escapeHtml(thread.contact.displayName)}</strong>
                <span class="messages-thread-time">${escapeHtml(formatShortTime(thread.updatedAt))}</span>
              </div>
              <div class="messages-thread-subline">
                <p class="messages-thread-preview">${escapeHtml(preview)}</p>
                <span class="messages-thread-status ${unread ? 'unread' : 'read'}">
                  <span class="messages-thread-status-dot" aria-hidden="true"></span>
                  ${unread ? 'Unread' : 'Read'}
                </span>
              </div>
            </div>
          </div>
        </button>
      `;
    }).join('');

    threadList.querySelectorAll('[data-thread-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeThreadId = button.getAttribute('data-thread-id') || '';
        renderActiveThread();
        renderThreads();
      });
    });
  }

  function renderActiveThread() {
    const thread = getActiveThread();

    if (!thread) {
      emptyState.classList.remove('hidden');
      threadView.classList.add('hidden');
      activeLink.classList.add('hidden');
      sendButton.disabled = true;
      return;
    }

    emptyState.classList.add('hidden');
    threadView.classList.remove('hidden');
    sendButton.disabled = state.sending;
    activeAvatar.innerHTML = createAvatarMarkup(thread.contact);
    activeName.textContent = thread.contact.displayName || 'SocialEra Contact';
    activeCopy.textContent = thread.contact.intro || 'Talk about the look, product, support need, or creator listing.';
    markThreadRead(thread);

    if (thread.contact.role === 'creator' && thread.contact.sourcePostId) {
      activeLink.href = `index.html?highlightPost=${encodeURIComponent(thread.contact.sourcePostId)}`;
      activeLink.textContent = 'View in feed';
      activeLink.classList.remove('hidden');
    } else {
      activeLink.classList.add('hidden');
    }

    feed.innerHTML = (thread.messages || []).map((message) => {
      const outgoing = message.senderActorId === state.identity.actorId;
      return `
        <div class="message-row ${outgoing ? 'outgoing' : 'incoming'}">
          <article class="message-bubble">
            <strong>${escapeHtml(outgoing ? 'You' : message.authorName || thread.contact.displayName)}</strong>
            <p>${escapeHtml(message.text)}</p>
            <time datetime="${escapeHtml(message.createdAt || '')}">${escapeHtml(formatLongTime(message.createdAt))}</time>
          </article>
        </div>
      `;
    }).join('');

    requestAnimationFrame(() => {
      feed.scrollTop = feed.scrollHeight;
    });
  }

  function renderAll() {
    renderIdentity();
    renderContacts();
    renderActiveThread();
    renderThreads();
    updateCharacterCount();
  }

  async function loadContacts() {
    const data = await fetchJson(CONTACTS_ENDPOINT);
    state.contacts = Array.isArray(data.contacts) ? data.contacts : [];
  }

  async function loadThreads() {
    const data = await fetchJson(`${THREADS_ENDPOINT}?actorId=${encodeURIComponent(state.identity.actorId)}`);
    state.threads = Array.isArray(data.threads) ? data.threads : [];
    sortThreads();
  }

  function updateCharacterCount() {
    if (!characterCount || !input) {
      return;
    }

    characterCount.textContent = `${String(input.value.length)} / 1000`;
  }

  async function openThreadForContact(contactId, silent) {
    if (!contactId || !state.identity) {
      return;
    }

    if (!silent) {
      setStatus('Opening conversation...', '');
    }

    try {
      const data = await fetchJson(THREADS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actorId: state.identity.actorId,
          contactId
        })
      });

      if (data && data.thread) {
        upsertThread(data.thread);
        state.activeThreadId = data.thread.id;
        renderAll();
        setStatus(`Conversation ready with ${data.thread.contact.displayName}.`, 'success');
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'We could not open that conversation.', 'error');
    }
  }

  async function refreshInbox(preserveSelection) {
    if (!state.identity) {
      return;
    }

    state.loading = true;
    refreshButton.disabled = true;

    const currentThreadId = preserveSelection ? state.activeThreadId : '';

    try {
      await Promise.all([loadContacts(), loadThreads()]);

      if (currentThreadId && state.threads.some((thread) => thread.id === currentThreadId)) {
        state.activeThreadId = currentThreadId;
      } else if (!state.activeThreadId && state.threads.length) {
        state.activeThreadId = state.threads[0].id;
      } else if (state.activeThreadId && !state.threads.some((thread) => thread.id === state.activeThreadId)) {
        state.activeThreadId = state.threads[0] ? state.threads[0].id : '';
      }

      renderAll();
      setStatus('Inbox ready.', 'success');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'We could not load messages right now.', 'error');
    } finally {
      state.loading = false;
      refreshButton.disabled = false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const thread = getActiveThread();
    const text = String(input.value || '').trim();

    if (!thread || !text || state.sending) {
      return;
    }

    state.sending = true;
    sendButton.disabled = true;
    setStatus('Sending message...', '');

    try {
      const data = await fetchJson(`${THREADS_ENDPOINT}/${encodeURIComponent(thread.id)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actorId: state.identity.actorId,
          authorName: state.identity.displayName,
          userName: state.identity.userName,
          avatar: state.identity.avatar,
          text
        })
      });

      if (data && data.thread) {
        input.value = '';
        updateCharacterCount();
        upsertThread(data.thread);
        state.activeThreadId = data.thread.id;
        renderAll();
        setStatus(`Message sent to ${data.thread.contact.displayName}.`, 'success');
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'We could not send that message.', 'error');
    } finally {
      state.sending = false;
      sendButton.disabled = false;
    }
  }

  async function init() {
    state.identity = await loadIdentity();
    renderIdentity();
    await refreshInbox(false);

    const params = new URLSearchParams(window.location.search);
    const requestedContact = params.get('contact');

    if (requestedContact) {
      await openThreadForContact(requestedContact, true);
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, 'messages.html');
      }
      return;
    }

    if (!state.activeThreadId && state.threads.length) {
      state.activeThreadId = state.threads[0].id;
      renderAll();
    }
  }

  refreshButton.addEventListener('click', () => {
    refreshInbox(true);
  });

  input.addEventListener('input', updateCharacterCount);
  form.addEventListener('submit', handleSubmit);

  document.addEventListener('DOMContentLoaded', init);
})();
