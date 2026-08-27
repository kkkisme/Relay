# Relay

A fast native Mihomo desktop client powered by GPUIX.

Relay is an experimental desktop-first proxy client built with React, TypeScript, and [GPUIX](https://github.com/remorses/gpuix). The UI renders natively through Zed's GPUI stack rather than Electron or a WebView.

## Goals

- Native GPU-accelerated desktop UI
- Mihomo-compatible core integration
- Fast startup and low UI overhead
- Clean desktop-first interaction design
- Windows, macOS, and Linux support
- Profiles, proxy groups, delay testing, connections, logs, system proxy, and TUN

## Architecture

```text
React + TypeScript
        │
      GPUIX
        │
   Relay UI / State
        │
     Core SDK
        │
 Named Pipe / Unix Socket
        │
    Relay Core
        │
      Mihomo
```

The desktop core is intentionally separated from the UI. Relay's TypeScript layer communicates with the core through a small RPC client, keeping the React/GPUIX application independent from core process management.

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

Run Relay:

```bash
bun run dev
```

Type-check:

```bash
bun run typecheck
```

Build a standalone executable:

```bash
bun run build
```

## Status

Relay is in early development. The initial focus is the desktop application shell and the core RPC boundary.

## License

GPL-3.0. See [LICENSE](./LICENSE).
