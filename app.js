import { supabase, sessionExpired, endSession } from "./supabaseClient.js?v=10";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// ---- Identity badges. Only people who RSVPed yes (signed in/set a password, not declined, not maybe)
// get one. Ranked oldest-first by first_signed_in_at (order of RSVPing yes): rank 0 = triangle +
// Maize & Blue, rank 1 = square + Scarlet/Gray/White, rank 2 = pentagon + Maize & Blue ...
// shape = 3 + rank % 7 (triangle to nonagon), color = rank % 2. Existing ranks never change
// unless someone switches to maybe/no.
const SHAPE_NAMES = ["Triangle", "Square", "Pentagon", "Hexagon", "Heptagon", "Octagon", "Nonagon"];
const SVG_NS = "http://www.w3.org/2000/svg";
let identities = new Map(); // display_name -> { rank }

function computeIdentities(people) {
  const yes = people
    .filter((p) => p.first_signed_in_at && !p.declined_at && !p.maybe_at)
    .sort((a, b) => new Date(a.first_signed_in_at) - new Date(b.first_signed_in_at));
  identities = new Map(yes.map((p, rank) => [p.display_name, { rank }]));
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function shapeBadge(name) {
  const id = identities.get(name);
  if (!id) return el("span", { className: "shape-none", textContent: "-", title: "No RSVP yes yet" });
  const sides = 3 + (id.rank % 7);
  const maizeBlue = id.rank % 2 === 0;
  const points = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides; // first vertex points up
    return `${(12 + 9.5 * Math.cos(a)).toFixed(2)},${(12 + 9.5 * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  const svg = svgEl("svg", { viewBox: "0 0 24 24", class: "shape", role: "img" });
  svg.setAttribute("aria-label", `${SHAPE_NAMES[sides - 3]}, ${maizeBlue ? "maize and blue" : "scarlet, gray and white"}`);
  if (maizeBlue) {
    svg.append(svgEl("polygon", { points, fill: "#FFCB05", stroke: "#00274C", "stroke-width": 2.4, "stroke-linejoin": "round" }));
  } else {
    // gray outline, scarlet fill, white inner stroke
    svg.append(svgEl("polygon", { points, fill: "#BB0000", stroke: "#8a8d8f", "stroke-width": 3.4, "stroke-linejoin": "round" }));
    svg.append(svgEl("polygon", { points, fill: "#BB0000", stroke: "#ffffff", "stroke-width": 1.2, "stroke-linejoin": "round" }));
  }
  const title = svgEl("title", {});
  title.textContent = svg.getAttribute("aria-label");
  svg.append(title);
  return svg;
}

function setStatus(id, text, kind = "") {
  $(id).textContent = text;
  $(id).className = `status ${kind}`;
}

function renderName(person) {
  let name;
  if (person.maybe_at && !person.declined_at) {
    // Maybe: only the first letter capitalized, whole name teeters back and forth.
    const lower = person.display_name.toLowerCase();
    name = el("span", { className: "name maybe", textContent: lower.charAt(0).toUpperCase() + lower.slice(1) });
  } else if (!person.first_signed_in_at) {
    name = el("span", { className: "name pending", textContent: person.display_name });
  } else {
    const letters = [...person.display_name].map((ch, i) => {
      const span = el("span", { textContent: ch === " " ? "\u00a0" : ch });
      span.style.setProperty("--i", i);
      return span;
    });
    name = el("span", { className: "name active", ariaLabel: person.display_name }, letters);
  }
  if (!person.declined_at) {
    // RSVP-yes people get their shape badge next to the name (legend samples have no identity).
    return identities.has(person.display_name)
      ? el("span", { className: "name-wrap" }, [shapeBadge(person.display_name), name])
      : name;
  }
  // Declined: red X through the name.
  return el("span", { className: "declined", title: "Not coming" }, [name]);
}

// Display labels for the roster card headings only. Stored group_label values stay unchanged.
const ROSTER_HEADINGS = {
  Folk: "MOIDS (FOLK)",
  "Foids (W)": "FOIDS (W (We <3 you Women))",
};

function renderRoster(people) {
  const groups = [];
  const byGroup = new Map();
  for (const p of people) {
    if (!byGroup.has(p.group_label)) {
      byGroup.set(p.group_label, []);
      groups.push(p.group_label);
    }
    byGroup.get(p.group_label).push(p);
  }
  for (const list of byGroup.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  $("roster-head").replaceChildren(...groups.map((g) => el("th", { textContent: ROSTER_HEADINGS[g] || g })));
  const rows = Math.max(0, ...groups.map((g) => byGroup.get(g).length));
  $("roster-body").replaceChildren(
    ...Array.from({ length: rows }, (_, r) =>
      el("tr", {}, groups.map((g) => {
        const person = byGroup.get(g)[r];
        return el("td", {}, person ? [renderName(person)] : []);
      }))
    )
  );
}

// The key beside the roster. Uses made-up sample names so it never reveals real data.
function renderLegend() {
  const rows = [
    [{ display_name: "name" }, "Hasn't answered yet"],
    [{ display_name: "Name", first_signed_in_at: "x" }, "Coming!"],
    [{ display_name: "Name", maybe_at: "x" }, "Maybe"],
    [{ display_name: "Name", declined_at: "x" }, "Can't come"],
  ];
  $("legend-list").replaceChildren(
    ...rows.map(([sample, meaning]) =>
      el("li", {}, [el("span", { className: "legend-sample" }, [renderName(sample)]), el("span", { textContent: meaning })])
    )
  );
}
renderLegend();

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function renderItinerary(days) {
  $("itinerary").replaceChildren(
    ...days.map((d) =>
      el("li", { className: "day" }, [
        el("div", { className: "label", textContent: `Day ${d.day_number}` }),
        el("div", { className: "date", textContent: d.day_date ? dateFmt.format(new Date(d.day_date)) : "" }),
        d.items.length
          ? el("ul", {}, d.items.map((item) => el("li", { textContent: item })))
          : el("div", { className: "empty", textContent: "Nothing planned yet" }),
      ])
    )
  );
}

async function loadAll() {
  const [people, days] = await Promise.all([
    supabase.from("people").select("display_name,group_label,sort_order,first_signed_in_at,declined_at,maybe_at").order("id"),
    supabase.from("itinerary_days").select("day_number,day_date,items").order("day_number"),
  ]);
  const error = people.error || days.error;
  if (error) return setStatus("status", error.message, "error");
  computeIdentities(people.data);
  renderRoster(people.data);
  renderItinerary(days.data);
  loadBring(); // after identities so badges are right
}

// Split the welcome headline into individually shaking letters (words stay unbroken).
function shakeLetters(node) {
  const text = node.textContent.trim();
  node.setAttribute("aria-label", text);
  const words = text.split(/\s+/).map((word) => {
    const letters = [...word].map((ch) => {
      const span = el("span", { className: "ch", textContent: ch });
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--delay", `${(-Math.random()).toFixed(2)}s`);
      span.style.setProperty("--dur", `${(0.25 + Math.random() * 0.2).toFixed(2)}s`);
      return span;
    });
    return el("span", { className: "word" }, letters);
  });
  node.replaceChildren(...words.flatMap((w, i) => (i ? [" ", w] : [w])));
}
shakeLetters($("welcome"));

// ---- "Bringing" list: entries are AES-256-GCM encrypted in the browser; the database only stores
// ciphertext. The passphrase + salt are fetched (signed-in users only) via get_bring_secret().
const enc = new TextEncoder();
const dec = new TextDecoder();
let bringKey = null;
let editingId = null;

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function getBringKey() {
  if (bringKey) return bringKey;
  const { data, error } = await supabase.rpc("get_bring_secret");
  if (error || !data?.length) throw new Error(error?.message || "Could not load the key.");
  const { passphrase, salt } = data[0];
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  bringKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 200000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return bringKey;
}

async function encryptText(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getBringKey(), enc.encode(text)));
  return toB64([...iv, ...ct]);
}

async function decryptText(b64) {
  try {
    const bytes = fromB64(b64);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await getBringKey(), bytes.slice(12));
    return cleanItemText(dec.decode(pt));
  } catch {
    return "(could not decrypt)";
  }
}

// Clean user text before encrypting and again before showing it (entries can also arrive via direct
// API calls): drop control/format characters (incl. bidi overrides, zero-width), collapse whitespace, cap length.
const MAX_ITEM_CHARS = 200;
function cleanItemText(text) {
  return [...String(text).normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim()]
    .slice(0, MAX_ITEM_CHARS)
    .join("");
}

function resetBringForm() {
  editingId = null;
  $("bring-input").value = "";
  $("bring-submit").textContent = "Add";
  $("bring-cancel").hidden = true;
}

async function loadBring() {
  const { data, error } = await supabase.rpc("list_bring_items");
  if (error) return setStatus("bring-status", error.message, "error");
  const items = await Promise.all(data.map(async (r) => ({ ...r, text: await decryptText(r.ciphertext) })));
  if (!items.length) {
    $("bring-list").replaceChildren(el("tr", {}, [el("td", { className: "empty", colSpan: 4, textContent: "Nothing yet" })]));
    return;
  }
  $("bring-list").replaceChildren(
    ...items.map((it) => {
      const actions = [];
      if (it.mine) {
        const edit = el("button", { type: "button", className: "ghost", textContent: "Edit" });
        const del = el("button", { type: "button", className: "ghost", textContent: "Delete" });
        edit.addEventListener("click", () => {
          editingId = it.id;
          $("bring-input").value = it.text;
          $("bring-input").focus();
          $("bring-submit").textContent = "Save";
          $("bring-cancel").hidden = false;
        });
        del.addEventListener("click", async () => {
          const { error: delError } = await supabase.rpc("delete_bring_item", { p_id: it.id });
          if (delError) return setStatus("bring-status", delError.message, "error");
          if (editingId === it.id) resetBringForm();
          loadBring();
        });
        actions.push(edit, del);
      }
      return el("tr", {}, [
        el("td", {}, [shapeBadge(it.person_name)]),
        el("td", { className: "who-name", textContent: it.person_name }),
        el("td", { textContent: it.text }),
        el("td", {}, [el("div", { className: "row-actions" }, actions)]),
      ]);
    })
  );
}

$("bring-cancel").addEventListener("click", resetBringForm);

$("bring-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = cleanItemText($("bring-input").value);
  if (!text) return setStatus("bring-status", "Please enter some text.", "error");
  $("bring-submit").disabled = true;
  setStatus("bring-status", "");
  try {
    const cipher = await encryptText(text);
    const { error } = editingId
      ? await supabase.rpc("update_bring_item", { p_id: editingId, p_cipher: cipher })
      : await supabase.rpc("add_bring_item", { p_cipher: cipher });
    if (error) throw error;
    resetBringForm();
    await loadBring();
  } catch (err) {
    setStatus("bring-status", err.message || "Could not save.", "error");
  } finally {
    $("bring-submit").disabled = false;
  }
});

let loaded = false;

const toLogin = () => window.location.replace("./login.html");

// Auth gate. The page stays hidden until the server confirms the session:
// 1) a session must exist, 2) it must be younger than MAX_SESSION_MS, 3) getUser() asks the
// Supabase Auth server (catches deleted users and revoked/invalid tokens, unlike getSession()).
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
  render(userData.user);
}

function render(user) {
  $("app").hidden = false;
  $("who").textContent = user.email.endsWith("@guest.massanutten.invalid")
    ? user.email.split("@")[0]
    : user.email;
  if (!loaded) {
    loaded = true;
    loadAll();
  }
}

$("logout").addEventListener("click", async () => {
  $("app").hidden = true;
  await endSession();
  toLogin();
});

$("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.auth.updateUser({ password: $("new-password").value });
  if (error) return setStatus("password-status", error.message, "error");
  $("new-password").value = "";
  await supabase.rpc("mark_first_sign_in");
  setStatus("password-status", "Password saved.", "ok");
  loadAll();
});

supabase.auth.onAuthStateChange((event, session) => {
  // Only react to sign-out (e.g. refresh failed, or signed out in another place); guard() does the rest.
  // Don't await Supabase calls directly in this callback (deadlock risk); defer.
  if (event === "SIGNED_OUT" || !session) setTimeout(() => { $("app").hidden = true; toLogin(); }, 0);
});

// Back/forward cache: a restored page does not re-run scripts, so hide it and re-check.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    $("app").hidden = true;
    guard();
  }
});

// Re-check when the tab regains focus, so an expired session is caught on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && loaded) guard();
});

guard();
