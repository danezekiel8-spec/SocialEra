import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://kfunqpatayfkscilhncx.supabase.co';
const supabaseKey = 'sb_publishable_ByM_npvMJj4LM_WVntb_aw_qwFPgoMj';

const supabase = createClient(supabaseUrl, supabaseKey);

window.supabase = supabase;
