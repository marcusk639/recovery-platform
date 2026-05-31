export class Chore {
  name: string = 'None';
  description: string = 'None';
}

export interface Chores {
  [name: string]: Chore;
}

export const defaultChores: Chores = {
  Bathroom: {
    name: 'Bathroom',
    description: 'Clean the bathroom.'
  },
  'Living Room': {
    name: 'Living Room',
    description: 'Clean the living room.'
  },
  Kitchen: {
    name: 'Kitchen',
    description: 'Clean the kitchen.'
  }
};
