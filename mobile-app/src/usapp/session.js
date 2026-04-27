export function createUsappSessionService({
  apiService,
  ensureSupabaseSessionState,
  getAuthUser,
  getMessageActorId,
  hydrateMessageReplyDecorations,
  isMemberMessageContact,
  mergeMessageContacts,
  normalizeContacts,
  normalizeThreads,
  onSessionReady
}) {
  async function ensureUsappMemberSession() {
    const hadAuthUser = Boolean(getAuthUser() && getAuthUser().id);

    try {
      let session = await ensureSupabaseSessionState();

      if (!session || !session.access_token) {
        session = await ensureSupabaseSessionState({ forceRefresh: true });
      }

      if (session && session.access_token) {
        await onSessionReady(session);

        return {
          ready: true,
          guest: false,
          session
        };
      }
    } catch (error) {
      return {
        ready: false,
        guest: false,
        error
      };
    }

    if (!hadAuthUser) {
      return {
        ready: false,
        guest: true,
        session: null
      };
    }

    return {
      ready: false,
      guest: false,
      error: new Error('Your SocialEra member session expired. Sign in again to load Usapp.')
    };
  }

  async function loadMessagingContacts() {
    const sessionState = await ensureUsappMemberSession();

    if (sessionState.guest) {
      return [];
    }

    if (!sessionState.ready) {
      throw sessionState.error || new Error('Sign in again to load member people.');
    }

    const actorId = getMessageActorId();

    if (!actorId) {
      throw new Error('Sign in again to load member people.');
    }

    try {
      const payload = await apiService.fetchMessageJson(`/messages/members?actorId=${encodeURIComponent(actorId)}`);
      const memberContacts = normalizeContacts(payload && payload.contacts, 'member');
      return mergeMessageContacts(memberContacts.filter((contact) => isMemberMessageContact(contact)));
    } catch (error) {
      console.error('Member contacts could not be loaded:', error);
      throw error;
    }
  }

  async function loadMessagingThreads() {
    const sessionState = await ensureUsappMemberSession();

    if (sessionState.guest) {
      return [];
    }

    if (!sessionState.ready) {
      throw sessionState.error || new Error('Sign in again to load member chats.');
    }

    const actorId = getMessageActorId();

    if (!actorId) {
      throw new Error('Sign in again to load member chats.');
    }

    let memberThreads = [];

    try {
      const payload = await apiService.fetchMessageJson(`/messages/member-threads?actorId=${encodeURIComponent(actorId)}`);
      memberThreads = normalizeThreads(payload && payload.threads, 'member');
    } catch (error) {
      console.error('Member threads could not be loaded:', error);
      throw error;
    }

    return hydrateMessageReplyDecorations(memberThreads.filter((thread) => thread && thread.provider === 'member'))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  return {
    ensureUsappMemberSession,
    loadMessagingContacts,
    loadMessagingThreads
  };
}
