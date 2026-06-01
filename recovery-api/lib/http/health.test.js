"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const health_1 = require("./health");
describe('GET /health', () => {
    it('returns ok: true with a valid ISO timestamp', () => {
        const mockRes = { json: jest.fn() };
        (0, health_1.healthHandler)({}, mockRes);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        const call = mockRes.json.mock.calls[0][0];
        expect(typeof call.ts).toBe('string');
        expect(new Date(call.ts).toString()).not.toBe('Invalid Date');
    });
});
