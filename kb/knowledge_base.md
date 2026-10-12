Last updated: 2026-10-12 (Bringing list identity badges)

# Knowledge Base

## Overview

`massanutten` is a static GitHub Pages site for the org `MassanuttenNewYears` (remote: `https://github.com/MassanuttenNewYears/Massanutten.git`, branch `main`). Invite-only trip site for New Years 2026 at Massanutten: a winter-themed login page gates a home page with the roster (names light up after each person's first sign-in), car assignments, and the itinerary, all loaded from Supabase.

- **How to run:** serve the folder over HTTP (e.g. `python3 -m http.server`); ES modules do not work from `file://`. No build step. Deploy via GitHub Pages (Settings > Pages > `main` branch, root). Expected URL: `https://massanuttennewyears.github.io/Massanutten/`.

## Architecture

- `styles.css`: shared winter theme (night gradient, frosted `.card`, inputs/buttons, `.status`).
- `snow.js`: classic script on every page. Injects a fixed canvas drawn at 1/4 resolution, scaled with `image-rendering: pixelated` (square flakes, 3 depth layers, sine drift). Pauses when the tab is hidden; static under `prefers-reduced-motion`.
- `login.html` + `login.js`: login. Personal links `login.html#e=<login email>&k=<key>` are read from the fragment, the fragment is removed with `history.replaceState`, then `signInWithPassword` + `rpc('mark_first_sign_in')`, then redirect to `./`. Manual email/password form also calls the RPC. Bad link shows an error.
- `index.html` + `app.js`: home. `#app` stays hidden until `guard()` passes (session exists, younger than 8h, and `auth.getUser()` confirms it with the server); otherwise redirects to `./login.html`. Renders roster table (one column per `group_label`, groups in `people.id` order, rows by `sort_order`), car cards, itinerary day cards, and a "Set your own password" form (`auth.updateUser`). Placeholder logins show as the slug in the header.
- **Bringing list** (right of the roster, `#bring-list`/`#bring-form` in `index.html`, logic in `app.js`): signed-in users add/edit/delete their own entries; everyone sees all. See "Bringing list" below.
- `supabaseClient.js`: single `createClient` (URL + publishable key, **sessionStorage** session), `SITE_URL`, and the forced re-login helpers `signIn` (stamps sign-in time), `sessionExpired`, `endSession`, `MAX_SESSION_MS` (8h).
- `supabase/migrations/*.sql`: idempotent copies of schema migrations applied via MCP (no secrets; account creation SQL is intentionally not saved).
- `invite.py` (gitignored): local invite mailer, see "Invites".
- `.cursor/mcp.json`: routes the `supabase` MCP server to this project (overrides global).

## Supabase

- Project: "Massanutten", ref `vxevjynsfzemnzqxcfgt`, region us-east-1, URL `https://vxevjynsfzemnzqxcfgt.supabase.co`. Dashboard: public sign-ups disabled, email confirmation off (set by John).
- Tables (public, RLS on everywhere):
  - `profiles`, `user_logs`: from the first integration; `user_logs` no longer has UI.
  - `people` (slug unique, display_name, group_label, sort_order, user_id -> auth.users, first_signed_in_at). 15 rows from the PDF: Folk = Jack, Jesse, Liam, William, Nate, TK, Ben, John, Matias, Hrdy; "Foids (W)" = Gabby, Katie M., Ashley, Lili, Conna.
  - `cars` + `car_passengers` (passenger `name` is free text, so non-roster people like Brian / "Will Smuth" can ride).
  - `itinerary_days` (day_number unique, day_date, `items text[]`).
  - Access: `authenticated` has SELECT only (policy `using (true)`); `anon` has no grants; nobody can write via the API. Edit content in the Supabase Table Editor; the site reads it at runtime (no redeploy).
- Functions:
  - `mark_first_sign_in()`: security definer, `authenticated` only; sets `first_signed_in_at` for the caller's row if null. Advisor flags it as signed-in-callable; intentional.
  - `admin_set_login_email(p_slug, p_email)`: security definer, `service_role` only. Switches the person's Auth login email (users + identities, confirmed). Idempotent; errors on unknown slug or email taken. Run manually: `select public.admin_set_login_email('jack', 'real@example.com');`
- Accounts: John (`REDACTED_EMAIL`) is his real account, linked to `people.john`. The other 14 have placeholder logins `<slug>@guest.massanutten.invalid` whose password is a random key. Keys live only in gitignored `invites.local.json` (slug -> key); only bcrypt hashes (via local `htpasswd`) were sent to the database.
- Verified 2026-10-09: key login works; RPC flips `first_signed_in_at`; anon gets 401 on tables and admin RPC; authenticated gets 403 on admin RPC and on writes. Test state reset afterwards (0 activated).

## Bringing list

- Why not a SHA-256 hash: a hash is one-way and cannot be "unhashed" for display. Instead entries are encrypted client-side with AES-256-GCM (key = PBKDF2-SHA256, 200k iterations, from passphrase `REDACTED` + a random 64-hex salt); stored value is base64(iv + ciphertext). The DB never sees plaintext.
- Tables (no API privileges at all; access only through security definer RPCs): `app_secrets` (`bring_passphrase`, `bring_salt`) and `bring_items` (person_id -> people, ciphertext <= 4000 chars). RPCs, all `authenticated`-only: `get_bring_secret()` (returns passphrase + salt), `list_bring_items()` (id, person_name, ciphertext, created_at, mine), `add_bring_item(cipher)` (max 50 per person, needs a linked roster row), `update_bring_item(id, cipher)` / `delete_bring_item(id)` (own rows only). Migration: `supabase/migrations/20261012_bring_items.sql` (salt is generated when first applied; do not re-seed or old entries become unreadable).
- Threat model: outsiders (anon) cannot read ciphertext or the key. Any signed-in user can fetch the key (needed to decrypt), and anyone with DB/dashboard access can too, so this is obfuscation-at-rest, not secrecy from members. `REDACTED` is a weak passphrase, mitigated only by the salt and by the key being sign-in-gated. Rotating the passphrase/salt requires re-encrypting all rows.
- **Layout:** the Bringing card is a separate right-hand column (`.layout` > `.main-col` + `aside.bring`) that is `position: sticky` so it follows the scroll (static on screens < 900px). Entries render as a table: Shape, Name, Item, actions.
- **Identity badges** (client-side only, computed in `computeIdentities()` from the `people` columns already fetched; no DB change): only people who RSVPed yes (`first_signed_in_at` set, not declined, not maybe) get one. They are ranked newest-first by `first_signed_in_at`; rank 0 = triangle, shape = 3 + rank % 7 (triangle..nonagon, 7 shapes), color = rank % 2 (even = Maize & Blue `#FFCB05`/`#00274C`, odd = Scarlet/Gray/White `#BB0000`/`#8a8d8f`/white). Consequence: badges shift whenever someone new RSVPs yes or someone changes to maybe/no. People without a yes show "-". Matching of entries to people is by `display_name`.
- Verified via a rolled-back SQL test (add/list/update/delete/get secret as John). Not browser-tested.

## Accept / decline flow

- Email has two links to `invite.html#e=<login email>&k=<key>&a=accept|decline` (fragment is stripped on load; never sent to servers).
- Accept: sign in with the key, `accept_invite()` (clears `declined_at`), forced "Choose a password" form (min 6 chars client-side), `updateUser`, then `mark_first_sign_in()` (this is what triggers the rainbow name), then redirect home. Login alone no longer triggers the rainbow; saving a password on the home page does too (that is how John would light up).
- Decline: sign in with the key, show a big ASCII frown with a confirm button (mail scanners opening the link can't decline by themselves); confirm calls `decline_invite()` (sets `people.declined_at`) and signs out. The page offers "Actually, I'm coming" (re-signs in from in-memory creds, `accept_invite()`, then the password step). Home page draws a red X (`.declined` CSS) through declined names.
- **Maybe RSVP:** third email button (`a=maybe`). `invite.js` calls `maybe_invite()` (sets `people.maybe_at`, clears `declined_at`) and offers "I'm in" / "I can't make it". Display precedence on the roster: declined (red X) > maybe (name lowercased then first letter capitalized, whole name teeters via CSS `teeter`) > rainbow (set a password) > grey lowercase. `accept_invite`/`decline_invite` clear the other state. A key beside the roster (`#legend-list`, built by `renderLegend()` from sample names) explains the four looks: grey = hasn't answered yet, rainbow = coming, teetering = maybe, red X = can't come. Migration: `supabase/migrations/20261009_maybe_rsvp.sql`; `maybe_at` is in the column-level SELECT grant.
- Schema: `people.declined_at`; `decline_invite()` / `accept_invite()` are security definer, `authenticated` only, act on the caller's own row. Migration: `supabase/migrations/20261009_invite_responses.sql`.
- Once a person sets a password their key stops working, so old invite links fail with "can't be used any more" (they use the normal login page).
- **Password length:** both password forms require 6-72 chars client-side. Supabase Auth enforces its own server-side minimum (default 6) under Dashboard > Authentication > Sign In / Providers > Email; keep it at 6 or higher (it can't be read or set via MCP, so confirm it in the dashboard).

## Invites

- `invite.py` (gitignored, untested by design; John tests/edits). Sends a multipart (plain + HTML) email with Accept and Decline buttons; John is exempt (`SKIP_INVITE`); `ALREADY_SYNCED = {"jack"}` makes his link use his real login email. Modeled on `../secret-santa/secret_santa.py` (same `load_env`, Gmail SMTP 587, `smtp_username`/`smtp_password`).
- `.env` (gitignored) was copied blind from secret-santa and had `SUPABASE_URL` and an empty `SUPABASE_SERVICE_ROLE_KEY` appended.
- Config: `emails[slug]` for all 15 (8 prefilled from secret-santa, TK assumed = Teddy; 7 blank). Brian/Will kept commented. Switches: `DRY_RUN` (default True), `ONLY`, `SYNC_LOGIN_EMAILS` (calls `admin_set_login_email` with the service key, then links use the real email; keep True once anyone has been synced). John gets the plain login URL.

## Security model (audited 2026-10-09)

- **Database privileges:** `anon` has NO privileges on any public table or function. `authenticated` has SELECT only on `cars`, `car_passengers`, `itinerary_days`, and on `people` only the columns `id, display_name, group_label, sort_order, first_signed_in_at, declined_at` (`user_id` and `slug` are hidden; `select=*` on people is denied by design, so always list columns). `profiles`/`user_logs`: per-row RLS on `auth.uid()`, `authenticated` can UPDATE only `profiles.display_name`; no TRUNCATE/REFERENCES/TRIGGER anywhere. Default privileges for new public objects are revoked for API roles (new tables need explicit grants + policies).
- **Functions:** `mark_first_sign_in`, `accept_invite`, `decline_invite` are `authenticated`-only and only touch the caller's own `people` row. `admin_set_login_email` is `service_role`-only. `rls_auto_enable` (event trigger) and `handle_new_user` (auth trigger) have no API execute rights (verified auto-RLS on new tables still works). Remaining advisor WARNs for the 3 caller-scoped RPCs are intentional.
- **Front end:** no `innerHTML`/`eval`; all DB text rendered with `textContent`. Link params (`e`,`k`,`a`) are length-checked, only used as credentials, and `a` is whitelisted. Password inputs `maxlength=72`. Each page has a strict CSP meta (`script-src 'self'`, `connect-src 'self'` + the Supabase origin, no inline scripts, `form-action 'none'`, `base-uri 'none'`) and `no-referrer`. Pages hide themselves if framed (clickjacking; GitHub Pages cannot send headers).
- **Supply chain:** supabase-js is vendored at `vendor/supabase-js-2.117.3.umd.js` (sha256 `d6a5c441...54a3`), no CDN code at runtime. To upgrade: `npm pack @supabase/supabase-js`, copy `dist/umd/supabase.js`, rename, update the 3 `<script>` tags.
- **Cache busting:** GitHub Pages caches ~10 min; script/CSS URLs carry `?v=7` (and `supabaseClient.js?v=7` in imports). Bump the number in all HTML/JS files whenever JS/CSS changes, or visitors can get stale files that conflict with the CSP.
- **Verified by live attack script (45 checks, all pass):** anon cannot read/write anything or call any RPC, sign-ups blocked (`signup_disabled`), admin API 401/403; a signed-in user cannot write trip data, read hidden columns, read/modify/delete/forge another user's rows, call admin or internal functions, or affect another person's decline state.
- **Secrets:** repo and full git history contain no passwords, JWTs, or service keys; `.env`, `invite.py`, `invites.local.json`, and the PDF are gitignored and were never committed.

## Key design decisions

- Plain static HTML, no bundler; supabase-js via `https://esm.sh`. Publishable key committed deliberately (public by design; RLS protects data).
- Personal-link auth uses password sign-in with a per-person random key in the URL fragment (never sent to servers, stripped on load). Link carries the login email so switching to real emails needs no code change.
- No registration UI; accounts are admin-provisioned.
- Roster/trip content is data, not code. Group headings come from `group_label`.
- No emoji anywhere in the UI. ASCII penguin kept in the hero (`<`/`>` escaped in `<pre>`); keep it mirror-symmetric when editing (23-char width, center column 11).
- All paths relative for the `/Massanutten/` subpath.
- MCP safety: before any write, confirm via `get_project_url` + a schema fingerprint. Use the plugin namespace with explicit `project_id`; `user-supabase` may still point at EquityHealthSys until MCP reloads.

## Shortcuts / conventions

- **Edit trip data:** Supabase Table Editor on `people`, `cars`, `car_passengers`, `itinerary_days`.
- **Reset someone's animation:** `update public.people set first_signed_in_at = null where slug = '...'`.
- **Add a person:** insert into `people`, create an Auth user (bcrypt hash of a new key), set `user_id`, add the key to `invites.local.json` and an `emails[...]` line in `invite.py`.
- **Code conventions:** inline page styles + shared `styles.css`; migrations idempotent.
- **Process:** all changes follow the KB workflow in `.cursor/rules/knowledge-base.mdc`.

## Known limitations

- **Password strength:** the minimum is 6 characters; short passwords are still guessable if someone knows a person's email, despite Supabase's rate limits. Consider a longer minimum or enabling leaked-password protection.
- A signed-in user can change their OWN login email via the Auth API (`updateUser`); it only affects their own account. Leaked-password protection is off (Dashboard setting).
- Signed-in users can see all roster names, who has signed in/declined, cars, and itinerary (by design). `profiles`/`user_logs` are unused by the UI and could be dropped.
- **Manual step:** Auth Site URL / redirect URLs (Dashboard > Authentication > URL Configuration): Site URL `https://massanuttennewyears.github.io/Massanutten/`, redirect `https://massanuttennewyears.github.io/Massanutten/**`.
- Personal links are bearer credentials; anyone with the link can sign in as that person until they set their own password (old key stops working after that) or the key is rotated.
- John's name only lights up on his next sign-in (his earlier logins predate `mark_first_sign_in`).
- PDF text kept verbatim (e.g. "Hrdy", "Will Smuth", "emploids", "booling", "Sendy"); Day 2 vs Day 3 split was ambiguous.
- If `invites.local.json` is lost, keys cannot be recovered; rotate by setting new bcrypt hashes.
- Global `~/.cursor/mcp.json` `supabase` entry points at EquityHealthSys (`fkgwjkcixpjxxnhlqwow`) and is intentionally left as-is; this repo and `~/Desktop/dev/deploy/equityhealthsystems` each pin their project in `.cursor/mcp.json`.
- Pre-existing `public.rls_auto_enable()` (Supabase-provided) and "leaked password protection disabled" advisor warnings; left untouched.
- Auth gate is client-side only (static hosting): the page is hidden until verified, but data protection still rests on RLS. Because sessions use sessionStorage, each new tab/window needs a fresh sign-in (personal links sign in automatically); the 8h cap is a client-side check a determined user could bypass, and server-side limits (Dashboard session time-box/inactivity, Pro plan) are not set.
- The personal-link success path has been verified via the Auth API, not by clicking a real link in a browser (to keep keys out of logs).

## Update log

- 2026-10-12: Bringing card moved to a sticky right column, entries shown as a Shape/Name/Item table with RSVP-yes identity badges (shape modulo 7, color modulo 2, newest RSVP = triangle + Maize & Blue). Cache-bust `?v=7`. Syntax-checked only, not browser-tested.
- 2026-10-12: Bringing list. New `app_secrets` + `bring_items` tables and 5 RPCs (migration `20261012_bring_items.sql`, applied to the live project), side card next to the roster with add/edit/delete, client-side AES-GCM encryption instead of the requested SHA-256 (not reversible) with the key stored in the DB behind a signed-in-only RPC. Cache-bust bumped to `?v=6` (now `?v=7`).
- 2026-10-12: Auth gate fixes. Root cause of content flashing: `.page { display: grid }` overrode the `hidden` attribute on `#app`; added global `[hidden] { display: none !important; }` to `styles.css`. `app.js` now runs `guard()` before revealing anything (session present, not older than 8h, `getUser()` validated server-side), re-runs it on bfcache restore (`pageshow` persisted) and when the tab becomes visible, and hides + redirects on `SIGNED_OUT`. Sessions moved from localStorage to sessionStorage (old `sb-*-auth-token` localStorage entries are purged), sign-in time stamped by `signIn()` for the 8h forced re-login; `login.js` no longer auto-forwards an expired session; logout and decline use local-scope `endSession()`. `login.js`/`invite.js` use the stamped `signIn`. Cache-bust bumped to `?v=6` (now `?v=7`). Not browser-tested (syntax-checked only).
- 2026-10-09: Incident: while staging RSVP visuals I overwrote and then nulled Jack's real `first_signed_in_at` (he had signed in and set a password at ~19:32 UTC). Restored to 19:32:23 UTC from his `auth.users.updated_at`. Lesson: never stage or reset state on live `people` rows without first snapshotting them; prefer a local copy of the page or only touch rows with no sign-in in `auth.users`.
- 2026-10-09: Maybe RSVP. Added `people.maybe_at`, `maybe_invite()`, teetering roster style, a Maybe button in the invite email (`invite.py`, syntax-checked only, never run) and on `invite.html`, and a Key beside the roster. Cache-bust bumped to `?v=4`. Tested via API (state transitions, anon denied, user_id still hidden) and visually with staged states, then reset.

- 2026-10-09: Car changes in Supabase: added William to Car 1 (he was in no car in the PDF) and moved Matias from Car 3 to Car 4. Cars are now: Car 1 Liam, Ashley, Jesse, John, William; Car 2 Jack, Gabby, Conna, Lili, Hrdy; Car 3 Nate, TK, Katie M.; Car 4 Ben, Matias.
- 2026-10-09: Raised the minimum password length from 2 to 6 on the invite and home password forms (`minlength="6"`).
- 2026-10-09: Security audit and hardening (see "Security model"). Migration `20261009_security_hardening.sql`: removed leftover anon/TRUNCATE privileges, column-level SELECT on `people`, locked internal functions, revoked default API privileges. Vendored supabase-js, added CSP + referrer + frame defenses, input length limits, cache-busting `?v=3`. Found and fixed: stale cached `supabaseClient.js` conflicting with the new CSP.

- 2026-10-09: Home hero: replaced the explainer text with the headline "WELCOME TO JACK D. RELICHMAN'S 2026 SENDOFF 2027 JUMPSTART WEEKEND GETAWAY OF YOUR DREAMS !!!" (`#welcome`), split by `shakeLetters()` in `app.js` into per-letter spans with randomized shake duration/phase (words kept unbroken; static under reduced motion). Redrew the ASCII penguin to be mirror-symmetric around its center column (verified with a script; N/Y on the hat is the only non-mirrored text).
- 2026-10-09: Accept/decline invitations. Added `invite.html`/`invite.js`, `people.declined_at`, `decline_invite()`/`accept_invite()`, red X on declined roster names, rainbow now triggered by setting a password, `invite.py` sends Accept/Decline HTML email (syntax-checked only, never run). `login.js` no longer marks first sign-in.
- 2026-10-09: Removed non-roster passengers "Will Smuth" and "Brian" from `car_passengers`; cars now only list people in `people` (Car 4 is just Ben). Passenger names are still free text, so keep them matching `people.display_name`.
- 2026-10-09: Renamed Car 2 passenger "Lilli" to "Lili" to match the roster.
- 2026-10-09: Roster, personal sign-in links, trip data, invites. Added `people`/`cars`/`car_passengers`/`itinerary_days` (read-only to signed-in users), `mark_first_sign_in` and `admin_set_login_email`; seeded from the PDF; created 14 placeholder accounts from locally generated keys (`invites.local.json`). New shared `styles.css` and pixelated `snow.js` on all pages; login handles `#e=&k=` links; home rebuilt with animated rainbow roster names, cars, itinerary, set-password form. Added gitignored `invite.py` + blind-copied `.env`; `.gitignore` covers `.env`, `invite.py`, `invites.local.json`, `*.local.sql`, `*.pdf`.
- 2026-10-09: Added winter-themed `login.html`/`login.js`; created first user `REDACTED_EMAIL`.
- 2026-10-09: Added per-workspace `.cursor/mcp.json` routing Supabase MCP to `vxevjynsfzemnzqxcfgt`; pinned the equityhealthsystems repo to `fkgwjkcixpjxxnhlqwow`; global config untouched.
- 2026-10-09: Integrated Supabase: `supabaseClient.js`, `app.js`, `profiles` + `user_logs` with RLS, profile trigger.
- 2026-10-09: Added `index.html` with ASCII penguin wearing an "NY" hat as the initial Pages site.
- 2026-10-09: Initial KB created.
