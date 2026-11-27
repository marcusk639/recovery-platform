import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { HouseListing } from '../entities/HouseListing';
import { HouseSearch } from '../entities/HouseSearch';
import { getGeohashRange } from '../util/geolocation';
import { logException } from '../util/logging';

/**
 * Public house listings (house-listings/{houseId}), the house data a
 * signed-out visitor may read: houses/{houseId} is for the house's members
 * only (EMU-009, owner 2026-11-27). The server writes them.
 */
export const houseListingCollection = collection(firestore, 'house-listings');

const SEARCH_RADIUS_MILES = 25;
/** At most this many listings per search: the data is public, so bound the read. */
const SEARCH_LIMIT = 200;

/**
 * Listed houses within 25 miles of the search location, optionally of one
 * gender. The listing geohash is cut to six characters, so the range is in
 * whole cells, and a house at the very edge may fall either side of it.
 */
export async function searchHouseListings(searchData: HouseSearch): Promise<HouseListing[]> {
  const location = searchData.filters?.location;
  if (!location?.lat || !location?.lng) return [];
  const range = getGeohashRange(location.lat, location.lng, SEARCH_RADIUS_MILES);
  try {
    const snap = await getDocs(
      query(
        houseListingCollection,
        where('geohash', '>=', range.lower.slice(0, 6)),
        where('geohash', '<=', range.upper),
        limit(SEARCH_LIMIT),
      ),
    );
    const listings = snap.docs.map((d) => d.data() as HouseListing);
    const gender = searchData.filters?.gender;
    return gender ? listings.filter((l) => l.gender === gender) : listings;
  } catch (error) {
    logException(error);
    throw new Error('Could not search houses. Please try again.');
  }
}

/** One house's public listing, or null when it isn't listed. */
export async function getHouseListing(houseId: string): Promise<HouseListing | null> {
  try {
    const snap = await getDoc(doc(houseListingCollection, houseId));
    return snap.exists() ? (snap.data() as HouseListing) : null;
  } catch (error) {
    logException(error);
    throw new Error('Could not load this house. Please try again.');
  }
}
