import { supabase } from "./supabaseClient.js?v=4";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

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
  if (!person.declined_at) return name;
  // Declined: red X through the name.
  return el("span", { className: "declined", title: "Not coming" }, [name]);
}

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

  $("roster-head").replaceChildren(...groups.map((g) => el("th", { textContent: g })));
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

function renderCars(cars) {
  $("cars").replaceChildren(
    ...cars.map((car) =>
      el("div", { className: "car" }, [
        el("h3", { textContent: car.name }),
        el("ul", {}, [...car.car_passengers]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => el("li", { textContent: p.name }))),
      ])
    )
  );
}

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
  const [people, cars, days] = await Promise.all([
    supabase.from("people").select("display_name,group_label,sort_order,first_signed_in_at,declined_at,maybe_at").order("id"),
    supabase.from("cars").select("name,sort_order,car_passengers(name,sort_order)").order("sort_order"),
    supabase.from("itinerary_days").select("day_number,day_date,items").order("day_number"),
  ]);
  const error = people.error || cars.error || days.error;
  if (error) return setStatus("status", error.message, "error");
  renderRoster(people.data);
  renderCars(cars.data);
  renderItinerary(days.data);
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

let loaded = false;

function render(session) {
  const user = session?.user;
  if (!user) return window.location.replace("./login.html");
  $("app").hidden = false;
  $("who").textContent = user.email.endsWith("@guest.massanutten.invalid")
    ? user.email.split("@")[0]
    : user.email;
  if (!loaded) {
    loaded = true;
    loadAll();
  }
}

$("logout").addEventListener("click", () => supabase.auth.signOut());

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
  // Don't await Supabase calls directly in this callback (deadlock risk); defer.
  setTimeout(() => render(session), 0);
});
