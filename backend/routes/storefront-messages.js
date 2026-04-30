const express = require('express');

function createMessageRoutes({
  buildMessageContacts,
  loadSupabaseMemberDirectory,
  readSocialMessages,
  upsertMemberProfile,
  usappPersistence,
  writeSocialMessages,
  normalizeMessageContact,
  serializeMemberThreadForActor,
  getMemberProfile,
  createMemberThread,
  normalizeMessageAttachment,
  normalizeMessageEntry,
  normalizeMemberProfile,
  toggleMessageReaction,
  ensureWelcomeInboxThread,
  resolveMessageContact,
  createMessageThread,
  buildAutoReply,
  normalizeMessageThread,
  messageEvents,
  emitMessageEvent
}) {
  const router = express.Router();

  router.use('/messages', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  function hasUsappPersistence() {
    return Boolean(
      usappPersistence
      && typeof usappPersistence.isConfigured === 'function'
      && usappPersistence.isConfigured()
    );
  }

  function normalizeLookupValue(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isUserBackedActorId(actorId) {
    return String(actorId || '').trim().startsWith('user-');
  }

  async function mirrorMemberProfileToPersistence(profile) {
    if (!hasUsappPersistence() || !profile || !isUserBackedActorId(profile.actorId)) {
      return null;
    }

    try {
      return await usappPersistence.upsertMemberProfile(profile);
    } catch (error) {
      console.error('Supabase member profile mirror failed:', error);
      return null;
    }
  }

  function listJsonMemberThreadsForActor(data, actorId) {
    return data.memberThreads
      .filter((thread) => Array.isArray(thread.participantActorIds) && thread.participantActorIds.includes(actorId))
      .map((thread) => serializeMemberThreadForActor(thread, actorId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function mergeMemberThreads(preferredThreads, fallbackThreads) {
    const threadsByPeerActorId = new Map();
    const pushThread = (thread, preferred = false) => {
      const peerActorId = String(thread && thread.contact && thread.contact.actorId || '').trim();
      const mapKey = peerActorId || String(thread && (thread.nativeId || thread.id) || '').trim();

      if (!mapKey) {
        return;
      }

      if (!threadsByPeerActorId.has(mapKey) || preferred) {
        threadsByPeerActorId.set(mapKey, thread);
      }
    };

    (Array.isArray(fallbackThreads) ? fallbackThreads : []).forEach((thread) => pushThread(thread, false));
    (Array.isArray(preferredThreads) ? preferredThreads : []).forEach((thread) => pushThread(thread, true));

    return Array.from(threadsByPeerActorId.values())
      .sort((a, b) => new Date(String(b && b.updatedAt || 0)).getTime() - new Date(String(a && a.updatedAt || 0)).getTime());
  }

  async function loadMergedMemberThreads(actorId, data) {
    const jsonThreads = listJsonMemberThreadsForActor(data, actorId);

    if (!hasUsappPersistence()) {
      return jsonThreads;
    }

    try {
      const persistedThreads = await usappPersistence.listMemberThreads(actorId);
      return mergeMemberThreads(persistedThreads, jsonThreads);
    } catch (error) {
      console.error('Supabase member thread read failed:', error);
      return jsonThreads;
    }
  }

  async function ensurePersistentMemberThread(actorId, contactActorId) {
    if (!hasUsappPersistence() || !isUserBackedActorId(actorId) || !isUserBackedActorId(contactActorId)) {
      return null;
    }

    try {
      const result = await usappPersistence.findOrCreateMemberThread({
        actorId,
        contactActorId
      });
      return result && result.thread ? result.thread : null;
    } catch (error) {
      console.error('Supabase member thread promotion failed:', error);
      return null;
    }
  }

  async function loadPersistedMemberThread(threadId, actorId) {
    if (!hasUsappPersistence() || !isUserBackedActorId(actorId)) {
      return null;
    }

    try {
      return await usappPersistence.getMemberThread(actorId, threadId);
    } catch (error) {
      console.error('Supabase persisted member thread lookup failed:', error);
      return null;
    }
  }

  async function loadRemoteMemberContacts(actorId = '') {
    if (typeof loadSupabaseMemberDirectory !== 'function') {
      return [];
    }

    const members = await loadSupabaseMemberDirectory();
    const normalizedActorId = String(actorId || '').trim();

    return (Array.isArray(members) ? members : [])
      .filter((member) => member && member.actorId && member.actorId !== normalizedActorId)
      .map((member) => normalizeMessageContact(member, {
        role: 'member',
        intro: 'Start a direct message with this member.',
        provider: 'member'
      }));
  }

  function touchMemberPresence(data, actorId) {
    const normalizedActorId = String(actorId || '').trim();

    if (!normalizedActorId || !getMemberProfile(data, normalizedActorId)) {
      return null;
    }

    return upsertMemberProfile(data, { actorId: normalizedActorId });
  }

  function getComparableMemberProfileSnapshot(profile) {
    const normalized = normalizeMemberProfile(profile || {});

    return {
      actorId: normalized.actorId,
      nativeUserId: normalized.nativeUserId,
      displayName: normalized.displayName,
      userName: normalized.userName,
      avatar: normalized.avatar,
      photoUrl: normalized.photoUrl
    };
  }

  function hasMeaningfulMemberProfileChange(previousProfile, nextProfile) {
    return JSON.stringify(getComparableMemberProfileSnapshot(previousProfile))
      !== JSON.stringify(getComparableMemberProfileSnapshot(nextProfile));
  }

  function normalizeMessageState(actorId, payload = {}) {
    const normalizedActorId = String(actorId || payload.actorId || '').trim();
    const threadReadState = Object.fromEntries(
      Object.entries(payload.threadReadState && typeof payload.threadReadState === 'object' ? payload.threadReadState : {})
        .map(([threadId, seenAt]) => [String(threadId || '').trim(), String(seenAt || '').trim()])
        .filter(([threadId, seenAt]) => threadId && seenAt)
    );

    return {
      actorId: normalizedActorId,
      notificationSeenAt: String(payload.notificationSeenAt || '').trim(),
      mutedThreadIds: Array.from(new Set(
        (Array.isArray(payload.mutedThreadIds) ? payload.mutedThreadIds : [])
          .map((threadId) => String(threadId || '').trim())
          .filter(Boolean)
      )),
      forcedUnreadThreadIds: Array.from(new Set(
        (Array.isArray(payload.forcedUnreadThreadIds) ? payload.forcedUnreadThreadIds : [])
          .map((threadId) => String(threadId || '').trim())
          .filter(Boolean)
      )),
      threadReadState,
      updatedAt: String(payload.updatedAt || new Date().toISOString())
    };
  }

  function getMessageStateForActor(data, actorId) {
    const normalizedActorId = String(actorId || '').trim();

    if (!normalizedActorId || !Array.isArray(data && data.memberStates)) {
      return null;
    }

    return data.memberStates.find((entry) => String(entry.actorId || '').trim() === normalizedActorId) || null;
  }

  function getComparableMessageStateSnapshot(state) {
    const normalized = normalizeMessageState(state && state.actorId, state || {});

    return {
      actorId: normalized.actorId,
      notificationSeenAt: normalized.notificationSeenAt,
      mutedThreadIds: [...normalized.mutedThreadIds].sort(),
      forcedUnreadThreadIds: [...normalized.forcedUnreadThreadIds].sort(),
      threadReadState: Object.fromEntries(
        Object.entries(normalized.threadReadState || {}).sort(([left], [right]) => left.localeCompare(right))
      )
    };
  }

  function isSameMessageState(left, right) {
    return JSON.stringify(getComparableMessageStateSnapshot(left)) === JSON.stringify(getComparableMessageStateSnapshot(right));
  }

  function upsertMessageState(data, actorId, payload = {}) {
    const normalizedActorId = String(actorId || '').trim();

    if (!normalizedActorId) {
      return {
        changed: false,
        state: null
      };
    }

    if (!Array.isArray(data.memberStates)) {
      data.memberStates = [];
    }

    const existingIndex = data.memberStates.findIndex((entry) => String(entry.actorId || '').trim() === normalizedActorId);
    const existing = existingIndex === -1 ? null : data.memberStates[existingIndex];
    const draftState = normalizeMessageState(normalizedActorId, {
      ...(existing || {}),
      ...(payload || {}),
      actorId: normalizedActorId
    });
    const changed = !existing || !isSameMessageState(existing, draftState);
    const nextState = normalizeMessageState(normalizedActorId, {
      ...draftState,
      updatedAt: changed
        ? new Date().toISOString()
        : String(existing && existing.updatedAt || draftState.updatedAt || new Date().toISOString())
    });

    if (existingIndex === -1) {
      data.memberStates.unshift(nextState);
    } else if (changed) {
      data.memberStates[existingIndex] = nextState;
    }

    return {
      changed,
      state: changed ? nextState : existing
    };
  }

  function emitActors(actorIds, kind, extra = {}) {
    if (typeof emitMessageEvent !== 'function') {
      return;
    }

    emitMessageEvent({
      actorIds,
      kind,
      ...extra
    });
  }

  function isMemberLinkedContact(contact, data) {
    if (!contact) {
      return false;
    }

    if (String(contact.provider || '').trim().toLowerCase() === 'member') {
      return true;
    }

    const members = Array.isArray(data && data.members) ? data.members : [];
    const contactActorId = normalizeLookupValue(contact.actorId);
    const contactUserName = normalizeLookupValue(contact.userName);
    const contactDisplayName = normalizeLookupValue(contact.displayName);

    return members.some((member) => {
      return (
        (contactActorId && normalizeLookupValue(member.actorId) === contactActorId)
        || (contactUserName && normalizeLookupValue(member.userName) === contactUserName)
        || (contactDisplayName && normalizeLookupValue(member.displayName) === contactDisplayName)
      );
    });
  }

  router.get('/messages/contacts', (req, res) => {
    try {
      return res.json({
        contacts: buildMessageContacts()
      });
    } catch (error) {
      console.error('Error reading message contacts:', error);
      return res.status(500).json({ error: 'Failed to load message contacts' });
    }
  });

  router.post('/messages/profiles/sync', async (req, res) => {
    try {
      const actorId = String(req.body.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const previousProfile = getMemberProfile(data, actorId);
      const profile = upsertMemberProfile(data, {
        actorId,
        displayName: req.body.displayName,
        userName: req.body.userName,
        avatar: req.body.avatar,
        photoUrl: req.body.photoUrl
      });
      const persistedProfile = await mirrorMemberProfileToPersistence(profile);

      writeSocialMessages(data);
      if (!previousProfile || hasMeaningfulMemberProfileChange(previousProfile, profile)) {
        emitActors(
          Array.isArray(data.members) ? data.members.map((member) => member.actorId) : [actorId],
          'profile-sync',
          { actorId }
        );
      }
      return res.status(previousProfile ? 200 : 201).json({ profile: persistedProfile || profile });
    } catch (error) {
      console.error('Error syncing message profile:', error);
      return res.status(500).json({ error: 'Failed to sync message profile' });
    }
  });

  router.get('/messages/state', async (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      let remoteState = getMessageStateForActor(data, actorId) || normalizeMessageState(actorId);
      let profile = getMemberProfile(data, actorId);

      if (hasUsappPersistence() && isUserBackedActorId(actorId)) {
        try {
          remoteState = await usappPersistence.getMemberState(actorId) || remoteState;
          profile = await usappPersistence.getMemberProfile(actorId) || profile;
        } catch (error) {
          console.error('Supabase message state read failed:', error);
        }
      }

      return res.json({
        state: remoteState,
        profile: profile || null
      });
    } catch (error) {
      console.error('Error reading message state:', error);
      return res.status(500).json({ error: 'Failed to load message state' });
    }
  });

  router.post('/messages/state/sync', async (req, res) => {
    try {
      const actorId = String(req.body.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const syncResult = upsertMessageState(data, actorId, {
        notificationSeenAt: req.body.notificationSeenAt,
        mutedThreadIds: req.body.mutedThreadIds,
        forcedUnreadThreadIds: req.body.forcedUnreadThreadIds,
        threadReadState: req.body.threadReadState
      });
      const presenceProfile = touchMemberPresence(data, actorId);
      const nextState = syncResult && syncResult.state ? syncResult.state : normalizeMessageState(actorId);
      let persistedState = null;

      if (hasUsappPersistence() && isUserBackedActorId(actorId)) {
        persistedState = await usappPersistence.upsertMemberState(actorId, nextState);
        await mirrorMemberProfileToPersistence(presenceProfile);
      }

      if ((syncResult && syncResult.changed) || presenceProfile) {
        writeSocialMessages(data);
        emitActors([actorId], 'thread-state-sync', { actorId });
      }

      return res.status(201).json({ state: persistedState || nextState });
    } catch (error) {
      console.error('Error syncing message state:', error);
      return res.status(500).json({ error: 'Failed to sync message state' });
    }
  });

  router.get('/messages/events', (req, res) => {
    const actorId = String(req.query.actorId || '').trim();

    if (!actorId) {
      return res.status(400).json({ error: 'Actor ID is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const send = (payload = {}) => {
      const targets = Array.isArray(payload.actorIds) ? payload.actorIds.map((value) => String(value || '').trim()) : [];

      if (targets.length && !targets.includes(actorId)) {
        return;
      }

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const keepAliveTimer = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    send({
      kind: 'connected',
      actorIds: [actorId],
      actorId,
      at: new Date().toISOString()
    });

    if (messageEvents && typeof messageEvents.on === 'function') {
      messageEvents.on('message-event', send);
    }

    req.on('close', () => {
      clearInterval(keepAliveTimer);

      if (messageEvents && typeof messageEvents.off === 'function') {
        messageEvents.off('message-event', send);
      }

      res.end();
    });
  });

  router.get('/messages/members', async (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();
      const data = readSocialMessages();
      const jsonContacts = data.members
        .filter((member) => member.actorId && member.actorId !== actorId)
        .map((member) => normalizeMessageContact(member, {
          role: 'member',
          intro: 'Start a direct message with this member.',
          provider: 'member',
          nativeUserId: String(
            member && member.nativeUserId
              ? member.nativeUserId
              : (member && String(member.actorId || '').startsWith('user-')
                ? String(member.actorId || '').slice(5)
                : '')
              ).trim()
        }));
      let localContacts = jsonContacts;
      if (hasUsappPersistence() && isUserBackedActorId(actorId)) {
        try {
          const persistedProfiles = await usappPersistence.listMemberProfiles({ excludeActorId: actorId });
          localContacts = persistedProfiles.map((member) => normalizeMessageContact(member, {
            role: 'member',
            intro: 'Start a direct message with this member.',
            provider: 'member',
            nativeUserId: String(
              member && member.nativeUserId
                ? member.nativeUserId
                : (member && String(member.actorId || '').startsWith('user-')
                  ? String(member.actorId || '').slice(5)
                  : '')
            ).trim()
          }));
        } catch (error) {
          console.error('Supabase member profile listing failed:', error);
        }
      }
      const remoteContacts = await loadRemoteMemberContacts(actorId).catch((error) => {
        console.error('Supabase member directory could not be loaded:', error);
        return [];
      });
      const contactsByActorId = new Map();

      remoteContacts.forEach((contact) => {
        contactsByActorId.set(contact.actorId, contact);
      });

      localContacts.forEach((contact) => {
        const existing = contactsByActorId.get(contact.actorId);
        contactsByActorId.set(contact.actorId, normalizeMessageContact({
          ...(existing || {}),
          ...contact,
          updatedAt: String(contact.updatedAt || (existing && existing.updatedAt) || new Date().toISOString()),
          lastActiveAt: String(contact.lastActiveAt || (existing && existing.lastActiveAt) || contact.updatedAt || new Date().toISOString())
        }, {
          role: 'member',
          intro: 'Start a direct message with this member.',
          provider: 'member'
        }));
      });
      const contacts = Array.from(contactsByActorId.values())
        .sort((a, b) => {
          const leftTime = new Date(String(a.lastActiveAt || a.updatedAt || 0)).getTime();
          const rightTime = new Date(String(b.lastActiveAt || b.updatedAt || 0)).getTime();
          return rightTime - leftTime;
        })
        .slice(0, 250);

      return res.json({ contacts });
    } catch (error) {
      console.error('Error reading member contacts:', error);
      return res.status(500).json({ error: 'Failed to load member contacts' });
    }
  });

  router.get('/messages/member-threads', async (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const threads = await loadMergedMemberThreads(actorId, data);

      return res.json({ threads });
    } catch (error) {
      console.error('Error reading member message threads:', error);
      return res.status(500).json({ error: 'Failed to load member message threads' });
    }
  });

  router.post('/messages/member-threads', async (req, res) => {
    try {
      const actorId = String(req.body.actorId || '').trim();
      const contactActorId = String(req.body.contactActorId || req.body.contactId || '').trim();

      if (!actorId || !contactActorId) {
        return res.status(400).json({ error: 'Actor ID and contact actor ID are required' });
      }

      if (actorId === contactActorId) {
        return res.status(400).json({ error: 'You cannot message yourself' });
      }

      const data = readSocialMessages();
      const actorProfile = upsertMemberProfile(data, {
        actorId,
        displayName: req.body.displayName,
        userName: req.body.userName,
        avatar: req.body.avatar,
        photoUrl: req.body.photoUrl
      });
      let contactProfile = getMemberProfile(data, contactActorId);

      if (!contactProfile) {
        const remoteContacts = await loadRemoteMemberContacts(actorId).catch((error) => {
          console.error('Supabase member directory lookup failed while opening a thread:', error);
          return [];
        });
        const remoteMatch = remoteContacts.find((contact) => contact.actorId === contactActorId);

        if (remoteMatch) {
          contactProfile = upsertMemberProfile(data, {
            actorId: remoteMatch.actorId,
            nativeUserId: remoteMatch.nativeUserId,
            displayName: remoteMatch.displayName,
            userName: remoteMatch.userName,
            avatar: remoteMatch.avatar,
            photoUrl: remoteMatch.photoUrl,
            lastActiveAt: remoteMatch.lastActiveAt,
            updatedAt: remoteMatch.updatedAt
          });
        }
      }

      if (!contactProfile) {
        return res.status(404).json({ error: 'Member not found' });
      }

      await mirrorMemberProfileToPersistence(actorProfile);
      await mirrorMemberProfileToPersistence(contactProfile);

      let thread = data.memberThreads.find((entry) => (
        Array.isArray(entry.participantActorIds)
        && entry.participantActorIds.length === 2
        && entry.participantActorIds.includes(actorId)
        && entry.participantActorIds.includes(contactActorId)
      ));
      const created = !thread;

      if (!thread) {
        thread = createMemberThread(actorProfile, contactProfile);
        data.memberThreads.unshift(thread);
      } else {
        thread.participants = thread.participants.map((participant) => {
          if (participant.actorId === actorId) {
            return actorProfile;
          }

          if (participant.actorId === contactActorId) {
            return contactProfile;
          }

          return normalizeMemberProfile(participant);
        });
      }

      writeSocialMessages(data);
      emitActors([actorId, contactActorId], 'member-thread-opened', {
        actorId,
        threadId: thread.id
      });

      const persistedThread = await ensurePersistentMemberThread(actorId, contactActorId);

      return res.status(created ? 201 : 200).json({
        created,
        thread: persistedThread || serializeMemberThreadForActor(thread, actorId)
      });
    } catch (error) {
      console.error('Error creating member message thread:', error);
      return res.status(500).json({ error: 'Failed to create member message thread' });
    }
  });

  router.post('/messages/member-threads/:threadId/messages', async (req, res) => {
    try {
      const threadId = String(req.params.threadId || '').trim();
      const actorId = String(req.body.actorId || '').trim();
      const text = String(req.body.text || '').trim();
      const attachment = normalizeMessageAttachment(req.body.attachment);

      if (!threadId || !actorId || (!text && !attachment)) {
        return res.status(400).json({ error: 'Thread ID, actor ID, and a message or file are required' });
      }

      const data = readSocialMessages();
      const thread = data.memberThreads.find((entry) => (
        entry.id === threadId
        && Array.isArray(entry.participantActorIds)
        && entry.participantActorIds.includes(actorId)
      ));
      const persistedExistingThread = thread
        ? null
        : await loadPersistedMemberThread(threadId, actorId);

      if (!thread && !persistedExistingThread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const actorProfile = upsertMemberProfile(data, {
        actorId,
        displayName: req.body.authorName || req.body.displayName,
        userName: req.body.userName,
        avatar: req.body.avatar,
        photoUrl: req.body.photoUrl
      });
      await mirrorMemberProfileToPersistence(actorProfile);

      if (!thread && persistedExistingThread) {
        const persistedThread = await usappPersistence.appendMemberThreadMessage({
          threadId: persistedExistingThread.id,
          existingThread: persistedExistingThread,
          actorId,
          authorName: actorProfile.displayName,
          displayName: actorProfile.displayName,
          userName: actorProfile.userName,
          avatar: actorProfile.avatar,
          photoUrl: actorProfile.photoUrl,
          text: text.slice(0, 2000),
          attachment,
          replyToMessageId: req.body.replyToMessageId,
          replyPreviewAuthor: req.body.replyPreviewAuthor,
          replyPreviewText: req.body.replyPreviewText
        });
        const latestMessage = Array.isArray(persistedThread && persistedThread.messages)
          ? persistedThread.messages[persistedThread.messages.length - 1] || null
          : null;
        const eventActorIds = Array.from(new Set(
          (Array.isArray(persistedThread && persistedThread.participantActorIds)
            ? persistedThread.participantActorIds
            : [actorId, persistedThread && persistedThread.contact && persistedThread.contact.actorId]
          )
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        ));

        emitActors(eventActorIds, 'member-message-sent', {
          actorId,
          threadId: String(persistedThread && persistedThread.id || threadId).trim(),
          updatedAt: String(
            persistedThread && persistedThread.updatedAt
            || latestMessage && latestMessage.createdAt
            || new Date().toISOString()
          ).trim(),
          message: latestMessage
        });

        return res.status(201).json({
          thread: persistedThread
        });
      }

      thread.participants = thread.participants.map((participant) => (
        participant.actorId === actorId ? actorProfile : normalizeMemberProfile(participant)
      ));

      const outgoingMessage = normalizeMessageEntry({
        senderActorId: actorId,
        authorName: actorProfile.displayName,
        userName: actorProfile.userName,
        avatar: actorProfile.avatar,
        text: text.slice(0, 2000),
        replyToMessageId: req.body.replyToMessageId,
        replyPreviewAuthor: req.body.replyPreviewAuthor,
        replyPreviewText: req.body.replyPreviewText,
        attachments: attachment ? [attachment] : [],
        createdAt: new Date().toISOString()
      });

      thread.messages.push(outgoingMessage);
      thread.updatedAt = outgoingMessage.createdAt;
      writeSocialMessages(data);

      let persistedThread = null;
      const peerActorId = Array.isArray(thread.participantActorIds)
        ? thread.participantActorIds.find((entry) => String(entry || '').trim() !== actorId) || ''
        : '';

      if (peerActorId) {
        const promotedThread = await ensurePersistentMemberThread(actorId, peerActorId);

        if (promotedThread) {
          try {
            persistedThread = await usappPersistence.appendMemberThreadMessage({
              threadId: promotedThread.id,
              existingThread: promotedThread,
              actorId,
              authorName: actorProfile.displayName,
              displayName: actorProfile.displayName,
              userName: actorProfile.userName,
              avatar: actorProfile.avatar,
              photoUrl: actorProfile.photoUrl,
              text: text.slice(0, 2000),
              attachment,
              replyToMessageId: req.body.replyToMessageId,
              replyPreviewAuthor: req.body.replyPreviewAuthor,
              replyPreviewText: req.body.replyPreviewText
            });
          } catch (error) {
            console.error('Supabase member message append failed:', error);
          }
        }
      }

      emitActors(thread.participantActorIds || [actorId], 'member-message-sent', {
        actorId,
        threadId: String((persistedThread && persistedThread.id) || thread.id || '').trim(),
        updatedAt: String((persistedThread && persistedThread.updatedAt) || thread.updatedAt || outgoingMessage.createdAt).trim(),
        message: outgoingMessage
      });

      return res.status(201).json({
        thread: persistedThread || serializeMemberThreadForActor(thread, actorId)
      });
    } catch (error) {
      console.error('Error sending member message:', error);
      return res.status(500).json({ error: 'Failed to send member message' });
    }
  });

  router.post('/messages/member-threads/:threadId/messages/:messageId/reactions', async (req, res) => {
    try {
      const threadId = String(req.params.threadId || '').trim();
      const messageId = String(req.params.messageId || '').trim();
      const actorId = String(req.body.actorId || '').trim();
      const emoji = String(req.body.emoji || '').trim();

      if (!threadId || !messageId || !actorId || !emoji) {
        return res.status(400).json({ error: 'Thread ID, message ID, actor ID, and emoji are required' });
      }

      const data = readSocialMessages();
      const thread = data.memberThreads.find((entry) => (
        entry.id === threadId
        && Array.isArray(entry.participantActorIds)
        && entry.participantActorIds.includes(actorId)
      ));
      const persistedExistingThread = thread
        ? null
        : await loadPersistedMemberThread(threadId, actorId);

      if (!thread && !persistedExistingThread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      if (!thread && persistedExistingThread) {
        const persistedThread = await usappPersistence.syncMemberMessageReaction({
          threadId: persistedExistingThread.id,
          existingThread: persistedExistingThread,
          messageId,
          actorId,
          emoji
        });
        const eventActorIds = Array.from(new Set(
          (Array.isArray(persistedThread && persistedThread.participantActorIds)
            ? persistedThread.participantActorIds
            : [actorId, persistedThread && persistedThread.contact && persistedThread.contact.actorId]
          )
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        ));

        emitActors(eventActorIds, 'member-message-reaction', {
          actorId,
          threadId: String(persistedThread && persistedThread.id || threadId).trim()
        });

        return res.json({
          thread: persistedThread
        });
      }

      const message = Array.isArray(thread.messages)
        ? thread.messages.find((entry) => entry.id === messageId)
        : null;

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      toggleMessageReaction(message, actorId, emoji);
      writeSocialMessages(data);
      let persistedThread = null;
      const peerActorId = Array.isArray(thread.participantActorIds)
        ? thread.participantActorIds.find((entry) => String(entry || '').trim() !== actorId) || ''
        : '';

      if (peerActorId) {
        const promotedThread = await ensurePersistentMemberThread(actorId, peerActorId);

        if (promotedThread) {
          const persistedMessageId = String(
            message && (message.nativeId || message.id) || messageId
          ).trim();

          try {
            persistedThread = await usappPersistence.syncMemberMessageReaction({
              threadId: promotedThread.id,
              existingThread: promotedThread,
              messageId: persistedMessageId,
              actorId,
              emoji
            });
          } catch (error) {
            console.error('Supabase member message reaction sync failed:', error);
          }
        }
      }

      emitActors(thread.participantActorIds || [actorId], 'member-message-reaction', {
        actorId,
        threadId: String((persistedThread && persistedThread.id) || thread.id || '').trim()
      });

      return res.json({
        thread: persistedThread || serializeMemberThreadForActor(thread, actorId)
      });
    } catch (error) {
      console.error('Error reacting to member message:', error);
      return res.status(500).json({ error: 'Failed to update reaction' });
    }
  });

  router.get('/messages/threads', (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const seeded = ensureWelcomeInboxThread(data, actorId);

      if (seeded) {
        writeSocialMessages(data);
        emitActors([actorId], 'local-thread-seeded', {
          actorId
        });
      }

      const threads = data.threads
        .filter((thread) => !isMemberLinkedContact(thread.contact, data))
        .filter((thread) => thread.ownerActorId === actorId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return res.json({ threads });
    } catch (error) {
      console.error('Error reading message threads:', error);
      return res.status(500).json({ error: 'Failed to load message threads' });
    }
  });

  router.post('/messages/threads', (req, res) => {
    try {
      const actorId = String(req.body.actorId || '').trim();
      const contactId = String(req.body.contactId || '').trim();

      if (!actorId || !contactId) {
        return res.status(400).json({ error: 'Actor ID and contact ID are required' });
      }

      const data = readSocialMessages();
      const contact = resolveMessageContact(contactId, req.body.contact);

      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (isMemberLinkedContact(contact, data)) {
        return res.status(409).json({
          error: 'This member uses direct messages. Open the member conversation instead.'
        });
      }

      const existing = data.threads.find((thread) => (
        thread.ownerActorId === actorId && thread.contact.actorId === contact.actorId
      ));

      if (existing) {
        return res.json({
          created: false,
          thread: existing
        });
      }

      const thread = createMessageThread(actorId, contact, { includeIntro: true });
      data.threads.unshift(thread);
      writeSocialMessages(data);
      emitActors([actorId], 'local-thread-opened', {
        actorId,
        threadId: thread.id
      });

      return res.status(201).json({
        created: true,
        thread
      });
    } catch (error) {
      console.error('Error creating message thread:', error);
      return res.status(500).json({ error: 'Failed to create message thread' });
    }
  });

  router.post('/messages/threads/:threadId/messages', (req, res) => {
    try {
      const threadId = String(req.params.threadId || '').trim();
      const actorId = String(req.body.actorId || '').trim();
      const text = String(req.body.text || '').trim();
      const attachment = normalizeMessageAttachment(req.body.attachment);

      if (!threadId || !actorId || (!text && !attachment)) {
        return res.status(400).json({ error: 'Thread ID, actor ID, and a message or file are required' });
      }

      const data = readSocialMessages();
      const thread = data.threads.find((entry) => entry.id === threadId && entry.ownerActorId === actorId);

      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      if (isMemberLinkedContact(thread.contact, data)) {
        return res.status(409).json({
          error: 'This member uses direct messages. Open the member conversation instead.'
        });
      }

      const outgoingMessage = normalizeMessageEntry({
        senderActorId: actorId,
        authorName: String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(req.body.userName || '@socialera.member').trim() || '@socialera.member',
        avatar: String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        text: text.slice(0, 1000),
        replyToMessageId: req.body.replyToMessageId,
        replyPreviewAuthor: req.body.replyPreviewAuthor,
        replyPreviewText: req.body.replyPreviewText,
        attachments: attachment ? [attachment] : [],
        createdAt: new Date().toISOString()
      });

      thread.messages.push(outgoingMessage);

      if (req.body.autoReply === true) {
        thread.messages.push(buildAutoReply(thread.contact, outgoingMessage));
      }

      thread.updatedAt = thread.messages[thread.messages.length - 1].createdAt;
      writeSocialMessages(data);
      emitActors([actorId], 'local-message-sent', {
        actorId,
        threadId: thread.id
      });

      return res.status(201).json({
        thread: normalizeMessageThread(thread)
      });
    } catch (error) {
      console.error('Error sending message:', error);
      return res.status(500).json({ error: 'Failed to send message' });
    }
  });

  router.post('/messages/threads/:threadId/messages/:messageId/reactions', (req, res) => {
    try {
      const threadId = String(req.params.threadId || '').trim();
      const messageId = String(req.params.messageId || '').trim();
      const actorId = String(req.body.actorId || '').trim();
      const emoji = String(req.body.emoji || '').trim();

      if (!threadId || !messageId || !actorId || !emoji) {
        return res.status(400).json({ error: 'Thread ID, message ID, actor ID, and emoji are required' });
      }

      const data = readSocialMessages();
      const thread = data.threads.find((entry) => entry.id === threadId && entry.ownerActorId === actorId);

      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const message = Array.isArray(thread.messages)
        ? thread.messages.find((entry) => entry.id === messageId)
        : null;

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      toggleMessageReaction(message, actorId, emoji);
      writeSocialMessages(data);
      emitActors([actorId], 'local-message-reaction', {
        actorId,
        threadId: thread.id
      });

      return res.json({ thread });
    } catch (error) {
      console.error('Error reacting to message:', error);
      return res.status(500).json({ error: 'Failed to update reaction' });
    }
  });

  return router;
}

module.exports = createMessageRoutes;
