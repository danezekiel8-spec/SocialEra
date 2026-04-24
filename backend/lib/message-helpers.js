const crypto = require('crypto');

function getDisplayInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) {
    return 'SE';
  }

  return words
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2) || 'SE';
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'contact';
}

function sanitizeMessageMediaUrl(value) {
  const text = String(value || '').trim();
  return text.startsWith('data:') ? '' : text;
}

function normalizeMessageAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }

  const name = String(attachment.name || 'Attachment').trim().slice(0, 120) || 'Attachment';
  const type = String(attachment.type || '').trim().slice(0, 120);
  const size = Math.max(0, Math.min(Number(attachment.size || 0) || 0, 8 * 1024 * 1024));
  const dataUrl = String(attachment.dataUrl || attachment.url || '').trim();

  if (!dataUrl.startsWith('data:')) {
    return null;
  }

  if (dataUrl.length > 8 * 1024 * 1024) {
    return null;
  }

  const normalizedKind = String(attachment.kind || '').trim();
  const inferredKind = type.startsWith('image/')
    ? 'image'
    : type.startsWith('audio/')
      ? 'audio'
      : 'file';
  const kind = ['image', 'audio'].includes(normalizedKind) ? normalizedKind : inferredKind;

  return {
    id: String(attachment.id || crypto.randomUUID()),
    name,
    type: type || (kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : 'application/octet-stream'),
    size,
    kind,
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

  const actorIds = Array.from(new Set(
    (Array.isArray(reaction.actorIds) ? reaction.actorIds : [])
      .map((actorId) => String(actorId || '').trim())
      .filter(Boolean)
  ));

  return {
    emoji,
    actorIds
  };
}

