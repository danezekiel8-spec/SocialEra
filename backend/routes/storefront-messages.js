const express = require('express');

function createMessageRoutes({
  buildMessageContacts,
  readSocialMessages,
  upsertMemberProfile,
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

  function normalizeLookupValue(value) {
    return String(value || '').trim().toLowerCase();
  }

  function touchMemberPresence(data, actorId) {
    const normalizedActorId = String(actorId || '').trim();

    if (!normalizedActorId || !getMemberProfile(data, normalizedActorId)) {
      return null;
    }

    return upsertMemberProfile(data, { actorId: normalizedActorId });
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

  router.post('/messages/profiles/sync', (req, res) => {
    try {
      const actorId = String(req.body.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const profile = upsertMemberProfile(data, {
        actorId,
        displayName: req.body.displayName,
        userName: req.body.userName,
        avatar: req.body.avatar,
        photoUrl: req.body.photoUrl
      });

      writeSocialMessages(data);
      emitActors(
        Array.isArray(data.members) ? data.members.map((member) => member.actorId) : [actorId],
        'profile-sync',
        { actorId }
      );
      return res.status(201).json({ profile });
    } catch (error) {
      console.error('Error syncing message profile:', error);
      return res.status(500).json({ error: 'Failed to sync message profile' });
    }
  });

  router.get('/messages/state', (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const remoteState = getMessageStateForActor(data, actorId) || normalizeMessageState(actorId);
      const profile = getMemberProfile(data, actorId);

      return res.json({
        state: remoteState,
        profile: profile || null
      });
    } catch (error) {
      console.error('Error reading message state:', error);
      return res.status(500).json({ error: 'Failed to load message state' });
    }
  });

  router.post('/messages/state/sync', (req, res) => {
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

      if ((syncResult && syncResult.changed) || presenceProfile) {
        writeSocialMessages(data);
        emitActors([actorId], 'thread-state-sync', { actorId });
      }

      return res.status(201).json({ state: nextState });
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

  router.get('/messages/members', (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();
      const data = readSocialMessages();
      const contacts = data.members
        .filter((member) => member.actorId && member.actorId !== actorId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 18)
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

      return res.json({ contacts });
    } catch (error) {
      console.error('Error reading member contacts:', error);
      return res.status(500).json({ error: 'Failed to load member contacts' });
    }
  });

  router.get('/messages/member-threads', (req, res) => {
    try {
      const actorId = String(req.query.actorId || '').trim();

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const data = readSocialMessages();
      const threads = data.memberThreads
        .filter((thread) => Array.isArray(thread.participantActorIds) && thread.participantActorIds.includes(actorId))
        .map((thread) => serializeMemberThreadForActor(thread, actorId))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return res.json({ threads });
    } catch (error) {
      console.error('Error reading member message threads:', error);
      return res.status(500).json({ error: 'Failed to load member message threads' });
    }
  });

  router.post('/messages/member-threads', (req, res) => {
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
      const contactProfile = getMemberProfile(data, contactActorId);

      if (!contactProfile) {
        return res.status(404).json({ error: 'Member not found' });
      }

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

      return res.status(created ? 201 : 200).json({
        created,
        thread: serializeMemberThreadForActor(thread, actorId)
      });
    } catch (error) {
      console.error('Error creating member message thread:', error);
      return res.status(500).json({ error: 'Failed to create member message thread' });
    }
  });

  router.post('/messages/member-threads/:threadId/messages', (req, res) => {
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

      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const actorProfile = upsertMemberProfile(data, {
        actorId,
        displayName: req.body.authorName || req.body.displayName,
        userName: req.body.userName,
        avatar: req.body.avatar,
        photoUrl: req.body.photoUrl
      });

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
      emitActors(thread.participantActorIds || [actorId], 'member-message-sent', {
        actorId,
        threadId: thread.id
      });

      return res.status(201).json({
        thread: serializeMemberThreadForActor(thread, actorId)
      });
    } catch (error) {
      console.error('Error sending member message:', error);
      return res.status(500).json({ error: 'Failed to send member message' });
    }
  });

  router.post('/messages/member-threads/:threadId/messages/:messageId/reactions', (req, res) => {
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
      emitActors(thread.participantActorIds || [actorId], 'member-message-reaction', {
        actorId,
        threadId: thread.id
      });

      return res.json({
        thread: serializeMemberThreadForActor(thread, actorId)
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
