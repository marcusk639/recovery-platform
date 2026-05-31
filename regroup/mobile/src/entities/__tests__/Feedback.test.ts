import { Feedback } from '../Feedback';

describe('Feedback class defaults', () => {
  it('can be instantiated with no arguments', () => {
    const feedback = new Feedback();
    expect(feedback).toBeInstanceOf(Feedback);
  });

  it('description defaults to empty string', () => {
    const feedback = new Feedback();
    expect(feedback.description).toBe('');
  });

  it('reviewer defaults to empty string', () => {
    const feedback = new Feedback();
    expect(feedback.reviewer).toBe('');
  });

  it('type defaults to "app"', () => {
    const feedback = new Feedback();
    expect(feedback.type).toBe('app');
  });

  it('houseId defaults to empty string', () => {
    const feedback = new Feedback();
    expect(feedback.houseId).toBe('');
  });

  it('inherits id from BaseEntity, defaults to empty string', () => {
    const feedback = new Feedback();
    expect(feedback.id).toBe('');
  });

  it('inherits createdAt from BaseEntity as ISO string', () => {
    const feedback = new Feedback();
    expect(typeof feedback.createdAt).toBe('string');
    expect(new Date(feedback.createdAt).toISOString()).toBe(feedback.createdAt);
  });

  it('inherits updatedAt from BaseEntity as ISO string', () => {
    const feedback = new Feedback();
    expect(typeof feedback.updatedAt).toBe('string');
    expect(new Date(feedback.updatedAt).toISOString()).toBe(feedback.updatedAt);
  });
});

describe('Feedback field assignments', () => {
  it('description can be set after construction', () => {
    const feedback = new Feedback();
    feedback.description = 'The app is great!';
    expect(feedback.description).toBe('The app is great!');
  });

  it('reviewer can be set after construction', () => {
    const feedback = new Feedback();
    feedback.reviewer = 'user-abc';
    expect(feedback.reviewer).toBe('user-abc');
  });

  it('type can be set to "house"', () => {
    const feedback = new Feedback();
    feedback.type = 'house';
    expect(feedback.type).toBe('house');
  });

  it('type remains "app" by default and can be set to "house"', () => {
    const feedback = new Feedback();
    expect(feedback.type).toBe('app');
    feedback.type = 'house';
    expect(feedback.type).toBe('house');
  });

  it('houseId can be set after construction', () => {
    const feedback = new Feedback();
    feedback.houseId = 'house-999';
    expect(feedback.houseId).toBe('house-999');
  });

  it('id can be set after construction', () => {
    const feedback = new Feedback();
    feedback.id = 'feedback-doc-id';
    expect(feedback.id).toBe('feedback-doc-id');
  });

  it('all fields can be set independently', () => {
    const feedback = new Feedback();
    feedback.description = 'Needs more structure';
    feedback.reviewer = 'user-001';
    feedback.type = 'house';
    feedback.houseId = 'house-001';
    feedback.id = 'fb-001';

    expect(feedback.description).toBe('Needs more structure');
    expect(feedback.reviewer).toBe('user-001');
    expect(feedback.type).toBe('house');
    expect(feedback.houseId).toBe('house-001');
    expect(feedback.id).toBe('fb-001');
  });

  it('two Feedback instances are independent', () => {
    const f1 = new Feedback();
    const f2 = new Feedback();
    f1.description = 'Feedback A';
    f2.description = 'Feedback B';
    expect(f1.description).not.toBe(f2.description);
  });

  it('uid is undefined by default (optional legacy field)', () => {
    const feedback = new Feedback();
    expect(feedback.uid).toBeUndefined();
  });

  it('createdBy is undefined by default', () => {
    const feedback = new Feedback();
    expect(feedback.createdBy).toBeUndefined();
  });
});
