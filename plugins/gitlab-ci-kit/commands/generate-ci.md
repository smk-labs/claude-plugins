---
description: Generate a GitLab CI/CD pipeline and Helm chart for this project
---

# Generate CI/CD + Helm chart

Generate a GitLab CI/CD pipeline and a Helm chart that builds the current project with kaniko, pushes to the GitLab Container Registry, and deploys to a GKE namespace via a user-provided kubeconfig. Reusable across apps — inspect the repo first, ask for the unknowns, then generate only the stages and templates that apply. If no Dockerfile exists, generate one tailored to the detected runtime.

## When this fires

The user wants to set up CI/CD for a project that will deploy to a GKE namespace they have access to via a kubeconfig file. They will provide that kubeconfig as a base64-encoded GitLab CI variable named `KUBE_CONFIG_B64`. Build is **kaniko**, registry is **GitLab Container Registry**, deploy is **Helm**.

If the user wants something different (Argo CD, Flux, plain `kubectl apply`, GAR, Docker Hub, GitHub Actions), stop and confirm before proceeding — this skill is opinionated.

## Step 1 — Inspect the repo first (always)

Before writing a single file, read these. Then summarize what you found in 4–8 lines and ask the user about anything ambiguous **before** generating files.

1. **Runtime & build**
   - `Dockerfile` → base image, exposed port, `CMD`/`ENTRYPOINT`, `HEALTHCHECK`. **If missing, plan to generate one in Step 4.**
   - `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `composer.json` → language, framework, scripts, runtime version (engines, python_requires, go directive).
   - Lockfile → package manager (npm, pnpm, yarn, bun, poetry, pip, uv, etc.).
2. **Project shape — single app, monorepo, or backend + frontend?**
   - Look for top-level dirs like `backend/`, `server/`, `api/` **paired with** `frontend/`, `client/`, `web/`, `ui/`, `dashboard/` — strong signal of a split repo that needs **two separate deployables**.
   - Look for workspace files (`pnpm-workspace.yaml`, `package.json` `workspaces`, Turborepo `turbo.json`, Nx `nx.json`, Lerna) — also a monorepo signal.
   - Multiple Dockerfiles (`Dockerfile.backend`, `Dockerfile.frontend`, or one per package) → multi-image build.
   - Frontend signals: a build that emits static assets (`vite.config.*`, `next.config.*`, `vue.config.*`, `angular.json`, `dist/`, `build/`), a different runtime (nginx for static, Node for SSR).
   - Backend signals: API entrypoint (Express, FastAPI, Gin, Rails, Spring), DB/queue clients, server-only env vars.
   - **Decision rule**: if both a deployable backend **and** a deployable frontend exist, plan **two charts** (`helm/backend/`, `helm/frontend/`) and **two build jobs** (`build_backend`, `build_frontend`). If only one exists, single chart at `helm/`. Confirm with the user in Step 2 before generating.
- **Routing layer per cluster** — different teams' clusters use different ingress mechanisms. **You must know which** before generating templates:
  - **`<gateway-cluster-name>` and `<gateway-cluster-name-2>` clusters** → **GKE Gateway API**. Generate a `templates/httproute.yaml` (and a `Gateway` reference) instead of an `Ingress`.
  - **`<nginx-cluster-name>`, `<nginx-cluster-name-2>`, `<cluster-name>`, `<nginx-cluster-name-3>` clusters** → **ingress-nginx**. Generate a standard `templates/ingress.yaml` with `ingressClassName: nginx`.
  - If unsure which the user's cluster uses, ask in Step 2 — don't pick by guessing.
3. **Topology & deps**
   - `docker-compose.yml` → which external services the app talks to (Postgres, Redis, RabbitMQ, …) **and the inter-service wiring** (e.g. how the frontend reaches the backend — same-origin via ingress path, separate subdomain, or env-injected URL).
   - Entrypoint source → confirm health endpoint path, port, and **which env vars are actually read**. Do this for each service if there are multiple.
4. **Configuration**
   - `.env.example` → enumerate every env var. Classify each as **secret** (API keys, passwords, tokens, signing keys) or **non-secret** (hosts, ports, URLs, feature flags, model names). If backend/frontend are split, **partition the env vars per service** — frontend usually only needs public URLs and feature flags; secrets belong to the backend.
5. **Existing CI / chart**
   - If `.gitlab-ci.yml` or `helm/` already exists, plan to replace cleanly — don't dual-maintain. Preserve any legacy job that produces an artifact other teams depend on.

## Step 2 — Ask the user for the unknowns

Don't guess. Ask up front for anything you can't infer:

- **App name** — drives image name, Helm release, k8s resource names. If the repo has both backend and frontend, ask for **two names** (e.g. `myapp-api`, `myapp-web`) — they become two separate Helm releases and two separate images.
- **Project shape** — confirm what Step 1 detected: single app, **backend + frontend (two charts, two images, two deploys)**, or monorepo with N services. If split, also confirm the inter-service wiring (does the frontend call the backend via same-host `/api`, a separate subdomain like `api.example.com`, or an env-injected URL baked at build time?).
- **GitLab group** — which team/group the project lives under (`<cluster-name>`, `<nginx-cluster-name>`, `<nginx-cluster-name-2>`, `<gitlab-group>`, `<gateway-cluster-name-2>`, …). Runners are attached at the group level. If the project isn't under the right group, stop and tell the user to move it first — CI will hang otherwise.
- **Runner tag(s)** — the GitLab runner tag for the team's cluster (e.g. `<cluster-name>-staging-gke`, `<nginx-cluster-name>-prod-gcp-2`). User must get this from their EM or GitLab admin. If they have separate tags for heavy jobs (kaniko) vs light jobs (helm/kubectl), capture both.
- **Namespace** — the GKE namespace the user can deploy to (e.g. `team-alpha-dev`).
- **Environment label** — `staging` / `prod` / `dev`.
- **Public host** (optional) — FQDN for the ingress, e.g. `myapp.example.com`. If none, skip the routing template entirely.
- **Routing layer** — derive from the cluster (see Step 1):
  - `<gateway-cluster-name>`, `<gateway-cluster-name-2>` → **GKE Gateway API** (`HTTPRoute` + a parent `Gateway`). Ask for the parent Gateway name + namespace (commonly something like `external-gateway` in `gateway-system` or a team-owned namespace) and the listener port.
  - `<nginx-cluster-name>`, `<nginx-cluster-name-2>`, `<cluster-name>`, `<nginx-cluster-name-3>` → **ingress-nginx** (`Ingress` with `ingressClassName: nginx`). Ask for the TLS secret name if HTTPS is needed.
  - If the cluster isn't in either list above, ask the user's EM or GitLab admin which routing layer is in use; don't assume.
- **Health endpoint** — path + port if not obvious from the entrypoint.
- **Migrations** — does the app run DB migrations on deploy?
- **Dockerfile preference** (only if no Dockerfile exists) — confirm the user wants you to generate one, or whether they'd rather write it themselves first.

Confirm the user has already added the kubeconfig as `KUBE_CONFIG_B64` (Masked + Hidden CI/CD variable). If not, give them the encode commands:

```bash
# macOS
base64 -i ~/Downloads/u-<me>.kubeconfig | pbcopy
# Linux (no line wrapping — masked vars must be single-line)
base64 -w0 ~/Downloads/u-<me>.kubeconfig
```

## Step 3 — Pick stages based on what the repo supports

No fixed stage list. Include only what applies.

| Stage | Include when … |
|---|---|
| `test` | a runnable test command exists (`npm test`, `pytest`, `go test`, `bun test`, …) and tests don't need heavy infra |
| `lint` | a linter config exists (`.eslintrc*`, `ruff.toml`, `.golangci.yml`, …) — don't invent one |
| `typecheck` | TS project that doesn't emit JS (Bun/ts-node) and tests don't already typecheck. Skip for Python/Go/Rust — their build typechecks. |
| `build` | **always** — kaniko → GitLab Container Registry |
| `migrate` | app ships migrations (Django, Alembic, Prisma, Rails, …) — run as a Helm pre-upgrade hook, not a CI job |
| `deploy` | **always** — `helm upgrade --install` against the user's namespace |
| `smoke` | a smoke script exists that can run against the deployed URL |

Don't duplicate work. If `npm test` already typechecks, drop the standalone typecheck stage.

## Step 4 — Generate a Dockerfile if missing

If Step 1 found a Dockerfile, **leave it alone** — only suggest tweaks if it's missing the health endpoint, doesn't expose the port the entrypoint binds to, or runs as root when the runtime allows non-root.

If there is no Dockerfile, generate one matching the detected runtime. Always:

- **Multi-stage build** to keep the runtime image small (deps install + optional compile in stage 1, slim runtime in stage 2).
- **Pin the base image to a minor version**, never `latest` (`node:20-alpine`, `python:3.12-slim`, `golang:1.23-alpine`).
- **Run as a non-root user** (`USER 1000:1000` or `USER node` / `USER nobody`) where the runtime image allows it.
- **Set `WORKDIR /app`** consistently.
- **Copy lockfile + manifest first**, install deps, **then** copy source — so layer caching works on code-only changes.
- **`EXPOSE` the port the app actually binds to** (read it from the entrypoint, don't guess).
- **No secrets, no `.env` files, no credentials** copied in. Add them to `.dockerignore`.
- Generate a matching `.dockerignore` (`.git`, `node_modules`, `__pycache__`, `dist`, `build`, `.env*`, `*.log`, `.venv`, `target/`, `coverage/`, IDE files).

### Templates by runtime

**Node.js / TypeScript (npm)**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Adjust for **pnpm** (`corepack enable && pnpm install --frozen-lockfile`), **yarn** (`yarn install --frozen-lockfile`), or **bun** (`oven/bun:1-alpine`, `bun install --frozen-lockfile`, `bun run`).

**Python (poetry)**

```dockerfile
FROM python:3.12-slim AS deps
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 POETRY_VIRTUALENVS_CREATE=false
WORKDIR /app
RUN pip install --no-cache-dir poetry==1.8.3
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --only main

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/usr/local/bin:$PATH"
WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY . .
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

