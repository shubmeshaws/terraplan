# terraplan runbook

Operational guide for deploying, hardening, and running terraplan in production (EKS).

## Architecture (prod)

| Component | Role |
|-----------|------|
| **web** | Next.js UI + `/api/v1` proxy + SSE |
| **api** | NestJS auth, RBAC, runs, locks WS, metrics, audit |
| **runner** | BullMQ worker: clone → STS → terraform → artifacts |
| **Postgres** | Runs, users, locks, env configs, audit |
| **Redis** | BullMQ, SSE log bus, lock events, rate limits |
| **S3** | Plan binaries, plan JSON, run logs |

## Deploy

### 1. Build & push images

```bash
docker build -f apps/api/Dockerfile -t $ECR/terraplan-api:0.1.0 .
docker build -f apps/web/Dockerfile -t $ECR/terraplan-web:0.1.0 .
docker build -f apps/runner/Dockerfile -t $ECR/terraplan-runner:0.1.0 .
# push all three
```

### 2. Migrate database

```bash
pnpm db:deploy   # migrate + seed roles; first Google login becomes Admin
```

### 3. Helm (manual) or Terraform module

```bash
# Secret (do not commit)
kubectl -n terraplan create secret generic terraplan \
  --from-literal=SESSION_SECRET=... \
  --from-literal=DATABASE_URL=... \
  --from-literal=REDIS_URL=... \
  --from-literal=GOOGLE_CLIENT_ID=... \
  --from-literal=GOOGLE_CLIENT_SECRET=... \
  --from-literal=ARTIFACTS_S3_BUCKET=... \
  --from-literal=SLACK_WEBHOOK_URL=... \
  --from-literal=TEAMS_WEBHOOK_URL=...

helm upgrade --install terraplan deploy/helm/terraplan \
  -n terraplan --create-namespace \
  -f my-values.yaml
```

Or use `deploy/terraform/eks` against an existing cluster (creates bucket + IRSA + Helm release).

## Platform guardrails

| Control | Env / config | Behavior |
|---------|--------------|----------|
| Rate limit | `RATE_LIMIT_RUNS_PER_HOUR` (default 30) | Redis counter per user/hour → **429** |
| Concurrency | `USER_MAX_CONCURRENT_RUNS` (default 3) | Caps waiting+queued+running per user → **409** |
| Run timeout | `RUN_TIMEOUT_SECONDS` (default 3600) | Runner kills terraform / fails the job |
| TF flag deny | Built-in + `TF_DENIED_FLAGS` | Blocks `-lock=false`, `-target`, `-chdir`, `-state*`, etc. |
| Secret scan | `SECRET_SCAN_FAIL_ON_HIGH=true` | Scrubs plan JSON/logs; high findings fail the run |
| Notifications | `SLACK_WEBHOOK_URL` / `TEAMS_WEBHOOK_URL` + `NOTIFY_ON` | Approval / fail / success cards |
| Metrics | `METRICS_ENABLED=true` | `GET /api/v1/metrics` (Prometheus) |
| Audit export | Admin UI / API | `GET /api/v1/audit-logs/export?format=csv` |

### Suggested Prometheus alerts

```yaml
groups:
  - name: terraplan
    rules:
      - alert: TerraplanApiDown
        expr: terraplan_up == 0
        for: 2m
        labels: { severity: critical }
      - alert: TerraplanFailSpike
        expr: terraplan_runs_failed_last_hour > 10
        for: 5m
        labels: { severity: warning }
      - alert: TerraplanApprovalBacklog
        expr: terraplan_runs_waiting_approval > 20
        for: 30m
        labels: { severity: warning }
      - alert: TerraplanRedisDown
        expr: terraplan_redis_up == 0
        for: 2m
        labels: { severity: critical }
```

Protect `/api/v1/metrics` at the ingress (IP allowlist or basic auth). Do not expose it publicly.

## Day-2 operations

### Stuck lock

1. Open **Live locks** — confirm holder + waiters.
2. If the runner pod died mid-apply, wait for the stale-lock reaper (~60s) or break the lock as Admin.
3. Check runner logs: `kubectl -n terraplan logs -l app.kubernetes.io/component=runner --tail=200`

### Run stuck in `queued`

1. Confirm Redis and runner replicas are healthy.
2. `kubectl -n terraplan get deploy terraplan-runner`
3. Inspect BullMQ: runner health port `/health` should be ok.
4. If the env lock is held, the job is delayed until release (expected for apply/destroy).

### Secret scan failure

1. Open the run log — look for `# secret scan:` lines.
2. Rotate the leaked credential; scrub it from terraform state/vars.
3. Re-run plan. Temporary override (not recommended): `SECRET_SCAN_FAIL_ON_HIGH=false`.

### Rate / concurrency errors

- **429** — wait for the hour window or raise `RATE_LIMIT_RUNS_PER_HOUR`.
- **409** — cancel idle waiting/queued runs or raise `USER_MAX_CONCURRENT_RUNS`.

### Audit export

```bash
curl -H "Cookie: …" \
  "https://api.example.com/api/v1/audit-logs/export?format=csv&limit=5000" \
  -o terraplan-audit.csv
```

Or use **Admin → Audit log → Export CSV** in the UI.

### Notifications not firing

1. Confirm `SLACK_WEBHOOK_URL` / `TEAMS_WEBHOOK_URL` in the Secret.
2. Confirm `NOTIFY_ON` includes the event (`failed`, `succeeded`, `waiting_approval`, …).
3. API handles create/approve/cancel; runner handles succeed/fail.

## Security checklist

- [ ] Strong `SESSION_SECRET` (≥32 chars), unique per env
- [ ] Google OAuth redirect locked to `WEB_PUBLIC_URL`
- [ ] Runner IRSA: least-privilege S3 + only listed env role ARNs
- [ ] Env IAM roles: trust only the runner role; short session duration
- [ ] Ingress TLS + WAF; metrics not public
- [ ] Postgres TLS; Redis AUTH / TLS in transit
- [ ] `RUNNER_MODE=terraform` only after env configs + roles are verified
- [ ] Destroy confirmation + approval policies enabled for prod

## Rollback

```bash
helm rollback terraplan -n terraplan
# or pin previous image tags in values and helm upgrade
```

Database migrations are forward-only; restore from RDS snapshot if a migration must be undone.

## Health endpoints

| Service | Path |
|---------|------|
| API live | `GET /api/v1/health/live` |
| API ready | `GET /api/v1/health` |
| API metrics | `GET /api/v1/metrics` |
| Web | `GET /api/health` |
| Runner | `GET /health` (port 4100) |
