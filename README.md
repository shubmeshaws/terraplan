# terraplan.

Self-service Terraform plan/apply. Developers pick a repository, branch and environment;
terraplan queues the run, takes the environment's state lock, runs `terraform` on a runner and
shows the diff. Applies to prod and every destroy wait for an approval first.

## Stack

| Layer   | Tech                                                         |
| ------- | ------------------------------------------------------------ |
| Web     | Next.js 14 (App Router, TypeScript, Tailwind) on port `3005` |
| API     | NestJS 10 on port `4000`, prefix `/api/v1`                   |
| Runner  | BullMQ worker, health on port `4100`                         |
| Data    | PostgreSQL 16 via Prisma, Redis 7 for the job queue          |
| Tooling | pnpm workspaces, Turborepo, ESLint, Prettier, Docker Compose |

```
apps/
  web/       Next.js UI (ported from terraplan.html) + /api/health + /api/v1 proxy to the API
  api/       NestJS REST API: auth, runs, approvals, locks, users admin, audit, metrics, health
  runner/    BullMQ worker: acquires env lock, runs terraform (or a simulation), streams output
packages/
  shared/    zod env schemas, RBAC, domain types, queue constants, Prisma schema + client
deploy/
  helm/terraplan/   Helm chart for EKS/Kubernetes
  terraform/eks/    Terraform module (S3 artifacts, IRSA, Helm release)
docs/
  RUNBOOK.md        Day-2 ops, guardrails, alerts, rollback
```

### Platform guardrails

- **Rate limit** / **concurrency cap** per user (`RATE_LIMIT_RUNS_PER_HOUR`, `USER_MAX_CONCURRENT_RUNS`)
- **Run timeouts** (`RUN_TIMEOUT_SECONDS`) — runner kills hung terraform
- **Terraform flag deny list** — blocks `-lock=false`, `-target`, `-chdir`, `-state*`, …
- **Secret scanning** of plan JSON / logs (`SECRET_SCAN_FAIL_ON_HIGH`)
- **Slack / Teams** webhooks (`SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL`, `NOTIFY_ON`)
- **Audit export** — `GET /api/v1/audit-logs/export?format=csv`
- **Metrics** — Prometheus text at `GET /api/v1/metrics` (see `deploy/helm/terraplan/alerts.yaml`)

See [docs/RUNBOOK.md](docs/RUNBOOK.md) and [deploy/terraform/eks/README.md](deploy/terraform/eks/README.md).

### Authentication & RBAC

- **Google SSO** is the only sign-in method (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).
- Sessions are JWTs stored in an httpOnly `terraplan_session` cookie on the web origin.
- Tables: `users`, `roles`, `role_assignments` (one role per user per environment), `audit_logs`.
- Roles: **Viewer**, **Planner**, **Applier**, **Admin**. Permissions are derived per environment
  (see `packages/shared/src/rbac.ts`).
- NestJS `AuthGuard` + `RbacGuard` protect API routes. Admins manage users under **Admin → Users**
  (invite, disable/enable, change roles). Every admin action is written to `audit_logs`.
- **Admin → Bitbucket integration** connects a workspace (OAuth consumer or app password). Credentials
  are AES-GCM encrypted at rest (`CREDENTIALS_ENCRYPTION_KEY` or `SESSION_SECRET`). The API can list
  repositories, branches, open PRs and commit SHAs; Bitbucket webhooks hit
  `POST /api/v1/hooks/bitbucket` for `pullrequest:created` / `pullrequest:updated`. When a plan
  finishes for a linked PR, the API notify worker posts the result as a PR comment.

### How a run flows

1. `POST /api/v1/runs` validates the request. Plans and non-prod applies are stored as `queued`
   and pushed onto the `terraform-runs` BullMQ queue. Prod applies and all destroys are stored as
   `waiting_approval`.
2. `POST /api/v1/runs/:id/approve` moves an approved run to `queued` and enqueues it.
3. A runner picks up the job and inserts an `EnvironmentLock` row (the environment is the primary
   key, so only one run per environment can hold it). If the environment is busy the job is
   re-delayed every 5 s until the lock frees.