For **uv** swap the deps stage to `pip install uv && uv sync --frozen --no-dev`. For **pip + requirements.txt** drop poetry and use `pip install --no-cache-dir -r requirements.txt`.

**Go**

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/app /app
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app"]
```

**Rust**

```dockerfile
FROM rust:1.82-slim AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release && rm -rf src
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* && useradd --create-home --uid 1000 app
WORKDIR /app
COPY --from=build /src/target/release/<binary-name> /app/server
USER app
EXPOSE 8080
CMD ["/app/server"]
```

**Frontend — static SPA (Vite / CRA / Vue) served by nginx**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Bake the API URL at build time if the SPA needs it (Vite: VITE_*, CRA: REACT_APP_*).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
USER nginx
CMD ["nginx", "-g", "daemon off;"]
```

Pair with an `nginx.conf` that listens on `8080` (so the container can run as non-root), serves `index.html` as the SPA fallback (`try_files $uri /index.html`), and adds a `/healthz` location returning `200`. Output dir is `dist` for Vite, `build` for CRA — adjust the `COPY --from=build`.

**Frontend — Next.js (SSR / standalone)**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Requires `output: 'standalone'` in `next.config.js`. For a non-standalone Next deployment, fall back to the generic Node template above with `npm start`.

After writing the Dockerfile, **build it locally if Docker is available** (`docker build -t <app>:test .`) to catch syntax errors before CI runs it. If Docker isn't available, at minimum re-read the file and verify the `EXPOSE`d port matches what the entrypoint binds to.

