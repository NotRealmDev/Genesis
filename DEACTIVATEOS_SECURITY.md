# DeactivateOS access hardening — activation checklist

This patch is intentionally pending deployment. The live project had zero Supabase Auth users at inspection time. Enforcing admin access before provisioning an owner would prevent every administrator from approving IDs.

## Required owner setup

1. Create the owner's permanent Supabase Auth account through the Dashboard or a trusted Auth Admin API. Do not use the shared password embedded in the website.
2. Set that user's app_metadata.role to "admin" through trusted administration. Do not put the role in user_metadata.
3. Set GENESIS_BACKEND.adminEmail in supabase-config.js to that account's email.
4. Verify password sign-in and the admin JWT, then apply DEACTIVATEOS_SECURITY.sql and deploy the frontend together.
5. Test anonymous and non-admin reactivation rejection, pending new IDs, existing approved IDs, and deactivation/reactivation with a real admin. Run Supabase security advisors after deployment.

## Changes

- New device tokens start inactive and require admin approval. Clearing site data no longer automatically obtains approved access through registration.
- The status-changing RPC requires a real authenticated administrator, checked against current server-owned app metadata.
- Login verification failures and missing device records deny access.
- Admin login no longer accepts the public client-side password as authority.
- Existing device approvals remain unchanged.

## Scope and remaining work

Browser IDs are bearer tokens, not people. This patch prevents automatic approval of replacement IDs, but does not make anonymous browser identity non-transferable. Individual approved user accounts and account-linked deactivation are needed to enforce a ban across devices.

Genesis is served as public static HTML. Client JavaScript checks cannot prevent somebody from downloading or modifying that public UI. Protected backend APIs, Realtime channels, and any private content need per-user server authorization. Existing public Realtime messaging and unrelated announcement RPCs are not secured by this patch.

Validation so far: inline scripts compile; five isolated login-gate cases cover approved, deactivated, missing-record, network-error, and unconfigured-backend outcomes. No live DDL has been applied or claimed verified. The execution workspace was unavailable during preparation.
