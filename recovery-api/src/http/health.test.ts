import { healthHandler } from './health';

describe('GET /health', () => {
  it('returns ok: true with a valid ISO timestamp', () => {
    const mockRes = { json: jest.fn() } as any;
    healthHandler({} as any, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    const call = mockRes.json.mock.calls[0][0] as { ok: boolean; ts: string };
    expect(typeof call.ts).toBe('string');
    expect(new Date(call.ts).toString()).not.toBe('Invalid Date');
  });
});