## Step 5 — Generate the Helm chart(s)

**One chart per deployable.** Decide the layout based on what Step 1/2 confirmed:

- **Single app** → one chart at `helm/`. Release name = app name.
- **Backend + frontend** → two **independent** charts at `helm/backend/` and `helm/frontend/`. Two releases (e.g. `myapp-api`, `myapp-web`), two images, two `values-<env>.yaml` files per chart. **Do not** put backend and frontend templates inside the same chart — they have different lifecycles, scale independently, and split charts let you redeploy one without churning the other.
- **Monorepo with N services** → one chart per service (`helm/<service-a>/`, `helm/<service-b>/`, …) using the same single-app template.

Why separate charts (not a single chart with sub-deployments): independent versioning, independent rollbacks, independent `--wait` timeouts, and the ability to skip/override per-service via the CI `SKIP_*` toggles.

### Backend ↔ frontend wiring

Cover this explicitly in the generated charts based on what Step 2 told you. Translate "ingress" below into the right object for the cluster (`Ingress` for nginx clusters, `HTTPRoute` for `<gateway-cluster-name>`/`<gateway-cluster-name-2>`):

- **Same-host `/api`** — the public-facing chart (frontend) gets two routing rules: `/api` → backend service, `/` → frontend service. The backend chart's routing template stays disabled. On Gateway API this is two `rules[]` entries on one `HTTPRoute` with `matches: [{ path: { type: PathPrefix, value: /api } }]` and `matches: [{ path: { type: PathPrefix, value: / } }]` respectively.
- **Separate subdomain** (`api.example.com` + `app.example.com`) — each chart owns its own routing object + TLS. On Gateway API both charts produce their own `HTTPRoute` referencing the same shared `Gateway` via `parentRefs`.
- **Build-time baked URL** (Vite `VITE_API_URL`, CRA `REACT_APP_API_URL`) — pass via Docker `--build-arg` in the **frontend's** `build_image` job. Don't put it in `values.yaml` `env:` — it's baked into the bundle, not read at runtime.

