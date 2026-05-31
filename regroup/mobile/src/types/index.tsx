import { House } from '../entities/House';
import { Guest } from '../entities/Guest';
import { Notification } from '../entities/Notification';
import Admin from '../entities/Admin';

export interface Guests {
  [key: string]: Guest;
}

export interface Houses {
  [key: string]: House;
}

export interface Admins {
  [key: string]: Admin;
}

export interface Notifications {
  [key: string]: Notification;
}

export interface Action {
  type: string;
  error?: any;
}

export interface BaseState {
  error?: any;
}

export interface GuestProps {
  guest: Guest;
  house: House;
  updateGuest: (guestId: string, updates: Partial<Guest>) => any;
}

export interface Position {
  mocked: boolean;
  timestamp: number;
  coords: {
    speed: number;
    heading: number;
    accuracy: number;
    altitude: number;
    longitude: number;
    latitude: number;
  };
}
