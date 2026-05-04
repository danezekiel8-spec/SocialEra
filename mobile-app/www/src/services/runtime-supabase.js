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
    // 🔥 HARDCODED CONFIG (temporary for Android app)
const supabaseUrl = "https://kfunqpatayfkscilhncx.supabase.co";
const supabasePublishableKey = "sb_publishable_ByM_npvMJj4LM_WVntb_aw_qwFPgoMj";
    const publicAuthOrigin = '';

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
      supabaseConfigured: Boolean(supabaseUrl && supabasePublishableKey),
      supabaseSource: 'hardcoded'
    };
  }

  return {
    getSupabaseProjectRef,
    getSupabaseSessionStorageKeys,
    loadRuntimeSupabaseConfig
  };
}