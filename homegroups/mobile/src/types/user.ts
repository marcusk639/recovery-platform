import {SponsorSettings} from './sponsorship';

export interface UserData {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  sobrietyStartDate?: string | null;
  photoURL?: string;
  notificationSettings?: {
    meetings: boolean;
    announcements: boolean;
    celebrations: boolean;
    sponsorship: boolean;
  };
  privacySettings?: {
    showSobrietyDate: boolean;
    showPhoneNumber: boolean;
    allowDirectMessages: boolean;
    sponsorship: boolean;
  };
  sponsorSettings?: SponsorSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  sobrietyStartDate?: string;
  privacySettings?: {
    showSobrietyDate: boolean;
    showPhoneNumber: boolean;
    allowDirectMessages: boolean;
  };
  notificationSettings?: {
    meetings: boolean;
    announcements: boolean;
    celebrations: boolean;
  };
  sponsorSettings?: {
    isAvailable: boolean;
    maxSponsees: number;
    requirements: string[];
    bio?: string;
  };
  createdAt: string;
  updatedAt: string;
}
