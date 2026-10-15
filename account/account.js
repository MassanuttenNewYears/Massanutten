import { supabase, sessionExpired, endSession } from "../supabaseClient.js?v=10";

const $ = (id) => document.getElementById(id);
const toLogin = () => window.location.replace("../login.html");

function setStatus(message, kind) {
  const node = $("status");
  node.textContent = message;
  node.className = kind ? "status " + kind : "status";
}

function accountLabel(user) {
  return user.email.endsWith("@guest.massanutten.invalid")
    ? user.email.split("@")[0]
    : user.email;
}

// Auth gate. Stay hidden until the server confirms this session, same as the home page.
async function guard() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return toLogin();
  if (sessionExpired()) {
    await endSession();
    return toLogin();
  }
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    await endSession();
    return toLogin();
  }
  await render(userData.user);
}

// profiles_select_own allows only the signed-in user's row. Drop anything else.
async function render(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id);
  const rows = data || [];
  const mismatch = !error && rows.some((row) => row.id !== user.id);
  $("who").textContent = accountLabel(user);
  $("display-name").textContent = !mismatch && rows[0] && rows[0].display_name
    ? rows[0].display_name
    : accountLabel(user);
  if (!mismatch) {
    await loadDrivers();
    await loadLiquor();
  }
  $("app").hidden = false;
  if (error) return setStatus(error.message, "error");
  if (mismatch) {
    $("save-password").disabled = true;
    return setStatus("Account data did not match the signed-in user.", "error");
  }
}

// Only the signed-in person's target. Empty until the draw is published. Failures stay blank.
async function loadLiquor() {
  const { data, error } = await supabase.rpc("my_secret_liquor");
  if (error || typeof data !== "string" || data.length === 0) return;
  $("liquor-name").textContent = data;
  $("liquor").hidden = false;
}

// The RPC errors unless the signed-in roster row is allowed. Failures stay blank.
async function loadDrivers() {
  const { data, error } = await supabase.rpc("list_potential_drivers");
  if (error || !Array.isArray(data)) return;
  const body = $("drivers-body");
  body.replaceChildren();
  if (data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "empty";
    td.textContent = "None yet.";
    tr.append(td);
    body.append(tr);
  } else {
    for (const row of data) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.textContent = typeof row.driver_name === "string" ? row.driver_name : "";
      tr.append(td);
      body.append(tr);
    }
  }
  $("drivers").hidden = false;
}

$("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("save-password").disabled = true;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    $("save-password").disabled = false;
    return setStatus("Sign in again before changing your password.", "error");
  }
  // updateUser changes the password on the token's own user. There is no user id to pass.
  const { error } = await supabase.auth.updateUser({ password: $("new-password").value });
  if (error) {
    $("save-password").disabled = false;
    return setStatus(error.message, "error");
  }
  const { error: stampError } = await supabase.rpc("mark_first_sign_in");
  if (stampError) {
    $("save-password").disabled = false;
    return setStatus(stampError.message, "error");
  }
  $("new-password").value = "";
  $("save-password").disabled = false;
  setStatus("Password saved.", "ok");
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) setTimeout(() => { $("app").hidden = true; toLogin(); }, 0);
});

window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    $("app").hidden = true;
    guard();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") guard();
});

guard();
