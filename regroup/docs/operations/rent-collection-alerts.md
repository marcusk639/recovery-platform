# Rent collection alerts (phoenix-cleanhouse)

`scheduledRentCollection` deliberately does **not** fail the Cloud Scheduler job for
conditions that need a human but are not urgent. A permanently red scheduled job gets
ignored, which reproduces the silence the signals exist to break. The job goes red only
for charge failures, which are actionable immediately.

That trade is only sound if the ERROR logs below actually reach someone. **At the time
this was written, this project had no alert policies, no log-based metrics and no
notification channels** — a repo-wide search found none. So these logs went nowhere.
Create them, or the non-throwing design is just a quieter silence.

## What must alert

| Log message                                           | Means                                                                                                                                                      | Urgency   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `rentAttempts: attempts need reconciliation`          | A charge's Stripe outcome is unknown. Money may have moved with no ledger entry.                                                                           | Same day  |
| `rentAttempts: in-flight attempt is stale, releasing` | An attempt sat unsettled past 10 days. Its hold is released, so the resident can be charged again — if the original did settle, that is a duplicate debit. | Same day  |
| `scheduledRentCollection: some payments failed`       | One or more charges threw. The job also goes red for this.                                                                                                 | Immediate |
| `rentAttempts: could not flag stale attempt`          | The flag write itself failed, so the signal above may be missing.                                                                                          | Same day  |

## Create the metric and policy

Replace `CHANNEL_ID` with a notification channel from
`gcloud alpha monitoring channels list --project=phoenix-cleanhouse`.

```bash
PROJECT=phoenix-cleanhouse

# One log-based metric covering the reconciliation + staleness signals.
gcloud logging metrics create rent_reconciliation_needed \
  --project="$PROJECT" \
  --description="Rent attempts with an unknown Stripe outcome, or released as stale" \
  --log-filter='resource.type="cloud_run_revision"
AND resource.labels.service_name="scheduledrentcollection"
AND severity>=ERROR
AND (jsonPayload.message:"attempts need reconciliation"
     OR jsonPayload.message:"in-flight attempt is stale")'

cat > /tmp/rent-recon-policy.json <<'JSON'
{
  "displayName": "regroup: rent attempt needs reconciliation",
  "combiner": "OR",
  "conditions": [{
    "displayName": "any reconciliation or staleness ERROR in 24h",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/rent_reconciliation_needed\" AND resource.type=\"cloud_run_revision\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "0s",
      "aggregations": [{ "alignmentPeriod": "86400s", "perSeriesAligner": "ALIGN_SUM" }]
    }
  }],
  "notificationChannels": ["projects/phoenix-cleanhouse/notificationChannels/CHANNEL_ID"]
}
JSON

gcloud alpha monitoring policies create --project="$PROJECT" \
  --policy-from-file=/tmp/rent-recon-policy.json
```

## Verify it fires

Do not assume. Write a doc into `rent-collection-attempts` with
`needsReconciliation: true` in a non-production project, let the daily job run (or invoke
it), and confirm the metric increments and the channel receives it. An alert policy that
has never fired is indistinguishable from one that cannot.

## Counts the job computes but does not act on

`runRentCollection` returns `needsReconciliationCount` in its summary. Nothing consumes
it — the scheduler callback inspects only `failureCount`. That is intentional for the
reason at the top, but it means the summary is diagnostic, not a control signal. If you
would rather have the job go red, change the throw condition in the `onSchedule`
callback; just accept that it will stay red until a human clears every flagged attempt.
