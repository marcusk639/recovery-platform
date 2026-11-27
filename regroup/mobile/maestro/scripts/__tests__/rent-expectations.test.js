const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../maestro-js/rent-expectations.js'), 'utf8');

// Runs the script the way Maestro does: env vars and http/json/output as globals.
function run(env, rows = []) {
  const output = {};
  const posts = [];
  vm.runInNewContext(SCRIPT, {
    ...env,
    output,
    json: JSON.parse,
    http: {
      post: (url, req) => {
        posts.push({ url, body: JSON.parse(req.body) });
        return { ok: true, status: 200, body: JSON.stringify(rows) };
      },
    },
  });
  return { output, posts };
}

describe('rent-expectations.js', () => {
  // The spec's example (rent spec §4.3): $175/week, moving in on a Wednesday -> 5 of 7, $125.00.
  it('a Wednesday in Chicago is 5 of 7 days: 12500 cents, next Monday Nov 30', () => {
    const { output } = run({ NOW_MS: String(Date.parse('2026-11-25T18:00:00Z')) });
    expect(output).toMatchObject({
      daysCovered: 5,
      expectedCents: 12500,
      expectedDollars: '125.00',
      nextMonday: 'Mon, Nov 30',
    });
  });

  it("uses Chicago's date, not UTC's: 03:00 UTC Thursday is still Wednesday there", () => {
    const { output } = run({ NOW_MS: String(Date.parse('2026-11-26T03:00:00Z')) });
    expect(output.daysCovered).toBe(5);
  });

  it('a Monday is a full week, and a Sunday one day', () => {
    expect(run({ NOW_MS: String(Date.parse('2026-11-23T18:00:00Z')) }).output.expectedCents).toBe(
      17500,
    );
    expect(run({ NOW_MS: String(Date.parse('2026-11-29T18:00:00Z')) }).output.expectedCents).toBe(
      2500,
    );
  });

  it('applies daylight time in summer (UTC-5): 04:30 UTC is the evening before', () => {
    // Tue 2026-07-14 04:30 UTC is Mon 23:30 CDT: a full week.
    expect(run({ NOW_MS: String(Date.parse('2026-07-14T04:30:00Z')) }).output.daysCovered).toBe(7);
  });

  it("reads the intake resident's balance and own rate by email", () => {
    const { output, posts } = run({ EMAIL: 'aaron-rentcheck@rats-e2e.com', NOW_MS: '1' }, [
      {
        document: {
          name: 'projects/demo-regroup-e2e/databases/(default)/documents/guests/abc123',
          fields: {
            rentOwed: { integerValue: '12500' },
            customRent: {
              mapValue: {
                fields: {
                  amountCents: { integerValue: '15000' },
                  frequency: { stringValue: 'weekly' },
                },
              },
            },
          },
        },
      },
    ]);
    expect(posts[0].body.structuredQuery.where.fieldFilter.value).toEqual({
      stringValue: 'aaron-rentcheck@rats-e2e.com',
    });
    expect(output).toMatchObject({
      guestId: 'abc123',
      rentOwed: 12500,
      customRentCents: 15000,
      customRentFrequency: 'weekly',
    });
  });

  it('reports no record when the query finds none', () => {
    const { output } = run({ EMAIL: 'x@rats-e2e.com', NOW_MS: '1' }, [{ readTime: 'now' }]);
    expect(output).toMatchObject({ guestId: '', rentOwed: -1, customRentCents: -1 });
  });
});
