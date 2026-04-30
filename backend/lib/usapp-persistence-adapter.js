const {
  normalizeMessageAttachment,
  normalizeMessageContact,
  normalizeMessageEntry,
  normalizeMemberProfile,
  normalizeMessageThread,
  createMessageThread,
  toggleMessageReaction
} = require('./message-helpers');

const DEFAULT_SUPABASE_URL = 'https://kfunqpatayfkscilhncx.supabase.co';

// Member chats map to the existing normalized messaging tables.
// Local threads and member state use lightweight JSONB-backed tables until the schema extension lands.
const DEFAULT_TABLES = {
  memberProfiles: 'chat_profiles',
  memberThreads: 'conversations',
  memberParticipants: 'conversation_participants',
  memberMessages: 'messages',
  memberStates: 'usapp_user_states',
  localThreads: 'usapp_local_threads'
};

function trimEnv(value) {
  return String(value || '').trim();
}

function quoteInValue(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function setInFilter(params, key, values) {
  const normalizedValues = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));

  if (!normalizedValues.length) {
    return;
  }

  params[key] = `in.(${normalizedValues.map(quoteInValue).join(',')})`;
}

function normalizeMessageState(actorId, payload = {}) {
  const metadata = payload.metadata && typeof payload.metadata === 'object'
    ? payload.metadata
    : {};
  const normalizedActorId = String(actorId || payload.actorId || '').trim();
  const threadReadState = Object.fromEntries(
    Object.entries(
      payload.threadReadState && typeof payload.threadReadState === 'object'
        ? payload.threadReadState
        : metadata.threadReadState && typeof metadata.threadReadState === 'object'
          ? metadata.threadReadState
          : {}
    )
      .map(([threadId, seenAt]) => [String(threadId || '').trim(), String(seenAt || '').trim()])
      .filter(([threadId, seenAt]) => threadId && seenAt)
  );

  return {
    actorId: normalizedActorId,
    notificationSeenAt: String(payload.notificationSeenAt || payload.notification_seen_at || '').trim(),
    mutedThreadIds: Array.from(new Set(
      (
        Array.isArray(payload.mutedThreadIds || payload.muted_thread_ids)
          ? (payload.mutedThreadIds || payload.muted_thread_ids)
          : Array.isArray(metadata.mutedThreadIds || metadata.muted_thread_ids)
            ? (metadata.mutedThreadIds || metadata.muted_thread_ids)
            : []
      )
        .map((threadId) => String(threadId || '').trim())
        .filter(Boolean)
    )),
    forcedUnreadThreadIds: Array.from(new Set(
      (
        Array.isArray(payload.forcedUnreadThreadIds || payload.forced_unread_thread_ids)
          ? (payload.forcedUnreadThreadIds || payload.forced_unread_thread_ids)
          : Array.isArray(metadata.forcedUnreadThreadIds || metadata.forced_unread_thread_ids)
            ? (metadata.forcedUnreadThreadIds || metadata.forced_unread_thread_ids)
            : []
      )
        .map((threadId) => String(threadId || '').trim())
        .filter(Boolean)
    )),
    threadReadState,
    updatedAt: String(payload.updatedAt || payload.updated_at || new Date().toISOString()).trim()
  };
}

function actorIdToUserId(actorId) {
  const normalizedActorId = String(actorId || '').trim();
  return normalizedActorId.startsWith('user-') ? normalizedActorId.slice(5) : '';
}

function userIdToActorId(userId) {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `user-${normalizedUserId}` : '';
}

function buildDirectThreadNativeId(leftUserId, rightUserId) {
  const pair = [String(leftUserId || '').trim(), String(rightUserId || '').trim()]
    .filter(Boolean)
    .sort();
  return pair.length === 2 ? `member-thread-${pair[0]}-${pair[1]}` : '';
}

function isReplyMetaAttachment(attachment) {
  return Boolean(
    attachment
    && typeof attachment === 'object'
    && String(attachment.kind || '').trim() === 'reply-meta'
    && (
      attachment.replyToMessageId
      || attachment.reply_to_message_id
      || attachment.replyPreviewAuthor
      || attachment.reply_preview_author
      || attachment.replyPreviewText
      || attachment.reply_preview_text
    )
  );
}

function splitReplyMetaFromAttachments(attachments) {
  const rawAttachments = Array.isArray(attachments) ? attachments : [];
  let replyMeta = null;
  const cleanedAttachments = [];

  rawAttachments.forEach((attachment) => {
    if (isReplyMetaAttachment(attachment)) {
      if (!replyMeta) {
        replyMeta = attachment;
      }
      return;
    }

    const normalized = normalizeMessageAttachment(attachment);

    if (normalized) {
      cleanedAttachments.push(normalized);
    }
  });

  return {
    attachments: cleanedAttachments,
    replyMeta
  };
}

