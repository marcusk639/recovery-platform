/**
 * Seeded rent charges must look exactly as the server writes them, or the
 * history flows would pass against a shape the app never reads.
 */
const { rentCharges, uidOf, HOUSE } = require('../docs');

describe('rentCharges', () => {
  it("is one full week at $175.00 in cents for resident A, readable by A's own account", () => {
    const [c] = rentCharges(Date.parse('2026-11-25T12:00:00.000Z'));
    expect(c).toMatchObject({
      id: 'guest-a_2026-11-16',
      guestId: 'guest-a',
      houseId: HOUSE,
      guestUserId: uidOf('guest-a'),
      from: '2026-11-16',
      through: '2026-11-22',
      daysCovered: 7,
      daysInPeriod: 7,
      amountCents: 17500,
      rateSource: 'house',
    });
    expect(Number.isInteger(c.amountCents)).toBe(true);
  });
});