#### `HTTPRoute` template shape (Gateway API clusters)

```yaml
{{- if .Values.httpRoute.enabled }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ include "<chart>.fullname" . }}
  labels: {{- include "<chart>.labels" . | nindent 4 }}
spec:
  parentRefs:
    - name: {{ .Values.httpRoute.parentRef.name }}
      namespace: {{ .Values.httpRoute.parentRef.namespace }}
      {{- with .Values.httpRoute.parentRef.sectionName }}
      sectionName: {{ . }}
      {{- end }}
  hostnames:
    {{- toYaml .Values.httpRoute.hostnames | nindent 4 }}
  rules:
    {{- range .Values.httpRoute.rules }}
    - matches:
        {{- toYaml .matches | nindent 8 }}
      backendRefs:
        - name: {{ include "<chart>.fullname" $ }}
          port: {{ $.Values.service.port }}
    {{- end }}
{{- end }}
```

The parent `Gateway` is **shared cluster infrastructure** — don't create one from this chart. Ask the team's EM for its name + namespace (e.g. `external-gateway` in `gateway-system`). TLS termination happens at the `Gateway`, not the `HTTPRoute`, so you don't ship a `tls` block in the chart for Gateway API clusters.

### Standard chart layout (per chart — omit files that don't apply)

- `Chart.yaml` — `apiVersion: v2`, type `application`, version `0.1.0`, appVersion from package metadata.
- `values.yaml` — defaults:
  - `image.repository`, `image.tag` (empty → falls back to `.Chart.AppVersion`), `image.pullPolicy: IfNotPresent`
  - `imagePullSecrets: [{ name: gitlab-registry }]` — see **Step 7** for how this secret is created
  - `replicaCount: 1`, sensible `resources` per language
  - `service` (ClusterIP), `ingress` (disabled by default), `autoscaling` (disabled)
  - `livenessProbe` / `readinessProbe` using the health endpoint
  - `podSecurityContext`, `securityContext` (non-root where the image allows)
  - `env:` — every **non-secret** env var as key/value
  - `secrets.create: true`, `secrets.existingSecret: ""`, `secrets.data:` — every **secret** key with empty default
