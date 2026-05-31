export interface LatitudeLongitude {
  lat: number;
  lng: number;
}

export interface LocationsAPIResponse {
  id: number;
  name: string;
  email: null | string;
  url: string;
  api: string;
  state: null | string;
  last_import: string;
  updated_at: string;
  latitude: null | string;
  longitude: null | string;
  count_meetings: number;
  slug: string;
  location: string;
  phone: null | string;
  country: Country | null;
  last_survey: string;
  platform: Platform | null;
  plugin: null | string;
  published_at: string;
  count_errors: number;
  status_id: number;
  title: null | string;
  count_conflicts: number;
  north: string;
  east: string;
  south: string;
  west: string;
  boundary: LatitudeLongitude[];
  has_detailed_boundary: boolean;
  last_survey_attempt: string;
  meetings_url: null;
  api_open: number;
  address: null | string;
  email_admin: null | string;
  email_meetings: null | string;
  email_technical: null | string;
  image_url: null | string;
  website_participation: number | null;
  image_width: number | null;
  image_height: number | null;
}

export enum Country {
  CA = "CA",
  Ch = "CH",
  De = "DE",
  Fr = "FR",
  Hk = "HK",
  IL = "IL",
  Jp = "JP",
  MX = "MX",
  Pl = "PL",
  Ro = "RO",
  Si = "SI",
  Us = "US"
}

export enum Platform {
  ASPNet = "ASP.net",
  ColdFusion = "ColdFusion",
  CustomPHP = "Custom PHP",
  Dreamweaver = "Dreamweaver",
  Drupal = "Drupal",
  Firewall = "Firewall",
  FrontPage = "FrontPage",
  GoDaddy = "GoDaddy",
  GoogleSites = "Google Sites",
  HAPedit = "HAPedit",
  Joomla = "Joomla!",
  Squarespace = "Squarespace",
  Weebly = "Weebly",
  Wix = "Wix",
  WordPress = "WordPress"
}
