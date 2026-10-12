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

// Sessions live in sessionStorage: they end when the tab/browser is closed, so users must sign in again.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: window.sessionStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// One-time cleanup of long-lived sessions saved in localStorage by earlier versions of the site.
for (const key of Object.keys(localStorage)) {
  if (key.startsWith("sb-") && key.endsWith("-auth-token")) localStorage.removeItem(key);
}

// Forced re-login: a session older than this is ended even if it could still refresh.
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
const STAMP_KEY = "massanutten-signed-in-at";

// Use this instead of calling signInWithPassword directly so the sign-in time is recorded.
export async function signIn(credentials) {
  const result = await supabase.auth.signInWithPassword(credentials);
  if (!result.error) sessionStorage.setItem(STAMP_KEY, String(Date.now()));
  return result;
}

export function sessionExpired() {
  const at = Number(sessionStorage.getItem(STAMP_KEY));
  return !at || Date.now() - at > MAX_SESSION_MS;
}

export async function endSession() {
  sessionStorage.removeItem(STAMP_KEY);
  await supabase.auth.signOut({ scope: "local" }); // clears local state even if the server call fails
}

// Works at both https://org.github.io/Massanutten/ and a local server.
export const SITE_URL = new URL("./", window.location.href).href;
