export interface CelebrateRecoveryMeetings {
  markers: Markers;
}

export interface Markers {
  limited: string[];
  marker: CelebrateRecoveryMeeting[];
}

export interface CelebrateRecoveryMeeting {
  name: string[];
  category: string[];
  markertype: string[];
  featured: string[];
  address: string[];
  lat: string[];
  lng: string[];
  distance: string[];
  fulladdress: string[];
  phone: string[];
  url: string[];
  email: string[];
  facebook: string[];
  twitter: string[];
  tags: string[];
  custom1: Custom[];
  custom2: Custom[];
  custom3: Custom[];
  custom4: Custom[];
  custom5: Custom[];
  logo_url: string[];
}

export interface Custom {
  _: string;
  $: GeneratedType;
}

export interface GeneratedType {
  name: string;
}
