import * as yup from 'yup';

export class Chore {
  name: string = 'None';
  description: string = 'None';
}

export const choreSchema = yup.object().shape({
  name: yup.string().required(),
  description: yup.string().required()
});

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
