#!/usr/bin/env bash
set -u

MIN_NVIDIA_DRIVER="580.126.07"
FAILURES=0
PASSES=0

pass(){ echo "[PASS] $*"; PASSES=$((PASSES+1)); }
fail(){ echo "[FAIL] $*" >&2; FAILURES=$((FAILURES+1)); }
version_ge(){ printf '%s\n%s\n' "$2" "$1" | sort -V -C; }
check_cmd(){ command -v "$1" >/dev/null 2>&1 && pass "$1 installed" || fail "$1 missing"; }

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] && pass "Ubuntu 24.04 LTS" || fail "Expected Ubuntu 24.04 LTS, found ${PRETTY_NAME:-unknown}"
else
  fail "/etc/os-release missing"
fi

for cmd in curl jq flatpak nvidia-smi vulkaninfo xdpyinfo wmctrl selkies node systemctl; do check_cmd "$cmd"; done

if command -v nvidia-smi >/dev/null 2>&1; then
  DRIVER="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -n1 | tr -d '[:space:]')"
  if [[ -n "$DRIVER" ]] && version_ge "$DRIVER" "$MIN_NVIDIA_DRIVER"; then pass "NVIDIA driver $DRIVER >= $MIN_NVIDIA_DRIVER"; else fail "NVIDIA driver $DRIVER is below $MIN_NVIDIA_DRIVER"; fi
  GPU="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1)"
  [[ -n "$GPU" ]] && pass "GPU detected: $GPU" || fail "GPU name unavailable"
fi

if command -v vulkaninfo >/dev/null 2>&1; then
  vulkaninfo --summary >/tmp/genesis-vulkan-summary.txt 2>&1 && pass "Vulkan initializes" || fail "Vulkan initialization failed"
fi

if sudo -H -u genesisvm flatpak info --user com.nvidia.geforcenow >/dev/null 2>&1; then pass "Official GeForce NOW Flatpak installed"; else fail "GeForce NOW Flatpak is not installed for genesisvm"; fi

for svc in genesis-gfn-display genesis-gfn-session genesis-gfn-selkies genesis-gfn-gateway caddy; do
  systemctl is-active --quiet "$svc" && pass "$svc active" || fail "$svc inactive"
done

DISPLAY=:20 xdpyinfo >/dev/null 2>&1 && pass "X11 display :20 reachable" || fail "X11 display :20 unavailable"
pgrep -af 'com\.nvidia\.geforcenow|GeForceNOW' >/dev/null 2>&1 && pass "GeForce NOW process running" || fail "GeForce NOW process not detected"

# Repeat health checks to catch services that start once and then flap.
for i in $(seq 1 10); do
  curl -fsS --max-time 4 http://127.0.0.1:8080/ >/dev/null 2>&1 && pass "Selkies check $i/10" || fail "Selkies check $i/10"
  curl -fsS --max-time 4 http://127.0.0.1:3000/health >/dev/null 2>&1 && pass "Gateway check $i/10" || fail "Gateway check $i/10"
  curl -fsS --max-time 6 https://play.geforcenow.com/ >/dev/null 2>&1 && pass "GeForce NOW network check $i/10" || fail "GeForce NOW network check $i/10"
  sleep 1
done

if [[ -r /etc/genesis-gfn.env ]]; then
  # shellcheck disable=SC1091
  . /etc/genesis-gfn.env
  if [[ -n "${VM_PUBLIC_ORIGIN:-}" ]]; then
    for i in $(seq 1 5); do
      curl -fsS --max-time 8 "${VM_PUBLIC_ORIGIN%/}/health" >/dev/null 2>&1 && pass "Public HTTPS VM check $i/5" || fail "Public HTTPS VM check $i/5"
      sleep 1
    done
  fi
else
  fail "/etc/genesis-gfn.env missing"
fi

echo
echo "Genesis GFN VM verification: $PASSES passed, $FAILURES failed"
if (( FAILURES > 0 )); then exit 1; fi

echo "Automated checks passed. Final verification still requires opening Genesis > VM and starting a real GeForce NOW game to test the live NVIDIA session, audio and input path."
