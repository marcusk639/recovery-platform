/**
 * Runs the hourly rent job in the functions emulator. A v2 scheduled function is an
 * HTTP handler (Cloud Scheduler calls it over HTTP), answered 200 when the run has
 * ended and 500 if it threw. The emulator loads it only beside the Pub/Sub emulator,
 * but its Pub/Sub route drops the message for a v2 schedule, so this calls the
 * emulator's trigger route instead; `-0` is the emulator's key for the function.
 */
import { FUNCTIONS_BASE, PROJECT } from './guards';

const triggerUrl = `${new URL(FUNCTIONS_BASE).origin}/functions/projects/${PROJECT}/triggers/us-central1-rentCharges-0`;

export async function runRentJob(): Promise<void> {
  const res = await fetch(triggerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (res.status !== 200) throw new Error(`rentCharges answered ${res.status}`);
}
