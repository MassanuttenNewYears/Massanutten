Last updated: 2026-11-11 (full-stack security hardening and repo/history PII scrub)

# Knowledge Base

## Overview

`massanutten` is a static GitHub Pages site for the org `MassanuttenNewYears` (remote: `https://github.com/MassanuttenNewYears/Massanutten.git`, branch `main`). Invite-only trip site for New Years 2026 at Massanutten: a winter-themed login page gates a home page with the roster (names light up after each person's first password save) and the itinerary, loaded from Supabase. The Cars section is off the home page for now.

- **How to run:** serve the folder over HTTP (e.g. `python3 -m http.server`); ES modules do not work from `file://`. No build step. Deploy via GitHub Pages (Settings > Pages > `main` branch, root; `_config.yml` excludes `kb/`, `supabase/`, and `vendor/supabase-js-LICENSE` from the published Pages artifact). Expected URL: `https://massanuttennewyears.github.io/Massanutten/`.

## Architecture

- `styles.css`: shared winter theme (night gradient, frosted `.card`, inputs/buttons, `.status`, `[hidden] { display: none !important; }`).
- `snow.js`: classic script on every page. Injects a fixed canvas drawn at 1/4 resolution, scaled with `image-rendering: pixelated` (square flakes, 3 depth layers, sine drift). Pauses when the tab is hidden; static under `prefers-reduced-motion`.
- `login.html` + `login.js`: login. Personal links `login.html#e=<login email>&k=<key>` are read from the fragment, the fragment is removed with `history.replaceState`, then `signInWithPassword`, then redirect to `./`. Bad link shows an error.
- `index.html` + `app.js`: home. `#app` stays hidden until `guard()` passes (session exists, younger than 8h, and `auth.getUser()` confirms it with the server); otherwise redirects to `./login.html`. Loads `people`, `itinerary_days`, and `site_config` (`welcome_headline`, split by `shakeLetters()` into shaking spans) in parallel after auth. Renders roster table (one column per `group_label`, groups in `people.id` order, rows by `sort_order`) and itinerary day cards. The Cars section is not rendered. The signed-in label in the header links to `account/` (site path `/Massanutten/account/` on GitHub Pages; no leading slash, so the project subpath is kept). Roster card headings only are remapped in `ROSTER_HEADINGS` (`Folk` -> `MOIDS (FOLK)`, `Foids (W)` -> `FOIDS (W (We <3 you Women))`); stored `group_label` is unchanged. Placeholder logins (`<slug>@guest.massanutten.invalid`) show as the slug in the header.
- `account/index.html` + `account/account.js`: account page for the signed-in user. Same auth gate, then `profiles` select (`id, display_name`) filtered to `auth.uid()`; `profiles_select_own` is the RLS enforcement (a row whose id is not the session user is refused). Password change (`minlength=10`) is `auth.updateUser({ password })`, which updates only the token's user, then `mark_first_sign_in()`. The current password cannot be shown: Auth stores a hash, not the password. The page then calls `list_potential_drivers()`. On success it shows a Potential drivers table (names only; empty list says "None yet."). Any error leaves that section hidden. It also calls `my_secret_liquor()`. When that returns a name, a Secret liquor section shows "Your target is {name}." Otherwise that section stays hidden. The page has no admin label.
- **Bringing list** (right of the roster, `#bring-list`/`#bring-form` in `index.html`, logic in `app.js`): signed-in users add/edit/delete their own entries; everyone sees all. See "Bringing list" below.
- `supabaseClient.js`: single `createClient` (URL + publishable key, **sessionStorage** session, `detectSessionInUrl: false`), `SITE_URL`, and the forced re-login helpers `signIn` (stamps sign-in time), `sessionExpired`, `endSession` (revokes current session via `signOut({ scope: "local" })` with `finally` cleanup of `sb-*` storage entries), `MAX_SESSION_MS` (8h).
- `_config.yml`: excludes `kb`, `supabase`, and `vendor/supabase-js-LICENSE` from GitHub Pages builds so internal docs and SQL files return 404 on Pages.
- `supabase/migrations/*.sql`: idempotent schema/RLS/RPC migrations (no secrets, emails, or personal roster data; row data and flags are provisioned out of band).
- `invite.py` (gitignored, `0600`): local invite mailer, see "Invites".
- `secret_liq.py` (gitignored, `0600`): local secret-liquor draw, see "Secret liquor". The roster card border turns rainbow once every visible non-`yes_only` person has answered.
- `.cursor/mcp.json`: routes the `supabase` MCP server to this project.

## Supabase

- Project: "Massanutten", ref `vxevjynsfzemnzqxcfgt`, region us-east-1, URL `https://vxevjynsfzemnzqxcfgt.supabase.co`. Auth settings: `disable_signup: true`, `mailer_autoconfirm: false` (Confirm Email required for client email changes), `password_min_length: 10`.
- Tables (public, RLS on everywhere):
  - `profiles`: per-row RLS on `auth.uid()`; `authenticated` has `SELECT` and `UPDATE (display_name)` only (`profiles_display_name_len <= 100`); rows are inserted on user creation by `handle_new_user()`.
  - `user_logs`: unused legacy table; all API role privileges revoked.
  - `site_config` (`key` primary key, `value` <= 500 chars): holds authenticated-only UI copy such as `welcome_headline` (seeded out of band in the database so personal names never appear in public repo HTML). `authenticated` has `SELECT` only. Migration: `supabase/migrations/20261111160000_security_hardening_v2.sql`.
  - `people` (`slug` unique, `display_name`, `group_label`, `sort_order`, `user_id -> auth.users`, `first_signed_in_at`, `declined_at`, `maybe_at`, `is_admin`, `yes_only`). Rows, `is_admin` flags, and `yes_only` flags are managed out of band in the database (never committed to git). `yes_only` (not granted to API roles) hides a row via the `people_read_authenticated` RLS policy (and `list_bring_items`, `list_potential_drivers`, `set_secret_liquor`) unless that person has an active yes RSVP (`first_signed_in_at` set, `declined_at` and `maybe_at` null). Migration: `supabase/migrations/20261111014901_yes_only.sql`.
  - `cars` + `car_passengers`: inactive while the Cars section is off the home page; all `anon` and `authenticated` privileges are revoked (`20261111160000_security_hardening_v2.sql`). `car_passengers` retains its rows with `ON DELETE CASCADE NOT VALID`; restore `cars` from gitignored `cars.local.sql` if re-enabled.
  - `potential_drivers` (`person_id` unique -> `people`, `created_at`). Separate from `cars`. No direct API grants; written only by `offer_to_drive()` for the signed-in recipient and read only via `list_potential_drivers()` when the caller's `people` row has `is_admin`. Migrations: `supabase/migrations/20261014_potential_drivers.sql`, `supabase/migrations/20261014_admin_potential_drivers.sql`.
  - `itinerary_days` (`day_number` unique, `day_date`, `items text[]`). Four days (Dec 31 - Jan 3). `authenticated` has `SELECT` only; `anon` has no grants; nobody can write via the API. Edit content in the Supabase Table Editor; the site reads it at runtime.
  - `login_emails` (`slug -> people`, `email` unique). No API grants. RLS on with no policies (deny all). Holds the invited login address for each slug, inserted out of band and never stored in git. Migration: `supabase/migrations/20261015_login_email_on_password.sql`.
  - `secret_liquor` (`person_id -> people`, `target_id -> people`, both unique, no self-match). No API grants. RLS on with no policies (deny all). Migration: `supabase/migrations/20261014_secret_liquor.sql`.
- Functions:
  - `check_invite_ready()`: security definer, `authenticated` only. Verifies the caller has a linked `people` row and that any staged `login_emails` address does not collide with another `auth.users` account before `invite.js` updates the password.
  - `mark_first_sign_in()`: security definer, `authenticated` only. Sets `first_signed_in_at` for the caller's row if null. If `login_emails` has that caller's slug, it also sets the Auth login email (`auth.users` + `auth.identities`, keeping `email_confirmed_at` set) to that address, and refuses if the address already belongs to someone else. Takes no arguments.
  - `accept_invite()`, `decline_invite()`, `maybe_invite()`: security definer, `authenticated` only; update only the caller's own `people` RSVP timestamps.
  - `offer_to_drive()`: security definer, `authenticated` only; inserts the caller's `people` row into `potential_drivers` (idempotent on conflict).
  - `list_potential_drivers()`: security definer, `authenticated` only. Returns `driver_name` rows (respecting `yes_only`) when the caller's `people` row has `is_admin`; otherwise raises `not allowed`.
  - `my_secret_liquor()`: security definer, `authenticated` only. Returns the target display name for the caller's own `people` row, or null.
  - `list_yes_rsvps()`: security definer, `authenticated` only, `is_admin` required. Returns `slug` and `display_name` for active yes RSVPs.
  - `set_secret_liquor(p_pairs jsonb)`: security definer, `authenticated` only, `is_admin` required. Replaces the draw; pairs must form a derangement of every active yes RSVP and refuses while any non-`yes_only` row is still pending.
  - `admin_set_login_email(p_slug, p_email)`: security definer, `service_role` only. Switches the person's Auth login email (`users` + `identities`, confirmed).
- Accounts: Admin-provisioned out of band (`email_confirmed_at` set on all accounts). Unactivated invitees start on `<slug>@guest.massanutten.invalid` with a random per-person key stored only in gitignored `invites.local.json`; saving a password runs `check_invite_ready()`, updates the password, and runs `mark_first_sign_in()` to switch their Auth login to their invited address in `login_emails`.

## Bringing list

- Entries are encrypted client-side with AES-256-GCM (key derived via PBKDF2-SHA256, 200k iterations, from `app_secrets.bring_passphrase` and `app_secrets.bring_salt`, both set directly in the database; stored value is `base64(iv + ciphertext)`).
- Tables (no API privileges at all; access only through security definer RPCs): `app_secrets` (`bring_passphrase`, `bring_salt`) and `bring_items` (`person_id -> people`, ciphertext validated as base64, 40-1200 chars, enforced by `bring_items_ciphertext_format`; migration `20261012_bring_items_validate.sql`). RPCs, all `authenticated`-only: `get_bring_secret()`, `list_bring_items()` (respects `yes_only`), `add_bring_item(cipher)` (max 50 per person, requires linked roster row), `update_bring_item(id, cipher)` / `delete_bring_item(id)` (own rows only). Migration: `supabase/migrations/20261012_bring_items.sql`.
- Threat model: outsiders (`anon`) cannot read ciphertext or the key. Any signed-in user can fetch the key (needed to decrypt), and anyone with DB/dashboard access can too, so this is obfuscation-at-rest rather than secrecy between signed-in members. Rotating the secret/salt requires re-encrypting all `bring_items` rows atomically.
- **Layout:** the Bringing card is a sticky right-hand column (`400px`, static below `900px` viewport width) inside a `1600px` max-width `.layout`. Shape, name, and actions stay on one line; only the item text wraps.
- **Identity badges** (client-side only, computed in `computeIdentities()`): only active yes RSVPs get one, ranked oldest-first by `first_signed_in_at`; shape = `3 + rank % 7` (triangle..nonagon), color = `rank % 2` (even = Maize & Blue, odd = Scarlet/Gray/White).

## Accept / decline flow

- Invitation emails carry links to `invite.html#e=<login email>&k=<key>&a=accept|maybe|decline` (fragment stripped immediately on load; never sent over HTTP).
- Accept: sign in with key, `accept_invite()`, optional "Can you drive?" (`offer_to_drive()`), and password form (`minlength=10`, `maxlength=72`). Submitting runs `check_invite_ready()`, `auth.updateUser({ password })`, and `mark_first_sign_in()`, then redirects home.
- Decline: sign in with key, confirm button (protects against mail link scanners), calls `decline_invite()` and `endSession()`. Offers undo while credentials remain in page memory.
- Maybe: `maybe_invite()` sets `maybe_at` and clears `declined_at`; name teeters on the roster. Display precedence: declined (red X) > maybe (teetering) > yes (rainbow) > pending (grey lowercase).
- Once a person saves a password, their initial key no longer works and they sign in on `login.html` with their invited email and chosen password.

## Invites

- `invite.py` (gitignored, `0600`). Sends multipart/related HTML + plain-text emails over Gmail SMTP (`587`, `STARTTLS` verified with `ssl.create_default_context()`), inlining gitignored `Dc Comics Batman GIF.gif`.
- `.env` (gitignored, `0600`) holds SMTP credentials and `SUPABASE_URL`. Recipient addresses live only in gitignored `invite.py` and out-of-band `public.login_emails`; invite keys live only in gitignored `invites.local.json` (`0600`).
- Safety defaults: `DRY_RUN = True` by default so accidental execution prints planned actions without sending email; `SKIP_INVITE` prevents re-mailing already invited slugs; `SYNC_LOGIN_EMAILS = True`.

## Secret liquor

- When every visible roster row has answered, `#roster-card.all-rsvped` displays an animated rainbow border (`everyoneRsvped()` in `app.js`).
- `secret_liq.py` (gitignored, `0600`) signs in as an admin user (never needs the service role key), verifies nobody is pending, loads active yes RSVPs via `list_yes_rsvps()`, draws pairings using `secrets.SystemRandom()` (peeling off a 3-cycle trio when the yes count is odd), verifies TLS via `ssl.create_default_context()` when mailing, and publishes targets via `set_secret_liquor()` so each participant sees only their own target on `/account`. `DRY_RUN` defaults to `True`.

## Security model (re-audited and hardened 2026-11-11)

- **Database privileges:** `anon` has NO privileges on any public table, sequence, or function (OpenAPI `/rest/v1/` introspection is also blocked with 401). `authenticated` has `SELECT` only on `itinerary_days`, `site_config`, `profiles` (own row + `UPDATE (display_name)` <= 100 chars), and on `people` only the columns `id, display_name, group_label, sort_order, first_signed_in_at, declined_at, maybe_at` (`user_id`, `slug`, `is_admin`, and `yes_only` are hidden). `app_secrets`, `bring_items`, `cars`, `car_passengers`, `user_logs`, `potential_drivers`, `secret_liquor`, and `login_emails` have zero direct grants for `anon` and `authenticated`. Default privileges in `public` revoke all from API roles.
- **Auth configuration:** `disable_signup: true`, `mailer_autoconfirm: false` (prevents unverified client-side `updateUser({ email })` hijacking or guest lockout), `password_min_length: 10`, `refresh_token_rotation_enabled: true`. All provisioned accounts have `email_confirmed_at` set.
- **Functions:** All `SECURITY DEFINER` functions pin `set search_path = ''` and enforce caller scoping via `auth.uid()` (plus `people.is_admin` on admin RPCs). `admin_set_login_email` is restricted to `service_role`; trigger helpers (`handle_new_user`, `rls_auto_enable`) have no API execute grants.
- **Front end:** Zero `innerHTML`/`eval`; all DB strings rendered via `textContent` (plus `cleanItemText()` Unicode control/bidi stripping on Bringing items). `detectSessionInUrl: false` prevents URL-fragment session fixation / Login CSRF. `endSession()` revokes the current session via `signOut({ scope: "local" })` and clears `sb-*` `sessionStorage` keys in `finally`. Strict CSP meta, `no-referrer`, URL fragment stripping, and frame-busting clickjacking defense on every page.
- **Supply chain & cache busting:** `supabase-js` vendored locally at `vendor/supabase-js-2.117.3.umd.js` (SHA-256 `d6a5c441...54a3`). Unified `?v=18` cache-busting query string across all HTML and ES module imports.
- **Repo, Pages & local hygiene:** `_config.yml` excludes `kb/`, `supabase/`, and `vendor/supabase-js-LICENSE` from GitHub Pages. Tracked files and rewritten git history contain zero secrets, emails, or personal roster/admin/`yes_only` names. Sensitive local files (`.env`, `invites.local.json`, `invite.py`, `secret_liq.py`, `cars.local.sql`) are gitignored and `0600` owner-only. A local `.git/hooks/pre-commit` hook blocks accidental commits containing emails, keys, or secret tokens.

## Key design decisions

- Plain static HTML + ES modules, no bundler; vendored `supabase-js` UMD bundle. Publishable key committed deliberately (public by design; RLS + column privileges protect data).
- Personal-link auth uses password sign-in with a per-person random key in the URL fragment (never sent to servers, stripped on load).
- No registration UI; accounts are admin-provisioned out of band.
- Roster, hero copy, and trip content are database data, not committed code.
- No emoji anywhere in the UI. Mirror-symmetric 23-char ASCII penguin in the hero.
- All paths relative for the `/Massanutten/` subpath.
- MCP/API safety: always verify project ref `vxevjynsfzemnzqxcfgt` before any database write.

## Shortcuts / conventions

- **Edit trip data:** Supabase Table Editor on `people`, `itinerary_days`, `site_config`.
- **Reset someone's animation:** `update public.people set first_signed_in_at = null where slug = '...'`.
- **Admin / `yes_only` flags:** set `is_admin` or `yes_only` directly on `public.people` in the database; never commit personal slugs or names to migration files or the KB.
- **Add a person:** insert into `people` and `login_emails` out of band, create a confirmed Auth user with a bcrypt hash of a new random key, link `user_id`, and record the key/email only in gitignored `invites.local.json` and `invite.py`.
- **Process:** all changes follow `.cursor/rules/knowledge-base.mdc` and `.cursor/rules/kb-no-secrets.mdc`.

## Known limitations

- Leaked-password protection via HaveIBeenPwned (`password_hibp_enabled`) and server-side session time-boxing (`sessions_timebox`) require a Supabase Pro plan; mitigated on the Free plan by `password_min_length: 10`, `disable_signup: true`, `mailer_autoconfirm: false`, 1-hour JWT expiry with refresh token rotation, and the client-side 8-hour `MAX_SESSION_MS` check.
- Account password changes via `auth.updateUser({ password })` do not prompt for the old password (`security_update_password_require_reauthentication` is off so first-time invite links can set a password smoothly); sessions live in `sessionStorage` and end when the tab closes.
- Personal invite links are bearer credentials until the recipient saves their own password (which invalidates the link key).
- Orphaned pre-`2026-10-12` commits on GitHub remain reachable by exact SHA through GitHub's 90-day `/events` log unless purged by GitHub Support (the old Bringing secret exposed there was rotated twice and is dead; keep a strong unique password on admin accounts).

## Update log

- 2026-11-11: Full-stack security hardening and repo/history PII scrub. Supabase Auth: set `mailer_autoconfirm = false` (prevents unverified client email changes / guest lockout) and raised `password_min_length` to `10` (HIBP confirmed Pro-only). Database (`20261111160000_security_hardening_v2.sql`): rotated `app_secrets.bring_passphrase` and `bring_salt` to full 256-bit CSPRNG values and atomically re-encrypted all 8 `bring_items` rows (verified round-trip); added authenticated-only `site_config` (`welcome_headline` moved out of `index.html`); added `check_invite_ready()` pre-flight RPC before password updates in `invite.js`; revoked API grants on unused `user_logs`, `cars`, and `car_passengers`; capped `profiles.display_name` at 100 chars and revoked `INSERT`/`DELETE`. Frontend (`?v=18`): set `detectSessionInUrl: false` and hardened `endSession()` in `supabaseClient.js`; raised password form `minlength` to `10`. Local & repo hygiene: enforced verified TLS (`ssl.create_default_context()`) in `invite.py` and `secret_liq.py`, switched `secret_liq.py` to `secrets.SystemRandom()`, reset `invite.py` `DRY_RUN = True`, set `0600` permissions on local secret files, untracked `supabase/.temp/cli-latest`, added `_config.yml` Pages exclusions and `.git/hooks/pre-commit` secret/PII check, scrubbed personal names/slugs and cross-project references from KB and migrations, rewrote git history with `git filter-repo`, and force-pushed clean `main`.
- 2026-11-11: Set `people.yes_only = true` out of band for an additional invitee so their row stays hidden from `public.people` and related RPCs unless they RSVP yes.
- 2026-11-10: Sent invitations to three newly provisioned roster accounts (`SYNC_LOGIN_EMAILS = True`) and added them to `SKIP_INVITE`.
- 2026-11-10: Added two roster entries and provisioned three confirmed Auth accounts + `login_emails` rows out of band. Added hidden `people.yes_only` column (`SELECT` revoked for API roles) and updated `people_read_authenticated` RLS plus `list_bring_items`, `list_potential_drivers`, and `set_secret_liquor` (`supabase/migrations/20261111014901_yes_only.sql`).
- 2026-10-16: Replaced an admin user's Auth password out of band and signed out the test session.
- 2026-10-14: Bringing names no longer break mid-word; column widened to `400px` so only item text wraps.
- 2026-10-14: Added `login_emails` (no API grants) and updated `mark_first_sign_in()` (`20261015_login_email_on_password.sql`) so accounts still on placeholder emails switch to their invited address upon saving a password; switched already-activated accounts out of band and enabled `SYNC_LOGIN_EMAILS = True`.
- 2026-10-14: Sent first batch of invitations via `invite.py` and added recipients to `SKIP_INVITE`.
- 2026-10-14: Provisioned placeholder logins and `invites.local.json` keys for additional roster entries.
- 2026-10-14: Added secret liquor (`secret_liquor` table, `my_secret_liquor`, `list_yes_rsvps`, `set_secret_liquor`, rainbow border on `#roster-card.all-rsvped`, and gitignored `secret_liq.py`).
- 2026-10-14: Added hidden `people.is_admin` flag and `list_potential_drivers()` on `/account` (`20261014_admin_potential_drivers.sql`).
- 2026-10-14: Added inline GIF and `offer_to_drive()` (`potential_drivers` table, `20261014_potential_drivers.sql`) to `invite.html`.
- 2026-10-14: Moved password form from home page to `account/`.
- 2026-10-14: Updated itinerary to 4 days (Dec 31 - Jan 3) and removed Cars section from the home page (`cars` rows archived to gitignored `cars.local.sql`).
- 2026-10-14: Updated roster display headings (`ROSTER_HEADINGS` in `app.js`) and widened max page width to `1600px`.
- 2026-10-12: Rewrote git history with `git filter-repo` after rotating the initial Bringing secret and added `.cursor/rules/kb-no-secrets.mdc`.
- 2026-10-12: Hardened Bringing ciphertext validation (`20261012_bring_items_validate.sql`), client `cleanItemText()`, sticky Bringing layout with identity badges, and `guard()`/`sessionStorage` auth gate (`20261012_bring_items.sql`).
- 2026-10-09: Added Maybe RSVP (`20261009_maybe_rsvp.sql`), initial security hardening (`20261009_security_hardening.sql`, vendored `supabase-js`, CSP), accept/decline flow (`20261009_invite_responses.sql`), roster/trip schema (`20261009_roster_trip_data.sql`), login page, and initial Supabase integration (`20261009_profiles_and_user_logs_with_rls.sql`).
