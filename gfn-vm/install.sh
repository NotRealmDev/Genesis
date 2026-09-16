#!/usr/bin/env bash
set -Eeuo pipefail

MIN_NVIDIA_DRIVER="580.126.07"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail(){ echo "Genesis GFN VM install: $*" >&2; exit 1; }
require_env(){ [[ -n "${!1:-}" ]] || fail "Missing required environment variable $1"; }
version_ge(){ printf '%s\n%s\n' "$2" "$1" | sort -V -C; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || fail "Run this installer as root"
require_env VM_DOMAIN
require_env GENESIS_ORIGIN
require_env SUPABASE_URL
require_env SUPABASE_ANON_KEY
require_env GENESIS_ADMIN_EMAIL

source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || fail "This appliance currently requires Ubuntu 24.04 LTS"
[[ "$(dpkg --print-architecture)" == "amd64" ]] || fail "This appliance currently requires amd64/x86_64"
command -v nvidia-smi >/dev/null 2>&1 || fail "No NVIDIA GPU/driver detected. Install a supported NVIDIA GPU driver first."
DRIVER_VERSION="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n1 | tr -d '[:space:]')"
version_ge "$DRIVER_VERSION" "$MIN_NVIDIA_DRIVER" || fail "NVIDIA driver $DRIVER_VERSION is older than required $MIN_NVIDIA_DRIVER"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl jq gnupg debian-keyring debian-archive-keyring apt-transport-https \
  flatpak openbox xserver-xorg-core x11-xserver-utils dbus-x11 pulseaudio wmctrl \
  nodejs npm vulkan-tools pciutils

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  apt-get update
  apt-get install -y caddy
fi

if ! id genesisvm >/dev/null 2>&1; then
  useradd --create-home --shell /usr/sbin/nologin genesisvm
fi
install -d -o genesisvm -g genesisvm -m 700 /var/lib/genesis-gfn/runtime /var/lib/genesis-gfn/runtime/pulse
install -d -o genesisvm -g genesisvm -m 755 /home/genesisvm/.config/openbox

# Official NVIDIA GeForce NOW Flatpak repository and app.
sudo -H -u genesisvm flatpak remote-add --user --if-not-exists GeForceNOW \
  https://international.download.nvidia.com/GFNLinux/flatpak/geforcenow.flatpakrepo
sudo -H -u genesisvm flatpak install --user --noninteractive -y GeForceNOW com.nvidia.geforcenow

# Latest Selkies release package built for Ubuntu 24.04.
SELKIES_TAG="$(curl -fsSL https://api.github.com/repos/selkies-project/selkies/releases/latest | jq -r '.tag_name')"
[[ -n "$SELKIES_TAG" && "$SELKIES_TAG" != "null" ]] || fail "Could not determine latest Selkies release"
SELKIES_VERSION="${SELKIES_TAG#v}"
SELKIES_PKG="selkies-${SELKIES_VERSION}-ubuntu24.04-amd64.deb"
curl -fL "https://github.com/selkies-project/selkies/releases/download/${SELKIES_TAG}/${SELKIES_PKG}" -o "/tmp/${SELKIES_PKG}"
apt-get install -y "/tmp/${SELKIES_PKG}"

install -d -m 755 /opt/genesis-gfn
install -m 644 "$SCRIPT_DIR/server.mjs" "$SCRIPT_DIR/lib.mjs" "$SCRIPT_DIR/package.json" /opt/genesis-gfn/
install -m 755 "$SCRIPT_DIR/start-session.sh" /opt/genesis-gfn/start-session.sh
cd /opt/genesis-gfn
npm install --omit=dev --no-audit --no-fund

SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"
cat >/etc/genesis-gfn.env <<EOF
PORT=3000
SELKIES_TARGET=http://127.0.0.1:8080
SUPABASE_URL=${SUPABASE_URL%/}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
GENESIS_ADMIN_EMAIL=${GENESIS_ADMIN_EMAIL}
GENESIS_ORIGIN=${GENESIS_ORIGIN%/}
VM_PUBLIC_ORIGIN=https://${VM_DOMAIN}
SESSION_SECRET=${SESSION_SECRET}
EOF
chmod 600 /etc/genesis-gfn.env

# Single-purpose Openbox profile: no root menu, launcher or desktop shortcuts.
cat >/home/genesisvm/.config/openbox/menu.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu xmlns="http://openbox.org/3.4/menu"></openbox_menu>
EOF
cat >/home/genesisvm/.config/openbox/rc.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <resistance><strength>10</strength><screen_edge_strength>20</screen_edge_strength></resistance>
  <focus><focusNew>yes</focusNew><followMouse>no</followMouse><focusLast>yes</focusLast><underMouse>no</underMouse><focusDelay>0</focusDelay><raiseOnFocus>no</raiseOnFocus></focus>
  <placement><policy>Smart</policy><center>yes</center></placement>
  <desktops><number>1</number><firstdesk>1</firstdesk><popupTime>0</popupTime></desktops>
  <keyboard></keyboard>
  <mouse><context name="Root"></context><context name="Desktop"></context></mouse>
  <applications>
    <application name="*geforce*" class="*geforce*" title="*GeForce*"><maximized>yes</maximized><fullscreen>yes</fullscreen><focus>yes</focus></application>
  </applications>
</openbox_config>
EOF
chown -R genesisvm:genesisvm /home/genesisvm/.config

# Configure a headless X11 display on the NVIDIA GPU.
if command -v nvidia-xconfig >/dev/null 2>&1; then
  nvidia-xconfig --allow-empty-initial-configuration --use-display-device=None --virtual=1920x1080 >/tmp/genesis-nvidia-xconfig.log 2>&1 || true
fi
if [[ ! -s /etc/X11/xorg.conf ]]; then
  cat >/etc/X11/xorg.conf <<'EOF'
Section "Device"
  Identifier "GenesisGPU"
  Driver "nvidia"
  Option "AllowEmptyInitialConfiguration" "True"
  Option "UseDisplayDevice" "None"
EndSection
Section "Screen"
  Identifier "GenesisScreen"
  Device "GenesisGPU"
  DefaultDepth 24
  SubSection "Display"
    Depth 24
    Virtual 1920 1080
  EndSubSection
EndSection
EOF
fi

XORG_BIN="$(command -v Xorg || true)"
[[ -n "$XORG_BIN" ]] || XORG_BIN="/usr/lib/xorg/Xorg"

cat >/etc/systemd/system/genesis-gfn-display.service <<EOF
[Unit]
Description=Genesis GFN headless X11 display
After=network.target

[Service]
Type=simple
ExecStart=${XORG_BIN} :20 -noreset -nolisten tcp -config /etc/X11/xorg.conf
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/genesis-gfn-session.service <<'EOF'
[Unit]
Description=Genesis GFN single-purpose desktop session
After=genesis-gfn-display.service
Requires=genesis-gfn-display.service

[Service]
Type=simple
User=genesisvm
Group=genesisvm
Environment=HOME=/home/genesisvm
Environment=DISPLAY=:20
Environment=XDG_RUNTIME_DIR=/var/lib/genesis-gfn/runtime
Environment=PULSE_RUNTIME_PATH=/var/lib/genesis-gfn/runtime/pulse
Environment=PULSE_SERVER=unix:/var/lib/genesis-gfn/runtime/pulse/native
ExecStart=/usr/bin/dbus-run-session -- /opt/genesis-gfn/start-session.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/genesis-gfn-selkies.service <<'EOF'
[Unit]
Description=Genesis GFN low-latency remote display
After=genesis-gfn-session.service
Requires=genesis-gfn-session.service

[Service]
Type=simple
User=genesisvm
Group=genesisvm
Environment=HOME=/home/genesisvm
Environment=DISPLAY=:20
Environment=XDG_RUNTIME_DIR=/var/lib/genesis-gfn/runtime
Environment=PULSE_RUNTIME_PATH=/var/lib/genesis-gfn/runtime/pulse
Environment=PULSE_SERVER=unix:/var/lib/genesis-gfn/runtime/pulse/native
ExecStart=/usr/bin/selkies --addr=127.0.0.1 --port=8080 --enable-https=false --enable-basic-auth=false --encoder=h264enc --enable-resize=true
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/genesis-gfn-gateway.service <<'EOF'
[Unit]
Description=Genesis GFN authenticated gateway
After=network-online.target genesis-gfn-selkies.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/genesis-gfn.env
WorkingDirectory=/opt/genesis-gfn
ExecStart=/usr/bin/node /opt/genesis-gfn/server.mjs
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/caddy/Caddyfile <<EOF
${VM_DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
EOF

systemctl daemon-reload
systemctl enable --now genesis-gfn-display genesis-gfn-session genesis-gfn-selkies genesis-gfn-gateway caddy

cat <<EOF

Genesis GFN VM installed.

Public VM endpoint: https://${VM_DOMAIN}/api/session
Genesis origin: ${GENESIS_ORIGIN%/}
GFN Linux client: com.nvidia.geforcenow
NVIDIA driver: ${DRIVER_VERSION}

Next:
1. Make sure DNS for ${VM_DOMAIN} points to this VM and ports 80/443 are open.
2. Run: ${SCRIPT_DIR}/verify.sh
3. Put https://${VM_DOMAIN}/api/session into window.GENESIS_VM.sessionEndpoint in Genesis.
EOF
