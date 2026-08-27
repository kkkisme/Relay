# Desktop integration

Relay Core owns desktop operating-system changes. The GPUIX UI only reads typed capability state and submits settings over RPC.

## Support matrix

| Capability | Windows | macOS | Linux |
| --- | --- | --- | --- |
| System proxy | Current-user Internet Settings | `networksetup` web/secure proxy | GNOME `gsettings` HTTP/HTTPS proxy |
| Crash recovery | Atomic recovery document | Atomic recovery document | Atomic recovery document |
| TUN helper | SYSTEM startup task | Root LaunchDaemon | Root systemd service |
| TUN status | Native administrator state or Helper | Native root state or Helper | `/dev/net/tun` plus native capability or Helper |
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

## Privileged TUN helper

The Settings screen can install, repair, or uninstall Relay Helper through the operating system's authorization prompt. Windows registers a startup task under `SYSTEM`, macOS installs a root LaunchDaemon, and Linux installs a root systemd unit through `pkexec`. The UI and Relay Core remain unprivileged.

The helper exposes a loopback-only, token-authenticated control endpoint. Its protocol only permits status, start, and stop operations. At installation it copies the authorized Helper executable itself plus the same-directory packaged Mihomo into protected system directories and pins the Mihomo SHA-256 digest. Every start verifies that digest, rejects configurations outside Relay-managed storage, requires a loopback Mihomo controller with a strong secret, and stages root-owned runtime files in a separate system data directory. Windows removes inherited user ACLs from the system token/runtime directory. Linux additionally bounds the service to networking capabilities and mounts the rest of the system read-only.

Enabling or disabling TUN restarts Mihomo across the privilege boundary. If the privileged start fails, Relay restores the previous runtime and system-proxy state. Uninstalling the helper requires TUN to be disabled and removes its protected runtime data.

| Platform | Protected binaries | Privileged runtime |
| --- | --- | --- |
| Windows | `%ProgramFiles%\\Relay` | `%ProgramData%\\Relay\\runtime` |
| macOS | `/Library/PrivilegedHelperTools` | `/Library/Application Support/Relay/runtime` |
| Linux | `/usr/lib/relay` | `/var/lib/relay` |

Signing, notarization, installer packaging, and upgrade migration remain Phase 5 release work. A helper upgrade intentionally requires reinstalling the service so its protected binaries and pinned hash are refreshed.

GPUIX 0.5.1 does not expose a system-tray API or reliable window hide/show primitives. The UI therefore reports tray/background support as pending. When GPUIX adds those capabilities, they can be implemented behind `DesktopIntegration` without changing the Relay Core RPC boundary.
