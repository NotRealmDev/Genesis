# Server login and automatic suspension — staged cutover

## Status

The owner account is confirmed, the existing password has been verified against Supabase Auth, and the server migration has been applied. Live checks verified administrator access and rejection of anonymous reactivation. A rollback-only test verified suspension and incident recording without changing the owner's role or leaving an incident behind. Frontend publication is tracked by PR #67. Existing shared logins are replaced with approved server accounts. This patch replaces the narrower draft in PR #65; do not apply both SQL files.

## Behavior

- Password verification happens through Supabase Auth. The login page no longer contains shared passwords, offline password hashes, or an admin-password bypass.
- Intro, OS, and browser entry pages verify the server session and account approval. Local storage flags are display compatibility data, never authorization.
- Browser resets do not obtain a new identity: the database assigns one ID per verified account. New accounts require approval.
- A server-observed attempt by a non-admin authenticated account to change an ID's status or publish an admin announcement suspends that same account. The account comes from the signed session, never a supplied target ID.
- The denied operation returns a denial rather than raising an exception, so the suspension and incident survive transaction completion.
- Verified admins see an in-app security alert, normally on the next 10-second poll. Incidents remain in an admin-readable database table. No email, Slack, or external messages are sent.
- Invalid passwords, network failures, opening developer tools, DOM edits, and changing a browser preference do not trigger suspension.
- Admin reactivation restores a suspended account. Account approval and roles are stored server-side; user-editable metadata is never used for permission checks.

## Activation prerequisites

1. Identify the owner's valid email. Create and verify a real Supabase Auth account using the Dashboard or trusted Auth Admin API, then set `GENESIS_BACKEND.adminEmail` to that email. The login accepts the existing `Admin` username and maps it to this server-side account. The user requested retaining the existing password; it was previously public and should subsequently be changed. The old placeholder `admin@genesisos.lol` was rejected by Auth signup, so a valid owner email is still required.
2. Set that verified owner's `app_metadata.role` to `admin` using trusted server-side administration. Keep public signup disabled or require manual approval for all new accounts.
3. Provision individual accounts for existing users. The frontend now accepts account email and password. Existing browser-only IDs are retained as legacy records; bans cannot reliably be matched to people without linking their verified accounts.
4. Apply `GENESIS_AUTH_SECURITY.sql` and deploy the matching frontend together. The file is an initial cutover script, not a repeatable migration. Generate the recorded migration with the installed Supabase CLI during activation.
5. Verify owner sign-in, account approval, revoked-session rejection, suspension, admin alert delivery, and admin reactivation against the live backend. Run security advisors after applying.
6. Rotate every credential previously embedded in the public frontend. Removing it from new files does not remove copies or Git history.

## Validation

An isolated PostgreSQL-compatible PGlite database test exercises the actual SQL: anonymous status writes fail, non-admin privileged requests suspend only their own verified account, alerts persist and are visible only to admins, browser-token replacement preserves the account ID, reactivation works, and deleted sessions lose access. This test uses synthetic auth fixtures, not production Supabase infrastructure.

Client tests verify forged local flags cannot sign in, passwords are sent only to Auth and are not stored, identity mismatches and verification outages deny access, ordinary failed sign-ins never request suspension, and entrypoint scripts compile. Run:

```
npm install --no-save --no-package-lock @electric-sql/pglite@0.3.14
node --test tests/auth-database.test.mjs tests/login-presence.test.mjs tests/os-features.test.mjs
```

`tests/auth-ui.e2e.mjs` uses Playwright with a simulated Auth backend to verify the normal Admin username reaches DeactivateOS and forged browser storage flags remain locked out. The live password and admin-role checks were performed separately through Supabase Auth and the protected access RPC.

The security advisor's private-table/no-policy informational notice is intentional: `genesis_private.account_access` denies all direct client access. Auth's leaked-password protection remains disabled; the owner explicitly requested retaining the previously public password, which should be replaced subsequently.

## Boundaries

Public static HTML can always be downloaded, inspected, and modified locally. This protects the patched database operations and the normal application entrance; it cannot make a public static website impossible to copy. The public proxy endpoint, independently accessible game assets, and existing public Realtime channels require their own server authorization if they must be restricted. Do not claim those services are protected by this patch.

Detection is limited to the protected server operations. A browser-side detector can be removed, so arbitrary local edits are deliberately not described as reliably detectable or ban-worthy.
