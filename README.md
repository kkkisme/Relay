<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Relay logo" />
</p>

<h1 align="center">Relay</h1>

<p align="center">A fast native Mihomo desktop client powered by GPUIX.</p>

## Download

Ready-to-run preview builds are available from [GitHub Releases](https://github.com/kkkisme/Relay/releases). The Windows x64 installer bundles Relay Core, Relay Helper, and Mihomo, so no separate runtime setup is required.

The current preview is not code-signed. Windows may show an unknown publisher or SmartScreen warning during installation.

Relay is an experimental desktop-first proxy client built with React, TypeScript, and [GPUIX](https://github.com/remorses/gpuix). The UI renders natively through Zed's GPUI stack rather than Electron or a WebView.

## Current milestone

The Mihomo feature-integration milestone is implemented, and the first desktop-integration slice is now available:

- Native GPUIX application shell with six working sections
- Dashboard traffic metrics and runtime controls
- Proxy selection and latency testing
- Profile activation, connection management, logs, and settings
- Simplified Chinese by default with live Simplified Chinese/English switching
- Strictly typed, newline-delimited RPC contract with timeouts and cancellation
- Standalone Relay Core process with reconnect backoff and Mihomo supervision
- Unix sockets on macOS/Linux and named pipes on Windows
- Live Mihomo metrics, proxy groups, connections, runtime settings, and process logs
- Remote subscription and local YAML import with Mihomo validation
- Persistent, immutable profile revisions with update and rollback controls
- Automatic restoration of the previous configuration when activation fails
- Atomic persistence for profiles and user runtime settings
- Platform-native application data and rotating Relay Core logs
- Reversible Windows, macOS, and GNOME system proxy management with crash recovery
- TUN capability and privilege reporting before the setting can be enabled
- Installable, token-authenticated privileged TUN helper with a pinned Mihomo binary hash
- Launch-at-login registration for Windows, macOS, and XDG desktops
- In-memory Mock Core retained for deterministic UI development

The remaining desktop work is tray/background-window behavior. The installed GPUIX release does not yet expose tray or window hide/show APIs, so Relay reports that boundary explicitly instead of emulating an Electron API. See [the roadmap](docs/ROADMAP.md) and [desktop integration notes](docs/DESKTOP_INTEGRATION.md).

## Architecture

```text
React + TypeScript
        │
      GPUIX
        │
 Relay UI + State
        │
 Typed Core SDK
        │
 Named Pipe / Unix Socket
        │
    Relay Core
        │
      Mihomo
```

The desktop core is intentionally separated from the UI. Every operation crosses a typed RPC boundary, so UI development can use the included Mock Core while process management, configuration validation, and Mihomo integration evolve independently.

## Tech stack

- React 19
- TypeScript
- GPUIX / GPUI
- Bun
- Mihomo

## Development

Requirements:

- Bun
- A Mihomo executable placed beside Relay or configured with `RELAY_MIHOMO_BINARY`

Install dependencies:

```bash
bun install
```

Run Relay with hot remount:

```bash
bun run dev
```

`bun run dev` first builds the standalone Relay Helper and Relay Core. Relay Core starts Mihomo automatically and creates a minimal bootstrap configuration when no profile has been supplied. Imported configurations are copied into managed storage and validated with `mihomo -t` before they can be activated. Relay injects its loopback controller and random secret into a separate runtime copy, leaving the imported revision unchanged. Installing the TUN helper requires the packaged Mihomo executable to sit beside `relay-helper`; arbitrary external binaries are deliberately rejected at the privilege boundary.

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `RELAY_MIHOMO_BINARY` | Absolute path to the Mihomo executable |
| `RELAY_MIHOMO_CONFIG` | Existing Mihomo YAML configuration |
| `RELAY_MIHOMO_CONFIG_DIR` | Mihomo working/configuration directory |
| `RELAY_MIHOMO_CONTROLLER` | Controller URL, defaulting to a random loopback port |
| `RELAY_MIHOMO_SECRET` | Controller bearer token, random by default |
| `RELAY_MIHOMO_AUTO_START=0` | Start Relay Core without starting Mihomo |
| `RELAY_PROFILE_DIR` | Managed profile and revision storage directory |
| `RELAY_DATA_DIR` | Persistent Relay settings directory |
| `RELAY_APP_BINARY` | Packaged Relay executable used for launch-at-login registration |
| `RELAY_HELPER_BINARY` | Packaged Relay Helper executable used for TUN service installation |
| `RELAY_CORE_MODE=mock` | Use the in-memory Mock Core instead of the child process |

Validate the project:

```bash
bun run typecheck
bun test
bun run build
```

The standalone executables are written to `dist/relay` and `dist/relay-core` (`.exe` on Windows).

## Status

Relay is in early development. The native control plane, real Relay Core transport, managed Mihomo profile lifecycle, recoverable system-proxy integration, privileged TUN runtime, and first installable Windows release are implemented. Tray/background behavior and release hardening remain under development.

## License

GPL-3.0. See [LICENSE](./LICENSE).
