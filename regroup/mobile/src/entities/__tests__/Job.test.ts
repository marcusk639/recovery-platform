import Job, { jobItems } from '../Job';

describe('Job class defaults', () => {
  it('can be instantiated with no arguments', () => {
    const job = new Job();
    expect(job).toBeInstanceOf(Job);
  });

  it('employer defaults to empty string', () => {
    const job = new Job();
    expect(job.employer).toBe('');
  });

  it('startDate defaults to empty string', () => {
    const job = new Job();
    expect(job.startDate).toBe('');
  });

  it('endDate defaults to empty string', () => {
    const job = new Job();
    expect(job.endDate).toBe('');
  });

  it('city defaults to empty string', () => {
    const job = new Job();
    expect(job.city).toBe('');
  });

  it('state defaults to empty string', () => {
    const job = new Job();
    expect(job.state).toBe('');
  });

  it('zip defaults to empty string', () => {
    const job = new Job();
    expect(job.zip).toBe('');
  });

  it('street defaults to empty string', () => {
    const job = new Job();
    expect(job.street).toBe('');
  });

  it('lat defaults to 0', () => {
    const job = new Job();
    expect(job.lat).toBe(0);
  });

  it('lng defaults to 0', () => {
    const job = new Job();
    expect(job.lng).toBe(0);
  });

  it('type defaults to "work"', () => {
    const job = new Job();
    expect(job.type).toBe('work');
  });

  it('inherits id from BaseEntity, defaults to empty string', () => {
    const job = new Job();
    expect(job.id).toBe('');
  });

  it('inherits createdAt as ISO string', () => {
    const job = new Job();
    expect(typeof job.createdAt).toBe('string');
    expect(new Date(job.createdAt).toISOString()).toBe(job.createdAt);
  });
});

describe('Job field assignments', () => {
  it('employer can be set', () => {
    const job = new Job();
    job.employer = 'Acme Corp';
    expect(job.employer).toBe('Acme Corp');
  });

  it('startDate can be set', () => {
    const job = new Job();
    job.startDate = '2026-01-01';
    expect(job.startDate).toBe('2026-01-01');
  });

  it('endDate can be set', () => {
    const job = new Job();
    job.endDate = '2026-12-31';
    expect(job.endDate).toBe('2026-12-31');
  });

  it('type can be set to "school"', () => {
    const job = new Job();
    job.type = 'school';
    expect(job.type).toBe('school');
  });

  it('type can be set to "volunteer"', () => {
    const job = new Job();
    job.type = 'volunteer';
    expect(job.type).toBe('volunteer');
  });

  it('type can be set to "seekingWork"', () => {
    const job = new Job();
    job.type = 'seekingWork';
    expect(job.type).toBe('seekingWork');
  });

  it('lat and lng can be set to non-zero coordinates', () => {
    const job = new Job();
    job.lat = 34.0522;
    job.lng = -118.2437;
    expect(job.lat).toBe(34.0522);
    expect(job.lng).toBe(-118.2437);
  });

  it('two Job instances are independent', () => {
    const j1 = new Job();
    const j2 = new Job();
    j1.employer = 'Company A';
    j2.employer = 'Company B';
    expect(j1.employer).not.toBe(j2.employer);
  });
});

describe('jobItems constant', () => {
  it('is defined', () => {
    expect(jobItems).toBeDefined();
  });

  it('School maps to "school"', () => {
    expect(jobItems['School']).toBe('school');
  });

  it('Volunteer maps to "volunteer"', () => {
    expect(jobItems['Volunteer']).toBe('volunteer');
  });

  it('Work maps to "work"', () => {
    expect(jobItems['Work']).toBe('work');
  });

  it('"Seeking Work" maps to "seekingWork"', () => {
    expect(jobItems['Seeking Work']).toBe('seekingWork');
  });

  it('has exactly 4 entries', () => {
    expect(Object.keys(jobItems)).toHaveLength(4);
  });
});
