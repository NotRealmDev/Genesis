# Genesis Host

Genesis Host is the Windows-side companion for the **VM** app in Genesis.

It is intentionally narrow: the host opens GeForce NOW in a dedicated persistent Chrome/Edge profile, captures only the GeForce NOW window, and streams that window to a Genesis Admin over WebRTC. The host computer does **not** render the game itself; NVIDIA GeForce NOW remains the game-rendering service.

## Flow

1. Run `Genesis Host.exe` on the Windows computer that will host the session.
2. Genesis Host opens `https://play.geforcenow.com/` in Chrome or Microsoft Edge using a persistent browser profile.
3. Copy the long **Host Key** from Genesis Host.
4. Log into Genesis as Admin and open **VM**.
5. Paste the Host Key once and select **Connect**.
6. Genesis and the Host app use the existing Supabase Realtime backend only to exchange WebRTC signaling messages.
7. Video/audio flow directly over WebRTC. Keyboard, mouse, and basic gamepad-to-keyboard/mouse mappings travel over a WebRTC data channel.

## Security model

- The VM icon remains admin-only in Genesis.
- The Host Key is 192 bits of random data and functions as the private signaling-channel identifier.
- Genesis includes the current Supabase Admin access token in the offer; Genesis Host verifies it with Supabase Auth before streaming.
- The Windows input bridge accepts only normalized keyboard/mouse/focus messages. It has no shell/command execution message type.
- Genesis Host asks Electron to capture a window whose title identifies GeForce NOW. It deliberately does not fall back to capturing the whole desktop.
- Regenerating the Host Key immediately creates a new private signaling channel. Paste the new key into Genesis afterward.

## Network notes

The first version uses public STUN servers and a direct peer-to-peer WebRTC connection. This works on many home networks and avoids opening router ports. Some restrictive/corporate/mobile networks require a TURN relay; when that happens Genesis shows a connection-failed message rather than silently falling back to another desktop or service.

## Development

```powershell
cd genesis-host
npm install
npm start
```

Build the portable Windows executable:

```powershell
npm run dist
```

GitHub Actions runs the host unit suite 10 times and builds `Genesis-Host-*-Windows-x64.exe` as the `Genesis-Host-Windows` artifact.

## GeForce NOW login persistence

Chrome/Edge is started with a dedicated profile under the Genesis Host app-data directory. GeForce NOW and identity-provider cookies stored by that browser profile can therefore persist between Host launches, subject to the sites' own expiration/security rules.

## Controls

- Click the stream to focus it.
- Double-click the stream for browser pointer lock (useful for relative-mouse games).
- Keyboard and mouse are sent to the focused GeForce NOW window.
- A connected browser gamepad is mapped to common keyboard/mouse controls for compatibility. Native virtual-Xbox-controller emulation is not included in this first host build.
