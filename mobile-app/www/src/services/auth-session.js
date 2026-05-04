export function createSupabaseSessionService({
  forceReauth,
  getAuthSession,
  getAuthUser,
  getSupabaseClient,
  logger = console,
  setAuthSession,
  setAuthUser
}) {
  function readSupabaseClient() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    return client && typeof client === 'object' ? client : null;
  }

  async function ensureSupabaseSessionState({ forceRefresh = false } = {}) {
    const supabase = readSupabaseClient();

    if (!supabase) {
      return null;
    }

    const result = await supabase.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    let session = result.data && result.data.session ? result.data.session : null;

    if (forceRefresh && supabase.auth && typeof supabase.auth.refreshSession === 'function') {
      const refreshResult = await supabase.auth.refreshSession();

      if (refreshResult.error) {
        if (!session) {
          throw refreshResult.error;
        }

        logger.error('Could not force refresh Supabase session:', refreshResult.error);
      } else if (refreshResult.data && refreshResult.data.session) {
        session = refreshResult.data.session;
      }
    }

    if (session) {
      if (typeof setAuthSession === 'function') {
        setAuthSession(session);
      }

      if (typeof setAuthUser === 'function') {
        setAuthUser(session.user || (typeof getAuthUser === 'function' ? getAuthUser() : null));
      }
    }

    return session;
  }

  async function recoverSupabaseSessionOrRedirect(
    targetView = 'profile',
    message = 'Your app session expired. Sign in again to continue.',
    { forceRefresh = false } = {}
  ) {
    try {
      const session = await ensureSupabaseSessionState({ forceRefresh });

      if (session && session.access_token) {
        return false;
      }
    } catch (error) {
      logger.error('Could not recover Supabase session:', error);
    }

    if (!forceRefresh) {
      try {
        const refreshedSession = await ensureSupabaseSessionState({ forceRefresh: true });

        if (refreshedSession && refreshedSession.access_token) {
          return false;
        }
      } catch (error) {
        logger.error('Could not force refresh Supabase session:', error);
      }
    }

    if (typeof forceReauth === 'function') {
      forceReauth(targetView, message);
    }

    return true;
  }

  return {
    ensureSupabaseSessionState,
    getSupabaseClient: readSupabaseClient,
    recoverSupabaseSessionOrRedirect
  };
}
