# Genesis GPT: secure Supabase integration

Genesis GPT calls the Supabase Edge Function at /functions/v1/genesis-gpt when no personal session key is set.

**No OpenAI API key is stored in a browser, repository, public SQL table, or GitHub Pages.**

## Required setup
1. Revoke the old OpenAI key that was pasted into chat and create a fresh project key.
2. In the Supabase Dashboard for the Genesis project, open **Edge Functions > Secrets**, save the new key as OPENAI_API_KEY. Do not paste the value into source files, browser settings, pull requests, or SQL.
3. Run GPT_DEFAULTS.sql in the Supabase SQL Editor. It removes the legacy publicly readable api_key column and creates an atomic 30-per-hour per-user quota.
4. Deploy the function with supabase functions deploy genesis-gpt --project-ref yubpnkcsjuxuczrafmmj (after authenticating the CLI).
5. Sign into Genesis OS using the Supabase-authenticated admin account and open GPT; it will use the Edge Function without prompting for an API key.

For now only the verified Supabase Auth account with email admin@genesisos.lol is authorized. This protects the paid API from anonymous abuse; existing local Genesis IDs are not sufficiently authenticated to receive shared API access. To allow general users, add verified Supabase Auth accounts and authorization/rate-limit policies before broadening access.

A personal API key remains an optional session-only fallback, as before. If Edge Functions are not deployed, the app will report that the secure service is unavailable. OpenAI API billing and rate limits apply.

## Test locally
Run node --test tests/gpt-native.test.mjs tests/gpt-secure.test.mjs tests/os-features.test.mjs.

## Operational protections
- Strict origin allowlist, Supabase Auth verification, admin-email authorization
- Atomic quota in PostgreSQL (fails closed when unavailable)
- Maximum 12 messages, 20,000 input characters, 1,200 output tokens
- No persistence of chat by the function (store:false)
- Server-side OPENAI_API_KEY exclusively

Do not add OPENAI_API_KEY to GitHub Actions, source assets, or Supabase database tables.