- `values-<env>.yaml` — per-env overrides (ingress host, TLS secret, resource limits).
- `templates/_helpers.tpl` — `name`, `fullname`, `chart`, `labels`, `selectorLabels`, `serviceAccountName`, `secretName`.
- `templates/deployment.yaml` — one container, `envFrom` → ConfigMap (non-secret) + Secret (app secrets), probes, resources, **`imagePullSecrets` from `.Values.imagePullSecrets`**.
- `templates/service.yaml`.
- **Routing template — pick exactly one based on the cluster** (see Step 1's "Routing layer per cluster" rule):
  - `templates/ingress.yaml` for **ingress-nginx** clusters (`<nginx-cluster-name>`, `<nginx-cluster-name-2>`, `<cluster-name>`, `<nginx-cluster-name-3>`) — gated on `.Values.ingress.enabled`, sets `ingressClassName: nginx`. For SSE / long-poll apps include `nginx.ingress.kubernetes.io/proxy-buffering: "off"` and 300s read/send timeouts.
  - `templates/httproute.yaml` for **GKE Gateway API** clusters (`<gateway-cluster-name>`, `<gateway-cluster-name-2>`) — gated on `.Values.httpRoute.enabled`, references a parent `Gateway` via `parentRefs:` (name + namespace come from `.Values.httpRoute.parentRef`). Use `gateway.networking.k8s.io/v1`. Do **not** also generate an `Ingress` — pick one.
  - `values.yaml` should reflect whichever was generated: either an `ingress:` block (`enabled`, `className`, `host`, `tls`, `annotations`) **or** an `httpRoute:` block (`enabled`, `parentRef.name`, `parentRef.namespace`, `parentRef.sectionName`, `hostnames[]`, `rules[]`). Don't ship both stubs commented out — leave the chart unambiguous.
- `templates/configmap.yaml` — renders `.Values.env`.
- `templates/secret.yaml` — gated on `.Values.secrets.create`, `Opaque`, `stringData` from `.Values.secrets.data` (skip empty keys).
- `templates/serviceaccount.yaml`, `templates/hpa.yaml` (gated).
- `templates/migration-job.yaml` — only if migrations exist. Helm hook `pre-upgrade,pre-install`, `ttlSecondsAfterFinished: 300`.
- `.helmignore`.

**Classification reminder**
- **Non-secret** (`values.yaml` `env:`): DB host/port/user/db-name, Redis URL, upstream URLs, model names, feature flags, ports, timeouts, CORS origins.
- **Secret** (`values.yaml` `secrets.data:`): API keys, DB passwords, bearer tokens, basic-auth creds, webhook signing keys.

Don't bundle Postgres/Redis subcharts unless asked. Assume external services reachable via env values.

After generating, run:

```bash
helm lint helm/
helm template test helm/ -f helm/values.yaml -f helm/values-<env>.yaml
```

Fix any errors before moving on.

## Step 6 — Generate `.gitlab-ci.yml`

> **Every job must have a `tags:` block** matching the runner tag from Step 2. Without the right tag, jobs sit `pending` indefinitely. Convention: heavy jobs (kaniko build) on the `*-gcp-*` tag if it exists, light jobs (helm/kubectl/lint/test) on the `*-gke` tag. If only one tag exists, use it for everything.

### Required CI/CD variables the user must set in GitLab

| Variable | Purpose | Masked | Protected |
|---|---|---|---|
| `KUBE_CONFIG_B64` | base64-encoded kubeconfig | ✅ + Hidden | optional |
| `GITLAB_DEPLOY_TOKEN_USER` | username of the deploy token (Step 7) | ✅ | optional |
| `GITLAB_DEPLOY_TOKEN` | password of the deploy token (Step 7) | ✅ | optional |
| one row per app secret | injected via `--set-string secrets.data.<KEY>=$<KEY>` | ✅ | optional |

`$CI_REGISTRY`, `$CI_REGISTRY_IMAGE`, `$CI_REGISTRY_USER`, `$CI_REGISTRY_PASSWORD`, `$CI_COMMIT_SHORT_SHA` are GitLab built-ins — don't define them.

### File skeleton

```yaml
stages:
  - <only the stages picked in Step 3>

variables:
  IMAGE_TAG: $CI_COMMIT_SHORT_SHA
  K8S_NAMESPACE: <namespace>
  HELM_RELEASE: <app-name>
  HELM_CHART_DIR: helm
  HELM_VALUES_FILE: helm/values.yaml
  HELM_ENV_VALUES_FILE: helm/values-<env>.yaml

  # One SKIP_* dropdown per job.
  SKIP_BUILD_IMAGE:
    value: "false"
    options: ["false", "true"]
    description: "Skip the image build."
  SKIP_DEPLOY:
    value: "false"
    options: ["false", "true"]
    description: "Skip the deploy."
```

**Rules block on every job — in this order:**

```yaml
rules:
  - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    when: never
  - if: '$SKIP_<JOB> == "true" || $CI_COMMIT_MESSAGE =~ /\[skip <job>\]/'
    when: never
  - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

### Build job (kaniko → GitLab Container Registry)

```yaml
build_image:
  stage: build
  tags:
    - <heavy-runner-tag>   # e.g. <cluster-name>-staging-gcp-2 — fall back to the deploy tag if no heavy pool
  image:
    name: gcr.io/kaniko-project/executor:debug
    entrypoint: [""]
  script:
    - mkdir -p /kaniko/.docker
    - |
      cat > /kaniko/.docker/config.json <<EOF
      {
        "auths": {
          "$CI_REGISTRY": {
            "username": "$CI_REGISTRY_USER",
            "password": "$CI_REGISTRY_PASSWORD"
          }
        }
      }
      EOF
    - /kaniko/executor
        --context "$CI_PROJECT_DIR"
        --dockerfile "$CI_PROJECT_DIR/Dockerfile"
        --destination "$CI_REGISTRY_IMAGE:$IMAGE_TAG"
        --destination "$CI_REGISTRY_IMAGE:latest"
        --cache=true --cache-ttl=168h --snapshot-mode=redo
```

> Kaniko on a default GitLab runner usually needs a 2 Gi memory limit; bump to 4 Gi for large images.

### Deploy job (helm)

```yaml
deploy:
  stage: deploy
  tags:
    - <deploy-runner-tag>   # e.g. <cluster-name>-staging-gke — must reach the GKE cluster
  image: alpine/helm:3.14.4
  needs:
    - job: build_image
      optional: true   # so chart-only redeploys work with SKIP_BUILD_IMAGE=true
  before_script:
    - apk add --no-cache kubectl
    - mkdir -p $HOME/.kube
    - echo "$KUBE_CONFIG_B64" | base64 -d > $HOME/.kube/config
    - chmod 600 $HOME/.kube/config
    # Create / refresh the GitLab registry pull secret in the user's namespace.
    - |
      kubectl -n "$K8S_NAMESPACE" create secret docker-registry gitlab-registry \
        --docker-server="$CI_REGISTRY" \
        --docker-username="$GITLAB_DEPLOY_TOKEN_USER" \
        --docker-password="$GITLAB_DEPLOY_TOKEN" \
        --docker-email="ci@example.com" \
        --dry-run=client -o yaml | kubectl apply -f -
  script:
    - helm upgrade --install "$HELM_RELEASE" "$HELM_CHART_DIR"
        --namespace "$K8S_NAMESPACE"
        -f "$HELM_VALUES_FILE"
        -f "$HELM_ENV_VALUES_FILE"
        --set image.repository="$CI_REGISTRY_IMAGE"
        --set image.tag="$IMAGE_TAG"
        # one --set-string per app secret:
        # --set-string secrets.data.MY_API_KEY="$MY_API_KEY"
        --wait --timeout 5m
  environment:
    name: <env>
    url: https://<host-if-any>
```

Optional jobs (`test`, `lint`, `typecheck`, `smoke`) — only add the ones Step 3 selected. Each gets its own `SKIP_*` variable and `[skip <name>]` commit token.

### Backend + frontend → duplicate the build and deploy jobs

When Step 1/2 confirmed two deployables, **don't try to share one build/deploy job**. Generate a parallel pair per service. Naming: `build_backend` / `deploy_backend` and `build_frontend` / `deploy_frontend`. Concrete differences:

- **Per-service image name** — push to `$CI_REGISTRY_IMAGE/backend:$IMAGE_TAG` and `$CI_REGISTRY_IMAGE/frontend:$IMAGE_TAG` so the two images are distinct in the GitLab registry. Set kaniko `--destination` accordingly.
- **Per-service Dockerfile context** — point kaniko at the right subdir (`--context "$CI_PROJECT_DIR/backend" --dockerfile "$CI_PROJECT_DIR/backend/Dockerfile"`), or use root-level `Dockerfile.backend` / `Dockerfile.frontend` with `--context "$CI_PROJECT_DIR"`.
- **Per-service Helm release** — separate `HELM_RELEASE_BACKEND` / `HELM_RELEASE_FRONTEND` and chart dirs `HELM_CHART_DIR_BACKEND=helm/backend` / `HELM_CHART_DIR_FRONTEND=helm/frontend`. Two `helm upgrade --install` calls.
- **Per-service skip toggles** — `SKIP_BUILD_BACKEND`, `SKIP_BUILD_FRONTEND`, `SKIP_DEPLOY_BACKEND`, `SKIP_DEPLOY_FRONTEND`. Plus a global `SKIP_BUILD` and `SKIP_DEPLOY` that short-circuit both. Each job's rules block checks both its own toggle and the global one.
- **Path-based skip (optional but recommended)** — add a `changes:` rule so a backend-only commit doesn't rebuild the frontend image:
  ```yaml
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: never
    - if: '$SKIP_BUILD_BACKEND == "true" || $SKIP_BUILD == "true"'
      when: never
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      changes:
        - backend/**/*
        - Dockerfile.backend
  ```
- **Frontend build args** — if the SPA bakes the API URL at build time, pass it to kaniko: `--build-arg VITE_API_URL=$VITE_API_URL` (with `VITE_API_URL` set as a CI/CD variable per environment).
- **Deploy ordering** — by default both deploy jobs run in parallel. If the frontend's runtime config depends on backend being healthy, add `needs: [{ job: deploy_backend }]` to `deploy_frontend`. Don't add a hard ordering unless there's a real reason — parallel deploys are faster.

## Step 7 — Pulling the image from GitLab Container Registry

The image lives in a **private** GitLab project registry. GKE has no native integration for GitLab's registry — the standard path is a Kubernetes `docker-registry` secret referenced via `imagePullSecrets`.

### a) Create a Deploy Token in GitLab

Tell the user to go to GitLab project → **Settings → Repository → Deploy tokens → Add deploy token**:

- **Name**: `k8s-pull`
- **Username**: leave blank (GitLab generates one) or set e.g. `gitlab+deploy-token-k8s`
- **Scopes**: `read_registry` only

They save the generated **username** and **token** as GitLab CI/CD variables `GITLAB_DEPLOY_TOKEN_USER` and `GITLAB_DEPLOY_TOKEN` (Masked).

> Why a deploy token, not a personal access token? Deploy tokens are scoped to one project and one purpose, survive when team members leave, and can be revoked independently.

### b) The deploy job creates / refreshes the secret each run

Already wired in the `deploy` job above — `kubectl create secret docker-registry … --dry-run=client -o yaml | kubectl apply -f -` is idempotent and keeps the credential current if the user ever rotates the token.

### c) The chart references it

`values.yaml`:

```yaml
imagePullSecrets:
  - name: gitlab-registry
```

`templates/deployment.yaml`:

```yaml
spec:
  template:
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

### Alternative — create the pull secret once, by hand

If the user deploys many apps from the same GitLab group to the same namespace, they can create the secret **once manually** and drop the `kubectl create secret` step from CI. Your org's self-hosted GitLab registry hostname is **`<registry-domain>`** — use it as `--docker-server` (not `registry.gitlab.com`):

```bash
kubectl -n <NAMESPACE> create secret docker-registry <APPNAME>-reg-secret \
  --docker-server=<registry-domain> \
  --docker-username='<deploy-token-username>' \
  --docker-password='<deploy-token-value>'
```

Then set `imagePullSecrets: [{ name: <APPNAME>-reg-secret }]` in `values.yaml` (instead of `gitlab-registry`).

Trade-off: less self-healing if the token rotates, but one less moving part in CI. Recommend the in-CI version unless the user says otherwise.

## Step 8 — Report back to the user

After generating, summarize:

1. **Files created** — bulleted list with clickable paths (include the Dockerfile + `.dockerignore` if you generated them).
2. **GitLab CI/CD variables to set** — table grouped into:
   - *Infra* (`KUBE_CONFIG_B64`, `GITLAB_DEPLOY_TOKEN_USER`, `GITLAB_DEPLOY_TOKEN`)
   - *App secrets* (one row per secret key, marked required/optional)
3. **Assumptions to verify** — runner tag correct?, health endpoint, exposed port matches entrypoint, migrations present?, ingress host/TLS, resource sizing.
4. **First-deploy checklist** — push to default branch → watch the pipeline → `kubectl -n <ns> get pods,svc,ingress` → hit the URL.

## House rules

- **Project must be under the correct GitLab group** (`<cluster-name>`, `<nginx-cluster-name>`, `<nginx-cluster-name-2>`, `<gitlab-group>`, `<gateway-cluster-name-2>`, …) — runners are attached at the group level. Confirm with the team's EM or GitLab admin before generating CI.
- **Every job needs a `tags:` block** with the team's runner tag. No tag = stuck pipelines. Get the tag from the EM or GitLab admin; do not guess.
- **Generate a Dockerfile only if one is missing.** Don't overwrite an existing Dockerfile — flag concerns and let the user decide.
- **Multi-stage, pinned base images, non-root user, no secrets baked in** — non-negotiable for any Dockerfile you generate.
- **One chart per deployable.** If the repo has both backend and frontend (or N services in a monorepo), generate separate Helm charts (`helm/backend/`, `helm/frontend/`, …) and separate build/deploy job pairs in CI. Never bundle multiple services into a single chart — it breaks independent rollback, scaling, and skip toggles.
- **Routing layer is cluster-determined, not optional.** `<gateway-cluster-name>` and `<gateway-cluster-name-2>` use **GKE Gateway API** → generate `HTTPRoute` (no `Ingress`). `<nginx-cluster-name>`, `<nginx-cluster-name-2>`, `<cluster-name>`, `<nginx-cluster-name-3>` use **ingress-nginx** → generate `Ingress` (no `HTTPRoute`). Never ship both. If the cluster isn't on either list, ask before generating.
- **Never commit secret values.** Secrets go to GitLab CI/CD variables, injected at deploy via `--set-string secrets.data.<KEY>=$<KEY>`.
- **Don't bundle Postgres/Redis subcharts** unless asked — assume external managed services.
- **Long-poll / SSE apps on ingress-nginx** need `proxy-buffering: "off"` + extended (300s) ingress timeouts. On Gateway API, configure equivalent timeouts via `BackendTrafficPolicy` / `HTTPRoute` `timeouts` instead — ask the EM if the cluster has a standard policy.
- **Replace existing CI cleanly** — don't dual-maintain old SSH-based or hand-rolled deploys.
- **Preserve legacy artifacts** other teams consume (browser extension bundles, SDKs, docs sites) under their own `build_<name>` job with a dedicated skip toggle.
- **Match conventions of sibling repos** when they conflict with these defaults.