function buildReplyMetaAttachment(message) {
  const replyToMessageId = String(message.replyToMessageId || '').trim();
  const replyPreviewAuthor = String(message.replyPreviewAuthor || '').trim();
  const replyPreviewText = String(message.replyPreviewText || '').trim();

  if (!replyToMessageId && !replyPreviewAuthor && !replyPreviewText) {
    return null;
  }

  return {
    kind: 'reply-meta',
    replyToMessageId,
    replyPreviewAuthor,
    replyPreviewText
  };
}

function normalizeStoredMessage(message, fallbackProfile = {}) {
  const rawAttachments = Array.isArray(message && message.attachments) ? message.attachments : [];
  const split = splitReplyMetaFromAttachments(rawAttachments);
  const replyMeta = split.replyMeta || {};

  return normalizeMessageEntry({
    id: message && message.id,
    senderActorId: message && (message.senderActorId || message.sender_actor_id) || fallbackProfile.actorId,
    authorName: message && (message.authorName || message.author_name) || fallbackProfile.displayName,
    userName: message && (message.userName || message.user_name) || fallbackProfile.userName,
    avatar: message && message.avatar || fallbackProfile.avatar,
    text: String(message && (message.text != null ? message.text : message.body) || '').slice(0, 2000),
    replyToMessageId: message && (message.replyToMessageId || message.reply_to_message_id) || replyMeta.replyToMessageId || replyMeta.reply_to_message_id,
    replyPreviewAuthor: message && (message.replyPreviewAuthor || message.reply_preview_author) || replyMeta.replyPreviewAuthor || replyMeta.reply_preview_author,
    replyPreviewText: message && (message.replyPreviewText || message.reply_preview_text) || replyMeta.replyPreviewText || replyMeta.reply_preview_text,
    attachments: split.attachments,
    reactions: Array.isArray(message && message.reactions) ? message.reactions : [],
    createdAt: message && (message.createdAt || message.created_at)
  }, fallbackProfile);
}

function mapChatProfileRowToMemberProfile(row) {
  return normalizeMemberProfile({
    actorId: String(row && row.actor_id || '').trim() || userIdToActorId(row && row.user_id),
    nativeUserId: String(row && row.user_id || '').trim(),
    displayName: row && row.display_name,
    userName: row && row.username ? `@${String(row.username).replace(/^@+/, '')}` : '',
    avatar: row && row.metadata && row.metadata.avatar,
    photoUrl: row && row.avatar_url,
    role: row && row.member_classification,
    intro: row && row.intro,
    topic: row && row.topic,
    sourcePostId: row && row.source_post_id,
    updatedAt: row && row.updated_at,
    lastActiveAt: row && (row.last_active_at || row.updated_at)
  });
}

function mapMemberProfileToChatProfilePayload(profileInput = {}) {
  const normalizedProfile = normalizeMemberProfile(profileInput);
  const userId = String(profileInput.nativeUserId || actorIdToUserId(normalizedProfile.actorId)).trim();

  if (!userId) {
    throw new Error('A member profile requires a user-backed actor ID.');
  }

  return {
    user_id: userId,
    actor_id: normalizedProfile.actorId,
    display_name: normalizedProfile.displayName,
    username: String(normalizedProfile.userName || '').replace(/^@+/, ''),
    avatar_url: normalizedProfile.photoUrl || '',
    bio: String(profileInput.bio || normalizedProfile.intro || '').trim(),
    member_classification: String(normalizedProfile.role || 'member').trim() || 'member',
    intro: String(normalizedProfile.intro || '').trim(),
    topic: String(normalizedProfile.topic || '').trim(),
    source_post_id: String(normalizedProfile.sourcePostId || '').trim(),
    last_active_at: String(normalizedProfile.lastActiveAt || normalizedProfile.updatedAt || new Date().toISOString()).trim(),
    metadata: {
      avatar: String(normalizedProfile.avatar || '').trim(),
      nativeUserId: normalizedProfile.nativeUserId
    }
  };
}

function mapLocalThreadRowToThread(row) {
  return normalizeMessageThread({
    id: row && row.id,
    nativeId: row && row.native_id,
    ownerActorId: row && row.owner_actor_id,
    contact: row && row.contact,
    messages: Array.isArray(row && row.messages) ? row.messages : [],
    createdAt: row && row.created_at,
    updatedAt: row && row.updated_at
  });
}

function memberProfileToContact(profile) {
  const normalizedProfile = normalizeMemberProfile(profile || {});

  return normalizeMessageContact({
    ...normalizedProfile,
    role: 'member',
    intro: 'Start a direct message with this member.',
    provider: 'member',
    nativeUserId: String(
      normalizedProfile.nativeUserId
      || actorIdToUserId(normalizedProfile.actorId)
    ).trim()
  });
}

