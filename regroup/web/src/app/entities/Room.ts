import { BaseEntity } from './BaseEntity';

class Bed extends BaseEntity {
  guestId: string;
  modifiedDate: string;
}

export interface Beds {
  [name: string]: Bed;
}

class Room extends BaseEntity {
  beds: Beds;
}

export interface Rooms {
  [name: string]: Room;
}

export { Bed, Room };
