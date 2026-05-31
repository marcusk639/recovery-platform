import { BaseEntity } from './BaseEntity';
import Week from './Week';

class WeeklyReport extends BaseEntity {
  guestId: string;
  startDate: string;
  endDate: string;
  hoursWorked: number | string;
  step: number | string;
  medication: number | string;
  choreCompleted: number | string;
  metPrimarySupporter: boolean;
  meeting: number | string;
}

export default WeeklyReport;
