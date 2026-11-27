/**
 * A house's public listing: house-listings/{houseId}, written only by the
 * server (functions/src/houses/houseListing.ts). The only house data a
 * signed-out visitor (the app's anonymous session) may read: house search and
 * the house summary they apply from. No street address, coordinates,
 * residents, staff or billing (EMU-009, owner 2026-11-27).
 */
export interface HouseListing {
  id: string;
  name: string;
  /** Cut to six characters (about a kilometre). */
  geohash: string;
  city?: string;
  state?: string;
  zip?: string;
  gender?: string;
  houseType?: string;
  certified?: boolean;
  rating?: number;
  baths?: number;
  wifi?: boolean;
  avatar?: string;
  imageUrl?: string;
  phoneNumber?: string;
  maximumCapacity?: number;
  currentCapacity?: number;
  openBeds?: number;
  /** Dollars, as on the house. */
  monthlyRent?: number;
  weeklyRent?: number;
  rentFrequency?: string;
  depositsAndFees?: string;
  phaseCount: number;
  roomCount: number;
  bedCount: number;
}
