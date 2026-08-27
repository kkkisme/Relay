# Relay roadmap

Relay follows a vertical-slice plan: keep the native UI usable with a Mock Core, then replace one boundary at a time until the same screens operate a real Mihomo process.

## Phase 0 — Bootstrap ✅

- Create the Bun, React, TypeScript, and GPUIX application shell
- Establish the UI/Core process boundary
- Add project identity and icon

## Phase 1 — Native control plane ✅

- Build Dashboard, Proxies, Profiles, Connections, Logs, and Settings
- Add Simplified Chinese and English interface localization
- Define typed domain models and RPC methods
- Add a replaceable `CoreTransport` interface
- Add Mock Core state, events, and mutations for independent UI work
- Validate with strict TypeScript and a standalone Bun build

## Phase 2 — Relay Core transport ✅

- Start and supervise the Relay Core child process
- Implement newline-delimited RPC over named pipes on Windows and Unix sockets on macOS/Linux
- Add connection lifecycle, request timeouts, cancellation, and reconnect backoff
- Stream core events, traffic metrics, connections, and logs to the UI
- Keep the Mock Core available for development and deterministic tests

Relay Core is compiled as a separate Bun executable. It owns Mihomo's lifecycle and is the only process allowed to call the Mihomo controller API.

## Phase 3 — Mihomo feature integration ✅

- Import remote subscriptions and local YAML profiles
- Validate, activate, update, and roll back configurations
- Read proxy groups and select nodes
- Run URL tests and surface errors per node
- Query and close live connections
- Persist user settings safely

Profiles are copied into Relay-managed storage, validated by Mihomo before use, and tracked as immutable revisions. Active-profile failures automatically restore the last working revision.

## Phase 4 — Desktop integration

- System proxy lifecycle with crash recovery
- TUN installation, permissions, and state management
- Tray menu, launch at login, and background operation
- Platform-specific paths, logs, and update handling

## Phase 5 — Release quality

- GPU renderer interaction tests for critical flows
- Core contract and transport integration tests
- Windows, macOS, and Linux packaging
- Signed artifacts, release automation, and upgrade migration
- Performance, accessibility, and failure-recovery passes

## Architecture rule

UI components must not call Mihomo directly. All core operations go through `CoreClient` and `CoreTransport`; this keeps the GPUIX app testable and prevents platform/process concerns from leaking into screens.
