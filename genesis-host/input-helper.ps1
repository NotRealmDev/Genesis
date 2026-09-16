$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class GenesisInput {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public const uint KEYUP = 0x0002;
  public const uint MOVE = 0x0001;
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, RIGHTDOWN = 0x0008, RIGHTUP = 0x0010, MIDDLEDOWN = 0x0020, MIDDLEUP = 0x0040, WHEEL = 0x0800;
  public static void Key(int vk, bool down) { keybd_event((byte)vk, 0, down ? 0u : KEYUP, UIntPtr.Zero); }
  public static void MoveRelative(int dx, int dy) { mouse_event(MOVE, dx, dy, 0, UIntPtr.Zero); }
  public static void MoveNormalized(double x, double y) {
    int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
    SetCursorPos(Math.Max(0, Math.Min(w-1, (int)Math.Round(x*(w-1)))), Math.Max(0, Math.Min(h-1, (int)Math.Round(y*(h-1)))));
  }
  public static void Button(int button, bool down) {
    uint flag = button == 2 ? (down ? RIGHTDOWN : RIGHTUP) : button == 1 ? (down ? MIDDLEDOWN : MIDDLEUP) : (down ? LEFTDOWN : LEFTUP);
    mouse_event(flag,0,0,0,UIntPtr.Zero);
  }
  public static void Wheel(int delta) { mouse_event(WHEEL,0,0,(uint)delta,UIntPtr.Zero); }
  public static bool FocusGeForce() {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd,lParam) => {
      if(!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512); GetWindowText(hWnd,sb,sb.Capacity);
      string title = sb.ToString();
      if(title.IndexOf("GeForce NOW",StringComparison.OrdinalIgnoreCase)>=0 || title.IndexOf("NVIDIA GeForce NOW",StringComparison.OrdinalIgnoreCase)>=0){ found=hWnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found != IntPtr.Zero && SetForegroundWindow(found);
  }
}
"@

$vk = @{
  'Backspace'=0x08;'Tab'=0x09;'Enter'=0x0D;'ShiftLeft'=0x10;'ShiftRight'=0x10;'ControlLeft'=0x11;'ControlRight'=0x11;'AltLeft'=0x12;'AltRight'=0x12;'Pause'=0x13;'CapsLock'=0x14;'Escape'=0x1B;'Space'=0x20;
  'PageUp'=0x21;'PageDown'=0x22;'End'=0x23;'Home'=0x24;'ArrowLeft'=0x25;'ArrowUp'=0x26;'ArrowRight'=0x27;'ArrowDown'=0x28;'Insert'=0x2D;'Delete'=0x2E;
  'Digit0'=0x30;'Digit1'=0x31;'Digit2'=0x32;'Digit3'=0x33;'Digit4'=0x34;'Digit5'=0x35;'Digit6'=0x36;'Digit7'=0x37;'Digit8'=0x38;'Digit9'=0x39;
  'KeyA'=0x41;'KeyB'=0x42;'KeyC'=0x43;'KeyD'=0x44;'KeyE'=0x45;'KeyF'=0x46;'KeyG'=0x47;'KeyH'=0x48;'KeyI'=0x49;'KeyJ'=0x4A;'KeyK'=0x4B;'KeyL'=0x4C;'KeyM'=0x4D;'KeyN'=0x4E;'KeyO'=0x4F;'KeyP'=0x50;'KeyQ'=0x51;'KeyR'=0x52;'KeyS'=0x53;'KeyT'=0x54;'KeyU'=0x55;'KeyV'=0x56;'KeyW'=0x57;'KeyX'=0x58;'KeyY'=0x59;'KeyZ'=0x5A;
  'MetaLeft'=0x5B;'MetaRight'=0x5C;
  'Numpad0'=0x60;'Numpad1'=0x61;'Numpad2'=0x62;'Numpad3'=0x63;'Numpad4'=0x64;'Numpad5'=0x65;'Numpad6'=0x66;'Numpad7'=0x67;'Numpad8'=0x68;'Numpad9'=0x69;'NumpadMultiply'=0x6A;'NumpadAdd'=0x6B;'NumpadSubtract'=0x6D;'NumpadDecimal'=0x6E;'NumpadDivide'=0x6F;
  'F1'=0x70;'F2'=0x71;'F3'=0x72;'F4'=0x73;'F5'=0x74;'F6'=0x75;'F7'=0x76;'F8'=0x77;'F9'=0x78;'F10'=0x79;'F11'=0x7A;'F12'=0x7B;
  'Semicolon'=0xBA;'Equal'=0xBB;'Comma'=0xBC;'Minus'=0xBD;'Period'=0xBE;'Slash'=0xBF;'Backquote'=0xC0;'BracketLeft'=0xDB;'Backslash'=0xDC;'BracketRight'=0xDD;'Quote'=0xDE
}

$held = New-Object System.Collections.Generic.HashSet[string]
$mouseLeft=$false; $mouseRight=$false

function Release-All {
  foreach($code in @($held)){
    if($vk.ContainsKey($code)){ [GenesisInput]::Key([int]$vk[$code],$false) }
  }
  $held.Clear()
  if($mouseLeft){[GenesisInput]::Button(0,$false);$mouseLeft=$false}
  if($mouseRight){[GenesisInput]::Button(2,$false);$mouseRight=$false}
}

while(($line=[Console]::In.ReadLine()) -ne $null){
  if([string]::IsNullOrWhiteSpace($line)){ continue }
  try { $m=$line | ConvertFrom-Json } catch { continue }
  try {
    switch($m.type){
      'focus' { [void][GenesisInput]::FocusGeForce() }
      'release-all' { Release-All }
      'key' {
        $code=[string]$m.code
        if(!$vk.ContainsKey($code)){ continue }
        $down=([string]$m.event -ne 'up')
        [GenesisInput]::Key([int]$vk[$code],$down)
        if($down){[void]$held.Add($code)}else{[void]$held.Remove($code)}
      }
      'pointer' {
        $event=[string]$m.event
        if($event -eq 'move'){
          if([bool]$m.locked){[GenesisInput]::MoveRelative([int][Math]::Round([double]$m.movementX),[int][Math]::Round([double]$m.movementY))}
          else{[GenesisInput]::MoveNormalized([double]$m.x,[double]$m.y)}
        } elseif($event -eq 'down'){
          [GenesisInput]::Button([int]$m.button,$true)
        } elseif($event -eq 'up'){
          [GenesisInput]::Button([int]$m.button,$false)
        } elseif($event -eq 'wheel'){
          $wheel=[int]([Math]::Round(-[double]$m.deltaY*2.4)); if($wheel -ne 0){[GenesisInput]::Wheel($wheel)}
        }
      }
      'gamepad-mouse' {
        $newLeft=[bool]$m.left; $newRight=[bool]$m.right
        if($newLeft -ne $mouseLeft){[GenesisInput]::Button(0,$newLeft);$mouseLeft=$newLeft}
        if($newRight -ne $mouseRight){[GenesisInput]::Button(2,$newRight);$mouseRight=$newRight}
      }
    }
  } catch {}
}
Release-All
