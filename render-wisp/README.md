# Genesis Wisp on Render

Deploy the repository's `render.yaml` Blueprint. It creates one free Node web service named `genesis-wisp`, builds this directory with `npm ci --omit=dev`, starts `npm start`, and checks `/health`.

Once Render reports the service live, its dashboard provides the actual service URL. Verify `https://YOUR-ACTUAL-SERVICE.onrender.com/health`, then configure `wss://YOUR-ACTUAL-SERVICE.onrender.com/wisp/` in Genesis Account Settings → Browser proxy providers. The hostname must come from Render; no hostname is assumed or reserved by this configuration.

The default allowed browser origin is `https://genesisoss.lol`. To support another Genesis deployment, add its exact origin to the comma-separated `ALLOWED_ORIGINS` environment variable on Render. This is a browser-origin restriction, not account authentication. Private and loopback destinations, direct IP destinations, UDP, and non-web ports are disabled.

Render's free service sleeps after 15 idle minutes and can take about a minute to restart. Existing Genesis providers remain available while it wakes. Do not add synthetic keep-alive traffic to bypass the free service's idle behavior.

Local validation: `npm ci` followed by `npm test`. The test checks HTTP health, Wisp negotiation, rejected origins, and invalid upgrade routes. It does not verify Render deployment or external website browsing.

Wisp is provided by the unmodified `@mercuryworkshop/wisp-js` 0.5.0 package (LGPL-3.0); its license is included with the installed dependency. Source: https://github.com/MercuryWorkshop/wisp-js
