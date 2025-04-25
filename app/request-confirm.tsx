import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Stack } from 'expo-router';

export default function RequestConfirmScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [accepted, setAccepted] = useState(true); // Simulate request accepted

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Location permission denied');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
  <View style={{
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  }}>

  
        <MapView
          style={styles.map}
          showsUserLocation
          initialRegion={{
            latitude: location?.latitude || 36.87,
            longitude: location?.longitude || 42.99,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          {location && (
            <Marker
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              title="Your Location"
            />
          )}
        </MapView>

        <View style={styles.card}>
          <Text style={styles.status}>
            {accepted ? 'Driver is on the way 🚚' : 'Waiting for a driver...'}
          </Text>
          {accepted && (
            <TouchableOpacity style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel Request</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#fff',
    width: '100%',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 10,
  },
  status: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: '#e53935',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});