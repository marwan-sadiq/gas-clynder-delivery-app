import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  TextInput,
  Linking,
  AppState,
  Animated,
} from 'react-native';
import MapView, { Marker, Polyline, Callout, AnimatedRegion, MarkerAnimated } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { 
  collection, 
  getDocs, 
  addDoc, 
  getDoc, 
  doc as firestoreDoc,
  query,
  where,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getRoutePolyline } from '../utils/getRoutePolyline';
import SuccessModal from './success';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const DRIVER_NAME = 'Driver Mizgin';
const FETCH_INTERVAL = 15000; // Reduced from 30000 to 15000 ms
const DEFAULT_PRICE = 7500; // Default price if Firestore data is unavailable
const MAX_CACHE_SIZE = 20; // For route polyline cache
const LOCATION_PERMISSION_MESSAGE = "We need your location to find nearby drivers and provide accurate delivery. This helps us calculate the correct route and delivery time.";

interface Driver {
  id: string;
  name: string;
  phone: string;
  car_number: string;
  distance: string;
  eta: number;
  latitude: number;
  longitude: number;
  image: string | null;
  available: boolean;
}

interface LocationCoords {
  latitude: number;
  longitude: number;
}

// Add loading overlay component
const LoadingOverlay = () => (
  <View style={styles.loadingOverlay}>
    <View style={styles.loadingCard}>
      <ActivityIndicator size="large" color="#6200ee" />
      <Text style={styles.loadingText}>Finding nearest drivers...</Text>
    </View>
  </View>
);