function mapMemberThreadBundleToThread({
  actorId,
  conversation,
  membership,
  participants,
  profileMap,
  messages
}) {
  const normalizedActorId = String(actorId || '').trim();
  const otherParticipant = (Array.isArray(participants) ? participants : []).find((participant) => (
    userIdToActorId(participant && participant.user_id) !== normalizedActorId
  )) || (Array.isArray(participants) ? participants[0] : null) || null;
  const otherUserId = String(otherParticipant && otherParticipant.user_id || '').trim();
  const contactProfile = otherUserId && profileMap[otherUserId]
    ? profileMap[otherUserId]
    : normalizeMemberProfile({
        actorId: userIdToActorId(otherUserId),
        nativeUserId: otherUserId,
        displayName: 'SocialEra Member'
      });

  return {
    id: String(conversation && conversation.id || '').trim(),
    nativeId: String(conversation && (conversation.native_id || conversation.id) || '').trim(),
    provider: 'member',
    contact: memberProfileToContact(contactProfile),
    messages: (Array.isArray(messages) ? messages : [])
      .map((message) => {
        const senderUserId = String(message && message.sender_id || '').trim();
        const senderProfile = senderUserId && profileMap[senderUserId]
          ? profileMap[senderUserId]
          : normalizeMemberProfile({
              actorId: userIdToActorId(senderUserId),
              nativeUserId: senderUserId,
              displayName: 'SocialEra Member'
            });

        return normalizeStoredMessage({
          id: message && message.id,
          native_id: message && message.native_id,
          sender_actor_id: userIdToActorId(senderUserId),
          body: message && message.body,
          attachments: Array.isArray(message && message.attachments) ? message.attachments : [],
          reactions: Array.isArray(message && message.reactions) ? message.reactions : [],
          reply_to_message_id: message && message.reply_to_message_id,
          reply_to_native_id: message && message.reply_to_native_id,
          reply_preview_author: message && message.reply_preview_author,
          reply_preview_text: message && message.reply_preview_text,
          created_at: message && message.created_at
        }, senderProfile);
      })
      .filter(Boolean),
    createdAt: String(
      conversation && (conversation.created_at || conversation.updated_at || conversation.last_message_at)
      || new Date().toISOString()
    ).trim(),
    updatedAt: String(
      conversation && (conversation.last_message_at || conversation.updated_at || conversation.created_at)
      || new Date().toISOString()
    ).trim(),
    lastReadAt: String(membership && membership.last_read_at || '').trim()
  };
}

