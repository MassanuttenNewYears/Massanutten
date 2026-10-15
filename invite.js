import { supabase, signIn as stampedSignIn, endSession } from "./supabaseClient.js?v=10";

const $ = (id) => document.getElementById(id);
const show = (...ids) => {
  for (const id of ["decline-step", "declined-step", "accept-step", "maybe-step"]) $(id).hidden = !ids.includes(id);
};
const setStatus = (text, kind = "") => {
  $("status").textContent = text;
  $("status").className = `status ${kind}`;
};

// Invite links look like invite.html#e=<login email>&k=<key>&a=accept|decline|maybe.
// The fragment is never sent to a server; remove it from the address bar right away.
const params = new URLSearchParams(window.location.hash.slice(1));
const creds = { email: params.get("e"), password: params.get("k") };
const requested = params.get("a");
const action = ["decline", "maybe"].includes(requested) ? requested : "accept";
history.replaceState(null, "", window.location.pathname + window.location.search);

async function signIn() {
  const { error } = await stampedSignIn(creds);
  return error;
}

let offeredToDrive = false;

function resetDrive() {
  offeredToDrive = false;
  $("drive-yes").disabled = false;
  $("drive-no").disabled = false;
  $("drive-note").textContent = "";
  $("drive-note").hidden = true;
}

function startAccept() {
  $("sub").textContent = "Welcome. Pick a password to finish.";
  setStatus("");
  resetDrive();
  show("accept-step");
}

async function init() {
  const ok = creds.email && creds.password && creds.email.length <= 254 && creds.password.length <= 72;
  if (!ok) {
    $("sub").textContent = "This invitation link is incomplete.";
    return setStatus("Use the buttons in your invitation email.", "error");
  }
  const error = await signIn();
  if (error) {
    $("sub").textContent = "This link can't be used any more.";
    return setStatus("If you already chose a password, open the login page and sign in with the email address this invitation was sent to. Otherwise ask John for a new invitation.", "error");
  }

  if (action === "decline") {
    $("sub").textContent = "Sorry you can't make it.";
    show("decline-step");
  } else if (action === "maybe") {
    const { error: rpcError } = await supabase.rpc("maybe_invite");
    if (rpcError) return setStatus(rpcError.message, "error");
    $("sub").textContent = "Marked as maybe.";
    show("maybe-step");
  } else {
    const { error: rpcError } = await supabase.rpc("accept_invite");
    if (rpcError) return setStatus(rpcError.message, "error");
    startAccept();
  }
}

$("maybe-accept").addEventListener("click", () => switchToAccept());
$("maybe-decline").addEventListener("click", () => {
  $("sub").textContent = "Sorry you can't make it.";
  setStatus("");
  show("decline-step");
});

$("confirm-decline").addEventListener("click", async () => {
  $("confirm-decline").disabled = true;
  const { error } = await supabase.rpc("decline_invite");
  $("confirm-decline").disabled = false;
  if (error) return setStatus(error.message, "error");
  await endSession();
  $("sub").textContent = "Marked as not coming.";
  setStatus("");
  show("declined-step");
});

async function switchToAccept() {
  setStatus("");
  if (!(await supabase.auth.getSession()).data.session) {
    const error = await signIn();
    if (error) return setStatus("Please use the link in your invitation email again.", "error");
  }
  const { error } = await supabase.rpc("accept_invite");
  if (error) return setStatus(error.message, "error");
  startAccept();
}
$("switch-accept").addEventListener("click", switchToAccept);
$("undo-decline").addEventListener("click", switchToAccept);

$("drive-no").addEventListener("click", () => {
  if (offeredToDrive) return;
  $("drive-note").textContent = "No problem.";
  $("drive-note").hidden = false;
});

$("drive-yes").addEventListener("click", async () => {
  $("drive-yes").disabled = true;
  $("drive-no").disabled = true;
  const { error } = await supabase.rpc("offer_to_drive");
  $("drive-yes").disabled = false;
  $("drive-no").disabled = false;
  if (error) return setStatus(error.message, "error");
  offeredToDrive = true;
  $("drive-note").textContent = "You're listed as a possible driver.";
  $("drive-note").hidden = false;
  setStatus("");
});

$("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("save-password").disabled = true;
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
  window.location.replace("./");
});

init();
