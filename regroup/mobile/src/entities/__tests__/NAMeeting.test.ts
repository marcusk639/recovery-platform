import type { NAMeeting } from '../NAMeeting';

function makeNAMeeting(overrides: Partial<NAMeeting> = {}): NAMeeting {
  return {
    Location: ['Community Center', '123 Main St', 'Room 4'],
    Day: 'Monday',
    TimeLanguage: '7:00 PM English',
    'Closed to Public': 'C',
    'Wheelchair Accessible': 'WA',
    'Day Time | Closed | Wheelchair': 'Monday 7:00 PM | C | WA',
    Language: 'English',
    Format: 'Speaker',
    Distance: '2.5 miles',
    Format_2: 'Discussion',
    Distance_2: '2.5 mi',
    ...overrides,
  };
}

describe('NAMeeting interface structural conformance', () => {
  it('constructs a valid NAMeeting object without errors', () => {
    expect(() => makeNAMeeting()).not.toThrow();
  });

  it('Location is an array of strings', () => {
    const meeting = makeNAMeeting();
    expect(Array.isArray(meeting.Location)).toBe(true);
    expect(meeting.Location.length).toBeGreaterThan(0);
    meeting.Location.forEach(item => expect(typeof item).toBe('string'));
  });

  it('Location can hold multiple address parts', () => {
    const location = ['Church Hall', '456 Oak Blvd', 'Suite 2', 'Austin, TX'];
    const meeting = makeNAMeeting({ Location: location });
    expect(meeting.Location).toHaveLength(4);
    expect(meeting.Location[0]).toBe('Church Hall');
    expect(meeting.Location[3]).toBe('Austin, TX');
  });

  it('Location can be an empty array', () => {
    const meeting = makeNAMeeting({ Location: [] });
    expect(meeting.Location).toHaveLength(0);
  });

  it('Day is a string representing day of week', () => {
    const meeting = makeNAMeeting({ Day: 'Friday' });
    expect(meeting.Day).toBe('Friday');
  });

  it('TimeLanguage is a string combining time and language', () => {
    const meeting = makeNAMeeting({ TimeLanguage: '8:00 PM Spanish' });
    expect(meeting.TimeLanguage).toBe('8:00 PM Spanish');
  });

  it('"Closed to Public" is a string', () => {
    const meeting = makeNAMeeting({ 'Closed to Public': 'C' });
    expect(meeting['Closed to Public']).toBe('C');
  });

  it('"Closed to Public" can be empty string for open meetings', () => {
    const meeting = makeNAMeeting({ 'Closed to Public': '' });
    expect(meeting['Closed to Public']).toBe('');
  });

  it('"Wheelchair Accessible" is a string', () => {
    const meeting = makeNAMeeting({ 'Wheelchair Accessible': 'WA' });
    expect(meeting['Wheelchair Accessible']).toBe('WA');
  });

  it('"Day Time | Closed | Wheelchair" composite field is a string', () => {
    const composite = 'Tuesday 6:30 PM | O | WA';
    const meeting = makeNAMeeting({ 'Day Time | Closed | Wheelchair': composite });
    expect(meeting['Day Time | Closed | Wheelchair']).toBe(composite);
  });

  it('Language is a string', () => {
    const meeting = makeNAMeeting({ Language: 'Spanish' });
    expect(meeting.Language).toBe('Spanish');
  });

  it('Format is a string describing meeting format', () => {
    const meeting = makeNAMeeting({ Format: 'Discussion' });
    expect(meeting.Format).toBe('Discussion');
  });

  it('Distance is a string (with units)', () => {
    const meeting = makeNAMeeting({ Distance: '5.2 miles' });
    expect(meeting.Distance).toBe('5.2 miles');
  });

  it('Format_2 is a secondary format string', () => {
    const meeting = makeNAMeeting({ Format_2: 'Speaker/Discussion' });
    expect(meeting.Format_2).toBe('Speaker/Discussion');
  });

  it('Distance_2 is a secondary distance string', () => {
    const meeting = makeNAMeeting({ Distance_2: '5.2 mi' });
    expect(meeting.Distance_2).toBe('5.2 mi');
  });

  it('two NAMeeting objects are independent', () => {
    const m1 = makeNAMeeting({ Day: 'Monday' });
    const m2 = makeNAMeeting({ Day: 'Wednesday' });
    expect(m1.Day).not.toBe(m2.Day);
  });

  it('has all required fields defined', () => {
    const meeting = makeNAMeeting();
    const requiredKeys: (keyof NAMeeting)[] = [
      'Location',
      'Day',
      'TimeLanguage',
      'Closed to Public',
      'Wheelchair Accessible',
      'Day Time | Closed | Wheelchair',
      'Language',
      'Format',
      'Distance',
      'Format_2',
      'Distance_2',
    ];
    requiredKeys.forEach(key => {
      expect(meeting[key]).toBeDefined();
    });
  });
});
