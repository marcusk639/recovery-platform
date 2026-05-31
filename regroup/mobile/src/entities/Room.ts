import { BaseEntity } from './BaseEntity';

class Bed extends BaseEntity {
  guestId: string | null;

  constructor(name: string, guestId: string) {
    super();
    this.id = name;
    this.guestId = guestId;
  }
}

export interface Beds {
  [name: string]: Bed;
}

class Room extends BaseEntity {
  beds: Beds;

  constructor(name: string, beds?: Beds) {
    super();
    this.id = name;
    this.beds = beds || {};
  }
}

export interface Rooms {
  [name: string]: Room;
}

export { Bed, Room };
