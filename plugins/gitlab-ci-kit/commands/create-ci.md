---
description: Create a GitLab CI/CD pipeline and Helm chart (kaniko build, cluster deploy)
---

Create a GitLab CI/CD pipeline and Helm chart that builds an image with kaniko and deploys to a GKE cluster. Reusable across apps — inspect the current project first, then pick the stages and templates that actually apply.

## Arguments

Parse `$ARGUMENTS` for hints:
- `cluster=<name>` — e.g. `cluster=<cluster-name>`, `cluster=<gateway-cluster-name>`. Drives the kubeconfig variable name and runner tags.
- `env=<name>` — e.g. `env=staging`, `env=prod`. Defaults to `staging`.
- `host=<fqdn>` — public URL for the ingress, e.g. `host=<app>.<your-domain>`.
- `namespace=<ns>` — k8s namespace. Defaults to the app name.
- `registry=<gar-url>` — Artifact Registry path, e.g. `<region>-docker.pkg.dev/<gcp-project>/<registry-repo>`.

Any missing required arg → **ask the user**, do not guess.

## Step 1 — Inspect the repo (ALWAYS do this first)

Before writing a single file, build a mental model of the app by reading:

1. **Runtime & build system**
   - `Dockerfile` → base image, exposed port, `CMD`/`ENTRYPOINT`, `HEALTHCHECK` path.
   - `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `composer.json` → language, framework, scripts.
   - Lockfiles → package manager in use (bun, npm, pnpm, poetry, pip, etc.).
2. **Topology & dependencies**
   - `docker-compose.yml` → which services the app talks to (Redis, Postgres, RabbitMQ, etc.) and how.
   - Entrypoint source (`server.ts`, `main.py`, `cmd/main.go`, …) → confirm health endpoint, port, and **which env vars are actually read**.
3. **Configuration**
   - `.env.example` / `.env.server.example` → full env var list. Classify each: **secret** (API keys, passwords, tokens) vs. **non-secret** (hosts, ports, feature flags, URLs, model names).
4. **Existing CI & conventions**
   - Existing `.gitlab-ci.yml` → stages already in use, any artifacts downstream teams consume, skip patterns.
   - Sibling projects under the same parent dir (`../*-ci-cd/`, `../infra/`, `../*-deploy/`) → copy runner-tag names, registry URLs, vault integration, helm chart structure. If the org uses a specific style (e.g. bitnami-like chart layout), match it.
5. **Language-specific signals for which stages are worth adding** (see Step 2)

Summarize findings to the user in 4–8 lines **before** generating files. Call out any ambiguity (e.g. "I can't find a health endpoint — confirm path?").

## Step 2 — Pick stages based on what the repo supports

There is no fixed stage list. Include only what the project actually has. Common choices:

| Stage | Include when … | Job image & command |
|---|---|---|
| `test` | a test runner exists (`jest`, `pytest`, `go test`, `bun test`, `vitest`) and tests are runnable in CI without heavy infra | matching runtime image; `npm test` / `pytest` / `go test ./...` |
| `lint` | a linter config exists (`.eslintrc*`, `ruff.toml`, `.golangci.yml`, `black`/`flake8` in deps) | runtime image; lint command |
| `typecheck` | language has a separate typechecker the project uses (`tsc --noEmit`, `mypy`, `pyright`) and project has no other pre-build check | only if not already covered by lint/test |
| `build` | **always** (kaniko → GAR); add extra `build_<name>` jobs for downstream artifacts (browser extensions, SDK bundles, docs sites) |
| `migrate` | app ships DB migrations that must run before deploy (Django `migrate`, Alembic `upgrade`, Rails, Prisma) | same runtime image; runs against target DB via kubectl exec or a one-shot Job |
| `deploy` | **always** (helm upgrade → GKE) |
| `e2e` / `smoke` | repo has a smoke-test script you can run against the deployed URL | curl-based image or a Playwright/Cypress job |

Rules of thumb:
- **Skip `typecheck` for Python/Go/Rust** — their build step already type-checks. Keep it for TypeScript projects that don't emit JS (Bun runtimes, ts-node) where a `bun run build` or `tsc --noEmit` is the only way to catch type errors before production.
- **Skip `lint` if there's no lint config** — don't invent one.
- **Always add `build` (kaniko) and `deploy` (helm)** — that's the core of this command.
- **Do not duplicate work**: if tests run typechecking as a side effect, skip the standalone `typecheck`.
- Preserve any legacy CI job that produces an artifact external teams depend on (e.g. a Chrome extension bundle). Put it under `build` with its own skip toggle.

## Step 3 — Generate the Helm chart at `helm/`

Standard chart layout (omit files that don't apply):

- `Chart.yaml` — `apiVersion: v2`, type `application`, version `0.1.0`, appVersion from package.json/pyproject.
- `values.yaml` — defaults:
  - `image.repository`, `image.tag` (empty → falls back to AppVersion), `image.pullPolicy`
  - `replicaCount`, `resources` (sensible defaults per language)
  - `service`, `ingress` (disabled by default), `autoscaling` (disabled)
  - `livenessProbe`/`readinessProbe` using the health endpoint you found
  - `podSecurityContext`, `securityContext`
  - `env:` — all **non-secret** env vars as key/value strings
  - `secrets.create`, `secrets.existingSecret`, `secrets.data:` — all **secret** keys with empty string defaults
  - `logsVolume` if the app writes to a log dir
- `values-<env>.yaml` — per-env overrides (ingress host, TLS secret, resource limits).
- `templates/_helpers.tpl` — `name`, `fullname`, `chart`, `labels`, `selectorLabels`, `serviceAccountName`, `secretName`.
- `templates/deployment.yaml` — one container, `envFrom` → ConfigMap (non-secret) + Secret (secret), probes, resources, optional logs volume.
- `templates/service.yaml`.
- `templates/ingress.yaml` — gated on `ingress.enabled`. For SSE/long-poll apps include annotations `nginx.ingress.kubernetes.io/proxy-buffering: "off"` and 300s read/send timeouts.
- `templates/configmap.yaml` — renders `.Values.env` as key/value data.
- `templates/secret.yaml` — gated on `secrets.create`, Opaque, `stringData` from `.Values.secrets.data` (skip empty keys).
- `templates/serviceaccount.yaml`, `templates/hpa.yaml` (gated), `templates/logs-pvc.yaml` (gated on `logsVolume.type == persistentVolumeClaim`).
- `templates/migration-job.yaml` — **only if the repo has migrations**. Helm hook `pre-upgrade` / `pre-install`, `ttlSecondsAfterFinished: 300`.
- `.helmignore`.

Classification guide:
- **Non-secret** (values.yaml `env:`): DB host/port/user/db, Redis URL, upstream URLs, model names, feature flags, log paths, CORS origins, ports, timeouts.
- **Secret** (values.yaml `secrets.data:`): API keys, DB passwords, bearer tokens, basic-auth creds, webhook signing keys.

Don't bundle Redis/Postgres subcharts unless the user asks. Assume external services reachable by plain env values (e.g. `REDIS_URL: redis://<release>-redis-master.<ns>:6379`).

**After generating, always run**:
```
helm lint helm/
helm template test helm/ -f helm/values.yaml -f helm/values-<env>.yaml
```
Fix any errors before proceeding to Step 4.

## Step 4 — Write `.gitlab-ci.yml`

### Naming conventions

- **Kubeconfig CI variable**: `<CLUSTER_UPPER>_<ENV_UPPER>_KUBECONFIG_B64` — different clusters get different variable names. Examples: `<CLUSTER_NAME>_STAGING_KUBECONFIG_B64`, `<GATEWAY_CLUSTER_NAME>_PROD_KUBECONFIG_B64`, `ADMIN_STAGING_KUBECONFIG_B64`.
- **GAR SA CI variable**: `GCR_BUILD_SA_B64` — check sibling repos first in case the org uses a different name.
- **Runner tags**:
  - Deploy + light jobs (lint/test/helm) → `<cluster>-<env>-gke`
  - Heavy build jobs (kaniko, bundlers) → `<cluster>-<env>-gcp-2` if it exists in sibling CI, else fall back to the `-gke` tag. Ask if unsure.

### File layout

Keep comments minimal. Only add stage-separator banners; no inline commentary.

```yaml
stages:
  - <only the stages you picked in Step 2>

variables:
  REGISTRY_URL: <registry>
  IMAGE_NAME: <app>
  IMAGE_TAG: $CI_COMMIT_SHORT_SHA
  K8S_NAMESPACE: <ns>
  HELM_RELEASE: <app>
  HELM_CHART_DIR: helm
  HELM_VALUES_FILE: helm/values.yaml
  HELM_ENV_VALUES_FILE: helm/values-<env>.yaml

  # One SKIP_* dropdown per job in the pipeline.
  SKIP_<JOB>:
    value: "false"
    options: ["false", "true"]
    description: "Skip the <job> job."
```

Rules block for every job — in this order:

```yaml
rules:
  - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    when: never
  - if: '$SKIP_<JOB> == "true" || $CI_COMMIT_MESSAGE =~ /\[skip <job>\]/'
    when: never
  - if: $CI_COMMIT_BRANCH == "main"
```

Combine related toggles when useful: `SKIP_BUILD=true` (or `[skip build]`) should skip **all** build jobs, while `SKIP_BUILD_<NAME>` targets one.

### Job templates

- **build_image** (kaniko, always present):
  - `image: { name: gcr.io/kaniko-project/executor:debug, entrypoint: [""] }`
  - Tag: `<cluster>-<env>-gcp-2`
  - Decode `$GCR_BUILD_SA_B64` into `$GOOGLE_APPLICATION_CREDENTIALS`
  - `/kaniko/.docker/config.json` with `credHelpers: { "<region>-docker.pkg.dev": "gcr" }`
  - Push both `:$CI_COMMIT_SHORT_SHA` and `:latest`, `--cache=true --cache-ttl=168h --snapshot-mode=redo`

- **deploy_<env>** (helm, always present):
  - `image: alpine/helm:3.14.4`, tag `<cluster>-<env>-gke`
  - `needs: [{ job: build_image, optional: true }]` — so chart-only redeploys work with `SKIP_BUILD_IMAGE=true`
  - Decode `$<CLUSTER_UPPER>_<ENV_UPPER>_KUBECONFIG_B64` → `$HOME/.kube/config`
  - `helm upgrade --install "$HELM_RELEASE" "$HELM_CHART_DIR" --namespace "$K8S_NAMESPACE" --create-namespace -f values.yaml -f values-<env>.yaml --set image.repository/tag --set-string secrets.data.<KEY>="$<KEY>" (for each secret) --wait --timeout 5m`
  - `environment: { name: <env>, url: https://<host> }`

- **Optional jobs** (test, lint, typecheck, migrate, smoke): only add if Step 2 said they apply. Each gets its own `SKIP_*` variable and `[skip <name>]` commit token.

## Step 5 — Report to the user

1. **Files created** — bulleted list with clickable paths.
2. **GitLab CI/CD variables table** — columns: Variable, Purpose, Masked, Protected. Split into:
   - *Infra* (kubeconfig, GAR SA)
   - *App secrets* (one row per secret key, marked required/optional)
3. **Assumptions to verify** — runner tag names, registry URL, health endpoint path, migrations present?, DNS/TLS setup.
4. **Resource sizing** — per-job CPU/memory suggestions for the GitLab runner. Flag kaniko's memory appetite (≥2Gi limit, bump to 4Gi on heavy builds).

## House rules

- Never commit secret values. They go to GitLab variables and are injected at deploy time via `--set-string`.
- Don't bundle Redis/Postgres subcharts unless asked; external services only.
- Long-poll / SSE apps need `proxy-buffering: "off"` + extended ingress timeouts.
- If existing `.gitlab-ci.yml` used SSH-based deploys, replace it cleanly — don't dual-maintain.
- Preserve legacy build artifacts other teams depend on (browser extensions, SDKs) under separate `build_<name>` jobs with their own skip toggles.
- Match the org's sibling-project conventions over these defaults when they conflict.
