import * as yup from 'yup';

export class Chore {
  name: string = 'None';
  description: string = 'None';

  constructor() {
    // Ensure name is never empty
    if (!this.name || this.name.trim() === '') {
      this.name = 'New Chore';
    }
  }
}

export const choreSchema = yup.object().shape({
  name: yup.string().required(),
  description: yup.string().required(),
});

export interface Chores {
  [name: string]: Chore;
}

export interface ChoreRotation {
  choreName: string; // e.g. "Kitchen" — the single chore this rotation controls
  guestIds: string[]; // ordered list of guest IDs for round-robin
  currentIndex: number; // index into guestIds of the CURRENT assignee
  lastRotatedAt: string; // ISO date string (YYYY-MM-DD) of the most recent Sunday rotation
}

export const defaultChores: Chores = {
  Bathroom: {
    name: 'Bathroom',
    description: 'Clean the bathroom.',
  },
  'Living Room': {
    name: 'Living Room',
    description: 'Clean the living room.',
  },
  Kitchen: {
    name: 'Kitchen',
    description: 'Clean the kitchen.',
  },
};
