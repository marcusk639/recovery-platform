import { Activity, ActivityType } from './Guest';

export class MeetingActivity extends Activity {
  type: ActivityType = 'meeting';
  meetingName: string = '';
  meetingTime: string = '';
  meetingLocation: string = '';
}

export class WorkActivity extends Activity {
  type: ActivityType = 'work';
  hours: number | string = '';
}

export class MedicationActivity extends Activity {
  type: ActivityType = 'medication';
  medication: string = '';
  amount: string = '';
}

export class SupporterActivity extends Activity {
  type: ActivityType = 'supporter';
  supporterName: string = '';
  location: string = '';
}

export class ChoreActivity extends Activity {
  type: ActivityType = 'chore';
}