export default function HomeScreen() {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [driverLocations, setDriverLocations] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [driversModalVisible, setDriversModalVisible] = useState(false);
  const [pricing, setPricing] = useState<number>(DEFAULT_PRICE);
  const [isGasAvailable, setIsGasAvailable] = useState(true);
  

  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const hasFitMap = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTime = useRef(0);
  
  // Update the pricing listener to also check for gas availability
  useEffect(() => {
    // Initial fetch from cache for instant display
    const loadCachedPrice = async () => {
      try {
        const cachedPrice = await AsyncStorage.getItem('cachedGasPrice');
        if (cachedPrice) {
          setPricing(Number(cachedPrice));
        }
        
        // Load cached availability
        const cachedAvailability = await AsyncStorage.getItem('gasAvailability');
        if (cachedAvailability) {
          setIsGasAvailable(cachedAvailability === 'true');
        }
      } catch (error) {
        console.error('Error loading cached data:', error);
      }
    };
    
    loadCachedPrice();
    
    // Set up real-time listener for config updates
    const pricingRef = firestoreDoc(db, 'config', 'pricing');
    console.log('Setting up config listener for path: config/pricing');
    
    const unsubscribePricing = onSnapshot(
      pricingRef,
      (doc) => {
        console.log('Config snapshot received, exists:', doc.exists());
        console.log('Config data:', doc.data());
        
        if (doc.exists()) {
          const configData = doc.data();
          
          // Check for price
          const price = configData.mediumCylinder || configData.price;
          if (price) {
            const newPrice = Number(price);
            console.log('Setting new price:', newPrice);
            setPricing(newPrice);
            // Update cache
            AsyncStorage.setItem('cachedGasPrice', newPrice.toString())
              .catch(err => console.error('Error caching price:', err));
          }
          
          // Check for gas availability
          if (configData.hasOwnProperty('isGasAvailable')) {
            const gasAvailable = Boolean(configData.isGasAvailable);
            console.log('Gas availability updated:', gasAvailable);
            setIsGasAvailable(gasAvailable);
            // Cache availability
            AsyncStorage.setItem('gasAvailability', gasAvailable.toString())
              .catch(err => console.error('Error caching availability:', err));
          }
        } else {
          console.log('No config document found at path: config/pricing');
        }
      },
      (error) => {
        console.error('Error listening to config updates:', error);
      }
    );

    // Clean up listener when component unmounts
    return () => {
      unsubscribePricing();
    };
  }, []);

  // Update the refresh function to use the correct path
  const refreshPrice = useCallback(async () => {
    try {
      const snap = await getDoc(firestoreDoc(db, 'config', 'pricing'));
      if (snap.exists()) {
        const priceData = snap.data();
        console.log('Refresh pricing data:', priceData);
        
        // Check for both possible field names
        const price = priceData.mediumCylinder || priceData.price;
        if (price) {
          const newPrice = Number(price);
          setPricing(newPrice);
          Alert.alert('Price Updated', `The current price is now ${newPrice.toLocaleString()} IQD`);
        } else {
          Alert.alert('Price Error', 'Could not find price information in the database');
        }
      } else {
        Alert.alert('Price Error', 'Pricing document not found in the database');
      }
    } catch (error) {
      console.error('Error refreshing price:', error);
      Alert.alert('Error', 'Failed to refresh price information');
    }
  }, []);

  // Improved location permission handling
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission Required', 
            LOCATION_PERMISSION_MESSAGE,
            [
              { 
                text: 'Cancel', 
                style: 'cancel',
                onPress: () => setIsLoading(false) 
              },
              { 
                text: 'Open Settings', 
                onPress: async () => {
                  setIsLoading(false);
                  await Linking.openSettings();
                } 
              }
            ]
          );
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ 
          accuracy: Location.Accuracy.Balanced 
        });
        
        const userCoords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        
        setLocation(userCoords);

        // Set initial map position to user location
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            ...userCoords,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }, 1000);
        }
      } catch (error) {
        console.error('Error getting location:', error);
        Alert.alert(
          'Location Error',
          'Unable to get your current location. Please make sure location services are enabled.',
          [{ text: 'OK', onPress: () => setIsLoading(false) }]
        );
      }
    };

    getUserLocation();
  }, []);

  // Setup driver fetch interval only when location is available
  useEffect(() => {
    if (!location) return;
    
    // Initial fetch
    fetchNearestDriver();
    
    // Setup interval
    timerRef.current = setInterval(fetchNearestDriver, FETCH_INTERVAL);
    
    // Cleanup interval on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [location]);

  // Memoized distance calculation function
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth radius in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * 
      Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }, []);

  // Restore polyline-related state
  const [routeCoords, setRouteCoords] = useState<LocationCoords[]>([]);

  // Restore cache reference
  const polylineCache = useRef<Map<string, LocationCoords[]>>(new Map());

  // Restore the updateRoutePolyline function
  const updateRoutePolyline = useCallback(async (driverPosition: LocationCoords) => {
    if (!location) return;

    const cacheKey = `${location.latitude},${location.longitude}-${driverPosition.latitude},${driverPosition.longitude}`;
    const cachedRoute = polylineCache.current.get(cacheKey);
    
    // Immediately show cached route if available
    if (cachedRoute) {
      setRouteCoords(cachedRoute);
      return;
    }

    try {
      // Check network connection before fetching route
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected || !netInfo.isInternetReachable) {
        // Use direct line if offline
        const straightRoute = [
          location,
          driverPosition
        ];
        setRouteCoords(straightRoute);
        return;
      }

      const polyline = await getRoutePolyline(location, driverPosition);
      
      if (!polyline || !polyline.coords || polyline.coords.length < 2) {
        // Use direct line if route API fails
        const straightRoute = [
          location,
          driverPosition
        ];
        setRouteCoords(straightRoute);
        return;
      }
      
      // Cache the new route
      polylineCache.current.set(cacheKey, polyline.coords);
      
      // Limit cache size
      if (polylineCache.current.size > MAX_CACHE_SIZE) {
        // Get first key using Array.from to avoid iterator issues
        const keys = Array.from(polylineCache.current.keys());
        if (keys.length > 0) {
          polylineCache.current.delete(keys[0]);
        }
      }
      
      setRouteCoords(polyline.coords);
    } catch (err) {
      console.error('Failed to fetch polyline:', err);
      // Use direct line as fallback
      const straightRoute = [
        location,
        driverPosition
      ];
      setRouteCoords(straightRoute);
    }
  }, [location]);

  // Update the fetchNearestDriver function to use the polyline again
  const fetchNearestDriver = useCallback(async () => {
    if (!location) return;

    // Throttle requests to avoid excessive fetching
    const now = Date.now();
    if (now - lastFetchTime.current < 5000) { // Only fetch if 5 seconds passed since last fetch
      return;
    }
    lastFetchTime.current = now;
    
    if (driverLocations.length === 0) {
      setIsLoading(true);
    }

    try {
      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('No internet connection');
        // Try to use cached driver data
        const cachedDriverJson = await AsyncStorage.getItem('lastKnownDriver');
        if (cachedDriverJson) {
          const cachedDriver = JSON.parse(cachedDriverJson) as Driver;
          if (!selectedDriver || selectedDriver.id !== cachedDriver.id) {
            setDriverLocations([cachedDriver]);
            setSelectedDriver(cachedDriver);
            
            const driverPosition = {
              latitude: cachedDriver.latitude,
              longitude: cachedDriver.longitude,
            };
            
            // Use a straight line when offline
            setRouteCoords([location, driverPosition]);
          }
        }
        
        setIsLoading(false);
        if (driverLocations.length === 0) {
          Alert.alert(
            'No Internet Connection',
            'Unable to find drivers. Please check your connection and try again.'
          );
        }
        return;
      }

      const driversQuery = query(
        collection(db, 'drivers'),
        where('status', '==', 'available'),
        limit(3)
      );

      const snap = await getDocs(driversQuery);

      if (snap.empty) {
        setDriverLocations([]);
        setSelectedDriver(null);
        setRouteCoords([]);
        setIsLoading(false);
        
        // Show a more helpful message when no drivers are available
        Alert.alert(
          'No Drivers Available',
          'Sorry, all drivers are currently busy. Please try again later.',
          [{ text: 'OK' }]
        );
        return;
      }

      const validDrivers = snap.docs
        .map(doc => {
          const d = doc.data();
          if (!d.location?.lat || !d.location?.lng) return null;

          const distance = calculateDistance(
            location.latitude,
            location.longitude,
            d.location.lat,
            d.location.lng
          );

          return {
            id: doc.id,
            name: d.name ?? 'Driver',
            phone: d.phone ?? 'N/A',
            car_number: d.car_number ?? 'N/A',
            distance: distance.toFixed(1),
            eta: Math.round(distance * 2),
            latitude: d.location.lat,
            longitude: d.location.lng,
            image: d.image ?? null,
            available: true
          };
        })
        .filter(Boolean) as Driver[];

      if (validDrivers.length === 0) {
        setDriverLocations([]);
        setSelectedDriver(null);
        setRouteCoords([]);
        setIsLoading(false);
        return;
      }

      validDrivers.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
      const closestDriver = validDrivers[0];

      // Store selected driver in AsyncStorage for offline access
      await AsyncStorage.setItem('lastKnownDriver', JSON.stringify(closestDriver));

      if (selectedDriver?.id === closestDriver.id) {
        setIsLoading(false);
        return;
      }

      const driverPosition = {
        latitude: closestDriver.latitude,
        longitude: closestDriver.longitude,
      };

      // Update driver states immediately
      setDriverLocations(validDrivers.slice(0, 1)); // Just use the closest driver
      setSelectedDriver(closestDriver);
      
      // Update route
      updateRoutePolyline(driverPosition);
      
      // Fit map if needed
      if (mapRef.current && !hasFitMap.current && location) {
        mapRef.current.fitToCoordinates(
          [
            { latitude: location.latitude, longitude: location.longitude },
            driverPosition
          ],
          {
            edgePadding: { top: 100, bottom: 100, left: 100, right: 100 },
            animated: true,
          }
        );
        hasFitMap.current = true;
      }

    } catch (err) {
      console.error('Failed to fetch drivers:', err);
      setRouteCoords([]);
      if (driverLocations.length === 0) {
        Alert.alert(
          'Network Error',
          'Failed to fetch driver information. Please check your connection and try again.',
          [{ text: 'Retry', onPress: () => fetchNearestDriver() }]
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [location, calculateDistance, selectedDriver, updateRoutePolyline]);

  // Add app state listener for better background/foreground behavior
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && location) {
        // Refresh data when app comes to foreground
        fetchNearestDriver();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchNearestDriver, location]);

  // Update the request handler to check gas availability
  const handleRequestDelivery = async () => {
    if (isRequesting || !selectedDriver) return;

    if (!isGasAvailable) {
      Alert.alert(
        'Gas Unavailable',
        'Sorry, gas delivery is currently unavailable. Please try again later.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!customerName.trim() || !phoneNumber.trim()) {
      Alert.alert('Missing Info', 'Please enter your name and phone number');
      return;
    }
    
    // Process the request immediately without confirmation
    setIsRequesting(true);
    setShowSuccess(true);

    try {
      const requestData = {
        customerName: customerName.trim(),
        phone: phoneNumber.trim(),
        location: {
          lat: location?.latitude,
          lng: location?.longitude,
          address: 'Delivery Location',
        },
        gasType: 'Regular',
        total: pricing,
        notes,
        driverId: selectedDriver.id,
        driverName: DRIVER_NAME,
        status: 'accepted',
        createdAt: new Date(),
      };

      const docRef = await addDoc(collection(db, 'deliveryRequests'), requestData);

      // Navigate after a short delay
      setTimeout(() => {
        router.push({ pathname: '/order', params: { requestId: docRef.id } });
      }, 1500);
    } catch (error) {
      console.error('Error creating delivery request:', error);
      setShowSuccess(false);
      Alert.alert('Error', 'Could not submit delivery request.');
    } finally {
      setIsRequesting(false);
    }
  };

  // Render driver item for list
  const renderDriverItem = ({ item }: { item: Driver }) => (
    <TouchableOpacity
      style={[
        styles.driverItem,
        selectedDriver?.id === item.id && styles.selectedDriverItem,
      ]}
      disabled={!item.available}
    >
      <View style={styles.driverAvatar}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.driverImage} />
        ) : (
          <Ionicons name="person" size={30} color="#6200ee" />
        )}
      </View>
      <View style={styles.driverInfo}>
        <Text style={styles.driverName}>{item.name}</Text>
        <View style={styles.driverRating}>
          <Ionicons name="car" size={16} color="#6200ee" />
          <Text style={styles.ratingText}>{item.car_number}</Text>
        </View>
      </View>
      <View style={styles.driverMeta}>
        <Text style={styles.distanceText}>{item.distance} km</Text>
        <Text style={styles.etaText}>~{item.eta} min</Text>
        {!item.available && <Text style={styles.unavailableText}>Unavailable</Text>}
      </View>
    </TouchableOpacity>
  );

  // Main render
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <SuccessModal visible={showSuccess} onClose={() => setShowSuccess(false)} />
          
          <View style={styles.header}>
            <TouchableOpacity style={styles.langButton}>
              <Ionicons name="globe-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleWrapper}>
              <Text style={styles.headerTitle}>Gas Delivery</Text>
              <Text style={styles.headerSubtitle}>Fast & Reliable Service</Text>
            </View>
            <TouchableOpacity 
              style={styles.driverButton} 
              onPress={() => router.push('/login')}
            >
              <View style={styles.driverButtonInner}>
                <Ionicons name="car-sport" size={20} color="#6200ee" />
                <Text style={styles.driverButtonText}>Driver</Text>
              </View>
            </TouchableOpacity>
          </View>

          <MapView
            ref={mapRef}
            style={styles.map}
            showsUserLocation
            initialRegion={location ? {
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            } : {
              latitude: 36.8668,
              longitude: 42.9881,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            moveOnMarkerPress={false}
            maxZoomLevel={20}
            minZoomLevel={3}
            rotateEnabled={false}
            pitchEnabled={false}
            zoomEnabled={true}
            scrollEnabled={true}
          >
            {driverLocations.map((driver) => (
              <Marker
                key={driver.id}
                coordinate={{ latitude: driver.latitude, longitude: driver.longitude }}
                tracksViewChanges={false}
              >
                <View style={styles.markerContainer}>
                  <Image
                    source={require('../assets/truck-icon.png')}
                    style={styles.driverIcon}
                    resizeMode="contain"
                  />
                </View>
                <Callout>
                  <View style={styles.calloutContainer}>
                    <Text style={styles.calloutName}>{driver.name}</Text>
                    <View style={styles.calloutRow}>
                      <Ionicons name="car" size={14} color="#6200ee" />
                      <Text style={styles.calloutText}>{driver.car_number}</Text>
                    </View>
                    <View style={styles.calloutRow}>
                      <Ionicons name="call" size={14} color="#6200ee" />
                      <Text style={styles.calloutText}>{driver.phone}</Text>
                    </View>
                    <View style={styles.calloutRow}>
                      <Ionicons name="location" size={14} color="#6200ee" />
                      <Text style={styles.calloutText}>{driver.distance} km away</Text>
                    </View>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
          
          {isLoading && <LoadingOverlay />}
          
          <View style={styles.bottomCard}>
            <Text style={styles.cardTitle}>Where should we deliver?</Text>

            {/* Price display with availability indicator */}
            <View style={[
              styles.priceDisplay,
              !isGasAvailable && styles.priceUnavailable
            ]}>
              <Ionicons 
                name={isGasAvailable ? "flame" : "alert-circle"} 
                size={24} 
                color={isGasAvailable ? "#6200ee" : "#d32f2f"} 
              />
              <View style={{ flex: 1 }}>
                <Text style={[
                  styles.priceText,
                  !isGasAvailable && styles.priceTextUnavailable
                ]}>
                  Gas Cylinder: {pricing.toLocaleString()} IQD
                </Text>
                {!isGasAvailable && (
                  <Text style={styles.unavailableText}>
                    Currently unavailable
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Ionicons name="person" size={20} color="#6200ee" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Your Name"
                value={customerName}
                onChangeText={setCustomerName}
                placeholderTextColor="#888"
              />
            </View>

            <View style={styles.inputGroup}>
              <Ionicons name="call" size={20} color="#6200ee" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                placeholderTextColor="#888"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Ionicons name="document-text" size={20} color="#6200ee" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Delivery Notes (Optional)"
                placeholderTextColor="#888"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>

            <TouchableOpacity 
              style={[
                styles.requestBtn, 
                isRequesting && styles.requestBtnDisabled,
                !isGasAvailable && styles.requestBtnUnavailable
              ]}
              onPress={handleRequestDelivery}
              disabled={isRequesting || !isGasAvailable}
            >
              {isRequesting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons 
                    name={isGasAvailable ? "flame-outline" : "alert-circle-outline"} 
                    size={20} 
                    color="#fff" 
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={styles.requestBtnText}>
                    {isGasAvailable ? 
                      `Request Delivery - ${pricing.toLocaleString()} IQD` : 
                      'Gas Currently Unavailable'
                    }
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Modal
            visible={driversModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setDriversModalVisible(false)}
          >
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Available Drivers</Text>
                <FlatList
                  data={driverLocations}
                  renderItem={renderDriverItem}
                  keyExtractor={(item) => item.id}
                />
              </View>
            </SafeAreaView>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverIcon: {
    width: 38,
    height: 38,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minWidth: 200,
  },
  markerContainer: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#fff',
    paddingVertical: height * 0.015,
    paddingHorizontal: width * 0.04,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
    paddingBottom: Platform.OS === 'ios' ? height * 0.04 : height * 0.015,
  },
  cardTitle: {
    fontSize: width * 0.035,
    fontWeight: '600',
    marginBottom: height * 0.008,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    paddingHorizontal: width * 0.03,
    paddingVertical: height * 0.012,
    marginBottom: height * 0.01,
    borderWidth: 1,
    borderColor: '#eee',
  },
  inputIcon: {
    marginRight: width * 0.02,
  },
  input: {
    flex: 1,
    fontSize: width * 0.035,
    color: '#333',
  },
  requestBtn: {
    backgroundColor: '#6200ee',
    paddingVertical: height * 0.014,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.015,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  requestBtnDisabled: {
    backgroundColor: '#a98eda',
  },
  requestBtnText: {
    color: '#fff',
    fontSize: width * 0.04,
    fontWeight: 'bold',
  },
  
  // Top Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    paddingHorizontal: width * 0.04,
    paddingTop: Platform.OS === 'ios' ? height * 0.06 : height * 0.05,
    paddingBottom: height * 0.025,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  langButton: {
    padding: width * 0.015,
  },
  titleWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: width * 0.055,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: width * 0.032,
    marginTop: 2,
  },
  driverButton: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  driverButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  driverButtonText: {
    color: '#6200ee',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
  },

  // Map
  map: {
    flex: 1,
  },

  // Modal for Drivers
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    marginHorizontal: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: width * 0.05,
    maxHeight: height * 0.8,
  },
  modalTitle: {
    fontSize: width * 0.05,
    fontWeight: 'bold',
    marginBottom: height * 0.015,
    color: '#333',
  },

  // Driver List Items
  driverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: height * 0.018,
    paddingHorizontal: width * 0.03,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedDriverItem: {
    backgroundColor: '#f0f0f0',
  },
  driverAvatar: {
    marginRight: width * 0.035,
    backgroundColor: '#eee',
    borderRadius: 25,
    width: width * 0.12,
    height: width * 0.12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverImage: {
    width: width * 0.12,
    height: width * 0.12,
    borderRadius: width * 0.06,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: width * 0.04,
    fontWeight: 'bold',
    color: '#333',
  },
  driverRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: width * 0.032,
    color: '#666',
  },
  driverMeta: {
    alignItems: 'flex-end',
  },
  distanceText: {
    fontSize: width * 0.035,
    color: '#333',
    fontWeight: '500',
  },
  etaText: {
    fontSize: width * 0.03,
    color: '#777',
    marginTop: height * 0.005,
  },
  unavailableText: {
    fontSize: width * 0.03,
    color: '#D32F2F',
    fontWeight: '600',
    marginTop: height * 0.005,
  },

  calloutContainer: {
    padding: 12,
    minWidth: 150,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  calloutName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  calloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 2,
  },
  calloutText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
    flex: 1,
  },

  gasTypeSection: {
    marginBottom: height * 0.015,
  },
  gasTypeLabel: {
    fontSize: width * 0.035,
    fontWeight: '500',
    marginBottom: height * 0.008,
    color: '#444',
  },
  gasPriceText: {
    fontSize: width * 0.03,
    color: '#666',
    marginTop: 4,
  },
  selectedGasPriceText: {
    color: '#fff',
  },

  priceDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0ff',
  },
  priceText: {
    fontSize: width * 0.035,
    color: '#333',
    fontWeight: '600',
    marginLeft: 8,
  },
  priceUnavailable: {
    backgroundColor: '#ffebee',
    borderColor: '#ffcdd2',
  },
  priceTextUnavailable: {
    color: '#d32f2f',
  },
  requestBtnUnavailable: {
    backgroundColor: '#b0b0b0',
  },
});