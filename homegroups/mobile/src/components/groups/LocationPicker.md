# Enhanced LocationPicker Implementation Guide

## Required Dependencies

To use the enhanced LocationPicker, you'll need to install several packages:

```bash
# Install core packages
npm install react-native-maps react-native-google-places-autocomplete react-native-permissions

# For iOS, install pods
cd ios && pod install && cd ..
```

## Configuration

### 1. Google Maps API Key

You'll need a Google Maps API key with the following APIs enabled:

- Maps SDK for Android/iOS
- Places API
- Geocoding API

#### For Android:

Edit `android/app/src/main/AndroidManifest.xml` and add:

```xml
<application>
   <!-- Add your API key here -->
   <meta-data
     android:name="com.google.android.geo.API_KEY"
     android:value="YOUR_GOOGLE_MAPS_API_KEY"/>
</application>
```

#### For iOS:

Edit `ios/YourApp/AppDelegate.m` and add:

```objective-c
#import <GoogleMaps/GoogleMaps.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [GMSServices provideAPIKey:@"YOUR_GOOGLE_MAPS_API_KEY"];
  // ...
}
@end
```

### 2. Permission Configuration

#### For iOS:

Add to `ios/YourApp/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to find meetings near you</string>
```

#### For Android:

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

## Usage Example

Here's how to integrate the LocationPicker into your group creation flow:

```tsx
import React, {useState} from 'react';
import {View} from 'react-native';
import LocationPicker from '../components/groups/LocationPicker';

const CreateGroupScreen = () => {
  const [location, setLocation] = useState({
    address: '',
    latitude: 0,
    longitude: 0,
    placeName: '',
  });

  const handleLocationSelect = selectedLocation => {
    setLocation(selectedLocation);

    // You can use the location data in your form
    console.log('Selected location:', selectedLocation);
  };

  return (
    <View>
      {/* Other form fields */}

      <LocationPicker
        onLocationSelect={handleLocationSelect}
        error={locationError} // Pass any validation errors here
      />

      {/* Rest of your form */}
    </View>
  );
};

export default CreateGroupScreen;
```

## Key Features

1. **Place Autocomplete**: Users can search for locations by name
2. **Current Location**: One-tap access to the user's current location
3. **Interactive Map**: Draggable marker for precise location selection
4. **Reverse Geocoding**: Automatically converts coordinates to readable addresses
5. **Place Name Detection**: Attempts to extract establishment names for easier identification

## Customization Options

You can customize the LocationPicker by passing these optional props:

- `initialAddress`: Pre-fill with an existing address
- `initialLocation`: Pre-fill with coordinates (latitude/longitude)
- `mapHeight`: Customize the height of the map (default: 250)
- `placeholder`: Custom placeholder for the search input
- `errorText`: Custom error message

## Security Considerations

1. **API Key Protection**: Ensure your Google Maps API key is restricted to your app's bundle ID/package name and has appropriate usage quotas set.

2. **User Privacy**: The component requests location permissions only when needed and provides clear feedback when permissions are denied.

## Performance Considerations

1. The map component is only rendered after a location is selected to minimize performance impact.

2. Autocomplete requests are debounced (300ms) to prevent excessive API calls.

3. Consider enabling the Maps SDK offline caching for improved performance.
