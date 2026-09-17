# Admin Test app

Experimental read-only screen mirroring, independent of the GeForce NOW VM.
No Python program, Windows capture script, HTTP iframe, or Genesis Host download
is needed. Both devices use the HTTPS Genesis website and its existing Supabase
Realtime service for signaling. Video is sent directly via WebRTC.

1. Sign into Genesis as admin on the PC in Chrome or Edge.
2. Double-click **Test**, click **Share PC screen**, and choose **Entire screen**.
3. Copy the Test key. Keep the Test window and PC browser running.
4. Sign into Genesis as admin on the Chromebook. Open **Test**, paste the key,
   and click **Connect**. Select **Fullscreen** if desired.
   Fullscreen shows only the mirrored display and a floating **Exit** button.
   Click **Exit** (or press Escape) to restore the mirror settings without
   disconnecting the stream.
5. Use **Stop** on the PC to end capture. Closing Test, logging out, losing the
   admin role, or leaving the page also stops capture.

Targets 720p/60 FPS, with an actual decoded-FPS readout. It does not guarantee
60 FPS, support audio/remote control, or extend the desktop. Motion should be
used when testing FPS; static screens may generate fewer frames. The browser
permission picker is always required. Protected video may appear black.

The previous downloadable app required local HTTP connectivity and could not
be embedded reliably on an HTTPS site. This version removes those dependencies;
it does not establish the exact cause of the user's earlier unspecified error.
No TURN relay is configured: some network routes can still fail. Errors and
timeouts are shown instead of calling a blank player connected.

The icon/app/actions follow Genesis's existing client-side admin role checks.
This is not new server-enforced admin authorization: the long random Test key
is the pairing credential for the broadcast topic. Keep it private; anyone who
obtains it and can use the signaling service may request a stream. One viewer
at a time. Sharing exposes all visible content on the chosen screen. Stop the
stream before showing private information.
