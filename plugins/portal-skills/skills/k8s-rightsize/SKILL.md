---
name: k8s-rightsize
description: Right-size Kubernetes pod CPU/memory requests from real Prometheus usage data (per-pod p95 CPU, p98 memory over 7 days), compute how many nodes the cluster needs, and tune KEDA queue-based autoscaling. Use when the user asks to rightsize workloads, fix over/under-provisioned requests, cut node count or cloud cost, size Celery or background workers, tune KEDA listLength or HPA settings, or answer "how many nodes do we need". Works for any namespace with kube-prometheus and cAdvisor metrics.
---

# k8s-rightsize: data-driven pod request sizing from Prometheus

Right-size CPU/memory **requests** for workloads in a namespace using real 7-day usage from Prometheus, then compute how many nodes the cluster needs. Built for queue-worker fleets (Celery and similar) plus web/API pods, but works for any namespace.

## Best-practice model (researched: Datadog, Kubernetes docs)

- **Requests drive scheduling (bin-packing); limits enforce a runtime ceiling.** (K8s docs)
- **CPU is compressible.** A CPU *limit* throttles via CFS even when the node has spare CPU, spiking p95/p99 latency. For **async/background workers (Celery and similar), do NOT set CPU limits**: let them burst. Set the **CPU request to observed steady-state (median to p95)**.
- **Memory is incompressible.** It can only be OOM-killed, not throttled. Set **memory request to p95-p98**. Optionally add a **memory limit of about p98 x 1.25** to stop a leak from taking down a node. (Some teams deliberately run fully burstable with no memory limits; respect the owner's choice, but name the trade-off.)
- **Spread replicas across nodes** (`topologySpreadConstraints`, `maxSkew: 1`, `topologyKey: kubernetes.io/hostname`, `whenUnsatisfiable: ScheduleAnyway`) so bursts scatter instead of stacking. This is what makes "no CPU limit" safe.
- Celery: use `--max-tasks-per-child` to bound memory-leak creep.

### Percentile guidance (no CPU limit case)

The request only controls *packing density*, not the ceiling. Higher percentile = looser packing = more on-node burst headroom = less throttling, but more idle reservation.

- **CPU = p95** is the sweet spot for steady workers. Use **p98** only with a real latency SLO; the p95-to-p98 premium is tiny for steadily-loaded workers and pure waste for bursty ones.
- **Beware bursty workers** (low p95, huge max, e.g. idle at 173m but spiking to 3292m). p85 vs p95 barely moves them; the spike is 10-20x either number. Don't size them at burst (waste); rely on topology-spread + no-limit bursting. But do NOT size *steadily-heavy* workers (running near p85 continuously) at p85: that under-reserves and packs them too tight.

## CRITICAL: the aggregation trap (the #1 mistake)

Compute usage **per pod = `avg` across replicas, then quantile over time**. Do NOT `max_over_time(max(...))` or `sum by (pod)` then take the fleet max: that captures the single busiest pod at its single busiest instant and over-states every unevenly-loaded workload (it once turned a 173m worker into a 3300m "recommendation"). Always:

```promql
# per-pod CPU p95 (one container per pod):
quantile_over_time(0.95, avg(rate(container_cpu_usage_seconds_total{namespace="NS",pod=~"POD_RE",container="CONT"}[5m]))[7d:15m]) * 1000   # millicores
# per-pod MEM p98:
quantile_over_time(0.98, avg(container_memory_working_set_bytes{namespace="NS",pod=~"POD_RE",container="CONT"})[7d:1h]) / 1048576           # MiB
```

For **multi-container pods** (e.g. app + nginx + a vault-agent sidecar), size each *request-bearing* container separately, or `sum by (pod)` ONLY the app + nginx containers (exclude the sidecar) before the `avg`/quantile. Never lump a sidecar into the app's request.

For **one-shot Jobs** (migrations): skip. They are transient with no steady-state footprint.

## Steps

1. **Confirm read-only + port-forward.** Treat cluster access as READ-ONLY; never mutate. Apply changes via the Helm chart values + CI/CD only. Reach Prometheus with a port-forward, e.g.:
   `kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090`
   (ask the user to start it; test with `curl -s localhost:9090/api/v1/query?query=up`).

2. **Enumerate workloads + current requests.** Parse the Helm `values.yaml` for each worker/app: cpu, memory, minReplicas (or KEDA minReplicaCount), replicaCount. Note which are KEDA-scaled (queue-depth) vs HPA (CPU%) vs static.

3. **Query per-pod p95 CPU and p98 mem** over 7d using the formulas above. Also pull `max` as a "burst" reference column to spot bursty workers. Use `[7d:15m]` step for CPU, `[7d:1h]` for mem (coarse steps avoid Prometheus subquery timeouts; if it still times out, query one metric at a time and persist intermediate results to JSON files).

4. **Recommend:** `cpu_request = round_50m(p95 x 1.10)`, `mem_request = round_64Mi(p98 x 1.05)`. Floor CPU at 50m. Show a table: current vs new, with p95/max columns and up/down/equal flags.

5. **Node math.** Sum (request x minReplicas) across all app workloads = baseline reservation. Add cluster system overhead = `sum(kube_pod_container_resource_requests) - sum(...{namespace="NS"})`. Get per-node allocatable CPU and memory from `kubectl describe node` (or `kube_node_status_allocatable`); for example an e2-standard-16 node allocates about 15.89 CPU and 50Gi memory. Divide the grand total by per-node allocatable x 0.85 (bin-packing efficiency); take `max(cpu_nodes, mem_nodes)`. **Memory is usually the binding constraint for worker fleets.** Report nodes needed at min-traffic vs the autoscaler ceiling, and whether the current min-node setting fits.

6. **Apply** to Helm `values.yaml` with a block-scoped edit (match each worker's `requests:` block by walking the indented keys under `workers:`; rewrite only `cpu:`/`memory:` lines; never touch `limits:`). Then `helm template <chart> <chart-dir> >/dev/null` to validate every changed chart. Show the diff; commit only when asked. Never push unless told.

## Redis queue depth (for KEDA tuning, not request sizing)

KEDA scales queue workers on **Redis list length per queue**, read from the redis_exporter metric `redis_key_size{key="<queueName>"}` (for Celery, the queue key equals the worker's `queueName` in values.yaml). Use this to tune KEDA `listLength`/`minReplicaCount`, NOT to size CPU/mem requests.

**Gotchas:**
- A queue at depth 0 has **no Redis key**, so the series *disappears*: `redis_key_size{key="q"}` returns empty, not 0. Don't `or vector(0)` it into `quantile_over_time` (it breaks the result: gives p50 > p95).
- The exporter scrapes watched keys infrequently, so there are few samples over 7d. Prefer `query_range` (step 600s) and compute percentiles **client-side** from the raw values; also report `% of samples > 0` (how often the queue is non-empty) and `max` (worst backlog). Confirm liveness with `changes(redis_key_size{key=...}[7d])`.

```promql
# worst backlog + typical depth, robust to gaps: pull the range, take percentiles in code
GET /api/v1/query_range?query=redis_key_size{key="QUEUE"}&start=..&end=..&step=600
```

**KEDA sizing rule:** target `listLength` at about **2-4 x worker concurrency** (items each pod should hold before adding another), NOT thousands. KEDA adds a pod when `queue_depth / current_replicas > listLength`. Example bug found in the wild: a worker had `listLength: 5000` + `concurrency: 20`, min 2 replicas, so a 3rd pod needed a **10,000**-item backlog; observed backlogs of 9k-37k produced zero scale-out, and pods spiked CPU instead.

**Boot-latency caveat:** measure scheduled-to-ready with `kubectl get pod -o json` (`status.conditions`, PodScheduled vs Ready). Workers with heavy images plus secret-injection sidecars and startup probes can take **2-3 minutes** to become ready, which makes KEDA reactive with that much lag. To offset: lower `listLength` (trigger earlier), lower `pollingInterval` (15-30s), raise `minReplicaCount` for chronically bursty queues (warm buffer), and set `cooldownPeriod` at or above `terminationGracePeriodSeconds`. Prefer scaling **out** (more pods + topologySpread to scatter across nodes) over letting one pod scale **up** to many cores.