function normalizeMessageContact(contact, fallback = {}) {
  const displayName = String(contact.displayName ?? fallback.displayName ?? 'SocialEra Contact').trim() || 'SocialEra Contact';
  const userNameSeed = String(contact.userName ?? fallback.userName ?? `@${slugify(displayName)}`).trim();
  const normalizedUserName = userNameSeed.startsWith('@') ? userNameSeed : `@${userNameSeed.replace(/^@+/, '')}`;
  const actorId = String(contact.actorId ?? fallback.actorId ?? '').trim() || `contact-${slugify(normalizedUserName || displayName)}`;
  const nativeUserId = String(contact.nativeUserId ?? fallback.nativeUserId ?? '').trim();
  const provider = String(contact.provider ?? fallback.provider ?? 'local').trim() || 'local';
  const updatedAt = String(contact.updatedAt ?? contact.updated_at ?? fallback.updatedAt ?? fallback.updated_at ?? new Date().toISOString()).trim();
  const lastActiveAt = String(
    contact.lastActiveAt
    ?? contact.last_active_at
    ?? fallback.lastActiveAt
    ?? fallback.last_active_at
    ?? updatedAt
  ).trim();

  return {
    actorId,
    nativeUserId,
    displayName,
    userName: normalizedUserName || '@socialera.contact',
    avatar: String(contact.avatar ?? fallback.avatar ?? getDisplayInitials(displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
    photoUrl: String(contact.photoUrl ?? fallback.photoUrl ?? '').trim(),
    role: String(contact.role ?? fallback.role ?? 'creator').trim() || 'creator',
    intro: String(contact.intro ?? fallback.intro ?? '').trim(),
    topic: String(contact.topic ?? fallback.topic ?? '').trim(),
    mediaUrl: sanitizeMessageMediaUrl(contact.mediaUrl ?? fallback.mediaUrl ?? ''),
    sourcePostId: String(contact.sourcePostId ?? fallback.sourcePostId ?? '').trim(),
    provider,
    updatedAt,
    lastActiveAt
  };
}

function getSupportMessageContact() {
  return normalizeMessageContact({
    actorId: 'support-socialera',
    displayName: 'SocialEra Support',
    userName: '@socialera.help',
    avatar: 'SE',
    role: 'support',
    intro: 'Ask about orders, sizing, creator listings, or platform help.',
    topic: 'Orders, account help, and shopping support'
  });
}

function normalizeMessageEntry(message, fallback = {}) {
  const authorName = String(message.authorName ?? fallback.authorName ?? 'SocialEra Member').trim() || 'SocialEra Member';
  const userNameSeed = String(message.userName ?? fallback.userName ?? `@${slugify(authorName)}`).trim();
  const userName = userNameSeed.startsWith('@') ? userNameSeed : `@${userNameSeed.replace(/^@+/, '')}`;
  const createdAt = message.createdAt || fallback.createdAt || new Date().toISOString();
  const attachments = Array.isArray(message.attachments ?? fallback.attachments)
    ? (message.attachments ?? fallback.attachments)
        .map((attachment) => normalizeMessageAttachment(attachment))
        .filter(Boolean)
    : [];
  const reactions = Array.isArray(message.reactions ?? fallback.reactions)
    ? (message.reactions ?? fallback.reactions)
        .map((reaction) => normalizeMessageReaction(reaction))
        .filter(Boolean)
    : [];

  return {
    id: String(message.id || crypto.randomUUID()),
    senderActorId: String(message.senderActorId ?? fallback.senderActorId ?? '').trim(),
    authorName,
    userName: userName || '@socialera.member',
    avatar: String(message.avatar ?? fallback.avatar ?? getDisplayInitials(authorName)).trim().slice(0, 2).toUpperCase() || 'SE',
    text: String(message.text ?? fallback.text ?? '').trim(),
    replyToMessageId: String(message.replyToMessageId ?? message.reply_to_message_id ?? fallback.replyToMessageId ?? fallback.reply_to_message_id ?? '').trim(),
    replyPreviewAuthor: String(message.replyPreviewAuthor ?? message.reply_preview_author ?? fallback.replyPreviewAuthor ?? fallback.reply_preview_author ?? '').trim(),
    replyPreviewText: String(message.replyPreviewText ?? message.reply_preview_text ?? fallback.replyPreviewText ?? fallback.reply_preview_text ?? '').trim(),
    attachments,
    reactions,
    createdAt
  };
}

function normalizeMemberProfile(profile, fallback = {}) {
  const displayName = String(profile.displayName ?? fallback.displayName ?? 'SocialEra Member').trim() || 'SocialEra Member';
  const userNameSeed = String(profile.userName ?? fallback.userName ?? `@${slugify(displayName)}`).trim();
  const userName = userNameSeed.startsWith('@') ? userNameSeed : `@${userNameSeed.replace(/^@+/, '')}`;
  const actorId = String(profile.actorId ?? fallback.actorId ?? '').trim() || `user-${slugify(userName || displayName)}`;
  const nativeUserId = String(
    profile.nativeUserId
    ?? fallback.nativeUserId
    ?? (actorId.startsWith('user-') ? actorId.slice(5) : '')
  ).trim();

  const updatedAt = String(profile.updatedAt ?? fallback.updatedAt ?? new Date().toISOString());
  const lastActiveAt = String(
    profile.lastActiveAt
    ?? profile.last_active_at
    ?? fallback.lastActiveAt
    ?? fallback.last_active_at
    ?? updatedAt
  );

  return {
    actorId,
    nativeUserId,
    displayName,
    userName: userName || '@socialera.member',
    avatar: String(profile.avatar ?? fallback.avatar ?? getDisplayInitials(displayName)).trim().slice(0, 2).toUpperCase() || 'SE',
    photoUrl: String(profile.photoUrl ?? fallback.photoUrl ?? '').trim(),
    role: 'member',
    intro: 'Start a direct message with this member.',
    topic: '',
    sourcePostId: '',
    updatedAt,
    lastActiveAt
  };
}

function normalizeMemberThread(thread) {
  const createdAt = thread.createdAt || new Date().toISOString();
  const participants = Array.isArray(thread.participants)
    ? thread.participants.map((participant) => normalizeMemberProfile(participant)).filter((participant) => participant.actorId)
    : [];
  const participantActorIds = Array.isArray(thread.participantActorIds)
    ? Array.from(new Set(thread.participantActorIds.map((actorId) => String(actorId || '').trim()).filter(Boolean)))
    : participants.map((participant) => participant.actorId);
  const messages = Array.isArray(thread.messages)
    ? thread.messages
        .map((message) => normalizeMessageEntry(message))
        .filter((message) => message.text || (Array.isArray(message.attachments) && message.attachments.length))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  return {
    id: String(thread.id || `member-thread-${crypto.randomUUID()}`),
    participantActorIds,
    participants,
    messages,
    createdAt,
    updatedAt: thread.updatedAt || (messages.length ? messages[messages.length - 1].createdAt : createdAt)
  };
}

function normalizeMessageThread(thread) {
  const createdAt = thread.createdAt || new Date().toISOString();
  const messages = Array.isArray(thread.messages)
    ? thread.messages
        .map((message) => normalizeMessageEntry(message))
        .filter((message) => message.text || (Array.isArray(message.attachments) && message.attachments.length))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  return {
    id: String(thread.id || `thread-${crypto.randomUUID()}`),
    ownerActorId: String(thread.ownerActorId || '').trim(),
    contact: normalizeMessageContact(thread.contact || {}),
    messages,
    createdAt,
    updatedAt: thread.updatedAt || (messages.length ? messages[messages.length - 1].createdAt : createdAt)
  };
}

function buildThreadIntroMessage(contact) {
  const text = contact.role === 'support'
    ? 'Welcome to SocialEra messages. Reach out here for order questions, creator listings, or shopping support.'
    : `Hey, it’s ${contact.displayName}. Happy to chat about ${contact.topic || 'the look'} whenever you are.`;

  return normalizeMessageEntry({
    senderActorId: contact.actorId,
    authorName: contact.displayName,
    userName: contact.userName,
    avatar: contact.avatar,
    text,
    createdAt: new Date().toISOString()
  });
}

function createMessageThread(ownerActorId, contact, options = {}) {
  const createdAt = new Date().toISOString();
  const includeIntro = options.includeIntro !== false;
  const introMessage = includeIntro ? [buildThreadIntroMessage(contact)] : [];

  return normalizeMessageThread({
    id: `thread-${crypto.randomUUID()}`,
    ownerActorId,
    contact,
    messages: introMessage,
    createdAt,
    updatedAt: introMessage.length ? introMessage[introMessage.length - 1].createdAt : createdAt
  });
}

function ensureWelcomeInboxThread(data, ownerActorId) {
  if (!ownerActorId) {
    return false;
  }

  const hasExisting = data.threads.some((thread) => thread.ownerActorId === ownerActorId);

  if (hasExisting) {
    return false;
  }

  data.threads.unshift(createMessageThread(ownerActorId, getSupportMessageContact(), { includeIntro: true }));
  return true;
}

function upsertMemberProfile(data, profileInput) {
  const actorId = String(profileInput && profileInput.actorId || '').trim();

  if (!actorId) {
    return null;
  }

  const existingIndex = Array.isArray(data.members)
    ? data.members.findIndex((member) => member.actorId === actorId)
    : -1;
  const existing = existingIndex === -1 ? null : data.members[existingIndex];
  const nextProfile = normalizeMemberProfile({
    ...(existing || {}),
    ...(profileInput || {}),
    actorId,
    updatedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString()
  });

  if (!Array.isArray(data.members)) {
    data.members = [];
  }

  if (existingIndex === -1) {
    data.members.unshift(nextProfile);
  } else {
    data.members[existingIndex] = nextProfile;
  }

  return nextProfile;
}

function getMemberProfile(data, actorId) {
  if (!actorId || !Array.isArray(data.members)) {
    return null;
  }

  return data.members.find((member) => member.actorId === actorId) || null;
}

function createMemberThread(actorProfile, contactProfile) {
  const createdAt = new Date().toISOString();

  return normalizeMemberThread({
    id: `member-thread-${crypto.randomUUID()}`,
    participantActorIds: [actorProfile.actorId, contactProfile.actorId],
    participants: [actorProfile, contactProfile],
    messages: [],
    createdAt,
    updatedAt: createdAt
  });
}

function resolveMemberThreadContact(thread, actorId) {
  const participants = Array.isArray(thread.participants) ? thread.participants : [];
  const otherParticipant = participants.find((participant) => participant.actorId !== actorId)
    || participants[0]
    || normalizeMemberProfile({});

  return normalizeMessageContact(otherParticipant, {
    role: 'member',
    intro: 'Start a direct message with this member.',
    provider: 'member',
    nativeUserId: String(
      otherParticipant && otherParticipant.nativeUserId
        ? otherParticipant.nativeUserId
        : (otherParticipant && String(otherParticipant.actorId || '').startsWith('user-')
          ? String(otherParticipant.actorId || '').slice(5)
          : '')
    ).trim()
  });
}

function serializeMemberThreadForActor(thread, actorId) {
  return {
    id: thread.id,
    nativeId: thread.id,
    provider: 'member',
    contact: resolveMemberThreadContact(thread, actorId),
    messages: Array.isArray(thread.messages) ? thread.messages.map((message) => normalizeMessageEntry(message)) : [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt
  };
}

function buildAutoReply(contact, outgoingMessage) {
  const normalizedText = String(outgoingMessage && outgoingMessage.text || '').trim().toLowerCase();
  const hasAttachment = Boolean(outgoingMessage && Array.isArray(outgoingMessage.attachments) && outgoingMessage.attachments.length);
  let reply = '';

  if (contact.role === 'support') {
    if (!normalizedText && hasAttachment) {
      reply = 'Thanks for sending that over. I can take a look from here if you want to add any context.';
    } else if (normalizedText.includes('order') || normalizedText.includes('shipping') || normalizedText.includes('delivery')) {
      reply = 'I can help with that. Send the order or product details and I will guide the next step.';
    } else if (normalizedText.includes('size') || normalizedText.includes('sizing') || normalizedText.includes('fit')) {
      reply = 'Happy to help with fit. Tell me the product or creator look you are asking about and I can narrow it down.';
    } else {
      reply = 'Thanks for reaching out. Tell me what you need help with and I will keep it moving from here.';
    }
  } else if (!normalizedText && hasAttachment) {
    reply = 'I got the file. If you want, send a quick note with what you want me to look at.';
  } else if (normalizedText.includes('price') || normalizedText.includes('pricing') || normalizedText.includes('cost')) {
    reply = `I can share more context on the pricing direction behind ${contact.topic || 'that drop'}.`;
  } else if (normalizedText.includes('size') || normalizedText.includes('sizing') || normalizedText.includes('fit')) {
    reply = `For fit, I would start with the proportions in ${contact.topic || 'that look'} and then tune the structure from there.`;
  } else if (normalizedText.includes('available') || normalizedText.includes('stock')) {
    reply = `${contact.topic || 'That piece'} is still part of the current rotation on my side.`;
  } else {
    reply = `Thanks for the message. ${contact.topic ? `The mood behind "${contact.topic}"` : 'That look'} is a good place to start, so ask me anything you want to dig into.`;
  }

  return normalizeMessageEntry({
    senderActorId: contact.actorId,
    authorName: contact.displayName,
    userName: contact.userName,
    avatar: contact.avatar,
    text: reply,
    createdAt: new Date(Date.now() + 1500).toISOString()
  });
}

function toggleMessageReaction(message, actorId, emoji) {
  if (!message || !actorId || !emoji) {
    return;
  }

  if (!Array.isArray(message.reactions)) {
    message.reactions = [];
  }

  const normalizedEmoji = Array.from(String(emoji || '').trim()).slice(0, 2).join('');

  if (!normalizedEmoji) {
    return;
  }

  const existing = message.reactions.find((reaction) => reaction.emoji === normalizedEmoji);

  if (!existing) {
    message.reactions.push({
      emoji: normalizedEmoji,
      actorIds: [actorId]
    });
    return;
  }

  const hasActor = existing.actorIds.includes(actorId);
  existing.actorIds = hasActor
    ? existing.actorIds.filter((entry) => entry !== actorId)
    : existing.actorIds.concat(actorId);

  message.reactions = message.reactions.filter((reaction) => Array.isArray(reaction.actorIds) && reaction.actorIds.length);
}

function createMessageContactHelpers({ readSocialMessages, readSocialPosts }) {
  function buildMessageContacts() {
    const supportContact = getSupportMessageContact();
    const contacts = [supportContact];
    const seen = new Set([supportContact.actorId, supportContact.userName.toLowerCase()]);
    const messageData = readSocialMessages();
    const memberProfiles = Array.isArray(messageData.members) ? messageData.members : [];
    const posts = readSocialPosts()
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    posts.forEach((post) => {
      const userName = String(post.userName || '').trim();
      const displayName = String(post.displayName || '').trim();
      const key = (userName || displayName).toLowerCase();

      if (!key || seen.has(key)) {
        return;
      }

      const linkedMember = memberProfiles.find((member) => (
        String(member.userName || '').trim().toLowerCase() === String(userName || '').trim().toLowerCase()
        || String(member.displayName || '').trim().toLowerCase() === String(displayName || '').trim().toLowerCase()
      )) || null;
      const linkedNativeUserId = linkedMember && String(linkedMember.actorId || '').startsWith('user-')
        ? String(linkedMember.actorId || '').slice(5)
        : '';
      const contact = normalizeMessageContact({
        actorId: linkedMember ? linkedMember.actorId : `creator-${slugify(userName || displayName)}`,
        nativeUserId: linkedNativeUserId,
        displayName: displayName || (linkedMember ? linkedMember.displayName : 'SocialEra Creator'),
        userName: userName || (linkedMember ? linkedMember.userName : `@${slugify(displayName || 'socialera.creator')}`),
        avatar: String(post.avatar || '').trim() || (linkedMember ? linkedMember.avatar : getDisplayInitials(displayName || userName)),
        photoUrl: linkedMember ? linkedMember.photoUrl : '',
        role: 'creator',
        intro: 'Usually replies about the featured look, product details, and the creator drop tied to the post.',
        topic: String(post.promotedTitle || post.captionTitle || 'the latest SocialEra look').trim(),
        mediaUrl: String(post.mediaUrl || '').trim(),
        sourcePostId: String(post.id || '').trim(),
        provider: linkedMember ? 'member' : 'local'
      });

      seen.add(key);
      seen.add(contact.actorId);
      contacts.push(contact);
    });

    return contacts.slice(0, 18);
  }

  function resolveMessageContact(contactId, fallbackContact) {
    const normalizedContactId = String(contactId || '').trim().toLowerCase();
    const contacts = buildMessageContacts();

    const matched = contacts.find((contact) => (
      [
        contact.actorId,
        contact.userName,
        contact.displayName,
        contact.sourcePostId
      ].some((value) => String(value || '').trim().toLowerCase() === normalizedContactId)
    ));

    if (matched) {
      return matched;
    }

    if (fallbackContact && typeof fallbackContact === 'object') {
      return normalizeMessageContact(fallbackContact);
    }

    return null;
  }

  return {
    buildMessageContacts,
    resolveMessageContact
  };
}

module.exports = {
  normalizeMessageAttachment,
  normalizeMessageContact,
  normalizeMessageEntry,
  normalizeMemberProfile,
  normalizeMemberThread,
  normalizeMessageThread,
  getSupportMessageContact,
  createMessageThread,
  ensureWelcomeInboxThread,
  upsertMemberProfile,
  getMemberProfile,
  createMemberThread,
  serializeMemberThreadForActor,
  buildAutoReply,
  toggleMessageReaction,
  createMessageContactHelpers
};
