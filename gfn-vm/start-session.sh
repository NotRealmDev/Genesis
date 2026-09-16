#!/usr/bin/env bash
set -Eeuo pipefail

export HOME="${HOME:-/home/genesisvm}"
export DISPLAY="${DISPLAY:-:20}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/var/lib/genesis-gfn/runtime}"
export PULSE_RUNTIME_PATH="${PULSE_RUNTIME_PATH:-$XDG_RUNTIME_DIR/pulse}"
export PULSE_SERVER="${PULSE_SERVER:-unix:$PULSE_RUNTIME_PATH/native}"

mkdir -p "$XDG_RUNTIME_DIR" "$PULSE_RUNTIME_PATH" "$HOME/.config/openbox"
chmod 700 "$XDG_RUNTIME_DIR" "$PULSE_RUNTIME_PATH" || true

for _ in $(seq 1 60); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
  echo "Genesis GFN VM: X11 display $DISPLAY did not become ready" >&2
  exit 1
fi

pulseaudio --start --exit-idle-time=-1 >/dev/null 2>&1 || true
openbox --config-file "$HOME/.config/openbox/rc.xml" >/tmp/genesis-openbox.log 2>&1 &

# Keep the appliance single-purpose. If GeForce NOW exits, relaunch it instead
# of exposing a shell or general desktop.
while true; do
  flatpak run --user com.nvidia.geforcenow >/tmp/genesis-gfn.log 2>&1 &
  gfn_pid=$!

  # Maximize/fullscreen the GFN window as soon as it appears. The exact title
  # can change between releases, so match both common forms.
  for _ in $(seq 1 90); do
    if ! kill -0 "$gfn_pid" 2>/dev/null; then break; fi
    wmctrl -r "GeForce NOW" -b add,maximized_vert,maximized_horz,fullscreen >/dev/null 2>&1 || \
      wmctrl -r "GeForceNOW" -b add,maximized_vert,maximized_horz,fullscreen >/dev/null 2>&1 || true
    if wmctrl -l 2>/dev/null | grep -Eqi 'GeForce[[:space:]]*NOW'; then break; fi
    sleep 1
  done

  wait "$gfn_pid" || true
  sleep 2
done
