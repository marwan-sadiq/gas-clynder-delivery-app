import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
  Platform,
  Clipboard,
  ScrollView,
  RefreshControl,
} from 'react-native';
import MapView, { Marker, Polyline, Callout } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getRoutePolyline } from '../utils/getRoutePolyline';
import { Ionicons } from '@expo/vector-icons';
import  { MarkerAnimated,  AnimatedRegion } from 'react-native-maps';

interface FirebaseLocation {
  lat: number;
  lng: number;
}

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface DeliveryRequest {
  id: string;
  driverId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  location: FirebaseLocation;
  // Add other fields as needed
}

interface Driver {
  id: string;
  name: string;
  status: 'available' | 'active' | 'offline';
  location: FirebaseLocation;
  phone: string;
  carNumber: string;
  // Add other fields as needed
}

// Conversion utility
const toCoords = (loc: FirebaseLocation): LocationCoords => ({
  latitude: loc.lat,
  longitude: loc.lng,
});

export default function OrderScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams();
  const mapRef = useRef<MapView | null>(null);
  const driverAnimatedRegion = useRef<AnimatedRegion | null>(null);
  const [driverLocation, setDriverLocation] = useState<LocationCoords | null>(null);
  const [customerLocation, setCustomerLocation] = useState<LocationCoords | null>(null);
  const [driverInfo, setDriverInfo] = useState<Driver | null>(null);
  const [routeCoords, setRouteCoords] = useState<LocationCoords[]>([]);
  const [eta, setEta] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverAvailable, setDriverAvailable] = useState(false);
  const previousLocation = useRef<LocationCoords | null>(null);
  const previousDriverLocation = useRef<LocationCoords | null>(null);
  const mapFitted = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);

  // Memoize heading calculation
  const calculateHeading = useCallback((routePoints: LocationCoords[]): number => {
    if (routePoints.length < 2) return 0;
    const currentPoint = routePoints[0];
    const nextPoint = routePoints[1];
    const deltaLon = nextPoint.longitude - currentPoint.longitude;
    const y = Math.sin(deltaLon) * Math.cos(nextPoint.latitude);
    const x =
      Math.cos(currentPoint.latitude) * Math.sin(nextPoint.latitude) -
      Math.sin(currentPoint.latitude) * Math.cos(nextPoint.latitude) * Math.cos(deltaLon);
    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    bearing = (bearing + 360) % 360;
    return bearing;
  }, []);

  // Simple map fitting function
  const fitMapToMarkers = useCallback(() => {
    if (!mapRef.current || !driverLocation || !customerLocation) return;

    try {
      mapRef.current.fitToCoordinates(
        [driverLocation, customerLocation],
        {
          edgePadding: { top: 100, bottom: 180, left: 50, right: 50 },
          animated: true,
        }
      );
    } catch (error) {
      console.error('Error fitting map:', error);
    }
  }, [driverLocation, customerLocation]);

  const deg2rad = (deg: number): number => deg * (Math.PI / 180);

  const getDistance = (a: LocationCoords, b: LocationCoords): number => {
    if (!a || !b) return 0;

    const R = 6371; // Earth radius in kilometers
    const dLat = deg2rad(b.latitude - a.latitude);
    const dLon = deg2rad(b.longitude - a.longitude);
    const aa =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(deg2rad(a.latitude)) *
        Math.cos(deg2rad(b.latitude)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c; // Distance in kilometers
  };

  useEffect(() => {
    if (!requestId || typeof requestId !== 'string') {
      setLoading(false);
      Alert.alert(
        'Error',
        'Invalid request ID',
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
      return;
    }

    let isMounted = true;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'deliveryRequests', requestId), async (docSnap) => {
      if (!isMounted) return;

      try {
        if (!docSnap.exists()) {
          setLoading(false);
          Alert.alert(
            'Error',
            'Delivery request not found',
            [{ text: 'OK', onPress: () => router.replace('/') }]
          );
          return;
        }

        const data = docSnap.data() as DeliveryRequest;
        
        if (!data?.location || !data?.driverId) {
          setLoading(false);
          Alert.alert(
            'Error',
            'Invalid delivery data',
            [{ text: 'OK', onPress: () => router.replace('/') }]
          );
          return;
        }

        const customer = toCoords(data.location);
        const driverDoc = await getDoc(doc(db, 'drivers', data.driverId));
        
        if (!driverDoc.exists()) {
          setLoading(false);
          Alert.alert(
            'Error',
            'Driver not found',
            [{ text: 'OK', onPress: () => router.replace('/') }]
          );
          return;
        }

        const driver = driverDoc.data() as Driver;
        
        if (!driver?.location) {
          setLoading(false);
          Alert.alert(
            'Error',
            'Driver location not available',
            [{ text: 'OK', onPress: () => router.replace('/') }]
          );
          return;
        }

        const driverLoc = toCoords(driver.location);
        
        setCustomerLocation(customer);
        setDriverLocation(driverLoc);
        setDriverInfo(driver);
        setDriverAvailable(driver.status === 'available' || driver.status === 'active');
        setLoading(false);

        try {
          const polylineData = await getRoutePolyline(driverLoc, customer);
          if (polylineData.coords.length >= 2) {
            setRouteCoords(polylineData.coords);
            setHeading(calculateHeading(polylineData.coords));
          }

          const distance = getDistance(driverLoc, customer);
          const baseETA = Math.round(distance * 2);
          setEta(baseETA);
          setCountdown(baseETA * 60);
        } catch (error) {
          console.error("Error updating route data:", error);
        }

        if (isMapReady) {
          setTimeout(fitMapToMarkers, 500);
        }
      } catch (error) {
        console.error("Error in snapshot update:", error);
        setLoading(false);
        Alert.alert(
          'Error',
          'Failed to load delivery information',
          [{ text: 'OK', onPress: () => router.replace('/') }]
        );
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [requestId]);

  // Cleanup countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [countdown]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
  };

  const handleCancel = () => {
    Alert.alert('Cancel', 'Are you sure you want to cancel the delivery?', [
      { text: 'No' },
      {
        text: 'Yes',
        onPress: () => {
          router.replace('/');
        },
      },
    ]);
  };

  // Memoized ETA display to prevent unnecessary re-renders
  const etaDisplay = useMemo(() => {
    return `ETA: ${eta} min | ⏱️ ${formatCountdown(countdown)}`;
  }, [eta, countdown]);

  const handleCallDriver = useCallback(() => {
    console.log('Call button pressed');
    
    // Use default number if none is available
    const phoneNumberToUse = driverInfo?.phone || '1234567890';
    
    // Remove any non-digit characters
    const formattedNumber = phoneNumberToUse.replace(/\D/g, '');
    
    // Copy to clipboard
    Clipboard.setString(formattedNumber);
    
    // Different handling for iOS and Android
    if (Platform.OS === 'ios') {
      // On iOS, telprompt: shows the dialog instead of immediately calling
      Linking.openURL(`telprompt:${formattedNumber}`)
        .catch(err => {
          console.error('Could not open phone app:', err);
          Alert.alert(
            'Phone Number Copied',
            `We've copied the driver's number (${formattedNumber}) to your clipboard. You can now paste it in your phone app.`,
            [{ text: 'OK' }]
          );
        });
    } else {
      // On Android, open phone app without direct calling
      Linking.openURL(`tel:${formattedNumber}`)
        .catch(err => {
          console.error('Could not open phone app:', err);
          Alert.alert(
            'Phone Number Copied',
            `We've copied the driver's number (${formattedNumber}) to your clipboard. You can now paste it in your phone app.`,
            [{ text: 'OK' }]
          );
        });
    }
    
    // Show confirmation
    Alert.alert(
      'Phone Number Copied',
      `The driver's number (${formattedNumber}) has been copied to your clipboard.`,
      [{ text: 'OK' }]
    );
  }, [driverInfo?.phone]);

  // Add refresh function
  const onRefresh = useCallback(async () => {
    if (!requestId || typeof requestId !== 'string') return;
    
    console.log('Manual refresh triggered');
    setRefreshing(true);
    
    try {
      // Fetch fresh delivery request data
      const docRef = doc(db, 'deliveryRequests', requestId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        setRefreshing(false);
        return;
      }
      
      const data = docSnap.data() as DeliveryRequest;
      
      if (!data?.location || !data?.driverId) {
        setRefreshing(false);
        return;
      }
      
      const customer = toCoords(data.location);
      const driverDoc = await getDoc(doc(db, 'drivers', data.driverId));
      
      if (!driverDoc.exists()) {
        setRefreshing(false);
        return;
      }
      
      const driver = driverDoc.data() as Driver;
      
      if (!driver?.location) {
        setRefreshing(false);
        return;
      }
      
      const driverLoc = toCoords(driver.location);
      
      // Update state
      setCustomerLocation(customer);
      setDriverLocation(driverLoc);
      setDriverInfo(driver);
      setDriverAvailable(driver.status === 'available' || driver.status === 'active');
      
      // Update route
      try {
        const polylineData = await getRoutePolyline(driverLoc, customer);
        if (polylineData.coords.length >= 2) {
          setRouteCoords(polylineData.coords);
          setHeading(calculateHeading(polylineData.coords));
        }
        
        const distance = getDistance(driverLoc, customer);
        const baseETA = Math.round(distance * 2);
        setEta(baseETA);
        setCountdown(baseETA * 60);
      } catch (error) {
        console.error("Error updating route on refresh:", error);
      }
      
      // Fit map if ready
      if (isMapReady) {
        setTimeout(fitMapToMarkers, 500);
      }
    } catch (error) {
      console.error("Error in refresh:", error);
    } finally {
      setRefreshing(false);
    }
  }, [requestId, isMapReady, fitMapToMarkers, calculateHeading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={{ marginTop: 12 }}>Fetching live delivery info...</Text>
      </View>
    );
  }

  if (!driverLocation || !customerLocation) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#d32f2f" />
        <Text style={{ marginTop: 12, textAlign: 'center' }}>
          Unable to track delivery. Location information unavailable.
        </Text>
        <TouchableOpacity 
          style={[styles.cancelBtn, {marginTop: 20}]} 
          onPress={() => router.replace('/')}>
          <Text style={styles.cancelText}>Return to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.headerTitle}>logo</Text>
          <Text style={styles.headerSubtitle}>Live Delivery Tracking</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Ionicons name="person-circle-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Map with shadow border - directly in the container, not in a ScrollView */}
      <View style={styles.mapContainer}>
        <MapView 
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: 0,
            longitude: 0,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          onMapReady={() => {
            setIsMapReady(true);
            if (driverLocation && customerLocation) {
              setTimeout(fitMapToMarkers, 500);
            }
          }}
        >
          {driverLocation && (
            <Marker
              coordinate={driverLocation}
              rotation={heading}
              anchor={{ x: 0.5, y: 0.5 }}
              identifier="driver"
            >
              <View style={[
                styles.driverIconContainer, 
                driverAvailable && styles.driverIconAvailable
              ]}>
                <Image
                  source={require('../assets/truck-icon.png')}
                  style={styles.driverIcon}
                  resizeMode="contain"
                />
              </View>
              <Callout tooltip>
                <View style={styles.calloutContainer}>
                  <View style={styles.calloutHeader}>
                    <Ionicons name="person-circle" size={28} color="#6200ee" />
                    <Text style={styles.calloutName}>{driverInfo?.name || 'Driver'}</Text>
                  </View>
                  <View style={styles.calloutRow}>
                    <Ionicons name="car-outline" size={18} color="#555" />
                    <Text style={styles.calloutText}>
                      Status: <Text style={driverAvailable ? styles.available : styles.busy}>
                        {driverAvailable ? 'Available' : 'Busy'}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.calloutRow}>
                    <Ionicons name="time-outline" size={18} color="#555" />
                    <Text style={styles.calloutText}>ETA: {eta} min</Text>
                  </View>
                  <View style={styles.calloutRow}>
                    <Ionicons name="call-outline" size={18} color="#555" />
                    <Text style={styles.calloutText}>
                      Phone: <Text style={styles.highlight}>{driverInfo?.phone || 'N/A'}</Text>
                    </Text>
                  </View>
                  <View style={styles.calloutRow}>
                    <Ionicons name="car-sport-outline" size={18} color="#555" />
                    <Text style={styles.calloutText}>
                      Car #: <Text style={styles.highlight}>{driverInfo?.carNumber || 'N/A'}</Text>
                    </Text>
                  </View>
                  <View style={styles.calloutArrow} />
                </View>
              </Callout>
            </Marker>
          )}
          
          {customerLocation && (
            <Marker 
              coordinate={customerLocation}
              title="Your Location"
              identifier="customer"
            >
              <View style={styles.customerMarker}>
                <Ionicons name="home" size={24} color="#6200ee" />
              </View>
            </Marker>
          )}
          
          {routeCoords.length > 0 && (
            <Polyline 
              coordinates={routeCoords}
              strokeWidth={4}
              strokeColor="#6200ee"
            />
          )}
        </MapView>
      </View>

      {/* Pull-to-refresh button - better positioned */}
      <TouchableOpacity 
        style={styles.refreshButton}
        onPress={onRefresh}
        disabled={refreshing}
      >
        {refreshing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="refresh" size={20} color="#fff" />
        )}
      </TouchableOpacity>

      {/* Bottom Info Card */}
      <View style={styles.bottomCard}>
        <Text style={styles.statusText}>
          {driverAvailable ? '🚗 Driver is on the way' : '⏳ Driver is preparing your order'}
        </Text>
        <View style={styles.driverInfoRow}>
          <Ionicons name="person-circle" size={48} color="#6200ee" />
          <View>
            <Text style={styles.driverName}>{driverInfo?.name || 'Driver'}</Text>
            <Text style={styles.eta}>{etaDisplay}</Text>
            <Text style={[
              styles.statusIndicator, 
              driverAvailable ? styles.statusAvailable : styles.statusBusy
            ]}>
              {driverAvailable ? 'Available' : 'Busy'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.callDriverButton}
            onPress={() => {
              console.log('Bottom card call button pressed');
              const phoneNumber = driverInfo?.phone || '1234567890';
              const formattedNumber = phoneNumber.replace(/\D/g, '');
              Clipboard.setString(formattedNumber);
              Alert.alert(
                'Driver Phone',
                `${formattedNumber} copied to clipboard. Would you like to call?`,
                [
                  {
                    text: 'Cancel',
                    style: 'cancel'
                  },
                  {
                    text: 'Call',
                    onPress: () => {
                      Linking.openURL(`tel:${formattedNumber}`).catch(err => {
                        console.error('Error opening phone app:', err);
                      });
                    }
                  }
                ]
              );
            }}
          >
            <Ionicons name="call" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.driverInfoExtra}>
          <View style={styles.infoItem}>
            <Ionicons name="car-sport" size={18} color="#6200ee" />
            <Text style={styles.infoText}>Car #: {driverInfo?.carNumber || 'N/A'}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="call" size={18} color="#6200ee" />
            <Text style={styles.infoText}>Phone: {driverInfo?.phone || 'N/A'}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel Delivery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  mapContainer: {
    flex: 1,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 6,
    borderBottomWidth: 1,
    borderColor: '#ddd',
    bottom: 1,
  },
  map: { 
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  statusText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#6200ee',
    marginBottom: 10,
  },
  driverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  eta: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
    marginBottom: 2,
  },
  statusIndicator: {
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusAvailable: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
  statusBusy: {
    backgroundColor: '#fff3e0',
    color: '#e65100',
  },
  cancelBtn: {
    backgroundColor: '#f2f2f2',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#d32f2f',
    fontWeight: '600',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomColor: '#eee',
    borderBottomWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 6,
  },
  backButton: {
    padding: 8,
  },
  titleWrapper: { 
    flex: 1, 
    alignItems: 'center' 
  },
  headerTitle: { 
    color: '#fff', 
    fontSize: 20, 
    fontWeight: 'bold', 
    letterSpacing: 0.5 
  },
  headerSubtitle: { 
    color: '#ddd', 
    fontSize: 12, 
    marginTop: 2 
  },
  profileButton: { 
    padding: 6 
  },
  customerMarker: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 6,
    borderWidth: 2,
    borderColor: '#6200ee',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  driverIconContainer: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 6,
    borderWidth: 2,
    borderColor: '#bbb',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  driverIconAvailable: {
    borderColor: '#4CAF50',
    borderWidth: 3,
  },
  driverIcon: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  calloutContainer: {
    width: 200,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: 8,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 8,
  },
  calloutName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  calloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  calloutText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
  calloutArrow: {
    width: 16,
    height: 16,
    backgroundColor: 'white',
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -8,
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 3,
  },
  available: {
    color: '#2e7d32',
    fontWeight: '600',
  },
  busy: {
    color: '#e65100',
    fontWeight: '600',
  },
  highlight: {
    color: '#6200ee',
    fontWeight: '600',
  },
  callDriverButton: {
    backgroundColor: '#6200ee',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  driverInfoExtra: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'column',
    gap: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
  },
  refreshButton: {
    position: 'absolute',
    right: 16,
    bottom: 240, // Position it above the bottom card
    backgroundColor: '#6200ee',
    borderRadius: 30,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 4,
  },
});