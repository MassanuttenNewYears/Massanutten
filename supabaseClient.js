// Centralized Supabase client. Only the public URL + anon/publishable key belong here.
// NEVER put the service_role key in this repo; RLS protects the data.
// supabase-js is vendored (./vendor/supabase-js-2.117.3.umd.js, loaded by a classic <script>
// before this module) so no third-party code runs on these pages.
const { createClient } = window.supabase;

// Clickjacking defense (GitHub Pages cannot send frame-ancestors headers): refuse to render in a frame.
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try { window.top.location = window.self.location; } catch { /* cross-origin parent: stay hidden */ }
}

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
