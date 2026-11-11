/** Polls until `until` holds. Handlers and Firestore triggers may still be running after a write. */
export async function waitFor<T>(
  read: () => Promise<T>,
  until: (value: T) => boolean,
  timeoutMs = 30000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!until(value)) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs} ms; last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = await read();
  }
  return value;
}
