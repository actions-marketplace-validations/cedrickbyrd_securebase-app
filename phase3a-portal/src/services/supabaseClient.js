import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = (rawUrl && rawUrl.startsWith('http')) 
  ? rawUrl 
  : 'https://dvmuaivsbtrykqsnrtnv.supabase.co';

const supabaseAnonKey = rawKey || 'demo-placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    lock: async (name, acquireTimeout, fn) => await fn()
  }
});
