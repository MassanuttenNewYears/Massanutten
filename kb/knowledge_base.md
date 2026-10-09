Last updated: 2026-10-09

# Knowledge Base

## Overview

`massanutten` is a static GitHub Pages site for the org `MassanuttenNewYears` (remote: `https://github.com/MassanuttenNewYears/Massanutten.git`, branch `main`). Invite-only trip site for New Years 2026 at Massanutten: a winter-themed login page gates a home page with the roster (names light up after each person's first sign-in), car assignments, and the itinerary, all loaded from Supabase.

- **How to run:** serve the folder over HTTP (e.g. `python3 -m http.server`); ES modules do not work from `file://`. No build step. Deploy via GitHub Pages (Settings > Pages > `main` branch, root). Expected URL: `https://massanuttennewyears.github.io/Massanutten/`.

## Architecture

- `styles.css`: shared winter theme (night gradient, frosted `.card`, inputs/buttons, `.status`).
- `snow.js`: classic script on every page. Injects a fixed canvas drawn at 1/4 resolution, scaled with `image-rendering: pixelated` (square flakes, 3 depth layers, sine drift). Pauses when the tab is hidden; static under `prefers-reduced-motion`.
- `login.html` + `login.js`: login. Personal links `login.html#e=<login email>&k=<key>` are read from the fragment, the fragment is removed with `history.replaceState`, then `signInWithPassword` + `rpc('mark_first_sign_in')`, then redirect to `./`. Manual email/password form also calls the RPC. Bad link shows an error.
- `index.html` + `app.js`: home. Redirects to `./login.html` without a session. Renders roster table (one column per `group_label`, groups in `people.id` order, rows by `sort_order`), car cards, itinerary day cards, and a "Set your own password" form (`auth.updateUser`). Placeholder logins show as the slug in the header.
- `supabaseClient.js`: single `createClient` (URL + publishable key, localStorage session) and `SITE_URL`.
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

## Accept / decline flow

- Email has two links to `invite.html#e=<login email>&k=<key>&a=accept|decline` (fragment is stripped on load; never sent to servers).
- Accept: sign in with the key, `accept_invite()` (clears `declined_at`), forced "Choose a password" form (min 2 chars client-side), `updateUser`, then `mark_first_sign_in()` (this is what triggers the rainbow name), then redirect home. Login alone no longer triggers the rainbow; saving a password on the home page does too (that is how John would light up).
- Decline: sign in with the key, show a big ASCII frown with a confirm button (mail scanners opening the link can't decline by themselves); confirm calls `decline_invite()` (sets `people.declined_at`) and signs out. The page offers "Actually, I'm coming" (re-signs in from in-memory creds, `accept_invite()`, then the password step). Home page draws a red X (`.declined` CSS) through declined names.
- Schema: `people.declined_at`; `decline_invite()` / `accept_invite()` are security definer, `authenticated` only, act on the caller's own row. Migration: `supabase/migrations/20261009_invite_responses.sql`.
- Once a person sets a password their key stops working, so old invite links fail with "can't be used any more" (they use the normal login page).
- **Password length:** the page asks for 2+ chars, but Supabase Auth enforces its own minimum (default 6) under Dashboard > Authentication > Sign In / Providers > Email. It must be lowered there, if the dashboard allows, or 2-char passwords will be rejected.

## Invites

- `invite.py` (gitignored, untested by design; John tests/edits). Sends a multipart (plain + HTML) email with Accept and Decline buttons; John is exempt (`SKIP_INVITE`); `ALREADY_SYNCED = {"jack"}` makes his link use his real login email. Modeled on `../secret-santa/secret_santa.py` (same `load_env`, Gmail SMTP 587, `smtp_username`/`smtp_password`).
- `.env` (gitignored) was copied blind from secret-santa and had `SUPABASE_URL` and an empty `SUPABASE_SERVICE_ROLE_KEY` appended.
- Config: `emails[slug]` for all 15 (8 prefilled from secret-santa, TK assumed = Teddy; 7 blank). Brian/Will kept commented. Switches: `DRY_RUN` (default True), `ONLY`, `SYNC_LOGIN_EMAILS` (calls `admin_set_login_email` with the service key, then links use the real email; keep True once anyone has been synced). John gets the plain login URL.

## Key design decisions

- Plain static HTML, no bundler; supabase-js via `https://esm.sh`. Publishable key committed deliberately (public by design; RLS protects data).
- Personal-link auth uses password sign-in with a per-person random key in the URL fragment (never sent to servers, stripped on load). Link carries the login email so switching to real emails needs no code change.
- No registration UI; accounts are admin-provisioned.
- Roster/trip content is data, not code. Group headings come from `group_label`.
- No emoji anywhere in the UI. ASCII penguin kept in the hero (`<`/`>` escaped in `<pre>`).
- All paths relative for the `/Massanutten/` subpath.
- MCP safety: before any write, confirm via `get_project_url` + a schema fingerprint. Use the plugin namespace with explicit `project_id`; `user-supabase` may still point at EquityHealthSys until MCP reloads.

## Shortcuts / conventions

- **Edit trip data:** Supabase Table Editor on `people`, `cars`, `car_passengers`, `itinerary_days`.
- **Reset someone's animation:** `update public.people set first_signed_in_at = null where slug = '...'`.
- **Add a person:** insert into `people`, create an Auth user (bcrypt hash of a new key), set `user_id`, add the key to `invites.local.json` and an `emails[...]` line in `invite.py`.
- **Code conventions:** inline page styles + shared `styles.css`; migrations idempotent.
- **Process:** all changes follow the KB workflow in `.cursor/rules/knowledge-base.mdc`.

## Known limitations

- **Manual step:** Auth Site URL / redirect URLs (Dashboard > Authentication > URL Configuration): Site URL `https://massanuttennewyears.github.io/Massanutten/`, redirect `https://massanuttennewyears.github.io/Massanutten/**`.
- Personal links are bearer credentials; anyone with the link can sign in as that person until they set their own password (old key stops working after that) or the key is rotated.
- John's name only lights up on his next sign-in (his earlier logins predate `mark_first_sign_in`).
- PDF text kept verbatim (e.g. "Hrdy", "Will Smuth", "emploids", "booling", "Sendy"); Day 2 vs Day 3 split was ambiguous.
- If `invites.local.json` is lost, keys cannot be recovered; rotate by setting new bcrypt hashes.
- Global `~/.cursor/mcp.json` `supabase` entry points at EquityHealthSys (`fkgwjkcixpjxxnhlqwow`) and is intentionally left as-is; this repo and `~/Desktop/dev/deploy/equityhealthsystems` each pin their project in `.cursor/mcp.json`.
- Pre-existing `public.rls_auto_enable()` (Supabase-provided) and "leaked password protection disabled" advisor warnings; left untouched.
- The home page briefly loads before redirecting signed-out users (client-side gate; data is protected by RLS regardless).
- The personal-link success path has been verified via the Auth API, not by clicking a real link in a browser (to keep keys out of logs).

## Update log

- 2026-10-09: Accept/decline invitations. Added `invite.html`/`invite.js`, `people.declined_at`, `decline_invite()`/`accept_invite()`, red X on declined roster names, rainbow now triggered by setting a password, `invite.py` sends Accept/Decline HTML email (syntax-checked only, never run). `login.js` no longer marks first sign-in.
- 2026-10-09: Removed non-roster passengers "Will Smuth" and "Brian" from `car_passengers`; cars now only list people in `people` (Car 4 is just Ben). Passenger names are still free text, so keep them matching `people.display_name`.
- 2026-10-09: Renamed Car 2 passenger "Lilli" to "Lili" to match the roster.
- 2026-10-09: Roster, personal sign-in links, trip data, invites. Added `people`/`cars`/`car_passengers`/`itinerary_days` (read-only to signed-in users), `mark_first_sign_in` and `admin_set_login_email`; seeded from the PDF; created 14 placeholder accounts from locally generated keys (`invites.local.json`). New shared `styles.css` and pixelated `snow.js` on all pages; login handles `#e=&k=` links; home rebuilt with animated rainbow roster names, cars, itinerary, set-password form. Added gitignored `invite.py` + blind-copied `.env`; `.gitignore` covers `.env`, `invite.py`, `invites.local.json`, `*.local.sql`, `*.pdf`.
- 2026-10-09: Added winter-themed `login.html`/`login.js`; created first user `REDACTED_EMAIL`.
- 2026-10-09: Added per-workspace `.cursor/mcp.json` routing Supabase MCP to `vxevjynsfzemnzqxcfgt`; pinned the equityhealthsystems repo to `fkgwjkcixpjxxnhlqwow`; global config untouched.
- 2026-10-09: Integrated Supabase: `supabaseClient.js`, `app.js`, `profiles` + `user_logs` with RLS, profile trigger.
- 2026-10-09: Added `index.html` with ASCII penguin wearing an "NY" hat as the initial Pages site.
- 2026-10-09: Initial KB created.
