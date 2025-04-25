import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  Text, 
  Platform, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  SafeAreaView,
  Dimensions,
  StatusBar
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

interface Driver {
  id: string;
  name: string;
  carNumber: string;
  location?: {
    lat: number;
    lng: number;
  };
}

interface MapViewTabProps {
  drivers: Driver[];
  currentDriverId?: string;
}

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.15;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

export default function MapViewTab({ drivers, currentDriverId }: MapViewTabProps) {
  const mapRef = useRef<MapView | null>(null);
  const [isTracking, setIsTracking] = useState(!!currentDriverId);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  useEffect(() => {
    if (!currentDriverId) return;

    let locationInterval: NodeJS.Timeout;

    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          Alert.alert(
            'Permission Denied', 
            'Location permission is required for tracking.',
            [{ text: 'OK', style: 'default' }]
          );
          setIsTracking(false);
          return;
        }

        const updateLocation = async () => {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High
            });
            
            const { latitude, longitude } = location.coords;

            console.log('📍 Updating driver location:', latitude, longitude);

            await updateDoc(doc(db, 'drivers', currentDriverId), {
              location: {
                lat: latitude,
                lng: longitude,
              },
            });
          } catch (err) {
            console.error('❌ Error getting current location:', err);
          }
        };

        await updateLocation();
        locationInterval = setInterval(updateLocation, 10000);
        setIsTracking(true);

      } catch (err) {
        console.error('❌ Error tracking location:', err);
        setIsTracking(false);
      }
    };

    startTracking();

    return () => {
      if (locationInterval) clearInterval(locationInterval);
    };
  }, [currentDriverId]);

  useEffect(() => {
    fitAllDriversOnMap();
  }, [drivers]);

  const fitAllDriversOnMap = () => {
    const driverCoords = drivers
      .filter(d => d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number')
      .map(d => ({
        latitude: d.location!.lat,
        longitude: d.location!.lng,
      }));

    if (driverCoords.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(driverCoords, {
        edgePadding: { 
          top: height * 0.15, 
          bottom: height * 0.15, 
          left: width * 0.15, 
          right: width * 0.15 
        },
        animated: true,
      });
    }
  };

  const handleRecenter = () => {
    fitAllDriversOnMap();
    setSelectedDriver(null);
  };

  const handleMarkerPress = (driver: Driver) => {
    setSelectedDriver(driver);
    
    if (driver.location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: driver.location.lat,
        longitude: driver.location.lng,
        latitudeDelta: LATITUDE_DELTA / 2,
        longitudeDelta: LONGITUDE_DELTA / 2,
      }, 500);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.fallbackContainer}>
        <View style={styles.fallbackContent}>
          <Ionicons name="map-outline" size={64} color="#ccc" />
          <Text style={styles.fallbackTitle}>Map Not Available</Text>
          <Text style={styles.fallbackText}>
            The map view is not supported on web platforms.
            Please run this application on a mobile device or tablet.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <MapView
  ref={mapRef}
  style={styles.map}
  showsUserLocation
  showsMyLocationButton={false}
  showsCompass
  showsScale
  showsTraffic={false}
  initialRegion={{
    latitude: 36.845669,
    longitude: 42.779006,
    latitudeDelta: LATITUDE_DELTA,
    longitudeDelta: LONGITUDE_DELTA,
  }}
>
        {drivers.map(driver => {
          const loc = driver.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            const isCurrentDriver = driver.id === currentDriverId;
            return (
              <Marker
                key={driver.id}
                coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                title={driver.name}
                description={`Car: ${driver.carNumber}`}
                onPress={() => handleMarkerPress(driver)}
                pinColor={isCurrentDriver ? '#4CAF50' : '#1976D2'}
              />
            );
          }
          return null;
        })}
      </MapView>

      {/* Map Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          onPress={handleRecenter}
          style={styles.controlButton}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={24} color="#fff" />
        </TouchableOpacity>

        {currentDriverId && (
          <TouchableOpacity
            style={[
              styles.controlButton,
              { backgroundColor: isTracking ? '#4CAF50' : '#F44336' }
            ]}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={isTracking ? "radio" : "radio-outline"} 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Driver Info Card */}
      {selectedDriver && (
        <View style={styles.driverInfoCard}>
          <View style={styles.driverInfoHeader}>
            <Text style={styles.driverName}>{selectedDriver.name}</Text>
            <TouchableOpacity onPress={() => setSelectedDriver(null)}>
              <Ionicons name="close-circle-outline" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <View style={styles.driverInfoDetails}>
            <View style={styles.driverInfoRow}>
              <Ionicons name="car-outline" size={18} color="#666" />
              <Text style={styles.driverInfoText}>Car: {selectedDriver.carNumber}</Text>
            </View>
            {selectedDriver.location && (
              <View style={styles.driverInfoRow}>
                <Ionicons name="location-outline" size={18} color="#666" />
                <Text style={styles.driverInfoText}>
                  Location: {selectedDriver.location.lat.toFixed(5)}, {selectedDriver.location.lng.toFixed(5)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legendContainer}>
        <Text style={styles.legendTitle}>Legend</Text>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#1976D2' }]} />
          <Text style={styles.legendText}>Other Drivers</Text>
        </View>
        {currentDriverId && (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>Your Location</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  map: {
    flex: 1,
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  fallbackContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  fallbackText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    maxWidth: 400,
  },
  controlsContainer: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'column',
    alignItems: 'center',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  driverInfoCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 80,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxWidth: 480,
    marginHorizontal: 'auto',
  },
  driverInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  driverName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  driverInfoDetails: {
    marginTop: 4,
  },
  driverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  driverInfoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  legendContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? (height > 812 ? 44 : 20) : StatusBar.currentHeight || 0,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  legendTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 6,
    color: '#333',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
});