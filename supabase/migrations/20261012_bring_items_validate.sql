-- Server-side shape check for bring_items.ciphertext. The DB cannot see plaintext, but it can require
-- valid base64 of iv(12) + AES-GCM output (>= 1 byte + 16-byte tag = 29 bytes => >= 40 chars) and cap the
-- size at what 200 characters of UTF-8 can encrypt to (<= 1104 chars, so 1200), so malformed/oversized rows are rejected.
alter table public.bring_items drop constraint if exists bring_items_ciphertext_check;
alter table public.bring_items drop constraint if exists bring_items_ciphertext_format;
alter table public.bring_items add constraint bring_items_ciphertext_format
  check (length(ciphertext) between 40 and 1200 and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$');
