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
    const supabaseUrl = "https://kfnpqatayfkscilhncx.supabase.co";
    const supabasePublishableKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmdW5xcGF0YXlma3NjaWxobmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDkxMjUsImV4cCI6MjA4OTIyNTEyNX0.K1dZXujRYCTvAl5b4jQQHmFhHEA6negOCefBFLkTTN0";

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