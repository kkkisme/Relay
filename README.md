<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Relay logo" />
</p>

<h1 align="center">Relay</h1>

<p align="center">A fast native Mihomo desktop client powered by GPUIX.</p>

Relay is an experimental desktop-first proxy client built with React, TypeScript, and [GPUIX](https://github.com/remorses/gpuix). The UI renders natively through Zed's GPUI stack rather than Electron or a WebView.

## Current milestone

The first control-plane milestone is implemented:

- Native GPUIX application shell with six working sections
- Dashboard traffic metrics and runtime controls
- Proxy selection and latency testing
- Profile activation, connection management, logs, and settings
- Simplified Chinese by default with live Simplified Chinese/English switching
- Strictly typed RPC contract and replaceable transport boundary
- In-memory Mock Core for UI development before the native transport lands

The next milestone replaces `MockCoreTransport` with the named-pipe/Unix-socket transport and connects the UI to the real Relay Core process. See [the roadmap](docs/ROADMAP.md).

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

Install dependencies:

```bash
bun install
```

Run Relay with hot remount:

```bash
bun run dev
```

Validate the project:

```bash
bun run typecheck
bun run build
```

The standalone executable is written to `dist/relay` (`dist/relay.exe` on Windows).

## Status

Relay is in early development. The native UI control plane and typed Core SDK boundary are ready; the real core transport is the next implementation target.

## License

GPL-3.0. See [LICENSE](./LICENSE).