4. The runner streams output into the run row every second, then marks it `succeeded`/`failed`
   and releases the lock. Locks held for more than 45 minutes (a crashed runner) are reaped.

## Prerequisites

- Node.js 20+ (`.nvmrc`), pnpm 9 (`corepack enable`)
- Docker (or Podman) with Compose, for Postgres and Redis
- Terraform, only if you set `RUNNER_MODE=terraform`

## Local setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure the environment (one .env at the repo root is read by every app)
cp .env.example .env
#    If Postgres/Redis already run natively on 5432/6379, change POSTGRES_PORT/REDIS_PORT
#    and the ports in DATABASE_URL/REDIS_URL (for example 5433 and 6380).

# 3. Start Postgres and Redis
pnpm infra:up

# 4. Build the shared package, create the schema and load sample runs
pnpm --filter @terraplan/shared build
pnpm db:deploy
pnpm db:seed

# 5. Run web, api and runner in watch mode
pnpm dev
```

Open http://localhost:3005 (or your `WEB_PORT`). Sign in with Google after setting
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and the callback
`{WEB_PUBLIC_URL}/api/v1/auth/google/callback` (same port as the web app). Invite users under
**Admin → Users**, or **Run terraform** to queue a plan.

In the default `RUNNER_MODE=simulate` the runner produces realistic plan/apply output without
touching any cloud. A branch name containing `fail` simulates a failed plan.

### Health endpoints

| Service | URL                                      | Checks                          |
| ------- | ---------------------------------------- | ------------------------------- |
| Web     | http://localhost:3005/api/health         | Web is up, API reachability     |
| API     | http://localhost:4000/api/v1/health      | Postgres and Redis (503 if not) |
| API     | http://localhost:4000/api/v1/health/live | Process liveness only           |
| Runner  | http://localhost:4100/health             | Postgres, Redis, worker state   |

### API

| Method | Path                       | Description                                            |
| ------ | -------------------------- | ------------------------------------------------------ |
| GET    | `/api/v1/auth/providers`   | Which sign-in methods are configured                   |
| GET    | `/api/v1/auth/me`          | Current session user + permissions                     |
| GET    | `/api/v1/auth/google`      | Start Google OAuth                                     |
| POST   | `/api/v1/auth/logout`      | Clear session cookie                                   |
| GET    | `/api/v1/runs`             | List runs (`environment`, `action`, `status`, `limit`) |
| GET    | `/api/v1/runs/:id`         | One run including output                               |
| POST   | `/api/v1/runs`             | Create `{repository, branch, environment, action}`     |
| POST   | `/api/v1/runs/:id/approve` | Approve a `waiting_approval` run                       |
| POST   | `/api/v1/runs/:id/cancel`  | Cancel a run that has not started                      |
| GET    | `/api/v1/locks`            | Lock state for every environment                       |
| GET    | `/api/v1/users`            | List users (Admin)                                     |
| POST   | `/api/v1/users/invite`     | Invite `{email, name?, assignments[]}` (Admin)         |
| PATCH  | `/api/v1/users/:id/roles`  | Replace per-env roles (Admin)                          |
| PATCH  | `/api/v1/users/:id/status` | `{status: active\|disabled}` (Admin)                   |
| GET    | `/api/v1/audit-logs`       | Recent audit events (Admin)                            |
| GET    | `/api/v1/audit-logs/export`| CSV/JSON audit export (`format`, `limit`, `since`)     |
| GET    | `/api/v1/metrics`          | Prometheus metrics (protect at ingress)                |
| GET/PUT/DELETE | `/api/v1/bitbucket/connection` | Workspace connection (Admin)                   |
| POST   | `/api/v1/bitbucket/connection/test` | Test credentials (Admin)                    |
| POST   | `/api/v1/bitbucket/connection/sync` | Sync + record lastSyncAt (Admin)            |
| GET    | `/api/v1/bitbucket/repositories` | List workspace repos                            |
| GET    | `/api/v1/bitbucket/repositories/:repo/branches` | Branches + tip SHAs                |
| GET    | `/api/v1/bitbucket/repositories/:repo/pull-requests` | Open PRs                      |
| GET    | `/api/v1/bitbucket/repositories/:repo/commits` | Commits (`?branch=`)                     |
| GET    | `/api/v1/bitbucket/webhook-deliveries` | Recent webhook deliveries (Admin)        |
| POST   | `/api/v1/hooks/bitbucket`  | Public PR webhook (`X-Terraplan-Webhook-Secret`)       |

The browser calls these through the web app (`/api/v1/*` is proxied to `API_INTERNAL_URL` with the
session cookie forwarded as a Bearer token).

## Environment variables

Every service validates its variables with zod at startup (`packages/shared/src/env.ts`) and exits
with a list of what is wrong. See `.env.example` for all of them; the important ones:

| Variable                     | Used by     | Default / notes                        |
| ---------------------------- | ----------- | -------------------------------------- |
| `DATABASE_URL`               | api, runner | required                               |
| `REDIS_URL`                  | api, runner | required                               |
| `WEB_PORT`                   | web         | `3005`                                 |
| `API_INTERNAL_URL`           | web         | `http://localhost:4000`                |
| `WEB_PUBLIC_URL`             | api, web    | Browser origin + OAuth redirect URI    |
| `API_PUBLIC_URL`             | api         | Webhook / public API host              |
| `API_PORT`, `CORS_ORIGIN`    | api         | `4000`, web origin(s)                  |
| `SESSION_SECRET`             | api         | min 32 chars; required in production   |
| `CREDENTIALS_ENCRYPTION_KEY` | api         | Encrypts workspace API secrets at rest |
| `GOOGLE_CLIENT_ID/SECRET`    | api         | Google SSO (required)                  |
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` | api, seed   | First admin email                      |
| `RUNNER_MODE`                | runner      | `simulate` (`terraform` for real runs) |
| `RUNNER_CONCURRENCY`         | runner      | `2`                                    |
| `TERRAFORM_WORKSPACES_DIR`   | runner      | `./.runner-workspaces`                 |

### Real Terraform runs

Set `RUNNER_MODE=terraform`. For each repository the runner expects a working copy at
`$TERRAFORM_WORKSPACES_DIR/<repository>`. If it is a git checkout, the runner fetches and checks
out the requested branch first. It then runs `terraform init`, selects (or creates) a workspace
named after the environment, and runs `plan` (plus `apply` of the saved plan for apply/destroy).
Cloud credentials come from the runner's own environment.

## Everything in Docker

```bash
docker compose --profile apps up --build
```

This builds the three apps, runs migrations and the seed in a one-off `migrate` container, then
starts web on http://localhost:3005, the API on 4000 and the runner. Use
`docker compose --profile apps down -v` to stop and wipe the volumes.

## Scripts

| Command           | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `pnpm dev`        | Watch mode for web, api, runner and shared      |
| `pnpm build`      | Production build of every package               |
| `pnpm start`      | Run the production builds                       |
| `pnpm lint`       | ESLint across the monorepo                      |
| `pnpm typecheck`  | `tsc --noEmit` everywhere                       |
| `pnpm format`     | Prettier write (`format:check` to verify)       |
| `pnpm db:migrate` | Create a new migration after editing the schema |
| `pnpm db:deploy`  | Apply migrations                                |
| `pnpm db:seed`    | Load the sample runs (skipped if runs exist)    |
| `pnpm db:studio`  | Prisma Studio                                   |
| `pnpm infra:up`   | Start Postgres and Redis containers             |

## Notes

- The UI is the original `terraplan.html` ported as-is: its CSS is `apps/web/app/terraplan.css`,
  its markup `apps/web/app/markup.ts` and its script `apps/web/public/terraplan.js`. The runs
  table, environment locks, the **Run terraform** modal and approvals are wired to the API. The
  other sidebar views still show the original mock data.
- Tailwind's preflight is disabled so it doesn't restyle the ported CSS; Tailwind utilities are
  available for new UI.
- Runs and approvals are attributed to the signed-in user's name. Unauthenticated API calls
  return 401.
- The Users and Audit log admin pages are live; other sidebar admin views still use mock data.
