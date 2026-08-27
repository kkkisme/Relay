<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Relay logo" />
</p>

<h1 align="center">Relay</h1>

<p align="center">A fast native Mihomo desktop client powered by GPUIX.</p>

Relay is an experimental desktop-first proxy client built with React, TypeScript, and [GPUIX](https://github.com/remorses/gpuix). The UI renders natively through Zed's GPUI stack rather than Electron or a WebView.

## Current milestone

The Mihomo feature-integration milestone is implemented:

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
- In-memory Mock Core retained for deterministic UI development

The next milestone adds desktop OS integration: system proxy recovery, TUN permissions, tray behavior, and launch at login. See [the roadmap](docs/ROADMAP.md).

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

`bun run dev` first builds the standalone Relay Core. Relay Core starts Mihomo automatically and creates a minimal bootstrap configuration when no profile has been supplied. Imported configurations are copied into managed storage and validated with `mihomo -t` before they can be activated. Relay injects its loopback controller and random secret into a separate runtime copy, leaving the imported revision unchanged.

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
| `RELAY_CORE_MODE=mock` | Use the in-memory Mock Core instead of the child process |

Validate the project:

```bash
bun run typecheck
bun test
bun run build
```

The standalone executables are written to `dist/relay` and `dist/relay-core` (`.exe` on Windows).

## Status

Relay is in early development. The native control plane, real Relay Core transport, and managed Mihomo profile lifecycle are implemented; desktop OS integration remains under development.

## License

GPL-3.0. See [LICENSE](./LICENSE).
