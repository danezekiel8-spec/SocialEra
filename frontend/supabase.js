import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const fallbackConfig = {
  supabaseUrl: 'https://kfunqpatayfkscilhncx.supabase.co',
  supabasePublishableKey: 'sb_publishable_ByM_npvMJj4LM_WVntb_aw_qwFPgoMj',
  supabaseProjectRef: 'kfunqpatayfkscilhncx',
  publicAuthOrigin: '',
  supabaseConfigured: true,
  supabaseSource: 'fallback'
};

async function loadSupabaseConfig() {
  try {
    const response = await fetch('/api/storefront-config', {
      cache: 'no-store',
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error(`Config request failed with ${response.status}`);
    }

    const payload = await response.json();
    const supabaseUrl = String(payload && payload.supabaseUrl ? payload.supabaseUrl : '').trim();
    const supabasePublishableKey = String(payload && payload.supabasePublishableKey ? payload.supabasePublishableKey : '').trim();

    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error('Supabase runtime config is incomplete.');
    }

    return {
      supabaseUrl,
      supabasePublishableKey,
      supabaseProjectRef: String(payload && payload.supabaseProjectRef ? payload.supabaseProjectRef : '').trim(),
      publicAuthOrigin: String(payload && payload.publicAuthOrigin ? payload.publicAuthOrigin : '').trim().replace(/\/+$/, ''),
      supabaseConfigured: true,
      supabaseSource: String(payload && payload.supabaseSource ? payload.supabaseSource : 'runtime').trim()
    };
  } catch (error) {
    console.warn('SocialEra Supabase runtime config failed. Falling back to bundled config.', error);
    return fallbackConfig;
  }
}

const config = await loadSupabaseConfig();
const supabase = config.supabaseConfigured
  ? createClient(config.supabaseUrl, config.supabasePublishableKey)
  : null;

window.SOCIALERA_SUPABASE_CONFIG = config;
window.supabase = supabase;

export { config };
export default supabase;
