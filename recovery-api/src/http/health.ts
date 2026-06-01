import { Response } from 'express';
import { onRequest, Request } from 'firebase-functions/v2/https';

// Exported for testing — call the handler directly without the onRequest wrapper.
export function healthHandler(_req: Request, res: Response): void {
  res.json({ ok: true, ts: new Date().toISOString() });
}

export const health = onRequest(healthHandler);
