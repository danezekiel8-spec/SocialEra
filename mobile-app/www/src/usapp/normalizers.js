export function createUsappIdentityService({
  getAuthUserId,
  getActorId
}) {
  function getActorIdFromUserId(userId) {
    const normalized = String(userId || '').trim();
    return normalized ? `user-${normalized}` : '';
  }

  function getUserIdFromActorId(actorId) {
    const normalized = String(actorId || '').trim();
    return normalized.startsWith('user-') ? normalized.slice(5) : '';
  }

  function getMessageActorId() {
    const authUserId = String(typeof getAuthUserId === 'function' ? getAuthUserId() : '').trim();
    return authUserId
      ? `user-${authUserId}`
      : String(typeof getActorId === 'function' ? getActorId() : '').trim();
  }

  function isCurrentActorId(actorId) {
    const value = String(actorId || '').trim();

    if (!value) {
      return false;
    }

    return value === String(typeof getActorId === 'function' ? getActorId() : '').trim()
      || value === getMessageActorId();
  }

  return {
    getActorIdFromUserId,
    getMessageActorId,
    getUserIdFromActorId,
    isCurrentActorId
  };
}

export function createUsappNormalizationService({
  getCurrentAuthUserId,
  getCurrentProfile,
  getInitials,
  getMessageActorId,
  getUserIdFromActorId,
  getActorIdFromUserId,
  isCurrentActorId,
  normalizeUserName
}) {
  function normalizeMessageAttachmentInput(attachment) {
    if (!attachment || typeof attachment !== 'object') {
      return null;
    }

    const dataUrl = String(attachment.dataUrl || attachment.url || '').trim();

    if (!dataUrl.startsWith('data:')) {
      return null;
    }

    return {
      id: String(attachment.id || `attachment-${Date.now()}`),
      name: String(attachment.name || 'Attachment').trim() || 'Attachment',
      type: String(attachment.type || '').trim(),
      size: Math.max(0, Number(attachment.size || 0)),
      kind: ['image', 'audio'].includes(String(attachment.kind || '').trim())
        ? String(attachment.kind || '').trim()
        : (String(attachment.type || '').toLowerCase().startsWith('image/')
          ? 'image'
          : String(attachment.type || '').toLowerCase().startsWith('audio/')
            ? 'audio'
            : 'file'),
      dataUrl
    };
  }

  function normalizeMessageReaction(reaction) {
    if (!reaction || typeof reaction !== 'object') {
      return null;
    }

    const emoji = Array.from(String(reaction.emoji || '').trim()).slice(0, 2).join('');

    if (!emoji) {
      return null;
    }

    return {
      emoji,
      actorIds: Array.isArray(reaction.actorIds) ? Array.from(new Set(reaction.actorIds.map(String).filter(Boolean))) : []
    };
  }

  function normalizeContact(contact, fallbackProvider = 'local') {
    if (!contact) {
      return null;
    }

    const displayName = String(contact.displayName || 'SocialEra contact').trim() || 'SocialEra contact';
    const roleText = String(contact.role || '').trim().toLowerCase();
    const actorId = String(contact.actorId || contact.id || `contact-${Date.now()}`).trim();
    const explicitProvider = String(contact.provider || '').trim().toLowerCase();
    const inferredNativeUserId = String(
      contact.nativeUserId
      || contact.native_user_id
      || (actorId.startsWith('user-') ? actorId.slice(5) : '')
    ).trim();
    const provider = roleText === 'member' && actorId.startsWith('user-') && (!explicitProvider || explicitProvider === 'local')
      ? 'member'
      : (explicitProvider || String(fallbackProvider || 'local').trim().toLowerCase() || 'local');

    return {
      actorId,
      nativeUserId: inferredNativeUserId,
      displayName,
      userName: normalizeUserName(contact.userName || '@socialera.contact'),
      avatar: String(contact.avatar || getInitials(displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl: String(contact.photoUrl || contact.photo_url || '').trim(),
      intro: String(contact.intro || 'Start a conversation from the app shell.').trim() || 'Start a conversation from the app shell.',
      mediaUrl: String(contact.mediaUrl || '').trim(),
      topic: String(contact.topic || '').trim(),
      sourcePostId: String(contact.sourcePostId || contact.source_post_id || '').trim(),
      lastActiveAt: String(contact.lastActiveAt || contact.last_active_at || contact.updatedAt || contact.updated_at || '').trim(),
      updatedAt: String(contact.updatedAt || contact.updated_at || contact.lastActiveAt || contact.last_active_at || '').trim(),
      role: roleText === 'support' || roleText === 'concierge'
        ? 'support'
        : roleText === 'member'
          ? 'member'
          : 'creator',
      provider
    };
  }

  function normalizeContacts(payload, fallbackProvider = 'local') {
    return Array.isArray(payload) ? payload.map((contact) => normalizeContact(contact, fallbackProvider)).filter(Boolean) : [];
  }

  function normalizeMessage(message, provider = 'local', contact = {}) {
    if (!message) {
      return null;
    }

    const nativeId = String(message.nativeId || message.id || `message-${Date.now()}`).trim();

    return {
      id: `${provider}-message:${nativeId}`,
      nativeId,
      senderActorId: String(message.senderActorId || message.sender_actor_id || ''),
      senderUserId: String(message.senderUserId || message.sender_user_id || '').trim(),
      authorName: String(message.authorName || message.author_name || contact.displayName || 'SocialEra Member').trim() || 'SocialEra Member',
      userName: normalizeUserName(message.userName || message.user_name || contact.userName || '@socialera.member'),
      avatar: String(message.avatar || getInitials(message.authorName || contact.displayName || 'SE')).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl: String(message.photoUrl || message.photo_url || '').trim(),
      text: String(message.text || message.body || '').trim(),
      replyToMessageId: String(message.replyToMessageId || message.reply_to_message_id || '').trim(),
      replyPreviewAuthor: String(message.replyPreviewAuthor || message.reply_preview_author || '').trim(),
      replyPreviewText: String(message.replyPreviewText || message.reply_preview_text || '').trim(),
      attachments: Array.isArray(message.attachments) ? message.attachments.map(normalizeMessageAttachmentInput).filter(Boolean) : [],
      reactions: Array.isArray(message.reactions) ? message.reactions.map(normalizeMessageReaction).filter(Boolean) : [],
      createdAt: message.createdAt || message.created_at || new Date().toISOString()
    };
  }

  function normalizeThread(thread, fallbackProvider = 'local') {
    if (!thread || !thread.id) {
      return null;
    }

    const provider = String(thread.provider || fallbackProvider || 'local').trim() || 'local';
    const nativeId = String(thread.nativeId || thread.id || '').trim();

    return {
      id: `${provider}:${nativeId}`,
      nativeId,
      provider,
      ownerActorId: String(thread.ownerActorId || thread.owner_actor_id || getMessageActorId()).trim(),
      contact: normalizeContact(thread.contact || {}, provider),
      messages: Array.isArray(thread.messages)
        ? thread.messages
            .map((message) => normalizeMessage(message, provider, thread.contact || {}))
            .filter(Boolean)
            .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        : [],
      createdAt: thread.createdAt || thread.created_at || new Date().toISOString(),
      updatedAt: thread.updatedAt || thread.updated_at || thread.lastMessageAt || thread.last_message_at || new Date().toISOString(),
      lastReadAt: String(thread.lastReadAt || thread.last_read_at || '').trim()
    };
  }

  function normalizeThreads(payload, provider = 'local') {
    return Array.isArray(payload) ? payload.map((thread) => normalizeThread(thread, provider)).filter(Boolean) : [];
  }

  function normalizeSupabaseMessageContact(contact) {
    if (!contact) {
      return null;
    }

    const nativeUserId = String(
      contact.nativeUserId ||
      contact.native_user_id ||
      contact.userId ||
      contact.user_id ||
      getUserIdFromActorId(contact.actorId || '')
    ).trim();
    const actorId = String(contact.actorId || getActorIdFromUserId(nativeUserId)).trim();
    const displayName = String(contact.displayName || contact.display_name || 'SocialEra Member').trim() || 'SocialEra Member';

    return {
      actorId,
      nativeUserId,
      displayName,
      userName: normalizeUserName(contact.userName || contact.user_name || contact.username || displayName),
      avatar: String(contact.avatar || getInitials(displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl: String(contact.photoUrl || contact.photo_url || contact.avatarUrl || contact.avatar_url || '').trim(),
      intro: String(contact.intro || 'Start a direct message with this member.').trim() || 'Start a direct message with this member.',
      mediaUrl: '',
      topic: '',
      sourcePostId: '',
      role: 'member',
      provider: 'member'
    };
  }

  function normalizeSupabaseMessage(message, contact, profilesByUserId = null) {
    if (!message) {
      return null;
    }

    const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
    const replyMetaAttachment = rawAttachments.find((attachment) => (
      attachment
      && typeof attachment === 'object'
      && String(attachment.kind || '').trim() === 'reply-meta'
      && (attachment.replyPreviewText || attachment.reply_preview_text || attachment.replyToMessageId || attachment.reply_to_message_id)
    )) || null;

    const senderUserId = String(
      message.senderUserId ||
      message.sender_user_id ||
      message.sender_id ||
      getUserIdFromActorId(message.senderActorId || '')
    ).trim();
    const senderActorId = String(message.senderActorId || getActorIdFromUserId(senderUserId)).trim();
    const senderProfile = senderUserId && profilesByUserId && profilesByUserId[senderUserId]
      ? normalizeSupabaseMessageContact(profilesByUserId[senderUserId])
      : null;
    const isOutgoing = Boolean(
      String(typeof getCurrentAuthUserId === 'function' ? getCurrentAuthUserId() : '').trim()
      && (
        (senderUserId && senderUserId === String(typeof getCurrentAuthUserId === 'function' ? getCurrentAuthUserId() : '').trim())
        || senderActorId === getMessageActorId()
      )
    );
    const currentProfile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : {};
    const displayName = isOutgoing
      ? currentProfile.displayName
      : String(
          message.authorName ||
          message.author_name ||
          (senderProfile && senderProfile.displayName) ||
          contact.displayName ||
          'SocialEra Member'
        ).trim() || 'SocialEra Member';
    const userName = isOutgoing
      ? normalizeUserName(currentProfile.userName)
      : normalizeUserName(
          message.userName ||
          message.user_name ||
          message.username ||
          (senderProfile && senderProfile.userName) ||
          contact.userName ||
          displayName
        );
    const photoUrl = isOutgoing
      ? String(currentProfile.photoUrl || '').trim()
      : String(
          message.photoUrl ||
          message.photo_url ||
          (senderProfile && senderProfile.photoUrl) ||
          contact.photoUrl ||
          ''
        ).trim();

    return {
      id: `member-message:${String(message.id || `message-${Date.now()}`)}`,
      nativeId: String(message.id || `message-${Date.now()}`),
      senderActorId,
      senderUserId,
      authorName: displayName,
      userName,
      avatar: isOutgoing
        ? currentProfile.avatar
        : String(
            message.avatar ||
            (senderProfile && senderProfile.avatar) ||
            getInitials(displayName)
          ).trim().slice(0, 2).toUpperCase() || 'SE',
      photoUrl,
      text: String(message.text != null ? message.text : message.body || '').trim(),
      replyToMessageId: String(message.replyToMessageId || message.reply_to_message_id || (replyMetaAttachment && (replyMetaAttachment.replyToMessageId || replyMetaAttachment.reply_to_message_id)) || '').trim(),
      replyPreviewAuthor: String(message.replyPreviewAuthor || message.reply_preview_author || (replyMetaAttachment && (replyMetaAttachment.replyPreviewAuthor || replyMetaAttachment.reply_preview_author)) || '').trim(),
      replyPreviewText: String(message.replyPreviewText || message.reply_preview_text || (replyMetaAttachment && (replyMetaAttachment.replyPreviewText || replyMetaAttachment.reply_preview_text)) || '').trim(),
      attachments: rawAttachments.map(normalizeMessageAttachmentInput).filter(Boolean),
      reactions: Array.isArray(message.reactions) ? message.reactions.map(normalizeMessageReaction).filter(Boolean) : [],
      createdAt: String(message.createdAt || message.created_at || new Date().toISOString())
    };
  }

  function normalizeSupabaseMessageThread(thread) {
    if (!thread || !thread.id) {
      return null;
    }

    const contact = normalizeSupabaseMessageContact(thread.contact || {});

    return {
      id: `member:${String(thread.id)}`,
      nativeId: String(thread.id),
      provider: 'member',
      ownerActorId: getMessageActorId(),
      updatedAt: String(thread.updatedAt || thread.updated_at || thread.lastMessageAt || thread.last_message_at || thread.createdAt || thread.created_at || new Date().toISOString()),
      createdAt: String(thread.createdAt || thread.created_at || thread.updatedAt || thread.updated_at || new Date().toISOString()),
      lastReadAt: String(thread.lastReadAt || thread.last_read_at || '').trim(),
      contact,
      messages: Array.isArray(thread.messages)
        ? thread.messages
            .map((message) => normalizeSupabaseMessage(message, contact, thread.profilesByUserId || null))
            .filter(Boolean)
        : []
    };
  }

  function buildFallbackSupabaseThread(conversationId, contact = null) {
    const now = new Date().toISOString();
    const normalizedContact = normalizeSupabaseMessageContact(contact || {});

    return normalizeSupabaseMessageThread({
      id: String(conversationId || '').trim(),
      updated_at: now,
      created_at: now,
      last_read_at: now,
      contact: normalizedContact,
      profilesByUserId: null,
      messages: []
    });
  }

  function buildMessageContactKey(contact) {
    return [
      String(contact && contact.provider || ''),
      String(contact && (contact.nativeUserId || contact.actorId || contact.userName) || '').toLowerCase()
    ].join('::');
  }

  function mergeMessageContacts(contacts) {
    const seen = new Map();

    (Array.isArray(contacts) ? contacts : []).forEach((contact) => {
      if (!contact || !contact.actorId) {
        return;
      }

      const key = buildMessageContactKey(contact);

      if (!seen.has(key)) {
        seen.set(key, contact);
      }
    });

    return Array.from(seen.values()).sort((left, right) => {
      const roleOrder = { member: 0, support: 1, creator: 2 };
      const leftRole = roleOrder[left.role] != null ? roleOrder[left.role] : 9;
      const rightRole = roleOrder[right.role] != null ? roleOrder[right.role] : 9;

      if (leftRole !== rightRole) {
        return leftRole - rightRole;
      }

      return String(left.displayName || '').localeCompare(String(right.displayName || ''));
    });
  }

  return {
    buildFallbackSupabaseThread,
    buildMessageContactKey,
    mergeMessageContacts,
    normalizeContact,
    normalizeContacts,
    normalizeMessage,
    normalizeMessageAttachmentInput,
    normalizeMessageReaction,
    normalizeSupabaseMessage,
    normalizeSupabaseMessageContact,
    normalizeSupabaseMessageThread,
    normalizeThread,
    normalizeThreads
  };
}
