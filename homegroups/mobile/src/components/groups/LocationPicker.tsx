// src/components/groups/LocationPicker.tsx

import React, {useState, useEffect, useRef} from 'react';
import 'react-native-get-random-values';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Keyboard,
  Alert,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import MapView, {Marker, PROVIDER_GOOGLE} from 'react-native-maps';
import {PERMISSIONS, request, RESULTS} from 'react-native-permissions';
import theme from '../../theme';
import {functions} from '../../services/firebase/config';

// Google Maps web-service calls (geocoding, places autocomplete, place details)
// are proxied through Cloud Functions so no Maps web-services key ships in the
// app bundle. See functions/src/callable/locationServices.ts.
//
// The map render below uses PROVIDER_GOOGLE, which reads a SEPARATE native key
// from AndroidManifest.xml / iOS AppDelegate. That key is unavoidably embedded
// in the binary and must be locked down via Google Cloud Console application +
// API restrictions.

interface PlacePrediction {
  description: string;
  place_id: string;
}

// Opaque session token groups autocomplete keystrokes + the details lookup into
// a single billable Google session. Regenerated after each completed selection.
const newSessionToken = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface LocationProps {
  address: string;
  latitude: number;
  longitude: number;
  placeName?: string;
}

interface LocationPickerProps {
  initialAddress?: string;
  initialLocation?: {
    latitude: number;
    longitude: number;
  };
  onLocationSelect: (location: {
    address: string;
    latitude: number;
    longitude: number;
    placeName?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  }) => void;
  error?: string;
  label?: string;
}

