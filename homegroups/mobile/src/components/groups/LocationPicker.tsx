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
  Dimensions,
  Alert,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import MapView, {Marker, PROVIDER_GOOGLE} from 'react-native-maps';
import {GooglePlacesAutocomplete} from 'react-native-google-places-autocomplete';
import {PERMISSIONS, request, RESULTS} from 'react-native-permissions';
import theme from '../../theme';
import {GOOGLE_MAPS_API_KEY} from '@env';

if (!GOOGLE_MAPS_API_KEY) {
  console.warn('GOOGLE_MAPS_API_KEY is not set in .env — maps will not work');
}

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

  const mapRef = useRef<MapView | null>(null);
  const placesRef = useRef<any>(null);

  useEffect(() => {
    // Initialize with initial values if provided
    if (initialLocation && initialAddress) {
      setLocation(initialLocation);
      setAddress(initialAddress);
      placesRef.current.setAddressText(initialAddress);
      setShowMap(true);
    } else if (initialAddress) {
      // If we have an address but no coordinates, still show the address
      setAddress(initialAddress);
      placesRef.current.setAddressText(initialAddress);
      if (!showMap) {
        // If we don't have coordinates, we'll hide the map but still show the address text
        console.log('Showing address without map:', initialAddress);
      }
    }
  }, [initialLocation, initialAddress]);

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

        // Reverse geocode to get address
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`,
          );
          const data = await response.json();

          if (data.results && data.results.length > 0) {
            const fullAddress = data.results[0].formatted_address;
            setAddress(fullAddress);

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

    // Reverse geocode to get address
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`,
      );
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const fullAddress = data.results[0].formatted_address;
        setAddress(fullAddress);

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

  // Handle place selection from autocomplete
  const handlePlaceSelect = (data: any, details: any = null) => {
    if (details) {
      const {geometry, formatted_address, name} = details;

      setLocation({
        latitude: geometry.location.lat,
        longitude: geometry.location.lng,
      });
      setAddress(formatted_address);
      setPlaceName(name);
      setShowMap(true);

      // Animate map to new location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: geometry.location.lat,
          longitude: geometry.location.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      }

      // Pass location back to parent
      onLocationSelect({
        address: formatted_address,
        latitude: geometry.location.lat,
        longitude: geometry.location.lng,
        placeName: name,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* Google Places Autocomplete */}
      <GooglePlacesAutocomplete
        ref={placesRef}
        placeholder="Search for a location"
        onPress={handlePlaceSelect}
        query={{
          key: GOOGLE_MAPS_API_KEY,
          language: 'en',
          types: 'address',
        }}
        fetchDetails={true}
        onFail={error => console.error('Places API Error:', error)}
        styles={{
          container: {
            ...styles.autocompleteContainer,
            position: 'relative',
            zIndex: 1,
          },
          textInput: styles.autocompleteInput,
          listView: {
            ...styles.autocompleteList,
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 2,
          },
          row: {
            ...styles.autocompleteRow,
            padding: 10,
            height: 44,
          },
          description: {
            ...styles.autocompleteDescription,
            fontSize: 14,
          },
          predefinedPlacesDescription: {
            color: '#1976D2',
          },
        }}
        textInputProps={{
          placeholderTextColor: '#757575',
        }}
        debounce={300}
        enablePoweredByContainer={false}
        listViewDisplayed={true}
        minLength={2}
      />

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
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 0,
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
    // Add appropriate styles for the row
  },
  autocompleteDescription: {
    // Add appropriate styles for the description
  },
});

export default LocationPicker;
