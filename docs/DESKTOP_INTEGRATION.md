# Desktop integration

Relay Core owns desktop operating-system changes. The GPUIX UI only reads typed capability state and submits settings over RPC.

## Support matrix

| Capability | Windows | macOS | Linux |
| --- | --- | --- | --- |
| System proxy | Current-user Internet Settings | `networksetup` web/secure proxy | GNOME `gsettings` HTTP/HTTPS proxy |
| Crash recovery | Atomic recovery document | Atomic recovery document | Atomic recovery document |
| TUN status | Administrator/Wintun readiness | Root or privileged-helper boundary | `/dev/net/tun` and privilege boundary |
| Launch at login | HKCU Run key | Per-user LaunchAgent | XDG autostart entry |
| Tray/background | Pending GPUIX API | Pending GPUIX API | Pending GPUIX API |

## System proxy recovery

Before Relay changes a system proxy, it captures the current platform state and atomically writes `system-proxy-recovery.json`. Relay restores that exact state when the user disables the setting, the Mihomo child exits unexpectedly, or Relay Core starts after an interrupted session. The recovery document is removed only after restoration succeeds, so a failed cleanup remains recoverable on the next launch.

The adapter never modifies an imported Mihomo profile. It reads the active runtime `mixed-port` (falling back to HTTP or SOCKS port), then points supported system proxy settings at `127.0.0.1`.

## Storage

| Platform | Configuration and profiles | Logs |
| --- | --- | --- |
| Windows | `%APPDATA%\\Relay` | `%APPDATA%\\Relay\\logs` |
| macOS | `~/Library/Application Support/Relay` | `~/Library/Application Support/Relay/logs` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/relay` | `${XDG_STATE_HOME:-~/.local/state}/relay/logs` |

`relay-core.log` rotates at 5 MiB and retains three previous files. `RELAY_DATA_DIR`, `RELAY_PROFILE_DIR`, and `RELAY_MIHOMO_CONFIG_DIR` remain available for explicit overrides.

## Deliberate capability boundaries

Relay currently detects whether TUN can be enabled safely, but it does not install a privileged helper, change executable capabilities, or elevate itself. Those operations require signed/package-specific workflows and remain a separate release milestone.

GPUIX 0.5.1 does not expose a system-tray API or reliable window hide/show primitives. The UI therefore reports tray/background support as pending. When GPUIX adds those capabilities, they can be implemented behind `DesktopIntegration` without changing the Relay Core RPC boundary.