const LocationPicker: React.FC<LocationPickerProps> = ({
  initialAddress = '',
  initialLocation,
  onLocationSelect,
  error,
  label = 'Location',
}) => {
  const [address, setAddress] = useState<string>(initialAddress);
  const [location, setLocation] = useState(initialLocation || null);
  const [placeName, setPlaceName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);

  // Autocomplete state (replaces react-native-google-places-autocomplete).
  const [searchText, setSearchText] = useState<string>(initialAddress);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState<boolean>(false);

  const mapRef = useRef<MapView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(newSessionToken());

  useEffect(() => {
    // Initialize with initial values if provided
    if (initialLocation && initialAddress) {
      setLocation(initialLocation);
      setAddress(initialAddress);
      setSearchText(initialAddress);
      setShowMap(true);
    } else if (initialAddress) {
      // If we have an address but no coordinates, still show the address text
      setAddress(initialAddress);
      setSearchText(initialAddress);
    }
  }, [initialLocation, initialAddress]);

  // Cancel any pending autocomplete debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // --- Places autocomplete (proxied via Cloud Function) ---
  const fetchPredictions = async (input: string) => {
    if (input.trim().length < 2) {
      setPredictions([]);
      return;
    }
    try {
      setSearchingPlaces(true);
      const response = await functions.httpsCallable('placesAutocomplete')({
        input,
        sessionToken: sessionTokenRef.current,
      });
      const data = response.data as {predictions?: PlacePrediction[]};
      setPredictions(data.predictions ?? []);
    } catch (err) {
      console.error('Places autocomplete error:', err);
      setPredictions([]);
    } finally {
      setSearchingPlaces(false);
    }
  };

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const handlePredictionSelect = async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setPredictions([]);
    setSearchText(prediction.description);
    try {
      setLoading(true);
      const response = await functions.httpsCallable('placeDetails')({
        placeId: prediction.place_id,
        sessionToken: sessionTokenRef.current,
      });
      // A details lookup ends the billing session — start a fresh token.
      sessionTokenRef.current = newSessionToken();

      const details = (response.data as {result?: any}).result;
      if (!details || !details.geometry) {
        return;
      }
      const {geometry, formatted_address, name} = details;
      const lat = geometry.location.lat;
      const lng = geometry.location.lng;

      setLocation({latitude: lat, longitude: lng});
      setAddress(formatted_address);
      setPlaceName(name || '');
      setShowMap(true);

      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      }

      onLocationSelect({
        address: formatted_address,
        latitude: lat,
        longitude: lng,
        placeName: name || undefined,
      });
    } catch (err) {
      console.error('Place details error:', err);
      Alert.alert('Location Error', 'Unable to load that location.');
    } finally {
      setLoading(false);
    }
  };

  // Request location permission
  const requestLocationPermission = async () => {
    try {
      const permission =
        Platform.OS === 'ios'
          ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
          : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

      const result = await request(permission);

      if (result === RESULTS.GRANTED) {
        return true;
      } else {
        setPermissionDenied(true);
        return false;
      }
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  // Get current location
  const getCurrentLocation = async () => {
    setLoading(true);

    const hasPermission = await requestLocationPermission();

    if (!hasPermission) {
      Alert.alert(
        'Location Permission',
        'We need permission to access your location. Please enable location services for this app in your settings.',
        [{text: 'OK', onPress: () => setLoading(false)}],
      );
      return;
    }

    Geolocation.getCurrentPosition(
      async position => {
        const {latitude, longitude} = position.coords;

        setLocation({latitude, longitude});
        setShowMap(true);

        // Reverse geocode to get address (proxied via Cloud Function)
        try {
          const response = await functions.httpsCallable(
            'reverseGeocodeLocation',
          )({latitude, longitude});
          const data = response.data as {results?: any[]};

          if (data.results && data.results.length > 0) {
            const fullAddress = data.results[0].formatted_address;
            setAddress(fullAddress);
            setSearchText(fullAddress);

            // Try to extract place name from results
            const addressComponents = data.results[0].address_components;
            const pointOfInterest = addressComponents.find((component: any) =>
              component.types.includes('point_of_interest'),
            );
            const premise = addressComponents.find((component: any) =>
              component.types.includes('premise'),
            );
            const establishment = addressComponents.find((component: any) =>
              component.types.includes('establishment'),
            );

            if (pointOfInterest) {
              setPlaceName(pointOfInterest.long_name);
            } else if (premise) {
              setPlaceName(premise.long_name);
            } else if (establishment) {
              setPlaceName(establishment.long_name);
            }

            // Pass location back to parent
            onLocationSelect({
              address: fullAddress,
              latitude,
              longitude,
              placeName: placeName || undefined,
            });
          }
        } catch (error) {
          console.error('Error in reverse geocoding:', error);
        }

        setLoading(false);
      },
      error => {
        console.error('Error getting location:', error);
        setLoading(false);
        Alert.alert(
          'Location Error',
          'Unable to get your current location. Please enter an address manually.',
        );
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
    );
  };

  // Handle map marker drag
  const handleMarkerDrag = async (e: any) => {
    const {latitude, longitude} = e.nativeEvent.coordinate;

    setLocation({latitude, longitude});

    // Reverse geocode to get address (proxied via Cloud Function)
    try {
      const response = await functions.httpsCallable('reverseGeocodeLocation')({
        latitude,
        longitude,
      });
      const data = response.data as {results?: any[]};

      if (data.results && data.results.length > 0) {
        const fullAddress = data.results[0].formatted_address;
        setAddress(fullAddress);
        setSearchText(fullAddress);

        // Try to extract place name from results as before
        const addressComponents = data.results[0].address_components;
        const pointOfInterest = addressComponents.find((component: any) =>
          component.types.includes('point_of_interest'),
        );
        const premise = addressComponents.find((component: any) =>
          component.types.includes('premise'),
        );
        const establishment = addressComponents.find((component: any) =>
          component.types.includes('establishment'),
        );

        let newPlaceName = '';
        if (pointOfInterest) {
          newPlaceName = pointOfInterest.long_name;
        } else if (premise) {
          newPlaceName = premise.long_name;
        } else if (establishment) {
          newPlaceName = establishment.long_name;
        }

        setPlaceName(newPlaceName);

        // Update location in parent component
        onLocationSelect({
          address: fullAddress,
          latitude,
          longitude,
          placeName: newPlaceName || undefined,
        });
      }
    } catch (error) {
      console.error('Error in reverse geocoding after drag:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* Address autocomplete (proxied via Cloud Function) */}
      <View style={styles.autocompleteContainer}>
        <TextInput
          style={styles.autocompleteInput}
          placeholder="Search for a location"
          placeholderTextColor="#757575"
          value={searchText}
          onChangeText={handleSearchTextChange}
          autoCorrect={false}
        />
        {searchingPlaces && (
          <ActivityIndicator
            size="small"
            color="#2196F3"
            style={styles.searchSpinner}
          />
        )}
        {predictions.length > 0 && (
          <View style={styles.autocompleteList}>
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={predictions}
              keyExtractor={item => item.place_id}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.autocompleteRow}
                  onPress={() => handlePredictionSelect(item)}>
                  <Text style={styles.autocompleteDescription}>
                    {item.description}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* Current Location Button */}
      <View style={styles.locationButtonContainer}>
        <TouchableOpacity
          style={styles.currentLocationButton}
          onPress={getCurrentLocation}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <Text style={styles.currentLocationText}>Use Current Location</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Map View */}
      {showMap && location && (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            showsUserLocation={true}
            showsMyLocationButton={true}
            showsCompass={true}
            moveOnMarkerPress={false}
            loadingEnabled={true}>
            <Marker
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              draggable
              onDragEnd={handleMarkerDrag}
              title={placeName || 'Location'}
              description={address}
            />
          </MapView>
        </View>
      )}

      {/* Location Details */}
      {(location && address) || (!location && address) ? (
        <View style={styles.locationDetailsContainer}>
          {placeName && <Text style={styles.placeNameText}>{placeName}</Text>}
          <Text style={styles.addressText}>{address}</Text>
        </View>
      ) : null}

      <Text style={styles.helperText}>
        Search for a location or use your current location. You can also drag
        the pin on the map to adjust the exact location.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  label: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
  },
  autocompleteContainer: {
    flex: 0,
    position: 'relative',
    zIndex: 1,
  },
  autocompleteInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#212121',
  },
  autocompleteList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#FFFFFF',
    zIndex: 2,
  },
  searchSpinner: {
    position: 'absolute',
    right: 12,
    top: 15,
  },
  locationButtonContainer: {
    marginTop: 12,
    marginBottom: 16,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    alignSelf: 'flex-start',
  },
  currentLocationText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginBottom: 8,
  },
  mapContainer: {
    height: 250,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  locationDetailsContainer: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  placeNameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: '#424242',
  },
  helperText: {
    color: '#757575',
    fontSize: 12,
  },
  autocompleteRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  autocompleteDescription: {
    fontSize: 14,
    color: '#212121',
  },
});

export default LocationPicker;
