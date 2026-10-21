# Live reads against phoenix-cleanhouse

<!-- Extracted verbatim from regroup/functions/CLAUDE.md -->

The firebase MCP server is pinned to `recovery-api` / the `recovery-platform` project, so it cannot query regroup. Use ADC + REST instead:

```bash
TOK=$(gcloud auth application-default print-access-token)
curl -s -X POST "https://firestore.googleapis.com/v1/projects/phoenix-cleanhouse/databases/(default)/documents:runQuery" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d @query.json
```

Gen2 function logs live under `resource.type="cloud_run_revision"` with a **lowercased** `service_name` — not `resource.labels.function_name`, which returns nothing:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="scheduledrentcollection"' \
  --project=phoenix-cleanhouse --freshness=30d
```

Log retention is ~30 days, so anything older cannot be confirmed from logs at all.
