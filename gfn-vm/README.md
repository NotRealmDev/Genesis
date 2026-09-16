# Genesis GeForce NOW VM

This folder contains the server-side appliance for the Genesis **VM** app.

The appliance is deliberately narrow: the remote machine launches **GeForce NOW only**. Game rendering happens on NVIDIA's GeForce NOW infrastructure, while the Genesis VM host runs the GeForce NOW client and streams that remote screen to the user's browser. The user's computer receives video/audio and sends input; the GeForce NOW client itself runs on the remote VM.

## Host requirements

Use a remote Ubuntu 24.04 LTS machine with:

- x86_64 CPU, 2+ cores
- 4 GB RAM minimum; 8 GB recommended for the extra remote-desktop layer
- an NVIDIA GPU with H.264/H.265 Vulkan video support
- NVIDIA driver 580.126.07 or newer
- enough network capacity for both the GFN stream and the VM stream
- a public DNS name such as `vm.example.com`

This is **not** a GitHub Pages workload. A real remote machine is required because GitHub Pages can only serve static files.

## What gets installed

`install.sh` prepares a dedicated `genesisvm` account and installs:

1. the official NVIDIA GeForce NOW Flatpak repository and `com.nvidia.geforcenow` app;
2. Selkies, an open-source low-latency HTML5 remote desktop;
3. a Genesis gateway (`server.mjs`) that verifies the existing Genesis Supabase admin session before issuing a short-lived VM viewer session;
4. Caddy for HTTPS and WebSocket proxying;
5. systemd services for a headless X11 session, Openbox, GeForce NOW and Selkies.

The remote session has no normal launcher, browser shortcut, terminal, file manager or general-purpose desktop UI. The custom Openbox configuration removes the root menu and keyboard launcher bindings, and the session service immediately runs GeForce NOW fullscreen.

## Configure

On the remote GPU VM, clone/copy this repository and run as root:

```bash
cd gfn-vm
sudo VM_DOMAIN=vm.example.com \
  GENESIS_ORIGIN=https://genesisos.lol \
  SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY \
  GENESIS_ADMIN_EMAIL=YOUR_ADMIN_EMAIL \
  ./install.sh
```

`install.sh` writes `/etc/genesis-gfn.env`, creates a random `SESSION_SECRET`, and starts the services.

Then set the Genesis client endpoint in `supabase-config.js`:

```js
window.GENESIS_VM.sessionEndpoint = "https://vm.example.com/api/session";
```

The VM app sends the logged-in Genesis admin access token to that endpoint. The gateway verifies the token with Supabase and checks the authenticated email against `GENESIS_ADMIN_EMAIL` before creating a viewer session.

## Verification

Run:

```bash
sudo ./verify.sh
```

The verifier checks the OS, GPU/driver, GeForce NOW install, X11 display, GFN process, Selkies, gateway, public HTTPS endpoint and repeats the network/service probes multiple times.

For the final live test, sign into Genesis as Admin, open **VM**, sign into GeForce NOW inside the remote session, start a game, then verify keyboard/mouse/controller/audio from the client device. Repository CI can thoroughly test the Genesis integration, authentication/session code and scripts, but it cannot replace this final GPU-host test because GitHub-hosted CI runners do not provide a supported live GeForce NOW GPU/display environment.