function createUsappPersistenceAdapter(options = {}) {
  const supabaseUrl = trimEnv(
    options.supabaseUrl
    || process.env.SUPABASE_URL
    || process.env.SUPABASE_PROJECT_URL
    || DEFAULT_SUPABASE_URL
  );
  const supabaseServiceRoleKey = trimEnv(
    options.supabaseServiceRoleKey
    || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const fetchImpl = typeof options.fetch === 'function' ? options.fetch : fetch;
  const tables = {
    ...DEFAULT_TABLES,
    ...(options.tables && typeof options.tables === 'object' ? options.tables : {})
  };

  function isConfigured() {
    return Boolean(supabaseUrl && supabaseServiceRoleKey && typeof fetchImpl === 'function');
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw new Error('Supabase Usapp persistence is not configured.');
    }
  }

  function buildHeaders(includeJson = false, extraHeaders = {}) {
    const headers = {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      ...extraHeaders
    };

    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  async function requestSupabase(pathname, requestOptions = {}) {
    assertConfigured();

    const response = await fetchImpl(`${supabaseUrl}/rest/v1/${pathname}`, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function upsertMemberProfile(profileInput = {}) {
    const payload = mapMemberProfileToChatProfilePayload(profileInput);
    const rows = await requestSupabase(
      `${tables.memberProfiles}${buildQuery({ on_conflict: 'user_id' })}`,
      {
        method: 'POST',
        headers: buildHeaders(true, {
          Prefer: 'resolution=merge-duplicates,return=representation'
        }),
        body: JSON.stringify([payload])
      }
    );

    return rows && rows[0] ? mapChatProfileRowToMemberProfile(rows[0]) : normalizeMemberProfile(profileInput);
  }

  async function getMemberProfile(actorId) {
    const userId = actorIdToUserId(actorId);

    if (!userId) {
      return null;
    }

    const rows = await requestSupabase(
      `${tables.memberProfiles}${buildQuery({
        select: 'user_id,actor_id,display_name,username,avatar_url,member_classification,intro,topic,source_post_id,last_active_at,metadata,updated_at',
        user_id: `eq.${userId}`,
        limit: 1
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );

    return rows && rows[0] ? mapChatProfileRowToMemberProfile(rows[0]) : null;
  }

  async function listMemberProfiles({ excludeActorId = '', limit = 250 } = {}) {
    const excludeUserId = actorIdToUserId(excludeActorId);
    const params = {
      select: 'user_id,actor_id,display_name,username,avatar_url,member_classification,intro,topic,source_post_id,last_active_at,metadata,updated_at',
      order: 'display_name.asc',
      limit: Math.max(1, Math.min(Number(limit) || 250, 1000))
    };

    if (excludeUserId) {
      params.user_id = `neq.${excludeUserId}`;
    }

    const rows = await requestSupabase(
      `${tables.memberProfiles}${buildQuery(params)}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );

    return Array.isArray(rows) ? rows.map(mapChatProfileRowToMemberProfile).filter((profile) => profile.actorId) : [];
  }

  async function getMemberState(actorId) {
    const normalizedActorId = String(actorId || '').trim();

    if (!normalizedActorId) {
      return null;
    }

    const rows = await requestSupabase(
      `${tables.memberStates}${buildQuery({
        select: 'user_id,actor_id,notification_seen_at,metadata,updated_at',
        actor_id: `eq.${normalizedActorId}`,
        limit: 1
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );

    return rows && rows[0] ? normalizeMessageState(normalizedActorId, rows[0]) : null;
  }

  async function upsertMemberState(actorId, payload = {}) {
    const nextState = normalizeMessageState(actorId, payload);

    if (!nextState.actorId) {
      throw new Error('Actor ID is required.');
    }

    const rows = await requestSupabase(
      `${tables.memberStates}${buildQuery({ on_conflict: 'actor_id' })}`,
      {
        method: 'POST',
        headers: buildHeaders(true, {
          Prefer: 'resolution=merge-duplicates,return=representation'
        }),
        body: JSON.stringify([{
          user_id: actorIdToUserId(nextState.actorId),
          actor_id: nextState.actorId,
          notification_seen_at: nextState.notificationSeenAt || null,
          metadata: {
            mutedThreadIds: nextState.mutedThreadIds,
            forcedUnreadThreadIds: nextState.forcedUnreadThreadIds,
            threadReadState: nextState.threadReadState
          },
          updated_at: nextState.updatedAt || new Date().toISOString()
        }])
      }
    );

    return rows && rows[0] ? normalizeMessageState(nextState.actorId, rows[0]) : nextState;
  }

  async function loadMemberThreadRows(actorId, conversationIds = []) {
    const userId = actorIdToUserId(actorId);

    if (!userId) {
      return [];
    }

    const membershipParams = {
      select: 'conversation_id,last_read_at',
      user_id: `eq.${userId}`
    };

    setInFilter(membershipParams, 'conversation_id', conversationIds);

    const membershipRows = await requestSupabase(
      `${tables.memberParticipants}${buildQuery(membershipParams)}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );
    const memberships = Array.isArray(membershipRows) ? membershipRows : [];
    const threadIds = memberships
      .map((row) => String(row && row.conversation_id || '').trim())
      .filter(Boolean);

    if (!threadIds.length) {
      return [];
    }

    const conversationParams = {
      select: 'id,native_id,kind,created_at,updated_at,last_message_at',
      kind: 'eq.direct',
      order: 'last_message_at.desc'
    };
    setInFilter(conversationParams, 'id', threadIds);

    const participantParams = {
      select: 'conversation_id,user_id,joined_at,last_read_at'
    };
    setInFilter(participantParams, 'conversation_id', threadIds);

    const messageParams = {
      select: 'id,native_id,conversation_id,sender_id,body,attachments,reactions,reply_to_message_id,reply_to_native_id,reply_preview_author,reply_preview_text,created_at',
      order: 'created_at.asc'
    };
    setInFilter(messageParams, 'conversation_id', threadIds);

    const [conversationRows, participantRows, messageRows] = await Promise.all([
      requestSupabase(
        `${tables.memberThreads}${buildQuery(conversationParams)}`,
        {
          method: 'GET',
          headers: buildHeaders(false)
        }
      ),
      requestSupabase(
        `${tables.memberParticipants}${buildQuery(participantParams)}`,
        {
          method: 'GET',
          headers: buildHeaders(false)
        }
      ),
      requestSupabase(
        `${tables.memberMessages}${buildQuery(messageParams)}`,
        {
          method: 'GET',
          headers: buildHeaders(false)
        }
      )
    ]);

    const conversations = Array.isArray(conversationRows) ? conversationRows : [];
    const participants = Array.isArray(participantRows) ? participantRows : [];
    const messages = Array.isArray(messageRows) ? messageRows : [];
    const profileIds = Array.from(new Set(
      participants
        .map((row) => String(row && row.user_id || '').trim())
        .filter(Boolean)
    ));
    const profileMap = {};

    if (profileIds.length) {
      const profileParams = {
        select: 'user_id,actor_id,display_name,username,avatar_url,member_classification,intro,topic,source_post_id,last_active_at,metadata,updated_at'
      };
      setInFilter(profileParams, 'user_id', profileIds);

      const profileRows = await requestSupabase(
        `${tables.memberProfiles}${buildQuery(profileParams)}`,
        {
          method: 'GET',
          headers: buildHeaders(false)
        }
      );

      (Array.isArray(profileRows) ? profileRows : []).forEach((row) => {
        const normalizedUserId = String(row && row.user_id || '').trim();

        if (!normalizedUserId) {
          return;
        }

        profileMap[normalizedUserId] = mapChatProfileRowToMemberProfile(row);
      });
    }

    const membershipByConversationId = {};
    memberships.forEach((row) => {
      const conversationId = String(row && row.conversation_id || '').trim();

      if (conversationId) {
        membershipByConversationId[conversationId] = row;
      }
    });

    const participantsByConversationId = {};
    participants.forEach((row) => {
      const conversationId = String(row && row.conversation_id || '').trim();

      if (!conversationId) {
        return;
      }

      if (!participantsByConversationId[conversationId]) {
        participantsByConversationId[conversationId] = [];
      }

      participantsByConversationId[conversationId].push(row);
    });

    const messagesByConversationId = {};
    messages.forEach((row) => {
      const conversationId = String(row && row.conversation_id || '').trim();

      if (!conversationId) {
        return;
      }

      if (!messagesByConversationId[conversationId]) {
        messagesByConversationId[conversationId] = [];
      }

      messagesByConversationId[conversationId].push(row);
    });

    return conversations.map((conversation) => mapMemberThreadBundleToThread({
      actorId,
      conversation,
      membership: membershipByConversationId[String(conversation && conversation.id || '').trim()] || null,
      participants: participantsByConversationId[String(conversation && conversation.id || '').trim()] || [],
      profileMap,
      messages: messagesByConversationId[String(conversation && conversation.id || '').trim()] || []
    })).filter(Boolean);
  }

  async function listMemberThreads(actorId) {
    return loadMemberThreadRows(actorId);
  }

  async function resolveMemberConversationId(threadId) {
    const normalizedThreadId = String(threadId || '').trim();

    if (!normalizedThreadId) {
      return '';
    }

    const rows = await requestSupabase(
      `${tables.memberThreads}${buildQuery({
        select: 'id,native_id',
        kind: 'eq.direct',
        or: `(id.eq.${normalizedThreadId},native_id.eq.${normalizedThreadId})`,
        limit: 1
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );

    return String(rows && rows[0] && rows[0].id || '').trim();
  }

  async function getMemberThread(actorId, threadId) {
    const normalizedThreadId = String(threadId || '').trim();

    if (!normalizedThreadId) {
      return null;
    }

    const resolvedThreadId = await resolveMemberConversationId(normalizedThreadId);

    if (!resolvedThreadId) {
      return null;
    }

    const threads = await loadMemberThreadRows(actorId, [resolvedThreadId]);
    return threads.find((thread) => (
      thread.id === resolvedThreadId
      || thread.id === normalizedThreadId
      || thread.nativeId === normalizedThreadId
    )) || threads[0] || null;
  }

  async function findOrCreateMemberThread({ actorId, contactActorId }) {
    const actorUserId = actorIdToUserId(actorId);
    const contactUserId = actorIdToUserId(contactActorId);

    if (!actorUserId || !contactUserId) {
      throw new Error('Member threads require user-backed actor IDs.');
    }

    if (actorUserId === contactUserId) {
      throw new Error('You cannot message yourself.');
    }

    const contactProfile = await getMemberProfile(contactActorId);

    if (!contactProfile) {
      throw new Error('Member not found.');
    }

    const participantLookupParams = {
      select: 'conversation_id,user_id'
    };
    setInFilter(participantLookupParams, 'user_id', [actorUserId, contactUserId]);

    const participantRows = await requestSupabase(
      `${tables.memberParticipants}${buildQuery(participantLookupParams)}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );
    const pairsByConversationId = {};

    (Array.isArray(participantRows) ? participantRows : []).forEach((row) => {
      const conversationId = String(row && row.conversation_id || '').trim();
      const userId = String(row && row.user_id || '').trim();

      if (!conversationId || !userId) {
        return;
      }

      if (!pairsByConversationId[conversationId]) {
        pairsByConversationId[conversationId] = new Set();
      }

      pairsByConversationId[conversationId].add(userId);
    });

    const candidateConversationIds = Object.entries(pairsByConversationId)
      .filter(([, userIds]) => userIds.has(actorUserId) && userIds.has(contactUserId))
      .map(([conversationId]) => conversationId);

    if (candidateConversationIds.length) {
      const participantCheckParams = {
        select: 'conversation_id,user_id'
      };
      setInFilter(participantCheckParams, 'conversation_id', candidateConversationIds);

      const candidateParticipants = await requestSupabase(
        `${tables.memberParticipants}${buildQuery(participantCheckParams)}`,
        {
          method: 'GET',
          headers: buildHeaders(false)
        }
      );
      const exactMatches = {};

      (Array.isArray(candidateParticipants) ? candidateParticipants : []).forEach((row) => {
        const conversationId = String(row && row.conversation_id || '').trim();
        const userId = String(row && row.user_id || '').trim();

        if (!conversationId || !userId) {
          return;
        }

        if (!exactMatches[conversationId]) {
          exactMatches[conversationId] = new Set();
        }

        exactMatches[conversationId].add(userId);
      });

      const directConversationIds = Object.entries(exactMatches)
        .filter(([, userIds]) => (
          userIds.size === 2
          && userIds.has(actorUserId)
          && userIds.has(contactUserId)
        ))
        .map(([conversationId]) => conversationId);

      if (directConversationIds.length) {
        const threads = await loadMemberThreadRows(actorId, directConversationIds);
        const existingThread = threads.find((thread) => thread.contact && thread.contact.actorId === String(contactActorId || '').trim())
          || threads[0]
          || null;

        if (existingThread) {
          return {
            created: false,
            thread: existingThread
          };
        }
      }
    }

    const now = new Date().toISOString();
    const nativeId = buildDirectThreadNativeId(actorUserId, contactUserId);
    const conversationRows = await requestSupabase(
      tables.memberThreads,
      {
        method: 'POST',
        headers: buildHeaders(true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify([{
          kind: 'direct',
          created_by: actorUserId,
          updated_at: now,
          last_message_at: now,
          native_id: nativeId || null
        }])
      }
    );
    const conversationId = String(conversationRows && conversationRows[0] && conversationRows[0].id || '').trim();

    if (!conversationId) {
      throw new Error('Could not create member thread.');
    }

    await requestSupabase(
      tables.memberParticipants,
      {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify([
          {
            conversation_id: conversationId,
            user_id: actorUserId,
            joined_at: now,
            last_read_at: now
          },
          {
            conversation_id: conversationId,
            user_id: contactUserId,
            joined_at: now,
            last_read_at: null
          }
        ])
      }
    );

    const thread = await getMemberThread(actorId, conversationId);

    if (!thread) {
      throw new Error('Could not load newly created member thread.');
    }

    return {
      created: true,
      thread
    };
  }

  async function appendMemberThreadMessage({
    threadId,
    existingThread,
    actorId,
    authorName,
    displayName,
    userName,
    avatar,
    photoUrl,
    text,
    attachment,
    attachments,
    replyToMessageId,
    replyPreviewAuthor,
    replyPreviewText
  }) {
    const actorUserId = actorIdToUserId(actorId);
    const normalizedThreadId = String(threadId || '').trim();

    if (!actorUserId || !normalizedThreadId) {
      throw new Error('Thread ID and actor ID are required.');
    }

    const thread = existingThread && (
      String(existingThread.id || '').trim() === normalizedThreadId
      || String(existingThread.nativeId || '').trim() === normalizedThreadId
    )
      ? existingThread
      : await getMemberThread(actorId, normalizedThreadId);

    if (!thread) {
      throw new Error('Thread not found.');
    }

    const resolvedThreadId = String(thread.id || '').trim();

    if (!resolvedThreadId) {
      throw new Error('Thread not found.');
    }

    const senderProfile = normalizeMemberProfile({
      actorId,
      nativeUserId: actorUserId,
      displayName: displayName || authorName,
      userName,
      avatar,
      photoUrl
    });
    const normalizedAttachments = []
      .concat(Array.isArray(attachments) ? attachments : [])
      .concat(attachment ? [attachment] : [])
      .map((entry) => normalizeMessageAttachment(entry))
      .filter(Boolean);
    const message = normalizeMessageEntry({
      senderActorId: actorId,
      authorName: senderProfile.displayName,
      userName: senderProfile.userName,
      avatar: senderProfile.avatar,
      text: String(text || '').slice(0, 2000),
      replyToMessageId,
      replyPreviewAuthor,
      replyPreviewText,
      attachments: normalizedAttachments,
      createdAt: new Date().toISOString()
    }, senderProfile);
    const storedAttachments = message.attachments.slice();
    const replyMetaAttachment = buildReplyMetaAttachment(message);

    if (replyMetaAttachment) {
      storedAttachments.push(replyMetaAttachment);
    }

    await requestSupabase(
      tables.memberMessages,
      {
        method: 'POST',
        headers: buildHeaders(true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify([{
          id: message.id,
          conversation_id: resolvedThreadId,
          sender_id: actorUserId,
          body: message.text,
          attachments: storedAttachments,
          reactions: message.reactions,
          created_at: message.createdAt
        }])
      }
    );

    return {
      ...thread,
      messages: thread.messages.concat([message]),
      updatedAt: message.createdAt
    };
  }

  async function syncMemberMessageReaction({
    threadId,
    existingThread,
    messageId,
    actorId,
    emoji
  }) {
    const actorUserId = actorIdToUserId(actorId);
    const normalizedThreadId = String(threadId || '').trim();
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedEmoji = String(emoji || '').trim();

    if (!actorUserId || !normalizedThreadId || !normalizedMessageId || !normalizedEmoji) {
      throw new Error('Thread ID, message ID, actor ID, and emoji are required.');
    }

    const thread = existingThread && (
      String(existingThread.id || '').trim() === normalizedThreadId
      || String(existingThread.nativeId || '').trim() === normalizedThreadId
    )
      ? existingThread
      : await getMemberThread(actorId, normalizedThreadId);

    if (!thread) {
      throw new Error('Thread not found.');
    }

    const resolvedThreadId = String(thread.id || '').trim();

    if (!resolvedThreadId) {
      throw new Error('Thread not found.');
    }

    const rows = await requestSupabase(
      `${tables.memberMessages}${buildQuery({
        select: 'id,conversation_id,reactions',
        id: `eq.${normalizedMessageId}`,
        conversation_id: `eq.${resolvedThreadId}`,
        limit: 1
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );
    const row = rows && rows[0] ? rows[0] : null;

    if (!row) {
      throw new Error('Message not found.');
    }

    const mutableMessage = {
      reactions: Array.isArray(row.reactions) ? row.reactions : []
    };

    toggleMessageReaction(mutableMessage, actorId, normalizedEmoji);

    await requestSupabase(
      `${tables.memberMessages}${buildQuery({
        id: `eq.${normalizedMessageId}`,
        conversation_id: `eq.${normalizedThreadId}`
      })}`,
      {
        method: 'PATCH',
        headers: buildHeaders(true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify({
          reactions: mutableMessage.reactions
        })
      }
    );

    const nextMessages = Array.isArray(thread.messages)
      ? thread.messages.map((message) => {
          const currentMessageId = String(message && (message.nativeId || message.id) || '').trim();
          return currentMessageId === normalizedMessageId
            ? { ...message, reactions: mutableMessage.reactions }
            : message;
        })
      : [];

    return {
      ...thread,
      messages: nextMessages
    };
  }

  async function listLocalThreads(ownerActorId) {
    const normalizedOwnerActorId = String(ownerActorId || '').trim();

    if (!normalizedOwnerActorId) {
      return [];
    }

    const rows = await requestSupabase(
      `${tables.localThreads}${buildQuery({
        select: 'id,native_id,owner_actor_id,contact,messages,created_at,updated_at',
        owner_actor_id: `eq.${normalizedOwnerActorId}`,
        order: 'updated_at.desc'
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );

    return Array.isArray(rows) ? rows.map(mapLocalThreadRowToThread) : [];
  }

  async function getLocalThread(ownerActorId, threadId) {
    const normalizedOwnerActorId = String(ownerActorId || '').trim();
    const normalizedThreadId = String(threadId || '').trim();

    if (!normalizedOwnerActorId || !normalizedThreadId) {
      return null;
    }

    const rows = await requestSupabase(
      `${tables.localThreads}${buildQuery({
        select: 'id,native_id,owner_actor_id,contact,messages,created_at,updated_at',
        owner_actor_id: `eq.${normalizedOwnerActorId}`,
        id: `eq.${normalizedThreadId}`,
        limit: 1
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(false)
      }
    );

    return rows && rows[0] ? mapLocalThreadRowToThread(rows[0]) : null;
  }

  async function findOrCreateLocalThread({
    ownerActorId,
    contact,
    includeIntro = true
  }) {
    const normalizedOwnerActorId = String(ownerActorId || '').trim();
    const normalizedContact = normalizeMessageContact(contact || {});

    if (!normalizedOwnerActorId || !normalizedContact || !normalizedContact.actorId) {
      throw new Error('Owner actor ID and contact are required.');
    }

    const existingThreads = await listLocalThreads(normalizedOwnerActorId);
    const existingThread = existingThreads.find((thread) => (
      thread
      && thread.contact
      && String(thread.contact.actorId || '').trim() === normalizedContact.actorId
    )) || null;

    if (existingThread) {
      return {
        created: false,
        thread: existingThread
      };
    }

    const nextThread = createMessageThread(normalizedOwnerActorId, normalizedContact, {
      includeIntro: includeIntro !== false
    });
    const rows = await requestSupabase(
      tables.localThreads,
      {
        method: 'POST',
        headers: buildHeaders(true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify([{
          id: nextThread.id,
          native_id: nextThread.id,
          owner_actor_id: nextThread.ownerActorId,
          contact: nextThread.contact,
          messages: nextThread.messages,
          created_at: nextThread.createdAt,
          updated_at: nextThread.updatedAt
        }])
      }
    );

    return {
      created: true,
      thread: rows && rows[0] ? mapLocalThreadRowToThread(rows[0]) : nextThread
    };
  }

  async function appendLocalThreadMessage({
    threadId,
    ownerActorId,
    actorId,
    authorName,
    userName,
    avatar,
    text,
    attachment,
    attachments,
    replyToMessageId,
    replyPreviewAuthor,
    replyPreviewText
  }) {
    const normalizedOwnerActorId = String(ownerActorId || '').trim();
    const normalizedThreadId = String(threadId || '').trim();
    const normalizedActorId = String(actorId || ownerActorId || '').trim();

    if (!normalizedOwnerActorId || !normalizedThreadId || !normalizedActorId) {
      throw new Error('Thread ID, owner actor ID, and actor ID are required.');
    }

    const thread = await getLocalThread(normalizedOwnerActorId, normalizedThreadId);

    if (!thread) {
      throw new Error('Thread not found.');
    }

    const normalizedAttachments = []
      .concat(Array.isArray(attachments) ? attachments : [])
      .concat(attachment ? [attachment] : [])
      .map((entry) => normalizeMessageAttachment(entry))
      .filter(Boolean);
    const message = normalizeMessageEntry({
      senderActorId: normalizedActorId,
      authorName,
      userName,
      avatar,
      text: String(text || '').slice(0, 2000),
      replyToMessageId,
      replyPreviewAuthor,
      replyPreviewText,
      attachments: normalizedAttachments,
      createdAt: new Date().toISOString()
    });
    const nextMessages = thread.messages.concat([message]);

    await requestSupabase(
      `${tables.localThreads}${buildQuery({
        owner_actor_id: `eq.${normalizedOwnerActorId}`,
        id: `eq.${normalizedThreadId}`
      })}`,
      {
        method: 'PATCH',
        headers: buildHeaders(true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify({
          messages: nextMessages,
          updated_at: message.createdAt
        })
      }
    );

    return getLocalThread(normalizedOwnerActorId, normalizedThreadId);
  }

  async function syncLocalMessageReaction({
    threadId,
    ownerActorId,
    actorId,
    messageId,
    emoji
  }) {
    const normalizedOwnerActorId = String(ownerActorId || '').trim();
    const normalizedThreadId = String(threadId || '').trim();
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedActorId = String(actorId || '').trim();
    const normalizedEmoji = String(emoji || '').trim();

    if (!normalizedOwnerActorId || !normalizedThreadId || !normalizedMessageId || !normalizedActorId || !normalizedEmoji) {
      throw new Error('Thread ID, owner actor ID, actor ID, message ID, and emoji are required.');
    }

    const thread = await getLocalThread(normalizedOwnerActorId, normalizedThreadId);

    if (!thread) {
      throw new Error('Thread not found.');
    }

    const message = Array.isArray(thread.messages)
      ? thread.messages.find((entry) => String(entry && entry.id || '').trim() === normalizedMessageId)
      : null;

    if (!message) {
      throw new Error('Message not found.');
    }

    toggleMessageReaction(message, normalizedActorId, normalizedEmoji);

    await requestSupabase(
      `${tables.localThreads}${buildQuery({
        owner_actor_id: `eq.${normalizedOwnerActorId}`,
        id: `eq.${normalizedThreadId}`
      })}`,
      {
        method: 'PATCH',
        headers: buildHeaders(true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify({
          messages: thread.messages
        })
      }
    );

    return getLocalThread(normalizedOwnerActorId, normalizedThreadId);
  }

  async function listThreads({ actorId, provider = 'member' } = {}) {
    return provider === 'local'
      ? listLocalThreads(actorId)
      : listMemberThreads(actorId);
  }

  async function getThread({ actorId, threadId, provider = 'member' } = {}) {
    return provider === 'local'
      ? getLocalThread(actorId, threadId)
      : getMemberThread(actorId, threadId);
  }

  async function appendMessage({ provider = 'member', ...payload } = {}) {
    return provider === 'local'
      ? appendLocalThreadMessage(payload)
      : appendMemberThreadMessage(payload);
  }

  async function syncMessageReaction({ provider = 'member', ...payload } = {}) {
    return provider === 'local'
      ? syncLocalMessageReaction(payload)
      : syncMemberMessageReaction(payload);
  }

  return {
    isConfigured,
    tables,
    upsertMemberProfile,
    getMemberProfile,
    listMemberProfiles,
    getMemberState,
    upsertMemberState,
    listMemberThreads,
    getMemberThread,
    findOrCreateMemberThread,
    appendMemberThreadMessage,
    syncMemberMessageReaction,
    listLocalThreads,
    getLocalThread,
    findOrCreateLocalThread,
    appendLocalThreadMessage,
    syncLocalMessageReaction,
    listThreads,
    getThread,
    appendMessage,
    syncMessageReaction
  };
}

module.exports = {
  createUsappPersistenceAdapter,
  normalizeMessageState
};
