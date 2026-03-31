(function () {
  if (window.SocialEraMessageWidgetTemplates) {
    return;
  }

  var widgetUtils = window.SocialEraMessageWidgetUtils;

  if (!widgetUtils) {
    console.error('Usapp Chats helpers must load before templates.');
    return;
  }

  var REACTION_EMOJIS = widgetUtils.REACTION_EMOJIS;
  var escapeHtml = widgetUtils.escapeHtml;
  var formatShortTime = widgetUtils.formatShortTime;
  var formatLongTime = widgetUtils.formatLongTime;
  var buildIcon = widgetUtils.buildIcon;
  var buildSearchIcon = widgetUtils.buildSearchIcon;
  var buildEmojiIcon = widgetUtils.buildEmojiIcon;
  var buildAttachIcon = widgetUtils.buildAttachIcon;
  var formatFileSize = widgetUtils.formatFileSize;
  var getThreadPreview = widgetUtils.getThreadPreview;
  var createAvatarMarkup = widgetUtils.createAvatarMarkup;
  var getRoleLabel = widgetUtils.getRoleLabel;

  function buildEmptyStateMarkup(message, extraClass) {
    return [
      '<div class="se-message-widget-empty', extraClass ? ' ' + extraClass : '', '">',
      '<p>', escapeHtml(message || ''), '</p>',
      '</div>'
    ].join('');
  }

  function buildWidgetShellMarkup() {
    return [
      '<div class="se-message-widget-shell" id="se-message-widget-shell">',
      '<div class="se-message-widget-launcher-wrap">',
      '<button type="button" class="se-message-widget-launcher" id="se-message-widget-launcher" aria-label="Open Usapp Chats" title="Usapp Chats">',
      buildIcon(),
      '</button>',
      '<span class="se-message-widget-launcher-badge se-message-widget-hidden" id="se-message-widget-launcher-badge">0</span>',
      '</div>',
      '<aside class="se-message-widget-panel" id="se-message-widget-panel" aria-hidden="true">',
      '<div class="se-message-widget-card">',
      '<div class="se-message-widget-head">',
      '<div class="se-message-widget-title">',
      '<strong>Usapp Chats</strong>',
      '<span id="se-message-widget-identity">Your chats in one place.</span>',
      '</div>',
      '<div class="se-message-widget-head-actions">',
      '<button type="button" class="se-message-widget-search-toggle" id="se-message-widget-search-toggle" aria-label="Search chats" title="Search chats">',
      buildSearchIcon(),
      '</button>',
      '<button type="button" class="se-message-widget-close" id="se-message-widget-close" aria-label="Close Usapp Chats">X</button>',
      '</div>',
      '</div>',
      '<div class="se-message-widget-status" id="se-message-widget-status">Message members, creators, or support without leaving the page.</div>',
      '<div class="se-message-widget-body">',
      '<div class="se-message-widget-search-wrap">',
      '<input type="search" class="se-message-widget-search" id="se-message-widget-search" placeholder="Search people or chats">',
      '</div>',
      '<div class="se-message-widget-view" id="se-message-widget-inbox">',
      '<div class="se-message-widget-section">',
      '<div class="se-message-widget-section-head">',
      '<strong>People</strong>',
      '<span>Start a new chat</span>',
      '</div>',
      '<div class="se-message-widget-contact-row" id="se-message-widget-contact-row"></div>',
      '</div>',
      '<div class="se-message-widget-section">',
      '<div class="se-message-widget-section-head">',
      '<strong>Chats</strong>',
      '<div class="se-message-widget-tabs">',
      '<button type="button" class="se-message-widget-tab active" id="se-message-widget-refresh">Refresh</button>',
      '</div>',
      '</div>',
      '<div class="se-message-widget-thread-list" id="se-message-widget-thread-list"></div>',
      '</div>',
      '</div>',
      '</div>',
      '</div>',
      '</aside>',
      '<section class="se-message-widget-chat-dock se-message-widget-hidden" id="se-message-widget-chat" aria-hidden="true">',
      '<div class="se-message-widget-chat-window">',
      '<div class="se-message-widget-chat-head">',
      '<div class="se-message-widget-person">',
      '<div class="se-message-widget-avatar large" id="se-message-widget-avatar">SE</div>',
      '<div class="se-message-widget-chat-meta">',
      '<strong id="se-message-widget-name">SocialEra Contact</strong>',
      '<div class="se-message-widget-chat-meta-row">',
      '<span class="se-message-widget-chat-badge" id="se-message-widget-chat-badge">Member</span>',
      '<span class="se-message-widget-chat-subtitle" id="se-message-widget-chat-subtitle">Direct chat</span>',
      '</div>',
      '</div>',
      '</div>',
      '<div class="se-message-widget-chat-actions">',
      '<a href="index.html" class="se-message-widget-chat-link se-message-widget-hidden" id="se-message-widget-source-link">View source</a>',
      '<button type="button" class="se-message-widget-back" id="se-message-widget-back" aria-label="Minimize chat">Hide</button>',
      '<button type="button" class="se-message-widget-close" id="se-message-widget-dock-close" aria-label="Close chat">X</button>',
      '</div>',
      '</div>',
      '<div class="se-message-widget-chat-intro" id="se-message-widget-intro">Talk about the look, product, support need, or creator listing.</div>',
      '<div class="se-message-widget-feed" id="se-message-widget-feed"></div>',
      '<form class="se-message-widget-form" id="se-message-widget-form">',
      '<div class="se-message-widget-composer-popovers">',
      '<div class="se-message-widget-emoji-picker se-message-widget-hidden" id="se-message-widget-emoji-picker"></div>',
      '</div>',
      '<div class="se-message-widget-attachment-preview se-message-widget-hidden" id="se-message-widget-attachment-preview"></div>',
      '<textarea class="se-message-widget-textarea" id="se-message-widget-textarea" maxlength="2000" placeholder="Write a message..."></textarea>',
      '<div class="se-message-widget-form-bar">',
      '<div class="se-message-widget-composer-tools">',
      '<button type="button" class="se-message-widget-tool" id="se-message-widget-emoji-toggle" aria-label="Add emoji" title="Add emoji">',
      buildEmojiIcon(),
      '</button>',
      '<button type="button" class="se-message-widget-tool" id="se-message-widget-attach-toggle" aria-label="Attach file" title="Attach file">',
      buildAttachIcon(),
      '</button>',
      '<input type="file" class="se-message-widget-hidden" id="se-message-widget-file-input" accept="image/*,.pdf,.txt,.csv,.doc,.docx,.zip">',
      '</div>',
      '<span class="se-message-widget-counter" id="se-message-widget-counter">0 / 2000</span>',
      '<button type="submit" class="se-message-widget-send" id="se-message-widget-send">Send</button>',
      '</div>',
      '</form>',
      '</div>',
      '</section>',
      '</div>'
    ].join('');
  }

  function buildContactsMarkup(contacts) {
    if (!Array.isArray(contacts) || !contacts.length) {
      return buildEmptyStateMarkup('No contacts ready yet.');
    }

    return contacts.slice(0, 8).map(function (contact) {
      var roleLabel = getRoleLabel(contact);
      return [
        '<button type="button" class="se-message-widget-contact-chip" data-contact-id="', escapeHtml(contact.actorId), '">',
        '<div class="se-message-widget-avatar">', createAvatarMarkup(contact), '</div>',
        '<strong>', escapeHtml(contact.displayName), '</strong>',
        '<span class="se-message-widget-contact-role role-', escapeHtml(roleLabel.toLowerCase()), '">', escapeHtml(roleLabel), '</span>',
        '</button>'
      ].join('');
    }).join('');
  }

  function buildThreadsMarkup(threads, options) {
    options = options || {};
    var activeThreadId = String(options.activeThreadId || '');
    var isThreadUnread = typeof options.isThreadUnread === 'function'
      ? options.isThreadUnread
      : function () { return false; };

    if (!Array.isArray(threads) || !threads.length) {
      return buildEmptyStateMarkup('No chats yet. Start with a member, creator, or support.');
    }

    return threads.map(function (thread) {
      var activeClass = thread.id === activeThreadId ? ' active' : '';
      var unread = Boolean(isThreadUnread(thread));
      var stateClass = unread ? ' unread' : ' read';
      var roleLabel = getRoleLabel(thread.contact);
      var statusLabel = unread ? 'Unread' : 'Seen';
      return [
        '<button type="button" class="se-message-widget-thread', activeClass, stateClass, '" data-thread-id="', escapeHtml(thread.id), '">',
        '<div class="se-message-widget-person">',
        '<div class="se-message-widget-avatar">', createAvatarMarkup(thread.contact), '</div>',
        '<div class="se-message-widget-thread-main">',
        '<div class="se-message-widget-thread-heading">',
        '<div class="se-message-widget-thread-identity">',
        '<strong>', escapeHtml(thread.contact.displayName), '</strong>',
        '<span class="se-message-widget-thread-role role-', escapeHtml(roleLabel.toLowerCase()), '">', escapeHtml(roleLabel), '</span>',
        '</div>',
        '<span class="se-message-widget-thread-time">', escapeHtml(formatShortTime(thread.updatedAt)), '</span>',
        '</div>',
        '<div class="se-message-widget-thread-subline">',
        '<p class="se-message-widget-thread-preview">', escapeHtml(getThreadPreview(thread)), '</p>',
        '<span class="se-message-widget-thread-status ', unread ? 'unread' : 'read', '">',
        '<span class="se-message-widget-thread-status-dot" aria-hidden="true"></span>',
        statusLabel,
        '</span>',
        '</div>',
        '</div>',
        '</div>',
        '</button>'
      ].join('');
    }).join('');
  }

  function buildComposerEmojiPickerMarkup(emojis) {
    return (Array.isArray(emojis) ? emojis : []).map(function (emoji) {
      return '<button type="button" class="se-message-widget-emoji-option" data-composer-emoji="' + escapeHtml(emoji) + '">' + escapeHtml(emoji) + '</button>';
    }).join('');
  }

  function buildAttachmentPreviewMarkup(attachment) {
    if (!attachment) {
      return '';
    }

    return [
      '<div class="se-message-widget-attachment-chip">',
      '<div class="se-message-widget-attachment-chip-meta">',
      '<strong>', escapeHtml(attachment.name), '</strong>',
      '<span>', escapeHtml(formatFileSize(attachment.size)), '</span>',
      '</div>',
      '<button type="button" class="se-message-widget-attachment-remove" id="se-message-widget-attachment-remove" aria-label="Remove attachment">Remove</button>',
      '</div>'
    ].join('');
  }

  function buildAttachmentMarkup(attachment) {
    if (!attachment) {
      return '';
    }

    if (attachment.kind === 'image') {
      return [
        '<a class="se-message-widget-attachment media" href="', escapeHtml(attachment.dataUrl), '" target="_blank" rel="noreferrer">',
        '<img src="', escapeHtml(attachment.dataUrl), '" alt="', escapeHtml(attachment.name || 'Attachment'), '">',
        '</a>'
      ].join('');
    }

    return [
      '<a class="se-message-widget-attachment file" href="', escapeHtml(attachment.dataUrl), '" download="', escapeHtml(attachment.name || 'attachment'), '">',
      '<div class="se-message-widget-attachment-file-icon">FILE</div>',
      '<div class="se-message-widget-attachment-file-meta">',
      '<strong>', escapeHtml(attachment.name || 'Attachment'), '</strong>',
      '<span>', escapeHtml(formatFileSize(attachment.size)), '</span>',
      '</div>',
      '</a>'
    ].join('');
  }

  function buildReactionSummaryMarkup(message, currentActorId) {
    var reactions = Array.isArray(message && message.reactions) ? message.reactions.filter(function (reaction) {
      return reaction && reaction.emoji && Array.isArray(reaction.actorIds) && reaction.actorIds.length;
    }) : [];

    if (!reactions.length) {
      return '';
    }

    return [
      '<div class="se-message-widget-reaction-row has-reactions">',
      reactions.map(function (reaction) {
        var actorIds = Array.isArray(reaction.actorIds) ? reaction.actorIds : [];
        var isActive = Boolean(currentActorId && actorIds.indexOf(currentActorId) !== -1);
        return [
          '<button type="button" class="se-message-widget-reaction-pill', isActive ? ' active' : '', '" data-message-reaction="', escapeHtml(message.id), '" data-emoji="', escapeHtml(reaction.emoji), '">',
          '<span>', escapeHtml(reaction.emoji), '</span>',
          '<strong>', escapeHtml(String(actorIds.length)), '</strong>',
          '</button>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function buildBubbleActionMarkup(messageId, reactionPickerMessageId, reactionEmojis) {
    var pickerEmojis = Array.isArray(reactionEmojis) && reactionEmojis.length ? reactionEmojis : REACTION_EMOJIS;

    return [
      '<div class="se-message-widget-bubble-side">',
      '<button type="button" class="se-message-widget-bubble-action" data-message-react="', escapeHtml(messageId), '" aria-label="Open message actions">',
      '<span></span><span></span><span></span>',
      '</button>',
      reactionPickerMessageId === messageId
        ? '<div class="se-message-widget-reaction-picker">' + pickerEmojis.map(function (emoji) {
            return '<button type="button" class="se-message-widget-reaction-option" data-message-reaction-option="' + escapeHtml(messageId) + '" data-emoji="' + escapeHtml(emoji) + '">' + escapeHtml(emoji) + '</button>';
          }).join('') + '</div>'
        : '',
      '</div>'
    ].join('');
  }

  function buildChatFeedMarkup(thread, options) {
    options = options || {};
    var currentActorId = String(options.currentActorId || '');
    var reactionRevealMessageId = String(options.reactionRevealMessageId || '');
    var reactionPickerMessageId = String(options.reactionPickerMessageId || '');
    var reactionEmojis = options.reactionEmojis;
    var messages = Array.isArray(thread && thread.messages) ? thread.messages : [];

    if (!messages.length) {
      return buildEmptyStateMarkup('No messages yet. Start the conversation here.', 'se-message-widget-feed-empty');
    }

    return messages.map(function (message) {
      var outgoing = currentActorId && message.senderActorId === currentActorId;
      var attachmentsMarkup = Array.isArray(message.attachments) ? message.attachments.map(buildAttachmentMarkup).join('') : '';
      var textMarkup = message.text ? '<p>' + escapeHtml(message.text) + '</p>' : '';
      var reactionRowClass = reactionRevealMessageId === message.id || reactionPickerMessageId === message.id
        ? ' reactions-visible'
        : '';

      return [
        '<div class="se-message-widget-bubble-row ', outgoing ? 'outgoing' : 'incoming', reactionRowClass, '" data-message-bubble="', escapeHtml(message.id), '">',
        '<article class="se-message-widget-bubble">',
        outgoing ? '' : '<strong>' + escapeHtml(message.authorName || thread.contact.displayName) + '</strong>',
        attachmentsMarkup,
        textMarkup,
        '<div class="se-message-widget-bubble-meta">',
        '<time datetime="', escapeHtml(message.createdAt || ''), '">', escapeHtml(formatLongTime(message.createdAt)), '</time>',
        '</div>',
        buildReactionSummaryMarkup(message, currentActorId),
        '</article>',
        buildBubbleActionMarkup(message.id, reactionPickerMessageId, reactionEmojis),
        '</div>'
      ].join('');
    }).join('');
  }

  window.SocialEraMessageWidgetTemplates = {
    buildWidgetShellMarkup: buildWidgetShellMarkup,
    buildContactsMarkup: buildContactsMarkup,
    buildThreadsMarkup: buildThreadsMarkup,
    buildComposerEmojiPickerMarkup: buildComposerEmojiPickerMarkup,
    buildAttachmentPreviewMarkup: buildAttachmentPreviewMarkup,
    buildChatFeedMarkup: buildChatFeedMarkup
  };
})();
