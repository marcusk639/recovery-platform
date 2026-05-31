# Meeting Instance Migration

This migration script generates meeting instances for all existing meetings in the database. This is necessary when transitioning from the monthly batch instance generation to the daily 7-day rolling window system.

## Why This Migration is Needed

When we switched from monthly to daily instance generation:

- New meetings get instances immediately via the `onMeetingCreate` trigger
- The daily function generates instances going forward
- **Existing meetings** created before this change won't have instances until the daily function runs

This migration ensures all existing meetings have instances available immediately.

## What It Does

1. Iterates through all groups in the database
2. For each group, finds all meetings
3. Generates meeting instances for the next 7 days (configurable) for each meeting
4. Uses the same `generateInstancesForMeeting` utility function as the daily generator
5. Respects group timezones for accurate date calculations
6. Is idempotent - won't create duplicate instances if they already exist

## Usage

### Using the Migration Script

From the root `scripts` directory:

```bash
# Dry run (see what would be generated without making changes)
cd scripts
npx ts-node migrateMeetingInstances.ts --dry-run

# Actual migration
npx ts-node migrateMeetingInstances.ts

# With debug logging
npx ts-node migrateMeetingInstances.ts --debug

# Generate instances for more days (default is 7)
npx ts-node migrateMeetingInstances.ts --days-ahead=14
```

### Using the Migration Runner Script

From the `functions` directory:

```bash
# Dry run
cd functions
./scripts/run-migrations.sh meeting-instances --dry-run

# Actual migration
./scripts/run-migrations.sh meeting-instances

# With debug logging
./scripts/run-migrations.sh meeting-instances --debug
```

## Configuration Options

- `--dry-run`: Show what would be generated without making changes
- `--debug`: Enable debug-level logging
- `--days-ahead=N`: Generate instances for N days ahead (default: 7)

## Output

The migration provides a summary:

- Groups processed
- Meetings processed
- Instances created
- Meetings skipped (missing required fields)
- Errors encountered

## Important Notes

1. **Idempotent**: Safe to run multiple times - won't create duplicate instances
2. **Timezone-aware**: Uses each group's timezone for accurate date calculations
3. **Respects existing instances**: Won't overwrite instances that already exist
4. **Error handling**: Continues processing even if individual meetings fail

## When to Run

- **Before deploying** the daily instance generator to production
- **After deploying** if you want to backfill instances for existing meetings
- **Anytime** you need to ensure all meetings have instances for the next 7 days

## Example Output

```
[INFO] Starting meeting instance migration
[INFO] Generating instances for next 7 days
[INFO] Found 25 groups total
[INFO] Processed 10 meetings, created 45 instances
[INFO] Processed 20 meetings, created 98 instances
[INFO] Meeting instance migration completed
[INFO] Groups processed: 25
[INFO] Meetings processed: 32
[INFO] Instances created: 142
[INFO] Meetings skipped: 0
[INFO] Errors: 0
```
