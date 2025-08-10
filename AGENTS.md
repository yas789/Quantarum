# Repository Guidelines

This repository hosts Quantarum’s local agent broker (Node.js 20+) under `agent-bus/`. Use this guide to navigate the codebase and contribute changes confidently.

## Project Structure & Module Organization
- `agent-bus/broker/`: HTTP server, config, logging, manifests loader (port defaults to `4000`).
- `agent-bus/adapters/`: Tool adapters (each folder exposes a `cli.js` and optional `manifest.yaml`).
- `agent-bus/broker/manifests/`: YAML manifests merged into `/capabilities`.
- `agent-bus/node_modules/`, `package.json`: Dependencies and scripts.
- `agent-bus/broker/logs/`: Runtime logs (ignored in commits).

## Build, Test, and Development Commands
- Install: `cd agent-bus && npm install`
- Run (dev, auto-reload): `npm run dev`
- Run (prod): `npm start`
- Health check: `curl http://localhost:4000/capabilities`
- Invoke example: `curl -X POST http://localhost:4000/invoke -H 'Content-Type: application/json' -d '{"tool":"fs","verb":"read","args":{"path":"/tmp/test.txt"}}'`

## Coding Style & Naming Conventions
- Language: Node.js (ES2019+), CommonJS modules.
- Indentation: 2 spaces; semicolons; single quotes; small, pure functions.
- Folders: lowercase with hyphens/underscores (e.g., `calendar_local`).
- Adapters: place code in `adapters/<tool>/cli.js`; manifest as `adapters/<tool>/manifest.yaml`.

## Testing Guidelines
- Current state: no formal test runner wired (`npm test` is a placeholder).
- Preferred: add smoke tests (e.g., `supertest` for `/capabilities` and `/invoke`). Use `__tests__/*.test.js` and update `package.json` to run them.
- Manual checks: call adapter CLIs directly (e.g., `./adapters/fs/cli.js '{"verb":"read","args":{"path":"/etc/hosts"}}'`).

## Commit & Pull Request Guidelines
- Commits: use Conventional-style prefixes seen in history: `Feat:`, `Fix:`, `Refactor:`, `Update:`; imperative mood; concise subject (<72 chars).
- PRs: clear description, linked issues (`closes #123`), test plan (curl steps or screenshots/logs), and note any breaking changes or new env vars.

## Security & Configuration Tips
- Env: configure via `.env` in `agent-bus/` (`PORT`, `LOG_LEVEL`, `NODE_ENV`, `TRUST_PROXY`).
- Outlook adapter: set `AZURE_CLIENT_ID`; device-code tokens are cached at `agent-bus/broker/.token-cache.json`—do not commit this file.
- Sensitive verbs can require confirmation via manifest (`confirm: true`). Keep operations least-privileged and local.

