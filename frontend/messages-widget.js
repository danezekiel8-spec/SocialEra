(function () {
  if (window.__socialEraMessageWidgetLoaded) {
    return;
  }

  window.__socialEraMessageWidgetLoaded = true;

  var pageName = (window.location.pathname || '').split('/').pop() || 'index.html';

  if (pageName === 'messages.html') {
    return;
  }

  var CONTACTS_ENDPOINT = '/api/messages/contacts';
  var THREADS_ENDPOINT = '/api/messages/threads';
  var POLL_INTERVAL_MS = 12000;
  var CACHE_WINDOW_MS = 15000;
  var MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
  var state = {
    identity: null,
    contacts: [],
    threads: [],
    activeThreadId: '',
    open: false,
    view: 'inbox',
    sending: false,
    loaded: false,
    loadPromise: null,
    lastLoadedAt: 0,
    pendingContactId: '',
    pendingDraft: '',
    searchQuery: '',
    supabaseReady: false,
    supabaseSetupNeeded: false,
    supabaseSetupMessage: '',
    pollTimer: 0,
    refreshTimer: 0,
    composerEmojiOpen: false,
    reactionPickerMessageId: '',
    reactionRevealMessageId: '',
    pendingAttachment: null
  };
  var refs = {};
  var widgetUtils = window.SocialEraMessageWidgetUtils;
  var widgetTemplates = window.SocialEraMessageWidgetTemplates;

  if (!widgetUtils) {
    console.error('Usapp Chats helpers did not load.');
    return;
  }

  if (!widgetTemplates) {
    console.error('Usapp Chats templates did not load.');
    return;
  }

  var COMPOSER_EMOJIS = widgetUtils.COMPOSER_EMOJIS;
  var REACTION_EMOJIS = widgetUtils.REACTION_EMOJIS;
  var escapeHtml = widgetUtils.escapeHtml;
  var normalizeText = widgetUtils.normalizeText;
  var normalizeMessageAttachment = widgetUtils.normalizeMessageAttachment;
  var normalizeReaction = widgetUtils.normalizeReaction;
  var getInitials = widgetUtils.getInitials;
  var normalizeUserName = widgetUtils.normalizeUserName;
  var getLocalActorId = widgetUtils.getLocalActorId;
  var getActorIdFromUserId = widgetUtils.getActorIdFromUserId;
  var extractSupabaseRecord = widgetUtils.extractSupabaseRecord;
  var getSupabaseClient = widgetUtils.getSupabaseClient;
  var getUserIdFromActorId = widgetUtils.getUserIdFromActorId;
  var getSupabaseSetupMessage = widgetUtils.getSupabaseSetupMessage;
  var readJsonStorage = widgetUtils.readJsonStorage;
  var writeJsonStorage = widgetUtils.writeJsonStorage;
  var getThreadPreview = widgetUtils.getThreadPreview;
  var createAvatarMarkup = widgetUtils.createAvatarMarkup;
  var isMemberContact = widgetUtils.isMemberContact;
  var getRoleLabel = widgetUtils.getRoleLabel;
  var getChatModeLabel = widgetUtils.getChatModeLabel;
  var getChatIntro = widgetUtils.getChatIntro;
  var getComposerPlaceholder = widgetUtils.getComposerPlaceholder;
  var buildWidgetShellMarkup = widgetTemplates.buildWidgetShellMarkup;
  var buildContactsMarkup = widgetTemplates.buildContactsMarkup;
  var buildThreadsMarkup = widgetTemplates.buildThreadsMarkup;
  var buildComposerEmojiPickerMarkup = widgetTemplates.buildComposerEmojiPickerMarkup;
  var buildAttachmentPreviewMarkup = widgetTemplates.buildAttachmentPreviewMarkup;
  var buildChatFeedMarkup = widgetTemplates.buildChatFeedMarkup;

  function applySupabaseSetupError(error) {
    state.supabaseSetupMessage = getSupabaseSetupMessage(error);
    state.supabaseSetupNeeded = /supabase\/socialera-messaging\.sql/i.test(state.supabaseSetupMessage);
  }

  function clearSupabaseSetupState() {
    state.supabaseSetupNeeded = false;
    state.supabaseSetupMessage = '';
  }

  async function loadIdentity() {
    var fallback = {
      actorId: getLocalActorId(),
      userId: '',
      displayName: 'SocialEra Member',
      userName: '@socialera.member',
      avatar: 'SE',
      photoUrl: '',
      mode: 'local'
    };

    if ((!window.supabase || !window.supabase.auth) && typeof window.ensureSocialEraSupabase === 'function') {
      try {
        await window.ensureSocialEraSupabase();
      } catch (error) {
        console.warn('Failed waiting for widget auth:', error);
      }
    }

    if (!window.supabase || !window.supabase.auth) {
      return fallback;
    }

    try {
      var sessionResult = await window.supabase.auth.getSession();
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      var user = session && session.user ? session.user : null;

      if (!user) {
        var result = await window.supabase.auth.getUser();
        user = result && result.data ? result.data.user : null;
      }

      if (!user) {
        return fallback;
      }

      var meta = user.user_metadata || {};
      var displayName = String(meta.full_name || meta.display_name || user.email || 'SocialEra Member').trim() || 'SocialEra Member';
      var userNameBase = String(meta.username || user.email || 'socialera.member')
        .split('@')[0]
        .trim()
        .replace(/^@+/, '') || 'socialera.member';

      return {
        actorId: getActorIdFromUserId(user.id),
        userId: String(user.id || '').trim(),
        displayName: displayName,
        userName: normalizeUserName(userNameBase),
        avatar: getInitials(displayName),
        photoUrl: String(meta.avatar_url || meta.picture || meta.avatar || '').trim(),
        mode: 'account'
      };
    } catch (error) {
      console.warn('Failed to load message widget identity:', error);
      return fallback;
    }
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, options);
    var data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    return data;
  }

  function getReadStateKey() {
    return state.identity ? 'socialeraMessageReadState::' + state.identity.actorId : '';
  }

  function getActiveThreadKey() {
    return state.identity ? 'socialeraMessageActiveThread::' + state.identity.actorId : '';
  }

  function getReadState() {
    return readJsonStorage(getReadStateKey());
  }

  function markThreadRead(thread) {
    if (!thread || !state.identity) {
      return;
    }

    if (thread.provider === 'member') {
      var latestIncoming = Array.isArray(thread.messages)
        ? thread.messages.slice().reverse().find(function (message) {
            return message && message.senderActorId && message.senderActorId !== state.identity.actorId;
          }) || null
        : null;
      var currentReadAt = String(thread.lastReadAt || '').trim();

      if (!latestIncoming) {
        return;
      }

      if (currentReadAt && new Date(currentReadAt).getTime() >= new Date(latestIncoming.createdAt || thread.updatedAt).getTime()) {
        return;
      }

      thread.lastReadAt = new Date().toISOString();
      syncMemberThreadRead(thread, thread.lastReadAt).catch(function (error) {
        console.error(error);
      });
      return;
    }

    var readState = getReadState();
    readState[thread.id] = thread.updatedAt || new Date().toISOString();
    writeJsonStorage(getReadStateKey(), readState);
  }

  function isThreadUnread(thread) {
    if (!thread || !state.identity) {
      return false;
    }

    if (thread.provider === 'member') {
      var latestIncoming = Array.isArray(thread.messages)
        ? thread.messages.slice().reverse().find(function (message) {
            return message && message.senderActorId && message.senderActorId !== state.identity.actorId;
          }) || null
        : null;

      if (!latestIncoming) {
        return false;
      }

      var memberSeenAt = String(thread.lastReadAt || '').trim();
      return !memberSeenAt || new Date(latestIncoming.createdAt || thread.updatedAt).getTime() > new Date(memberSeenAt).getTime();
    }

    var readState = getReadState();
    var seenAt = String(readState[thread.id] || '').trim();
    return !seenAt || new Date(thread.updatedAt).getTime() > new Date(seenAt).getTime();
  }

  function getUnreadCount() {
    return state.threads.reduce(function (count, thread) {
      return count + (isThreadUnread(thread) ? 1 : 0);
    }, 0);
  }

  function persistActiveThread() {
    if (!state.identity) {
      return;
    }

    try {
      if (state.activeThreadId) {
        localStorage.setItem(getActiveThreadKey(), state.activeThreadId);
        return;
      }

      localStorage.removeItem(getActiveThreadKey());
    } catch (error) {
      // no-op
    }
  }

  function restoreActiveThread() {
    if (!state.identity || state.activeThreadId) {
      return;
    }

    try {
      var stored = String(localStorage.getItem(getActiveThreadKey()) || '').trim();

      if (stored) {
        state.activeThreadId = stored;
      }
    } catch (error) {
      // no-op
    }
  }

  function matchesSearch(entity, extraText) {
    var query = String(state.searchQuery || '').trim().toLowerCase();

    if (!query) {
      return true;
    }

    var haystack = [
      entity && entity.displayName,
      entity && entity.userName,
      entity && entity.intro,
      entity && entity.topic,
      extraText
    ].join(' ').toLowerCase();

    return haystack.indexOf(query) !== -1;
  }

  function buildMarkup() {
    return buildWidgetShellMarkup();
  }

  function ensureWidget() {
    if (refs.shell) {
      return;
    }

    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildMarkup();
    document.body.appendChild(wrapper.firstChild);

    refs.shell = document.getElementById('se-message-widget-shell');
    refs.launcher = document.getElementById('se-message-widget-launcher');
    refs.launcherBadge = document.getElementById('se-message-widget-launcher-badge');
    refs.panel = document.getElementById('se-message-widget-panel');
    refs.identity = document.getElementById('se-message-widget-identity');
    refs.status = document.getElementById('se-message-widget-status');
    refs.searchToggle = document.getElementById('se-message-widget-search-toggle');
    refs.searchWrap = document.querySelector('.se-message-widget-search-wrap');
    refs.search = document.getElementById('se-message-widget-search');
    refs.back = document.getElementById('se-message-widget-back');
    refs.close = document.getElementById('se-message-widget-close');
    refs.dockClose = document.getElementById('se-message-widget-dock-close');
    refs.refresh = document.getElementById('se-message-widget-refresh');
    refs.inbox = document.getElementById('se-message-widget-inbox');
    refs.chat = document.getElementById('se-message-widget-chat');
    refs.contactRow = document.getElementById('se-message-widget-contact-row');
    refs.threadList = document.getElementById('se-message-widget-thread-list');
    refs.avatar = document.getElementById('se-message-widget-avatar');
    refs.name = document.getElementById('se-message-widget-name');
    refs.chatBadge = document.getElementById('se-message-widget-chat-badge');
    refs.chatSubtitle = document.getElementById('se-message-widget-chat-subtitle');
    refs.intro = document.getElementById('se-message-widget-intro');
    refs.sourceLink = document.getElementById('se-message-widget-source-link');
    refs.feed = document.getElementById('se-message-widget-feed');
    refs.form = document.getElementById('se-message-widget-form');
    refs.emojiPicker = document.getElementById('se-message-widget-emoji-picker');
    refs.attachmentPreview = document.getElementById('se-message-widget-attachment-preview');
    refs.textarea = document.getElementById('se-message-widget-textarea');
    refs.emojiToggle = document.getElementById('se-message-widget-emoji-toggle');
    refs.attachToggle = document.getElementById('se-message-widget-attach-toggle');
    refs.fileInput = document.getElementById('se-message-widget-file-input');
    refs.counter = document.getElementById('se-message-widget-counter');
    refs.send = document.getElementById('se-message-widget-send');
    refs.searchToggle.setAttribute('aria-expanded', 'false');

    refs.launcher.addEventListener('click', function () {
      if (state.open) {
        closeWidget();
        return;
      }

      openInbox(state.activeThreadId ? 'thread' : 'inbox');
    });

    refs.close.addEventListener('click', closeWidget);
    refs.dockClose.addEventListener('click', function () {
      state.view = 'inbox';
      render();
    });
    refs.back.addEventListener('click', function () {
      state.view = 'inbox';
      render();
    });
    refs.refresh.addEventListener('click', function () {
      ensureLoaded(true);
    });
    refs.searchToggle.addEventListener('click', function () {
      toggleSearch();
    });
    refs.search.addEventListener('input', function () {
      state.searchQuery = refs.search.value || '';
      render();
    });
    refs.search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearch(true);
        refs.searchToggle.focus();
      }
    });
    refs.textarea.addEventListener('input', updateCounter);
    refs.emojiToggle.addEventListener('click', function () {
      toggleComposerEmojiPicker();
    });
    refs.attachToggle.addEventListener('click', function () {
      if (refs.fileInput) {
        refs.fileInput.click();
      }
    });
    refs.fileInput.addEventListener('change', handleAttachmentSelected);
    refs.textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (refs.form.requestSubmit) {
          refs.form.requestSubmit();
          return;
        }
        refs.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
    refs.form.addEventListener('submit', handleSubmit);
    refs.feed.addEventListener('click', handleFeedClick);

    document.addEventListener('click', function (event) {
      if (!state.open || !refs.shell) {
        return;
      }

      if (refs.shell.contains(event.target)) {
        return;
      }

      closeWidget();
    });

    document.addEventListener('click', function (event) {
      if (!refs.chat || refs.chat.classList.contains('se-message-widget-hidden')) {
        return;
      }

      var inComposer = refs.form && refs.form.contains(event.target);
      var inFeed = refs.feed && refs.feed.contains(event.target);

      if (!inComposer && !inFeed) {
        closeComposerEmojiPicker();
        closeReactionPicker(true);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (state.view === 'thread' && getActiveThread()) {
          state.view = 'inbox';
          render();
          return;
        }

        if (state.open) {
          closeWidget();
        }
      }
    });
  }

  function setStatus(message, type) {
    ensureWidget();
    refs.status.textContent = message || '';
    refs.status.className = 'se-message-widget-status' + (type ? ' ' + type : '');
  }

  function stopAutoRefresh() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = 0;
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();

    if ((!state.open && state.view !== 'thread') || !state.identity || state.identity.mode !== 'account' || !state.supabaseReady) {
      return;
    }

    state.pollTimer = window.setInterval(function () {
      if (!state.sending && !state.loadPromise) {
        ensureLoaded(true);
      }
    }, POLL_INTERVAL_MS);
  }

  function queueRefresh() {
    if (state.refreshTimer) {
      window.clearTimeout(state.refreshTimer);
    }

    state.refreshTimer = window.setTimeout(function () {
      state.refreshTimer = 0;
      if ((state.open || state.view === 'thread') && !state.loadPromise) {
        ensureLoaded(true);
      }
    }, 1200);
  }

  function setOpen(nextOpen) {
    ensureWidget();
    state.open = Boolean(nextOpen);
    refs.shell.classList.toggle('open', state.open);
    refs.panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
  }

  function closeWidget() {
    closeSearch(false);
    setOpen(false);
  }

  function openSearch() {
    ensureWidget();
    refs.searchWrap.classList.add('is-open');
    refs.searchToggle.classList.add('active');
    refs.searchToggle.setAttribute('aria-expanded', 'true');
    window.setTimeout(function () {
      refs.search.focus();
    }, 0);
  }

  function closeSearch(clearValue) {
    if (!refs.searchWrap || !refs.searchToggle || !refs.search) {
      return;
    }

    refs.searchWrap.classList.remove('is-open');
    refs.searchToggle.classList.remove('active');
    refs.searchToggle.setAttribute('aria-expanded', 'false');

    if (clearValue) {
      refs.search.value = '';
      state.searchQuery = '';
      render();
    }
  }

  function toggleSearch() {
    ensureWidget();

    if (refs.searchWrap.classList.contains('is-open')) {
      closeSearch(true);
      return;
    }

    openSearch();
  }

  function openInbox(preferredView) {
    setOpen(true);
    state.view = 'inbox';
    render();
    ensureLoaded(false);
  }

  function openThreadView(contactId, options) {
    setOpen(true);
    state.view = 'inbox';
    state.pendingContactId = contactId || '';
    state.pendingDraft = options && options.draftText ? String(options.draftText) : '';
    render();
    ensureLoaded(false).then(function () {
      if (state.pendingContactId) {
        var pending = state.pendingContactId;
        var draft = state.pendingDraft;
        state.pendingContactId = '';
        state.pendingDraft = '';
        openThreadForContact(pending, true, draft);
      }
    });
  }

  function getActiveThread() {
    return state.threads.find(function (thread) {
      return thread.id === state.activeThreadId;
    }) || null;
  }

  function renderIdentity() {
    if (!refs.identity) {
      return;
    }

    if (!state.identity) {
      refs.identity.textContent = 'Preparing your SocialEra inbox...';
      return;
    }

    refs.identity.textContent = state.identity.mode === 'account'
      ? 'Signed in as ' + state.identity.displayName
      : 'Guest mode for creator and support chats';
  }

  function renderContacts() {
    if (!refs.contactRow) {
      return;
    }

    var visibleContacts = state.contacts.filter(function (contact) {
      return matchesSearch(contact);
    });

    refs.contactRow.innerHTML = buildContactsMarkup(visibleContacts);

    refs.contactRow.querySelectorAll('[data-contact-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        openThreadForContact(button.getAttribute('data-contact-id'));
      });
    });
  }

  function renderThreads() {
    if (!refs.threadList) {
      return;
    }

    var visibleThreads = state.threads.filter(function (thread) {
      return matchesSearch(thread.contact, getThreadPreview(thread));
    });

    refs.threadList.innerHTML = buildThreadsMarkup(visibleThreads, {
      activeThreadId: state.activeThreadId,
      isThreadUnread: isThreadUnread
    });

    refs.threadList.querySelectorAll('[data-thread-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.activeThreadId = button.getAttribute('data-thread-id') || '';
        persistActiveThread();
        state.view = 'thread';
        render();
      });
    });
  }

  function renderComposerEmojiPicker() {
    if (!refs.emojiPicker) {
      return;
    }

    refs.emojiPicker.innerHTML = buildComposerEmojiPickerMarkup(COMPOSER_EMOJIS);

    refs.emojiPicker.querySelectorAll('[data-composer-emoji]').forEach(function (button) {
      button.addEventListener('click', function () {
        insertEmojiIntoComposer(button.getAttribute('data-composer-emoji') || '');
      });
    });
  }

  function closeComposerEmojiPicker() {
    state.composerEmojiOpen = false;

    if (refs.emojiPicker) {
      refs.emojiPicker.classList.add('se-message-widget-hidden');
    }

    if (refs.emojiToggle) {
      refs.emojiToggle.classList.remove('active');
    }
  }

  function toggleComposerEmojiPicker() {
    if (!refs.emojiPicker) {
      return;
    }

    state.composerEmojiOpen = !state.composerEmojiOpen;
    refs.emojiPicker.classList.toggle('se-message-widget-hidden', !state.composerEmojiOpen);

    if (refs.emojiToggle) {
      refs.emojiToggle.classList.toggle('active', state.composerEmojiOpen);
    }

    if (state.composerEmojiOpen) {
      renderComposerEmojiPicker();
      closeReactionPicker(true);
    }
  }

  function insertEmojiIntoComposer(emoji) {
    if (!refs.textarea) {
      return;
    }

    var value = refs.textarea.value || '';
    var start = refs.textarea.selectionStart || value.length;
    var end = refs.textarea.selectionEnd || value.length;
    refs.textarea.value = value.slice(0, start) + emoji + value.slice(end);
    refs.textarea.selectionStart = refs.textarea.selectionEnd = start + emoji.length;
    closeComposerEmojiPicker();
    updateCounter();
    refs.textarea.focus();
  }

  function clearPendingAttachment() {
    state.pendingAttachment = null;

    if (refs.fileInput) {
      refs.fileInput.value = '';
    }

    renderAttachmentPreview();
  }

  function renderAttachmentPreview() {
    if (!refs.attachmentPreview) {
      return;
    }

    var attachment = state.pendingAttachment;

    if (!attachment) {
      refs.attachmentPreview.classList.add('se-message-widget-hidden');
      refs.attachmentPreview.innerHTML = '';
      return;
    }

    refs.attachmentPreview.classList.remove('se-message-widget-hidden');
    refs.attachmentPreview.innerHTML = buildAttachmentPreviewMarkup(attachment);

    var removeButton = document.getElementById('se-message-widget-attachment-remove');

    if (removeButton) {
      removeButton.addEventListener('click', function () {
        clearPendingAttachment();
      });
    }
  }

  function handleAttachmentSelected(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;

    if (!file) {
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      clearPendingAttachment();
      setStatus('Keep attachments under 4 MB for now.', 'error');
      return;
    }

    var reader = new FileReader();

    reader.onload = function () {
      state.pendingAttachment = normalizeMessageAttachment({
        name: file.name,
        type: file.type,
        size: file.size,
        kind: file.type.indexOf('image/') === 0 ? 'image' : 'file',
        dataUrl: String(reader.result || '')
      });

      if (!state.pendingAttachment) {
        clearPendingAttachment();
        setStatus('That file could not be added.', 'error');
        return;
      }

      renderAttachmentPreview();
      setStatus('Attachment ready to send.', 'success');
    };

    reader.onerror = function () {
      clearPendingAttachment();
      setStatus('That file could not be read.', 'error');
    };

    reader.readAsDataURL(file);
  }

  function closeReactionPicker(renderChatView) {
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';

    if (renderChatView) {
      renderChat({ preserveScroll: true, focusComposer: false });
    }
  }

  function getReactionEndpoint(thread, messageId) {
    if (!thread || !messageId) {
      return '';
    }

    return THREADS_ENDPOINT + '/' + encodeURIComponent(thread.nativeId) + '/messages/' + encodeURIComponent(messageId.replace(/^local-message:/, '')) + '/reactions';
  }

  async function sendReaction(thread, messageId, emoji) {
    if (!thread || !messageId || !emoji || !state.identity) {
      return;
    }

    if (thread.provider === 'member') {
      await sendSupabaseReaction(thread, messageId, emoji);
      state.reactionPickerMessageId = '';
      return;
    }

    var endpoint = getReactionEndpoint(thread, messageId);

    if (!endpoint) {
      return;
    }

    var data = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actorId: state.identity.actorId,
        emoji: emoji
      })
    });

    if (data && data.thread) {
      var normalizedThread = thread.provider === 'member'
        ? normalizeMemberThread(data.thread)
        : normalizeLocalThread(data.thread);
      upsertThread(normalizedThread);
      state.activeThreadId = normalizedThread.id;
      renderChat({ preserveScroll: true, focusComposer: false });
      renderThreads();
    }
  }

  function handleFeedClick(event) {
    var reactionToggle = event.target.closest('[data-message-react]');
    var reactionOption = event.target.closest('[data-message-reaction-option]');
    var reactionPill = event.target.closest('[data-message-reaction]');
    var bubbleRow = event.target.closest('[data-message-bubble]');

    if (reactionToggle) {
      var nextMessageId = reactionToggle.getAttribute('data-message-react') || '';
      state.reactionRevealMessageId = nextMessageId;
      state.reactionPickerMessageId = state.reactionPickerMessageId === nextMessageId ? '' : nextMessageId;
      closeComposerEmojiPicker();
      renderChat({ preserveScroll: true, focusComposer: false });
      return;
    }

    if (reactionOption) {
      sendReaction(getActiveThread(), reactionOption.getAttribute('data-message-reaction-option') || '', reactionOption.getAttribute('data-emoji') || '').catch(function (error) {
        console.error(error);
        setStatus(error.message || 'Could not update the reaction.', 'error');
      });
      state.reactionPickerMessageId = '';
      return;
    }

    if (reactionPill) {
      sendReaction(getActiveThread(), reactionPill.getAttribute('data-message-reaction') || '', reactionPill.getAttribute('data-emoji') || '').catch(function (error) {
        console.error(error);
        setStatus(error.message || 'Could not update the reaction.', 'error');
      });
      return;
    }

    if (bubbleRow && !event.target.closest('.se-message-widget-attachment')) {
      var bubbleMessageId = bubbleRow.getAttribute('data-message-bubble') || '';
      state.reactionRevealMessageId = state.reactionRevealMessageId === bubbleMessageId ? '' : bubbleMessageId;
      state.reactionPickerMessageId = '';
      renderChat({ preserveScroll: true, focusComposer: false });
    }
  }

  function renderChat(options) {
    var thread = getActiveThread();
    var preserveScroll = Boolean(options && options.preserveScroll);
    var focusComposer = !options || options.focusComposer !== false;
    var previousScrollTop = refs.feed ? refs.feed.scrollTop : 0;

    if (!thread) {
      refs.chat.classList.add('se-message-widget-hidden');
      refs.chat.setAttribute('aria-hidden', 'true');
      return;
    }

    refs.avatar.innerHTML = createAvatarMarkup(thread.contact);
    refs.name.textContent = thread.contact.displayName || 'SocialEra Contact';
    refs.intro.textContent = getChatIntro(thread.contact);
    refs.chatBadge.textContent = getRoleLabel(thread.contact);
    refs.chatBadge.className = 'se-message-widget-chat-badge role-' + getRoleLabel(thread.contact).toLowerCase();
    refs.chatSubtitle.textContent = getChatModeLabel(thread.contact);
    refs.textarea.placeholder = getComposerPlaceholder(thread.contact);

    if (thread.contact.role === 'creator' && thread.contact.sourcePostId) {
      refs.sourceLink.href = 'index.html?highlightPost=' + encodeURIComponent(thread.contact.sourcePostId);
      refs.sourceLink.textContent = 'Open post';
      refs.sourceLink.classList.remove('se-message-widget-hidden');
    } else {
      refs.sourceLink.classList.add('se-message-widget-hidden');
    }

    refs.feed.innerHTML = buildChatFeedMarkup(thread, {
      currentActorId: state.identity ? state.identity.actorId : '',
      reactionRevealMessageId: state.reactionRevealMessageId,
      reactionPickerMessageId: state.reactionPickerMessageId,
      reactionEmojis: REACTION_EMOJIS
    });

    markThreadRead(thread);
    updateLauncherBadge();
    persistActiveThread();

    requestAnimationFrame(function () {
      refs.feed.scrollTop = preserveScroll ? previousScrollTop : refs.feed.scrollHeight;
      renderAttachmentPreview();

      if (focusComposer) {
        refs.textarea.focus();
      }
    });
  }

  function renderViewVisibility() {
    if (state.view === 'thread' && getActiveThread()) {
      closeSearch(false);
      refs.chat.classList.remove('se-message-widget-hidden');
      refs.chat.setAttribute('aria-hidden', 'false');
      if (state.open) {
        setOpen(false);
      }
    } else {
      refs.chat.classList.add('se-message-widget-hidden');
      refs.chat.setAttribute('aria-hidden', 'true');
    }
  }

  function updateCounter() {
    if (!refs.counter || !refs.textarea) {
      return;
    }

    refs.counter.textContent = String(refs.textarea.value.length) + ' / 2000';
  }

  function updateLauncherBadge() {
    if (!refs.launcherBadge) {
      return;
    }

    var unreadCount = getUnreadCount();

    refs.launcherBadge.textContent = String(unreadCount);
    refs.launcherBadge.classList.toggle('se-message-widget-hidden', unreadCount <= 0);
  }

  function render() {
    if (!refs.shell) {
      return;
    }

    renderIdentity();
    renderContacts();
    renderChat();
    renderThreads();
    renderViewVisibility();
    updateCounter();
    updateLauncherBadge();
    refs.send.disabled = state.sending;

    if (state.open || state.view === 'thread') {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  function sortThreads() {
    state.threads.sort(function (a, b) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  function sortContacts(list) {
    var roleOrder = {
      member: 0,
      support: 1,
      creator: 2
    };

    return list.slice().sort(function (a, b) {
      var leftRole = roleOrder[a.role] !== undefined ? roleOrder[a.role] : 9;
      var rightRole = roleOrder[b.role] !== undefined ? roleOrder[b.role] : 9;

      if (leftRole !== rightRole) {
        return leftRole - rightRole;
      }

      return String(a.displayName || '').localeCompare(String(b.displayName || ''));
    });
  }

  function upsertThread(thread) {
    var index = state.threads.findIndex(function (entry) {
      return entry.id === thread.id;
    });

    if (index === -1) {
      state.threads.unshift(thread);
    } else {
      state.threads[index] = thread;
    }

    sortThreads();
    persistActiveThread();
  }

  function buildReadyStatus() {
    if (!state.identity) {
      return 'Preparing your messages...';
    }

    if (state.identity.mode !== 'account') {
      return 'Sign in for direct member chat. Creator and support chats still work in guest mode.';
    }

    if (state.supabaseSetupMessage) {
      return state.supabaseSetupMessage;
    }

    if (state.supabaseReady) {
      return 'Direct member chats sync through Usapp. Creator and support chats stay here too.';
    }

    return 'Loading your member inbox...';
  }

  function buildContactKey(contact) {
    return [
      String(contact && contact.provider || ''),
      String(contact && (contact.nativeUserId || contact.actorId || contact.userName) || '').toLowerCase()
    ].join('::');
  }

  function mergeContacts(contacts) {
    var seen = new Map();

    contacts.forEach(function (contact) {
      if (!contact || !contact.actorId) {
        return;
      }

      var key = buildContactKey(contact);

      if (!seen.has(key)) {
        seen.set(key, contact);
      }
    });

    return sortContacts(Array.from(seen.values()));
  }

  function normalizeLocalContact(contact) {
    if (!contact) {
      return null;
    }

    var displayName = String(contact.displayName || 'SocialEra Contact').trim() || 'SocialEra Contact';
    var userName = normalizeUserName(contact.userName || displayName);
    var nativeUserId = String(contact.nativeUserId || '').trim();
    var provider = String(contact.provider || 'local').trim() || 'local';

    return {
      actorId: String(contact.actorId || '').trim() || normalizeText(userName),
      nativeUserId: nativeUserId,
      displayName: displayName,
      userName: userName,
      avatar: String(contact.avatar || getInitials(displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl: String(contact.photoUrl || '').trim(),
      role: String(contact.role || 'creator').trim() || 'creator',
      intro: String(contact.intro || 'Open a conversation.').trim() || 'Open a conversation.',
      topic: String(contact.topic || '').trim(),
      sourcePostId: String(contact.sourcePostId || '').trim(),
      provider: provider
    };
  }

  function isSameContactPerson(left, right) {
    if (!left || !right) {
      return false;
    }

    var leftUserName = normalizeText(left.userName);
    var rightUserName = normalizeText(right.userName);

    if (leftUserName && rightUserName && leftUserName === rightUserName) {
      return true;
    }

    return normalizeText(left.displayName) && normalizeText(left.displayName) === normalizeText(right.displayName);
  }

  function filterLegacyLocalThreads(localThreads, memberContacts) {
    var linkedMemberContacts = Array.isArray(memberContacts)
      ? memberContacts.filter(function (contact) {
          return contact && contact.provider === 'member';
        })
      : [];

    if (!linkedMemberContacts.length) {
      return localThreads;
    }

    return localThreads.filter(function (thread) {
      if (!thread || thread.provider !== 'local' || !thread.contact) {
        return true;
      }

      return !linkedMemberContacts.some(function (contact) {
        return isSameContactPerson(thread.contact, contact);
      });
    });
  }

  function normalizeLocalThread(thread) {
    if (!thread || !thread.id) {
      return null;
    }

    var contact = normalizeLocalContact(thread.contact || {});

    return {
      id: 'local:' + String(thread.id),
      nativeId: String(thread.id),
      provider: 'local',
      updatedAt: String(thread.updatedAt || thread.createdAt || new Date().toISOString()),
      contact: contact,
      messages: Array.isArray(thread.messages) ? thread.messages.map(function (message) {
        return {
          id: 'local-message:' + String(message.id || Math.random().toString(36).slice(2)),
          senderActorId: String(message.senderActorId || '').trim(),
          authorName: String(message.authorName || contact.displayName || 'SocialEra Member').trim(),
          userName: normalizeUserName(message.userName || contact.userName),
          avatar: String(message.avatar || getInitials(message.authorName || contact.displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
          photoUrl: '',
          text: String(message.text || '').trim(),
          attachments: Array.isArray(message.attachments) ? message.attachments.map(normalizeMessageAttachment).filter(Boolean) : [],
          reactions: Array.isArray(message.reactions) ? message.reactions.map(normalizeReaction).filter(Boolean) : [],
          createdAt: String(message.createdAt || new Date().toISOString())
        };
      }) : []
    };
  }

  async function loadLocalContactsData() {
    var data = await fetchJson(CONTACTS_ENDPOINT);
    return Array.isArray(data.contacts)
      ? data.contacts.map(normalizeLocalContact).filter(Boolean)
      : [];
  }

  async function loadLocalThreadsData() {
    var data = await fetchJson(THREADS_ENDPOINT + '?actorId=' + encodeURIComponent(state.identity.actorId));
    return Array.isArray(data.threads)
      ? data.threads.map(normalizeLocalThread).filter(Boolean)
      : [];
  }

  function normalizeMemberContact(contact) {
    var record = extractSupabaseRecord(contact);
    var nativeUserId = String(
      record.nativeUserId ||
      record.native_user_id ||
      record.userId ||
      record.user_id ||
      getUserIdFromActorId(record.actorId || '')
    ).trim();
    var actorId = String(record.actorId || getActorIdFromUserId(nativeUserId)).trim();
    var displayName = String(record.displayName || record.display_name || 'SocialEra Member').trim() || 'SocialEra Member';
    var userName = normalizeUserName(record.userName || record.user_name || record.username || displayName);

    return {
      actorId: actorId,
      nativeUserId: nativeUserId,
      displayName: displayName,
      userName: userName,
      avatar: String(record.avatar || getInitials(displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl: String(record.photoUrl || record.photo_url || record.avatarUrl || record.avatar_url || '').trim(),
      role: 'member',
      intro: String(record.intro || 'Start a direct message with this member.').trim() || 'Start a direct message with this member.',
      topic: '',
      sourcePostId: '',
      provider: 'member'
    };
  }

  function normalizeMemberMessage(message, contact, profilesByUserId) {
    var senderUserId = String(
      message && (
        message.senderUserId ||
        message.sender_user_id ||
        message.sender_id ||
        getUserIdFromActorId(message.senderActorId || '')
      ) || ''
    ).trim();
    var senderActorId = String(message && message.senderActorId || getActorIdFromUserId(senderUserId)).trim();
    var senderProfile = senderUserId && profilesByUserId && profilesByUserId[senderUserId]
      ? normalizeMemberContact(profilesByUserId[senderUserId])
      : null;
    var isOutgoing = Boolean(
      state.identity &&
      (
        (senderUserId && senderUserId === state.identity.userId) ||
        senderActorId === state.identity.actorId
      )
    );
    var displayName = isOutgoing
      ? state.identity.displayName
      : String(
        message && (
          message.authorName ||
          message.author_name ||
          (senderProfile && senderProfile.displayName) ||
          contact.displayName ||
          'SocialEra Member'
        )
      ).trim() || 'SocialEra Member';
    var userName = isOutgoing
      ? state.identity.userName
      : normalizeUserName(
          message && (message.userName || message.user_name || message.username) ||
          (senderProfile && senderProfile.userName) ||
          contact.userName ||
          displayName
        );
    var photoUrl = isOutgoing
      ? String(state.identity.photoUrl || '').trim()
      : String(
          message && (message.photoUrl || message.photo_url) ||
          (senderProfile && senderProfile.photoUrl) ||
          contact.photoUrl ||
          ''
        ).trim();

    return {
      id: 'member-message:' + String(message && message.id || ''),
      senderActorId: senderActorId,
      senderUserId: senderUserId,
      authorName: displayName,
      userName: userName,
      avatar: isOutgoing
        ? state.identity.avatar
        : String(
            message && message.avatar ||
            (senderProfile && senderProfile.avatar) ||
            getInitials(displayName)
          ).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl: photoUrl,
      text: String(message && (message.text != null ? message.text : message.body) || '').trim(),
      attachments: Array.isArray(message && message.attachments) ? message.attachments.map(normalizeMessageAttachment).filter(Boolean) : [],
      reactions: Array.isArray(message && message.reactions) ? message.reactions.map(normalizeReaction).filter(Boolean) : [],
      createdAt: String(message && (message.createdAt || message.created_at) || new Date().toISOString())
    };
  }

  function normalizeMemberThread(thread) {
    if (!thread || !thread.id) {
      return null;
    }

    var contact = normalizeMemberContact(thread.contact || {});

    return {
      id: 'member:' + String(thread.id),
      nativeId: String(thread.id),
      provider: 'member',
      updatedAt: String(thread.updatedAt || thread.updated_at || thread.lastMessageAt || thread.last_message_at || thread.createdAt || thread.created_at || new Date().toISOString()),
      createdAt: String(thread.createdAt || thread.created_at || thread.updatedAt || thread.updated_at || new Date().toISOString()),
      lastReadAt: String(thread.lastReadAt || thread.last_read_at || '').trim(),
      contact: contact,
      messages: Array.isArray(thread.messages) ? thread.messages.map(function (message) {
        return normalizeMemberMessage(message, contact, thread.profilesByUserId || null);
      }) : []
    };
  }

  function isChatProfileRlsError(error) {
    var code = String(error && error.code || '').trim();
    var message = String(error && error.message || '').trim();

    return code === '42501' || /row-level security/i.test(message);
  }

  async function syncMemberProfile() {
    if (!state.identity || state.identity.mode !== 'account') {
      return;
    }

    var supabase = getSupabaseClient();

    if (!supabase || !state.identity.userId) {
      throw new Error('Supabase is not available for member chats.');
    }

    var result = await supabase
      .from('chat_profiles')
      .upsert({
        user_id: state.identity.userId,
        display_name: state.identity.displayName,
        username: String(state.identity.userName || '').replace(/^@+/, ''),
        avatar_url: state.identity.photoUrl || '',
        bio: ''
      }, {
        onConflict: 'user_id'
      })
      .select('user_id')
      .single();

    if (result.error) {
      if (isChatProfileRlsError(result.error)) {
        console.warn('Skipping member chat profile sync because chat_profiles is blocked by RLS.', result.error);
        return null;
      }

      throw result.error;
    }
  }

  async function loadMemberContactsData() {
    var supabase = getSupabaseClient();

    if (!supabase || !state.identity || !state.identity.userId) {
      throw new Error('Supabase is not available for member chats.');
    }

    var result = await supabase
      .from('chat_profiles')
      .select('user_id, display_name, username, avatar_url')
      .neq('user_id', state.identity.userId)
      .order('display_name', { ascending: true });

    if (result.error) {
      throw result.error;
    }

    return Array.isArray(result.data)
      ? result.data.map(normalizeMemberContact).filter(Boolean)
      : [];
  }

  async function loadMemberThreadsData(conversationIds) {
    var supabase = getSupabaseClient();

    if (!supabase || !state.identity || !state.identity.userId) {
      throw new Error('Supabase is not available for member chats.');
    }

    var requestedIds = Array.isArray(conversationIds)
      ? conversationIds.map(function (conversationId) {
          return String(conversationId || '').trim();
        }).filter(Boolean)
      : [];
    var membershipQuery = supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', state.identity.userId);

    if (requestedIds.length) {
      membershipQuery = membershipQuery.in('conversation_id', requestedIds);
    }

    var membershipResult = await membershipQuery;

    if (membershipResult.error) {
      throw membershipResult.error;
    }

    var membershipRows = Array.isArray(membershipResult.data) ? membershipResult.data : [];
    var threadIds = membershipRows.map(function (row) {
      return String(row.conversation_id || '').trim();
    }).filter(Boolean);

    if (!threadIds.length) {
      return [];
    }

    var conversationResult = await supabase
      .from('conversations')
      .select('id, created_at, updated_at, last_message_at')
      .in('id', threadIds)
      .order('last_message_at', { ascending: false });

    if (conversationResult.error) {
      throw conversationResult.error;
    }

    var participantResult = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, joined_at, last_read_at')
      .in('conversation_id', threadIds);

    if (participantResult.error) {
      throw participantResult.error;
    }

    var participantRows = Array.isArray(participantResult.data) ? participantResult.data : [];
    var profileIds = Array.from(new Set(participantRows.map(function (row) {
      return String(row.user_id || '').trim();
    }).filter(Boolean)));
    var profileMap = {};

    if (profileIds.length) {
      var profileResult = await supabase
        .from('chat_profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', profileIds);

      if (profileResult.error) {
        throw profileResult.error;
      }

      (profileResult.data || []).forEach(function (profile) {
        if (profile && profile.user_id) {
          profileMap[String(profile.user_id)] = profile;
        }
      });
    }

    var messageResult = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, attachments, reactions, created_at')
      .in('conversation_id', threadIds)
      .order('created_at', { ascending: true });

    if (messageResult.error) {
      throw messageResult.error;
    }

    var membershipByConversationId = {};
    membershipRows.forEach(function (row) {
      membershipByConversationId[String(row.conversation_id || '')] = row;
    });

    var participantsByConversationId = {};
    participantRows.forEach(function (row) {
      var conversationId = String(row.conversation_id || '').trim();

      if (!conversationId) {
        return;
      }

      if (!participantsByConversationId[conversationId]) {
        participantsByConversationId[conversationId] = [];
      }

      participantsByConversationId[conversationId].push(row);
    });

    var messagesByConversationId = {};
    (messageResult.data || []).forEach(function (message) {
      var conversationId = String(message.conversation_id || '').trim();

      if (!conversationId) {
        return;
      }

      if (!messagesByConversationId[conversationId]) {
        messagesByConversationId[conversationId] = [];
      }

      messagesByConversationId[conversationId].push(message);
    });

    return (conversationResult.data || []).map(function (conversation) {
      var conversationId = String(conversation.id || '').trim();
      var participants = participantsByConversationId[conversationId] || [];
      var otherParticipant = participants.find(function (participant) {
        return String(participant.user_id || '').trim() !== state.identity.userId;
      }) || participants[0] || null;
      var contact = normalizeMemberContact(
        otherParticipant && profileMap[String(otherParticipant.user_id || '').trim()]
          ? profileMap[String(otherParticipant.user_id || '').trim()]
          : { user_id: otherParticipant ? otherParticipant.user_id : '' }
      );
      var threadPayload = {
        id: conversationId,
        updated_at: conversation.last_message_at || conversation.updated_at || conversation.created_at,
        created_at: conversation.created_at || conversation.updated_at,
        last_read_at: membershipByConversationId[conversationId] && membershipByConversationId[conversationId].last_read_at,
        contact: contact,
        profilesByUserId: profileMap,
        messages: messagesByConversationId[conversationId] || []
      };

      return normalizeMemberThread(threadPayload);
    }).filter(Boolean);
  }

  async function loadMemberThreadById(conversationId) {
    var threads = await loadMemberThreadsData([conversationId]);
    return threads.find(function (thread) {
      return thread && thread.nativeId === String(conversationId || '').trim();
    }) || null;
  }

  async function syncMemberThreadRead(thread, readAt) {
    if (!thread || thread.provider !== 'member' || !state.identity || !state.identity.userId) {
      return;
    }

    var supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    var result = await supabase
      .from('conversation_participants')
      .update({
        last_read_at: readAt || new Date().toISOString()
      })
      .eq('conversation_id', thread.nativeId)
      .eq('user_id', state.identity.userId);

    if (result.error) {
      throw result.error;
    }
  }

  async function loadSupabaseMessagingData() {
    if (!state.identity || state.identity.mode !== 'account') {
      state.supabaseReady = false;
      return {
        contacts: [],
        threads: []
      };
    }

    clearSupabaseSetupState();
    await syncMemberProfile();

    var results = await Promise.all([
      loadMemberContactsData(),
      loadMemberThreadsData()
    ]);

    state.supabaseReady = true;

    return {
      contacts: results[0],
      threads: results[1]
    };
  }

  function findContactById(contactId) {
    var needle = normalizeText(contactId);

    return state.contacts.find(function (contact) {
      return [
        contact.actorId,
        contact.userName,
        contact.displayName,
        contact.nativeUserId
      ].some(function (value) {
        return normalizeText(value) === needle;
      });
    }) || null;
  }

  async function ensureLoaded(force) {
    ensureWidget();

    if (state.loadPromise) {
      return state.loadPromise;
    }

    if (!force && state.loaded && (Date.now() - state.lastLoadedAt) < CACHE_WINDOW_MS) {
      render();
      return Promise.resolve();
    }

    state.loadPromise = (async function () {
      var localContacts;
      var localThreads;
      var supabaseData = { contacts: [], threads: [] };

      state.supabaseReady = false;
      state.supabaseSetupNeeded = false;
      state.supabaseSetupMessage = '';

      setStatus('Loading messages...', '');
      state.identity = await loadIdentity();
      restoreActiveThread();

      var localResults = await Promise.all([
        loadLocalContactsData(),
        loadLocalThreadsData()
      ]);

      localContacts = localResults[0];
      localThreads = localResults[1];

      if (state.identity.mode === 'account') {
        try {
          supabaseData = await loadSupabaseMessagingData();
        } catch (error) {
          console.error('Member messaging could not be loaded:', error);
          state.supabaseReady = false;
          applySupabaseSetupError(error);
        }
      }

      localThreads = filterLegacyLocalThreads(localThreads, supabaseData.contacts || []);

      state.contacts = mergeContacts([].concat(localContacts, supabaseData.contacts || []));
      state.threads = [].concat(localThreads, supabaseData.threads || []);
      sortThreads();

      if (!state.activeThreadId && state.threads.length) {
        state.activeThreadId = state.threads[0].id;
      } else if (state.activeThreadId && !getActiveThread()) {
        state.activeThreadId = state.threads.length ? state.threads[0].id : '';
      }

      state.loaded = true;
      state.lastLoadedAt = Date.now();
      render();
      setStatus(buildReadyStatus(), '');

      if (state.open) {
        startAutoRefresh();
      }
    })().catch(function (error) {
      console.error(error);
      setStatus(error.message || 'We could not load messages right now.', 'error');
    }).finally(function () {
      state.loadPromise = null;
    });

    return state.loadPromise;
  }

  async function openLocalThreadForContact(contactId, contact, silent, draftText) {
    if (!contactId) {
      return;
    }

    if (!silent) {
      setStatus('Opening conversation...', '');
    }

    var data = await fetchJson(THREADS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actorId: state.identity.actorId,
        contactId: contactId,
        contact: contact && contact.provider === 'local' ? {
          actorId: contact.actorId,
          displayName: contact.displayName,
          userName: contact.userName,
          avatar: contact.avatar,
          photoUrl: contact.photoUrl,
          role: contact.role,
          intro: contact.intro,
          topic: contact.topic,
          sourcePostId: contact.sourcePostId
        } : null
      })
    });

    if (data && data.thread) {
      var normalizedThread = normalizeLocalThread(data.thread);
      upsertThread(normalizedThread);
      state.activeThreadId = normalizedThread.id;
      state.view = 'thread';
      state.reactionPickerMessageId = '';
      state.reactionRevealMessageId = '';
      refs.textarea.value = draftText ? String(draftText) : '';
      clearPendingAttachment();
      closeComposerEmojiPicker();
      updateCounter();
      render();
      if (!silent) {
        setStatus('Conversation ready with ' + normalizedThread.contact.displayName + '.', 'success');
      }
    }
  }

  async function openSupabaseThreadForContact(contact, silent, draftText) {
    var supabase = getSupabaseClient();
    var recipientUserId = contact && (contact.nativeUserId || getUserIdFromActorId(contact.actorId || ''));

    if (!contact || !recipientUserId) {
      throw new Error('That member is not available for chat yet.');
    }

    if (!supabase || !state.identity || state.identity.mode !== 'account' || !state.identity.userId) {
      throw new Error('Sign in to chat with other members.');
    }

    if (recipientUserId === state.identity.userId) {
      throw new Error('You cannot start a conversation with yourself.');
    }

    if (!silent) {
      setStatus('Opening conversation...', '');
    }

    var result = await supabase.rpc('open_direct_conversation', {
      other_user_id: recipientUserId
    });

    if (result.error) {
      throw result.error;
    }

    var normalizedThread = await loadMemberThreadById(result.data);

    if (!normalizedThread) {
      throw new Error('That conversation could not be opened right now.');
    }

    upsertThread(normalizedThread);
    state.activeThreadId = normalizedThread.id;
    state.view = 'thread';
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    refs.textarea.value = draftText ? String(draftText) : '';
    clearPendingAttachment();
    closeComposerEmojiPicker();
    updateCounter();

    render();

    if (!silent) {
      setStatus('Conversation ready with ' + normalizedThread.contact.displayName + '.', 'success');
    }
  }

  async function openThreadForContact(contactId, silent, draftText) {
    if (!contactId) {
      return;
    }

    ensureWidget();

    if (!state.identity) {
      await ensureLoaded(false);
    }

    var contact = findContactById(contactId);
    var fallbackError = 'We could not open that conversation.';

    try {
      if (contact && contact.provider === 'member') {
        await openSupabaseThreadForContact(contact, silent, draftText);
        return;
      }

      await openLocalThreadForContact(contactId, contact, silent, draftText);
    } catch (error) {
      console.error(error);
      setStatus(error.message || fallbackError, 'error');
    }
  }

  function getPendingOutgoingPayload() {
    return {
      text: String(refs.textarea.value || '').trim(),
      attachment: state.pendingAttachment ? {
        id: state.pendingAttachment.id,
        name: state.pendingAttachment.name,
        type: state.pendingAttachment.type,
        size: state.pendingAttachment.size,
        kind: state.pendingAttachment.kind,
        dataUrl: state.pendingAttachment.dataUrl
      } : null
    };
  }

  function clearComposerDraft() {
    refs.textarea.value = '';
    updateCounter();
    clearPendingAttachment();
    closeComposerEmojiPicker();
  }

  async function sendLocalMessage(thread, payload) {
    var data = await fetchJson(THREADS_ENDPOINT + '/' + encodeURIComponent(thread.nativeId) + '/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actorId: state.identity.actorId,
        authorName: state.identity.displayName,
        userName: state.identity.userName,
        avatar: state.identity.avatar,
        text: payload.text,
        attachment: payload.attachment
      })
    });

    if (data && data.thread) {
      var normalizedThread = normalizeLocalThread(data.thread);
      clearComposerDraft();
      upsertThread(normalizedThread);
      state.activeThreadId = normalizedThread.id;
      markThreadRead(normalizedThread);
      state.view = 'thread';
      render();
      setStatus('Message sent to ' + normalizedThread.contact.displayName + '.', 'success');
    }
  }

  async function sendSupabaseMessage(thread, payload) {
    var supabase = getSupabaseClient();

    if (!supabase || !state.identity || state.identity.mode !== 'account' || !state.identity.userId) {
      throw new Error('Sign in to chat with other members.');
    }

    var result = await supabase
      .from('messages')
      .insert({
        conversation_id: thread.nativeId,
        sender_id: state.identity.userId,
        body: payload.text || '',
        attachments: payload.attachment ? [payload.attachment] : [],
        reactions: []
      })
      .select('id')
      .single();

    if (result.error) {
      throw result.error;
    }

    var nextThread = await loadMemberThreadById(thread.nativeId);

    if (!nextThread) {
      throw new Error('Your message was sent, but the thread could not be refreshed.');
    }

    clearComposerDraft();
    upsertThread(nextThread);
    state.activeThreadId = nextThread.id;
    markThreadRead(nextThread);
    state.view = 'thread';
    render();
    setStatus('Message sent to ' + nextThread.contact.displayName + '.', 'success');
    queueRefresh();
  }

  async function sendSupabaseReaction(thread, messageId, emoji) {
    var supabase = getSupabaseClient();
    var nativeMessageId = String(messageId || '').replace(/^member-message:/, '');

    if (!supabase || !thread || !thread.nativeId || !nativeMessageId || !emoji || !state.identity) {
      return;
    }

    var messageResult = await supabase
      .from('messages')
      .select('id, reactions')
      .eq('conversation_id', thread.nativeId)
      .eq('id', nativeMessageId)
      .single();

    if (messageResult.error) {
      throw messageResult.error;
    }

    var reactions = Array.isArray(messageResult.data && messageResult.data.reactions)
      ? messageResult.data.reactions.map(normalizeReaction).filter(Boolean)
      : [];
    var actorId = state.identity.actorId;
    var existingReaction = reactions.find(function (reaction) {
      return reaction.emoji === emoji;
    });

    if (existingReaction) {
      var actorIndex = existingReaction.actorIds.indexOf(actorId);
      if (actorIndex === -1) {
        existingReaction.actorIds.push(actorId);
      } else {
        existingReaction.actorIds.splice(actorIndex, 1);
      }
    } else {
      reactions.push({
        emoji: emoji,
        actorIds: [actorId]
      });
    }

    reactions = reactions.filter(function (reaction) {
      return reaction && reaction.emoji && Array.isArray(reaction.actorIds) && reaction.actorIds.length;
    });

    var updateResult = await supabase
      .from('messages')
      .update({
        reactions: reactions
      })
      .eq('conversation_id', thread.nativeId)
      .eq('id', nativeMessageId)
      .select('id')
      .single();

    if (updateResult.error) {
      throw updateResult.error;
    }

    var nextThread = await loadMemberThreadById(thread.nativeId);

    if (nextThread) {
      upsertThread(nextThread);
      state.activeThreadId = nextThread.id;
      renderChat({ preserveScroll: true, focusComposer: false });
      renderThreads();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    var thread = getActiveThread();
    var payload = getPendingOutgoingPayload();

    if (!thread || (!payload.text && !payload.attachment) || state.sending || !state.identity) {
      return;
    }

    state.sending = true;
    refs.send.disabled = true;
    setStatus('Sending message...', '');

    try {
      if (thread.provider === 'member') {
        await sendSupabaseMessage(thread, payload);
      } else {
        await sendLocalMessage(thread, payload);
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'We could not send that message.', 'error');
    } finally {
      state.sending = false;
      refs.send.disabled = false;
    }
  }

  function isMessagesLink(link) {
    if (!link || !link.getAttribute) {
      return false;
    }

    var rawHref = link.getAttribute('href');

    if (!rawHref || rawHref.charAt(0) === '#') {
      return false;
    }

    try {
      var url = new URL(rawHref, window.location.href);
      return /\/messages\.html$/i.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function interceptTriggers() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      var contactId = '';
      var draftText = '';
      var url;

      if (!link || !isMessagesLink(link)) {
        return;
      }

      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank' || link.hasAttribute('download')) {
        return;
      }

      try {
        url = new URL(link.getAttribute('href'), window.location.href);
        contactId = String(url.searchParams.get('contact') || '').trim();
        draftText = String(url.searchParams.get('draft') || '').trim();
      } catch (error) {
        contactId = '';
        draftText = '';
      }

      event.preventDefault();

      if (contactId) {
        openThreadView(contactId, { draftText: draftText });
        return;
      }

      openInbox();
    });
  }

  function init() {
    if (!document.body) {
      return;
    }

    ensureWidget();
    updateCounter();
    interceptTriggers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
