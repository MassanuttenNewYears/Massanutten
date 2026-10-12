import { supabase, signIn as rawSignIn, sessionExpired, endSession } from "./supabaseClient.js?v=10";

const $ = (id) => document.getElementById(id);
const goHome = () => window.location.replace("./");

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = `status ${kind}`;
}

async function signIn(email, password) {
  const { error } = await rawSignIn({ email, password });
  // The rainbow name is triggered by setting a password (invite.js / home page), not by login.
  return error ?? null;
}

// Personal links look like login.html#e=<login email>&k=<key>. The fragment is never
// sent to the server; strip it from the address bar before doing anything else.
function readPersonalLink() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const email = params.get("e");
  const key = params.get("k");
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  const valid = email && key && email.length <= 254 && key.length <= 72 && email.includes("@");
  return valid ? { email, key } : null;
}

async function init() {
  const link = readPersonalLink();
  if (link) {
    $("sub").textContent = "Signing you in...";
    $("login-form").hidden = true;
    const error = await signIn(link.email, link.key);
    if (!error) return goHome();
    $("login-form").hidden = false;
    $("sub").textContent = "Sign in to warm up.";
    setStatus("That personal link didn't work. Ask John for a new one.", "error");
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  // Only skip the form for a valid, recent session; otherwise force a fresh sign-in.
  if (sessionExpired()) return endSession();
  goHome();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("submit").disabled = true;
  setStatus("");
  const error = await signIn($("email").value.trim(), $("password").value);
  $("submit").disabled = false;
  if (error) return setStatus(error.message, "error");
  goHome();
});

init();
