export function createRuntimeSupabaseConfigService({
  fetchImpl = (...args) => fetch(...args),
  getApiBase,
  getRuntimeSupabaseUrl,
  setRuntimeSupabaseConfig
}) {
  function getSupabaseProjectRef(url = typeof getRuntimeSupabaseUrl === 'function' ? getRuntimeSupabaseUrl() : '') {
    try {
      return new URL(String(url || '').trim()).host.split('.')[0] || '';
    } catch (error) {
      return '';
    }
  }

  function getSupabaseSessionStorageKeys() {
    const projectRef = getSupabaseProjectRef();
    return Array.from(new Set([
      projectRef ? `sb-${projectRef}-auth-token` : '',
      projectRef ? `sb-${projectRef}-auth-token-code-verifier` : '',
      'supabase.auth.token'
    ].filter(Boolean)));
  }

  async function loadRuntimeSupabaseConfig() {
    const apiBase = String(typeof getApiBase === 'function' ? getApiBase() : '/api').trim() || '/api';
    const response = await fetchImpl(`${apiBase}/storefront-config`, {
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`Could not load auth config (${response.status}).`);
    }

    const payload = await response.json().catch(() => null);
    const supabaseUrl = String(payload && payload.supabaseUrl ? payload.supabaseUrl : '').trim();
    const supabasePublishableKey = String(payload && payload.supabasePublishableKey ? payload.supabasePublishableKey : '').trim();
    const publicAuthOrigin = String(payload && payload.publicAuthOrigin ? payload.publicAuthOrigin : '').trim().replace(/\/+$/, '');

    if (typeof setRuntimeSupabaseConfig === 'function') {
      setRuntimeSupabaseConfig({
        supabaseUrl,
        supabasePublishableKey,
        publicAuthOrigin
      });
    }

    return {
      supabaseUrl,
      supabasePublishableKey,
      publicAuthOrigin,
      supabaseConfigured: Boolean(payload && payload.supabaseConfigured && supabaseUrl && supabasePublishableKey),
      supabaseSource: String(payload && payload.supabaseSource ? payload.supabaseSource : '').trim()
    };
  }

  return {
    getSupabaseProjectRef,
    getSupabaseSessionStorageKeys,
    loadRuntimeSupabaseConfig
  };
}
