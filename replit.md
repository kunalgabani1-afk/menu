# Tableline / QR Menu SaaS

Imported restaurant QR-menu application. Import setup is limited to running the existing app; preserve its application code, design, and structure.

## Verified import launch

- Dependencies: `npm install --package-lock=false --legacy-peer-deps`. Existing manifests and the imported lockfile are preserved.
- Frontend workflow: `artifacts/qr-menu-saas: web`, using `pnpm --filter @workspace/qr-menu-saas run dev` on port 25680.
- API workflow: `artifacts/api-server: API Server`, using `pnpm --filter @workspace/api-server run dev` on port 8080, routed at `/api`.
- The imported frontend also starts its existing local API on port 5000 for its Vite proxy.
- The landing page and `/api/health` were verified through the development preview. Signed-in screens were not verified.
- Firebase configuration is needed for sign-in; Gemini configuration is needed for AI features. No credentials were invented or added during import setup.
- The remaining sections below are inherited template notes, not verified setup instructions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
