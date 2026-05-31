import { HouseApplication } from '../../entities/Application';

describe('HouseApplication entity', () => {
  it('initializes with status pending', () => {
    expect(new HouseApplication().status).toBe('pending');
  });

  it('initializes all string fields to empty string', () => {
    const app = new HouseApplication();
    expect(app.houseId).toBe('');
    expect(app.applicantUid).toBe('');
    expect(app.applicantName).toBe('');
    expect(app.applicantEmail).toBe('');
    expect(app.applicantPhone).toBe('');
    expect(app.sobrietyDate).toBe('');
    expect(app.currentSituation).toBe('');
    expect(app.references).toBe('');
    expect(app.operatorNote).toBe('');
    expect(app.reviewedAt).toBe('');
    expect(app.reviewedBy).toBe('');
    expect(app.createdAt).toBe('');
  });

  it('defaults programType to AA', () => {
    expect(new HouseApplication().programType).toBe('AA');
  });
});
