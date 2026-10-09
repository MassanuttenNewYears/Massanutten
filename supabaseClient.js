// Centralized Supabase client. Only the public URL + anon/publishable key belong here.
// NEVER put the service_role key in this repo; RLS protects the data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vxevjynsfzemnzqxcfgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WleKASahVazlhUSQf85ZeA_5bHnRY06";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // localStorage
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Works at both https://org.github.io/Massanutten/ and a local server.
export const SITE_URL = new URL("./", window.location.href).href;
