# AI Coding Agent Instructions for ProjectDD

## Overview
- Monorepo-style workspace with two main parts:
  - `client/` (frontend): React + Vite.
  - `server/` (backend): Node.js Express server exposing `GET /api` on port `8080`.
- Dev communication: client calls backend via Vite dev proxy (`/api` → `http://localhost:8080`). Avoid hardcoding full URLs in client during dev.

## Key Directories & Files
- Client: `client/`
  - Entry: `src/main.jsx`, root component: `src/App.jsx`.
  - Styles: `src/App.css`, `src/index.css`.
  - Dev config: `vite.config.js` (contains proxy for `/api`).
- Server: `server/`
  - Entrypoint: `server.js` (Express app, `GET /api` returns `{ message: "Hello from the server!" }`).
  - Scripts: `package.json` (`start`: `node server`, `dev`: `nodemon server`).

## Run & Debug Workflows
- Backend (from `server/`):
  - Install: `npm install`
  - Start: `npm run start` (or dev hot-reload: `npm run dev` after `npm i -D nodemon`).
  - Endpoint: `http://localhost:8080/api` returns JSON.
- Frontend (from `client/`):
  - Install: `npm install`
  - Start: `npm run dev` (Vite dev server, usually on `http://localhost:5173`).
  - Client fetches: `fetch('/api')` — proxied to backend.

## Conventions & Patterns
- Client-server split: Keep frontend and backend isolated; communicate through `/api` path.
- Dev proxy: Configure in `vite.config.js` under `server.proxy` for any backend routes.
- Minimal React setup: Prefer simple functional components; avoid unused imports.
- Error handling: Client side shows minimal error text when fetch fails.

## Adding New API Routes
- Define routes in `server/server.js` (or split into modules if expanded later).
- For each new route, add a matching proxy entry in `client/vite.config.js` if the base path differs from `/api`.
- Example:
  - Server: `app.get('/api/users', ...)`
  - Client: `fetch('/api/users')`

## Environment & Ports
- Backend: `8080` by default. If changed, update Vite proxy.
- Frontend: Vite chooses a dev port (commonly `5173`). Client code should use relative `/api` paths in dev.

## Git & Repo
- Default branch: `main`.
- Recommend `.gitignore` for Node/Vite (not present yet): include `node_modules`, `dist`, `.env`.

## Common Tasks for Agents
- Display server data in client: Use `fetch('/api')`, handle `.json()`, render content in `App.jsx`.
- Update proxy: Edit `ProjectDistributed/vite.config.js` to include new backend paths.
- Backend change: Modify `server/server.js` and restart with `npm run start` or `npm run dev`.

## Examples
- Fetch server message in client:
  ```jsx
  useEffect(() => {
    fetch('/api')
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch(() => setError('Failed to load'))
  }, [])
  ```
- Vite proxy config snippet:
  ```js
  export default defineConfig({
    plugins: [react()],
    server: { proxy: { '/api': 'http://localhost:8080' } }
  })
  ```

## Notes
- No test suite configured; do not add unless requested.
- Keep changes minimal and consistent with current style.

---
Feedback: If any workflows or paths look off in your setup (e.g., ports, renamed folders), let me know and I’ll update these instructions.