# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenUsage is a macOS menu bar app that tracks AI coding subscription usage across providers (Claude, Cursor, Copilot, Gemini, etc.). Built with **Tauri 2** (Rust backend) + **React 19** (TypeScript frontend). Plugins run in sandboxed QuickJS runtimes.

## Common Commands

```bash
bun install                  # Install dependencies
bun run dev                  # Start Vite dev server + Tauri (dev mode)
bun run build                # TypeScript check + Vite build
bun tauri build              # Full Tauri release build
bun run bundle:plugins       # Copy plugins to src-tauri/resources/bundled_plugins/
bun run test                 # Run tests (Vitest)
bun run test:watch           # Tests in watch mode
bun run test:coverage        # Coverage report (90% threshold on branches/lines/functions/statements)
```

Before creating a PR, run `bun run test:coverage` — coverage minimums must pass.

## Architecture

### Three-layer architecture

1. **Frontend** (`src/`) — React + Zustand stores + Tailwind CSS. Vite dev server on port 1420.
2. **Backend** (`src-tauri/src/`) — Rust. Handles plugin execution, system tray, floating panel, IPC commands.
3. **Plugins** (`plugins/<provider-id>/`) — JavaScript files executed in isolated QuickJS sandboxes. Each plugin exports a `probe(ctx)` function that returns `{ lines: MetricLine[] }`.

### Frontend state (Zustand)

Three stores, each a single source of truth for its domain:
- `app-ui-store` — UI state (activeView, showAbout)
- `app-plugin-store` — Plugin metadata + per-plugin settings
- `app-preferences-store` — User preferences (theme, display, system settings)

Hooks in `src/hooks/app/` derive view models from stores. `App.tsx` composes all hooks. Use `useShallow()` for store subscriptions.

### Backend plugin engine (`src-tauri/src/plugin_engine/`)

- `mod.rs` — Initialize plugins (dev vs bundled vs installed)
- `manifest.rs` — Parse plugin.json
- `runtime.rs` — Execute plugin.js in QuickJS sandbox (~540 LOC)
- `host_api.rs` — Host APIs injected into plugin context (HTTP, filesystem, keychain, SQLite, ccusage, logging)

### IPC flow

1. Frontend calls `start_probe_batch()` via Tauri invoke
2. Backend spawns blocking task per plugin in QuickJS sandbox
3. Backend emits `probe:result` events per plugin, then `probe:batch-complete`

**Critical IPC rule**: JavaScript must send camelCase params (`{ batchId, pluginIds }`). Tauri auto-converts to Rust snake_case. Never send snake_case from JS — params silently won't match.

### Plugin structure

Each plugin lives in `plugins/<provider-id>/` with:
- `plugin.json` — Manifest (metadata, line declarations, brand color, links)
- `plugin.js` — Entry script exporting `probe(ctx)` via `globalThis.__openusage_plugin`
- `icon.svg` — Must use `fill="currentColor"` for theming

Host APIs available to plugins: `ctx.host.http.request()`, `ctx.host.fs.*()`, `ctx.host.keychain.*()`, `ctx.host.sqlite.*()`, `ctx.host.ccusage.query()`, `ctx.host.log.*()`. Line builders: `ctx.line.progress()`, `ctx.line.text()`, `ctx.line.badge()`. Formatters: `ctx.fmt.*()`.

## Key Conventions

- **Bun** as package manager and task runner (not npm/yarn)
- Keep files under ~400 LOC; split/refactor as needed
- Error handling: use explicit result types (not throw/try-catch) for expected issues. Throw for unexpected issues. Exception: external systems (git, gh) and React Query mutations may use try-catch/throw.
- Use `trash` for deletes, never `rm`
- Conventional git branches: `feat|fix|refactor|build|ci|chore|docs|style|perf|test`
- Push only when user asks; destructive git ops forbidden unless explicit
- Tests include both `src/**/*.test.{ts,tsx}` and `plugins/**/*.test.js`
- On plugin changes, audit exposed request/response fields against `host_api.rs` redaction lists
- Set `brandColor` in `plugin.json` to the provider's real brand color
- Before PR, ensure `README.md` lists all supported plugins
