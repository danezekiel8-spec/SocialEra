export function createUsappMessageStateService({
  apiService,
  buildProfileFromAuthUser,
  getAuthUser,
  getMessageActorId,
  getForcedUnreadThreadIds,
  getMutedThreadIds,
  getNotificationSeenAt,
  getThreadReadState,
  getThreads,
  persistForcedUnreadThreadIds,
  persistMutedThreadIds,
  persistNotificationSeenAt,
  persistProfilePhotoOverride,
  persistThreadReadState,
  setForcedUnreadThreadIds,
  setMutedThreadIds,
  setNotificationSeenAt,
  setProfile,
  setThreads,
  normalizeProfilePhotoValue,
  normalizeUserName,
  queueSyncFallback
}) {
  let remoteMessageStatePromise = null;
  let messageStateSyncPromise = null;
  let messageStateSyncTimer = null;

  function normalizeMessageStatePayload(payload, actorId = getMessageActorId()) {
    const normalizedActorId = String(payload && payload.actorId ? payload.actorId : actorId).trim();
    const threadReadState = Object.fromEntries(
      Object.entries(payload && payload.threadReadState && typeof payload.threadReadState === 'object' ? payload.threadReadState : {})
        .map(([threadId, seenAt]) => [String(threadId || '').trim(), String(seenAt || '').trim()])
        .filter(([threadId, seenAt]) => threadId && seenAt)
    );

    return {
      actorId: normalizedActorId,
      notificationSeenAt: String(payload && payload.notificationSeenAt ? payload.notificationSeenAt : '').trim(),
      mutedThreadIds: Array.from(new Set(
        (Array.isArray(payload && payload.mutedThreadIds) ? payload.mutedThreadIds : [])
          .map((threadId) => String(threadId || '').trim())
          .filter(Boolean)
      )),
      forcedUnreadThreadIds: Array.from(new Set(
        (Array.isArray(payload && payload.forcedUnreadThreadIds) ? payload.forcedUnreadThreadIds : [])
          .map((threadId) => String(threadId || '').trim())
          .filter(Boolean)
      )),
      threadReadState,
      updatedAt: String(payload && payload.updatedAt ? payload.updatedAt : '').trim()
    };
  }

  function normalizeRemoteMessageProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      return null;
    }

    const displayName = String(profile.displayName || profile.display_name || '').trim();
    const rawUserName = String(profile.userName || profile.user_name || profile.username || '').trim();
    const photoUrl = normalizeProfilePhotoValue(profile.photoUrl || profile.photo_url || '');

    if (!displayName && !rawUserName && !photoUrl) {
      return null;
    }

    return {
      displayName,
      userName: rawUserName ? normalizeUserName(rawUserName) : '',
      photoUrl
    };
  }

  function isMeaningfulMessageState(payload) {
    const normalized = normalizeMessageStatePayload(payload);
    return Boolean(
      normalized.notificationSeenAt
      || normalized.mutedThreadIds.length
      || normalized.forcedUnreadThreadIds.length
      || Object.keys(normalized.threadReadState).length
    );
  }

  function buildMessageStateSnapshot(actorId = getMessageActorId()) {
    return normalizeMessageStatePayload({
      actorId,
      notificationSeenAt: getNotificationSeenAt(),
      mutedThreadIds: getMutedThreadIds(),
      forcedUnreadThreadIds: getForcedUnreadThreadIds(),
      threadReadState: getThreadReadState()
    }, actorId);
  }

  function applyThreadReadStateToThreads(threadReadState = {}) {
    const normalizedState = threadReadState && typeof threadReadState === 'object' ? threadReadState : {};

    setThreads((Array.isArray(getThreads()) ? getThreads() : []).map((thread) => {
      if (!thread || !thread.id || thread.provider !== 'member') {
        return thread;
      }

      return {
        ...thread,
        lastReadAt: String(normalizedState[thread.id] || thread.lastReadAt || '').trim()
      };
    }));
  }

  function applyRemoteMessageStatePayload(payload, { syncIfMissing = false } = {}) {
    const authUser = getAuthUser();

    if (!authUser) {
      return;
    }

    const remoteState = normalizeMessageStatePayload(payload && payload.state ? payload.state : payload, getMessageActorId());
    const remoteProfile = normalizeRemoteMessageProfile(payload && payload.profile ? payload.profile : null);

    if (remoteProfile) {
      setProfile(buildProfileFromAuthUser(authUser, remoteProfile));
      if (remoteProfile.photoUrl) {
        persistProfilePhotoOverride(remoteProfile.photoUrl);
      }
    }

    if (!isMeaningfulMessageState(remoteState)) {
      if (syncIfMissing && isMeaningfulMessageState(buildMessageStateSnapshot())) {
        queueRemoteMessageStateSync({ delayMs: 80 });
      }
      return;
    }

    setNotificationSeenAt(remoteState.notificationSeenAt);
    setMutedThreadIds(remoteState.mutedThreadIds);
    setForcedUnreadThreadIds(remoteState.forcedUnreadThreadIds);
    persistNotificationSeenAt(remoteState.notificationSeenAt);
    persistMutedThreadIds(remoteState.mutedThreadIds);
    persistForcedUnreadThreadIds(remoteState.forcedUnreadThreadIds);
    persistThreadReadState(remoteState.threadReadState);
    applyThreadReadStateToThreads(remoteState.threadReadState);
  }

  async function loadRemoteMessageState() {
    if (!getAuthUser()) {
      return null;
    }

    if (remoteMessageStatePromise) {
      return remoteMessageStatePromise;
    }

    remoteMessageStatePromise = apiService.fetchMessageJson(`/messages/state?actorId=${encodeURIComponent(getMessageActorId())}`)
      .finally(() => {
        remoteMessageStatePromise = null;
      });

    return remoteMessageStatePromise;
  }

  async function syncRemoteMessageState() {
    if (!getAuthUser()) {
      return null;
    }

    if (messageStateSyncPromise) {
      return messageStateSyncPromise;
    }

    messageStateSyncPromise = apiService.fetchMessageJson('/messages/state/sync', {
      method: 'POST',
      body: JSON.stringify(buildMessageStateSnapshot())
    }).finally(() => {
      messageStateSyncPromise = null;
    });

    return messageStateSyncPromise;
  }

  function queueRemoteMessageStateSync({ delayMs = 140 } = {}) {
    if (!getAuthUser()) {
      return;
    }

    if (messageStateSyncTimer) {
      window.clearTimeout(messageStateSyncTimer);
    }

    messageStateSyncTimer = window.setTimeout(() => {
      messageStateSyncTimer = null;
      syncRemoteMessageState().catch((error) => {
        if (typeof queueSyncFallback === 'function') {
          queueSyncFallback(error);
          return;
        }
        console.error('Could not sync shared message state:', error);
      });
    }, delayMs);
  }

  return {
    applyRemoteMessageStatePayload,
    applyThreadReadStateToThreads,
    buildMessageStateSnapshot,
    loadRemoteMessageState,
    normalizeMessageStatePayload,
    queueRemoteMessageStateSync,
    syncRemoteMessageState
  };
}
