// src/integration/meetings.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration

import { addMeeting, updateMeeting, deleteMeeting } from '../services/meeting';
import { RatsMeeting } from '../entities/Meeting';
import { firestore } from '../../firebase-setup';

const BASE_MEETING: RatsMeeting = {
  name: 'AA Tuesday Night',
  type: 'AA',
  day: 'tuesday',
  time: '19:00',
  street: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('meeting service (integration)', () => {
  const createdMeetingIds: string[] = [];

  afterEach(async () => {
    await Promise.all(
      createdMeetingIds.map(id =>
        firestore.collection('meetings').doc(id).delete(),
      ),
    );
    createdMeetingIds.length = 0;
  });

  describe('addMeeting', () => {
    it('creates a meeting document in Firestore with correct fields', async () => {
      const meeting = await addMeeting({ ...BASE_MEETING });
      createdMeetingIds.push(meeting.id!);

      const doc = await firestore.collection('meetings').doc(meeting.id!).get();
      expect(doc.exists).toBe(true);

      const data = doc.data();
      expect(data?.name).toBe('AA Tuesday Night');
      expect(data?.type).toBe('AA');
      expect(data?.day).toBe('tuesday');
      expect(data?.time).toBe('19:00');
      expect(data?.street).toBe('123 Main St');
    });

    it('assigns an id when none is provided', async () => {
      const meetingWithoutId = { ...BASE_MEETING };
      delete meetingWithoutId.id;

      const meeting = await addMeeting(meetingWithoutId);
      createdMeetingIds.push(meeting.id!);

      expect(meeting.id).toBeDefined();
      expect(typeof meeting.id).toBe('string');
      expect(meeting.id!.length).toBeGreaterThan(0);

      // Document should exist in Firestore under the generated id
      const doc = await firestore.collection('meetings').doc(meeting.id!).get();
      expect(doc.exists).toBe(true);
    });

    it('uses the provided id when one is given', async () => {
      const customId = 'custom-meeting-integration-123';
      const meeting = await addMeeting({ ...BASE_MEETING, id: customId });
      createdMeetingIds.push(meeting.id!);

      expect(meeting.id).toBe(customId);

      const doc = await firestore.collection('meetings').doc(customId).get();
      expect(doc.exists).toBe(true);
    });

    it('returns the meeting object with all original fields intact', async () => {
      const meeting = await addMeeting({ ...BASE_MEETING, name: 'NA Monday' });
      createdMeetingIds.push(meeting.id!);

      expect(meeting.name).toBe('NA Monday');
      expect(meeting.type).toBe('AA');
      expect(meeting.day).toBe('tuesday');
    });
  });

  describe('updateMeeting', () => {
    it('updates specified fields in Firestore', async () => {
      const meeting = await addMeeting({ ...BASE_MEETING });
      createdMeetingIds.push(meeting.id!);

      await updateMeeting(meeting.id!, { name: 'AA Wednesday Night', day: 'wednesday' });

      const doc = await firestore.collection('meetings').doc(meeting.id!).get();
      expect(doc.data()?.name).toBe('AA Wednesday Night');
      expect(doc.data()?.day).toBe('wednesday');
    });

    it('leaves unspecified fields unchanged after update', async () => {
      const meeting = await addMeeting({ ...BASE_MEETING });
      createdMeetingIds.push(meeting.id!);

      await updateMeeting(meeting.id!, { name: 'AA Thursday Night' });

      const doc = await firestore.collection('meetings').doc(meeting.id!).get();
      // Updated field
      expect(doc.data()?.name).toBe('AA Thursday Night');
      // Unchanged fields
      expect(doc.data()?.type).toBe('AA');
      expect(doc.data()?.time).toBe('19:00');
      expect(doc.data()?.street).toBe('123 Main St');
    });
  });

  describe('deleteMeeting', () => {
    it('removes the meeting document from Firestore', async () => {
      // Don't track in createdMeetingIds — deleteMeeting handles cleanup
      const meeting = await addMeeting({ ...BASE_MEETING });

      await deleteMeeting(meeting);

      const doc = await firestore.collection('meetings').doc(meeting.id!).get();
      expect(doc.exists).toBe(false);
    });

    it('does not affect other meeting documents', async () => {
      const meetingA = await addMeeting({ ...BASE_MEETING, name: 'Meeting A' });
      const meetingB = await addMeeting({ ...BASE_MEETING, name: 'Meeting B' });
      createdMeetingIds.push(meetingB.id!);

      await deleteMeeting(meetingA);

      // Meeting A should be gone
      const docA = await firestore.collection('meetings').doc(meetingA.id!).get();
      expect(docA.exists).toBe(false);

      // Meeting B should still exist
      const docB = await firestore.collection('meetings').doc(meetingB.id!).get();
      expect(docB.exists).toBe(true);
      expect(docB.data()?.name).toBe('Meeting B');
    });
  });
});
