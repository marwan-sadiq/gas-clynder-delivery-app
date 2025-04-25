import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Linking
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import {
  doc,
  onSnapshot,
  collection,
  updateDoc,
  query,
  where,
  getDoc,
  getDocs,
  limit,
  serverTimestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getRoutePolyline } from '../utils/getRoutePolyline';
import { getDistanceInKm } from '../utils/getdistance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Modal } from 'react-native';
import { TextInput } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Keyboard } from 'react-native';

const screen = Dimensions.get('window');
const DRIVER_NAME = 'Driver Mizgin';
const DRIVER_CODE = '1234'; // We'll get this from login/authentication later

interface DeliveryRequest {
  id: string;
  customerName: string;
  phone: string;
  gasType: string;
  total?: number;
  notes?: string;
  quantity?: number;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  status: string;
  driverName?: string;
  driverId: string; // Make driverId required
}

interface DriverProfile {
  id: string;
  name: string;
  code: string;
  phone?: string;
  earnings?: number;
  totalDeliveries?: number;
  status?: 'available' | 'active' | 'offline';
  location?: {
    lat: number;
    lng: number;
  };
}

// Add retry logic utility
const retryOperation = async (operation: () => Promise<any>, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
};

export default function DriverScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [acceptedRequests, setAcceptedRequests] = useState<DeliveryRequest[]>([]);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [etas, setEtas] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [pricing, setPricing] = useState<{ [key: string]: number }>({});
  const [isOnline, setIsOnline] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const mapRef = useRef<MapView | null>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mapExpanded, setMapExpanded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [deliveryQuantity, setDeliveryQuantity] = useState('1');
  const [currentDeliveryId, setCurrentDeliveryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);

  // Monitor network state
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsOnline(state.isConnected ?? false);
      if (!state.isConnected) {
        Alert.alert(
          'No Internet Connection',
          'Please check your connection to continue delivering.'
        );
      }
    });

    return () => unsubscribe();
  }, []);

  // Session validation
  useEffect(() => {
    const validateSession = async () => {
      try {
        const driverData = await AsyncStorage.getItem('driverData');
        if (!driverData) {
          router.replace('/login');
          return;
        }

        // Validate driver in Firestore
        const driver = JSON.parse(driverData);
        const driverDoc = await getDoc(doc(db, 'drivers', driver.id));
        
        if (!driverDoc.exists() || driverDoc.data()?.status === 'inactive') {
          await handleLogout();
          return;
        }

        // Update last active timestamp
        await updateDoc(doc(db, 'drivers', driver.id), {
          lastActive: serverTimestamp(),
        });

      } catch (err) {
        console.error('Session validation error:', err);
        router.replace('/login');
      }
    };

    validateSession();
    const interval = setInterval(validateSession, 5 * 60 * 1000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, []);

  // 🔥 Fetch pricing config from Firestore
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const pricingRef = doc(db, 'config', 'pricing');
        const pricingSnap = await getDoc(pricingRef);
        if (pricingSnap.exists()) {
          // Map the pricing data to use gas type as keys
          const pricingData = pricingSnap.data();
          const mappedPricing = {
            'Medium Cylinder': pricingData.mediumCylinder || 7500, // Default to 7500 if not set
          };
          setPricing(mappedPricing);
        } else {
          console.warn('⚠️ Pricing document not found, using default pricing');
          setPricing({
            'Medium Cylinder': 7500 // Default price
          });
        }
      } catch (err) {
        console.error('❌ Failed to fetch pricing:', err);
        // Set default pricing if fetch fails
        setPricing({
          'Medium Cylinder': 7500
        });
      }
    };
    fetchPricing();
  }, []);

  // Enhanced location tracking
  useEffect(() => {
    const startLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'Please enable location services to use the driver app.',
            [
              { 
                text: 'Open Settings', 
                onPress: () => Linking.openSettings() 
              },
              { 
                text: 'Cancel', 
                onPress: () => router.back(),
                style: 'cancel'
              }
            ]
          );
          return;
        }

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 10,
          },
          async (loc) => {
            setLocation(loc.coords);
            if (driverProfile?.id && isOnline) {
              try {
                await retryOperation(() => 
                  updateDoc(doc(db, 'drivers', driverProfile.id), {
                    location: {
                      lat: loc.coords.latitude,
                      lng: loc.coords.longitude,
                    },
                    lastUpdated: serverTimestamp(),
                  })
                );
              } catch (err) {
                console.error('Failed to update location after retries:', err);
              }
            }
          }
        );

        return () => sub.remove();
      } catch (err) {
        console.error('Location tracking error:', err);
        Alert.alert(
          'Location Error',
          'Failed to start location tracking. Please check your GPS settings.',
          [
            { 
              text: 'Open Settings', 
              onPress: () => Linking.openSettings() 
            },
            { 
              text: 'Retry', 
              onPress: startLocationTracking 
            }
          ]
        );
      }
    };

    if (driverProfile?.id) {
      startLocationTracking();
    }
  }, [driverProfile, isOnline]);

  // 🔄 Listen for delivered requests and compute stats for current driver only
  useEffect(() => {
    if (!Object.keys(pricing).length || !driverProfile?.id) return;
  
    const deliveredQuery = query(
      collection(db, 'deliveryRequests'),
      where('driverId', '==', driverProfile.id),
      where('status', '==', 'delivered')
    );
  
    const unsubscribe = onSnapshot(deliveredQuery, (snapshot) => {
      try {
        const delivered = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as DeliveryRequest[];
        
        setDeliveredCount(delivered.length);
        
        const total = delivered.reduce((sum, item) => {
          let amount = 0;
          if (typeof item.total === 'number') {
            amount = item.total;
          } else {
            const qty = typeof item.quantity === 'number' ? item.quantity : 1;
            const price = pricing[item.gasType] || pricing['Medium Cylinder'] || 7500;
            amount = qty * price;
          }
          return sum + amount;
        }, 0);
        
        console.log('Updated driver stats:', {
          driverCode: driverProfile.code,
          driverName: driverProfile.name,
          deliveredCount: delivered.length,
          totalEarned: total,
        });
        
        setTotalEarned(total || 0);
      } catch (err) {
        console.error('Failed to calculate driver stats:', err);
        setTotalEarned(0);
      }
    });
  
    return () => unsubscribe();
  }, [pricing, driverProfile]);

  // 🗺️ Update route polyline when driver or selected request changes
  useEffect(() => {
    const updateRoute = async () => {
      if (!location || acceptedRequests.length === 0) {
        setRouteCoords([]);
        return;
      }

      const target = selectedRequest
        ? acceptedRequests.find(req => req.id === selectedRequest) || acceptedRequests[0]
        : acceptedRequests[0];

      const polylineData = await getRoutePolyline(location, {
        latitude: target.location.lat,
        longitude: target.location.lng,
      });

      setRouteCoords(polylineData.coords);
      fitToMarkers();
    };
    updateRoute();
  }, [location, acceptedRequests, selectedRequest]);
  useEffect(() => {
    if (!location || !driverProfile?.id) return;
  
    const deliveryQuery = query(
      collection(db, 'deliveryRequests'),
      where('driverId', '==', driverProfile.id),
      where('status', '==', 'accepted')
    );
  
    const unsubscribe = onSnapshot(deliveryQuery, (snapshot) => {
      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as DeliveryRequest[];
  
      if (location) {
        requests.sort((a, b) => {
          const distA = getDistanceInKm(location.latitude, location.longitude, a.location.lat, a.location.lng);
          const distB = getDistanceInKm(location.latitude, location.longitude, b.location.lat, b.location.lng);
          return distA - distB;
        });
      }
  
      setAcceptedRequests(requests);
      setLoading(false);
      setRefreshing(false);
    });
  
    return () => unsubscribe();
  }, [location, driverProfile]);

  // ⏱️ Update ETA every minute
  useEffect(() => {
    const updateEtas = async () => {
      if (!location || acceptedRequests.length === 0) return;

      const newEtas: { [key: string]: number } = {};
      for (const req of acceptedRequests) {
        const polylineData = await getRoutePolyline(location, {
          latitude: req.location.lat,
          longitude: req.location.lng,
        });
        newEtas[req.id] = polylineData.duration;
      }
      setEtas(newEtas);
    };
    updateEtas();
    const interval = setInterval(updateEtas, 60000);
    return () => clearInterval(interval);
  }, [location, acceptedRequests]);

  const fitToMarkers = useCallback(() => {
    if (!mapRef.current || !location || acceptedRequests.length === 0) return;
    const coordinates = acceptedRequests.map(req => ({
      latitude: req.location.lat,
      longitude: req.location.lng,
    })).concat({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 100, right: 100, bottom: 300, left: 100 },
      animated: true,
    });
  }, [location, acceptedRequests]);

  const handleMarkDelivered = async () => {
    if (!currentDeliveryId || !driverProfile?.id || !isOnline) {
      Alert.alert('Error', 'Please check your connection and try again');
      return;
    }
    
    const quantity = parseInt(deliveryQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid quantity greater than 0');
      return;
    }

    setSubmitting(true);
    try {
      await retryOperation(async () => {
        const ref = doc(db, 'deliveryRequests', currentDeliveryId);
        const delivery = acceptedRequests.find((r) => r.id === currentDeliveryId);
        
        if (!delivery) {
          throw new Error('Delivery request not found');
        }

        const gasType = delivery.gasType || 'Medium Cylinder';
        const unitPrice = pricing[gasType] || pricing['Medium Cylinder'] || 7500;
        const total = quantity * unitPrice;

        const deliveryData = {
          status: 'delivered',
          deliveredAt: serverTimestamp(),
          quantity,
          total,
          driverId: driverProfile.id,
          driverName: driverProfile.name,
          deliveryLocation: location ? {
            lat: location.latitude,
            lng: location.longitude
          } : undefined
        };

        const batch = writeBatch(db);
        
        // Update delivery request
        batch.update(ref, deliveryData);
        
        // Update driver stats
        const driverRef = doc(db, 'drivers', driverProfile.id);
        batch.update(driverRef, {
          totalDeliveries: increment(quantity),
          earnings: increment(total),
          lastDelivery: serverTimestamp(),
          lastDeliveryAmount: total
        });

        await batch.commit();
      });

      
    } catch (err) {
      console.error('Failed to mark as delivered:', err);
      Alert.alert(
        'Delivery Failed',
        'Could not complete the delivery. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSubmitting(false);
      setModalVisible(false);
      setDeliveryQuantity('1');
      setCurrentDeliveryId(null);
    }
  };

  const handleCenterMap = () => {
    if (!mapRef.current || !location) return;
    mapRef.current.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const handleSelectRequest = (requestId: string) => {
    setSelectedRequest(requestId === selectedRequest ? null : requestId);
    
    // Center map on selected request
    if (requestId !== selectedRequest && mapRef.current) {
      const request = acceptedRequests.find(req => req.id === requestId);
      if (request) {
        mapRef.current.animateToRegion({
          latitude: request.location.lat,
          longitude: request.location.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    }
  };

  const handleNavigate = async (request: DeliveryRequest) => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${request.location.lat},${request.location.lng}`;
    const label = request.location.address || 'Delivery Location';
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });

    if (url) {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          'Navigation Error',
          'Could not open maps application. Please make sure you have a maps app installed.'
        );
      }
    }
  };

  const fitMapToMarkers = useCallback(() => {
    if (!mapRef.current || !location || acceptedRequests.length === 0) return;

    const coordinates = [
      { latitude: location.latitude, longitude: location.longitude },
      ...acceptedRequests.map(req => ({
        latitude: req.location.lat,
        longitude: req.location.lng,
      }))
    ];

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [location, acceptedRequests]);

  // Add this to the MapView component props
  const mapViewProps = {
    ref: mapRef,
    style: styles.map,
    showsUserLocation: true,
    showsCompass: true,
    showsTraffic: true,
    followsUserLocation: acceptedRequests.length === 0,
    initialRegion: location
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : undefined,
  };

  const openDeliveryModal = (id: string) => {
    setCurrentDeliveryId(id);
    setDeliveryQuantity('1');
    setModalVisible(true);
  };
  
  // Fetch driver profile on mount
  useEffect(() => {
    const fetchDriverProfile = async () => {
      try {
        const driverDataStr = await AsyncStorage.getItem('driverData');
        if (!driverDataStr) {
          console.error('No driver data found');
          Alert.alert(
            'Error', 
            'Please log in again.',
            [{ text: 'OK', onPress: () => router.push('/login') }]
          );
          return;
        }

        const driverData = JSON.parse(driverDataStr) as DriverProfile;
        setDriverProfile(driverData);

        // Query driver's current data
        const driverQuery = query(
          collection(db, 'drivers'),
          where('code', '==', driverData.code),
          limit(1)
        );
        
        const driverSnap = await getDocs(driverQuery);
        
        if (!driverSnap.empty) {
          const driverDoc = driverSnap.docs[0];
          const updatedDriverData: DriverProfile = {
            id: driverDoc.id,
            ...driverDoc.data() as Omit<DriverProfile, 'id'>
          };
          setDriverProfile(updatedDriverData);
          // Update stored data
          await AsyncStorage.setItem('driverData', JSON.stringify(updatedDriverData));
        } else {
          console.error('Driver not found with code:', driverData.code);
          Alert.alert(
            'Error', 
            'Your account could not be found. Please log in again.',
            [{ text: 'OK', onPress: () => handleLogout() }]
          );
        }
      } catch (err) {
        console.error('Failed to fetch driver profile:', err);
        Alert.alert('Error', 'Could not load driver profile. Please try again.');
      }
    };

    fetchDriverProfile();
  }, []);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('driverData');
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <View style={styles.rootContainer}>
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={20} color="#fff" />
          <Text style={styles.offlineText}>You are offline</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <TouchableOpacity onPress={() => handleLogout()} style={[styles.headerIconLeft, { top: insets.top + 20 }]}>
          <Ionicons name="log-out" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Driver Mode</Text>

        <TouchableOpacity onPress={() => router.push('/driverprofile')} style={[styles.headerIconRight, { top: insets.top + 20 }]}>
          <Ionicons name="person-circle-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <View style={[
          styles.mapContainer,
          { height: mapExpanded ? screen.height * 0.6 : screen.height * 0.35 }
        ]}>
          {loading && !location ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6200ee" />
              <Text style={styles.loadingText}>Getting your location...</Text>
            </View>
          ) : (
            <MapView
              {...mapViewProps}
            >
              {acceptedRequests.map((req) => (
                <Marker
                  key={req.id}
                  coordinate={{
                    latitude: req.location.lat,
                    longitude: req.location.lng,
                  }}
                  title={req.customerName}
                  description={`${req.gasType} - $${req.total}`}
                  pinColor={req.id === selectedRequest ? "#ff4500" : "#00b300"}
                >
                  <View style={styles.customMarker}>
                    <Ionicons name="home" size={24} color="#6200ee" />
                  </View>
                </Marker>
              ))}

              {routeCoords.length > 0 && (
                <Polyline 
                  coordinates={routeCoords} 
                  strokeWidth={5} 
                  strokeColor="#6200ee" 
                  lineDashPattern={[0]}
                />
              )}
            </MapView>
          )}

          <TouchableOpacity 
            style={styles.centerButton} 
            onPress={handleCenterMap}
          >
            <MaterialIcons name="my-location" size={24} color="#6200ee" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.fitButton} 
            onPress={fitToMarkers}
          >
            <MaterialIcons name="fullscreen" size={24} color="#6200ee" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              backgroundColor: '#fff',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              elevation: 3,
            }}
            onPress={() => setMapExpanded(prev => !prev)}
          >
            <Text style={{ color: '#6200ee', fontWeight: '600' }}>
              {mapExpanded ? 'Collapse' : 'Expand'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.requestCountContainer}>
          <Text style={styles.requestCountText}>
            {acceptedRequests.length === 0 
              ? 'No active deliveries' 
              : `${acceptedRequests.length} Active ${acceptedRequests.length === 1 ? 'Delivery' : 'Deliveries'}`}
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {loading && acceptedRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#6200ee" />
              <Text style={styles.emptyStateText}>Loading deliveries...</Text>
            </View>
          ) : acceptedRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="local-shipping" size={64} color="#cccccc" />
              <Text style={styles.emptyStateText}>No active deliveries</Text>
              <Text style={styles.emptyStateSubText}>New deliveries will appear here</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.cardList}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={handleRefresh}
                  colors={['#6200ee']}
                />
              }
            >
              {acceptedRequests.map((req) => (
                <TouchableOpacity
                  key={req.id}
                  style={[
                    styles.deliveryCard,
                    req.id === selectedRequest && styles.selectedCard
                  ]}
                  onPress={() => handleSelectRequest(req.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.cardTitle}>{req.customerName}</Text>
                      <View style={styles.etaBadge}>
                        <Ionicons name="time-outline" size={14} color="#fff" />
                        <Text style={styles.etaText}>
                          {etas[req.id] !== undefined ? `${etas[req.id]} min` : 'Calculating...'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.totalText}>
                      ${((req.quantity || 1) * (pricing[req.gasType] || pricing['Medium Cylinder'] || 7500)).toFixed(2)}
                    </Text>
                  </View>
                  
                  <View style={styles.divider} />
                  
                  <View style={styles.cardContent}>
                    <View style={styles.infoRow}>
                      <Ionicons name="call-outline" size={18} color="#555" style={styles.infoIcon} />
                      <Text style={styles.cardInfo}>{req.phone}</Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                      <Ionicons name="location-outline" size={18} color="#555" style={styles.infoIcon} />
                      <Text style={styles.cardInfo}>{req.location?.address || 'No address provided'}</Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                      <FontAwesome5 name="gas-pump" size={16} color="#555" style={styles.infoIcon} />
                      <Text style={styles.cardInfo}>{req.gasType}</Text>
                    </View>
                    
                    {req.notes ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="document-text-outline" size={18} color="#555" style={styles.infoIcon} />
                        <Text style={styles.cardInfo}>{req.notes}</Text> 
                      </View>
                    ) : null}
                  </View>
                  
                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.navigationButton}
                      onPress={() => handleNavigate(req)}
                    >
                      <Ionicons name="navigate-outline" size={18} color="#6200ee" />
                      <Text style={styles.navigationButtonText}>Navigate</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={() => openDeliveryModal(req.id)}
                      style={styles.deliveredButton}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.deliveredButtonText}>Mark Delivered</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
              <View style={styles.bottomPadding} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>

        <View style={styles.driverSummaryCard}>
          <View style={styles.statBox}>
            <Ionicons name="checkmark-done-circle-outline" size={24} color="#4CAF50" />
            <View style={styles.statTextBox}>
              <Text style={styles.statLabel}>Your Deliveries</Text>
              <Text style={styles.statValue}>{deliveredCount}</Text>
            </View>
          </View>

          <View style={styles.dividerVertical} />

          <View style={styles.statBox}>
            <Ionicons name="cash-outline" size={24} color="#6200ee" />
            <View style={styles.statTextBox}>
              <Text style={styles.statLabel}>Your Earnings</Text>
              <Text style={styles.statValue}>
                ${typeof totalEarned === 'number' ? totalEarned.toFixed(2) : '0.00'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalBox}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Complete Delivery</Text>
                  <TouchableOpacity 
                    onPress={() => setModalVisible(false)}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                {currentDeliveryId && (
                  <View style={styles.modalContent}>
                    <View style={styles.deliveryDetails}>
                      <Text style={styles.detailLabel}>Customer</Text>
                      <Text style={styles.detailValue}>
                        {acceptedRequests.find(r => r.id === currentDeliveryId)?.customerName}
                      </Text>
                      
                      <Text style={styles.detailLabel}>Gas Type</Text>
                      <Text style={styles.detailValue}>
                        {acceptedRequests.find(r => r.id === currentDeliveryId)?.gasType}
                      </Text>

                      <Text style={styles.detailLabel}>Unit Price</Text>
                      <Text style={styles.detailValue}>
                        ${(pricing[acceptedRequests.find(r => r.id === currentDeliveryId)?.gasType || 'Medium Cylinder'] || 7500).toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.quantityContainer}>
                      <Text style={styles.quantityLabel}>Quantity Delivered</Text>
                      <View style={styles.quantityInputContainer}>
                        <TouchableOpacity 
                          style={styles.quantityButton}
                          onPress={() => {
                            const current = parseInt(deliveryQuantity) || 0;
                            if (current > 1) {
                              setDeliveryQuantity((current - 1).toString());
                            }
                          }}
                        >
                          <Ionicons name="remove" size={24} color="#6200ee" />
                        </TouchableOpacity>
                        
                        <TextInput
                          style={styles.quantityInput}
                          value={deliveryQuantity}
                          onChangeText={(text) => {
                            const num = parseInt(text);
                            if (!isNaN(num) && num >= 0) {
                              setDeliveryQuantity(text);
                            } else if (text === '') {
                              setDeliveryQuantity('');
                            }
                          }}
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                        
                        <TouchableOpacity 
                          style={styles.quantityButton}
                          onPress={() => {
                            const current = parseInt(deliveryQuantity) || 0;
                            if (current < 99) {
                              setDeliveryQuantity((current + 1).toString());
                            }
                          }}
                        >
                          <Ionicons name="add" size={24} color="#6200ee" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.totalContainer}>
                      <Text style={styles.totalLabel}>Total Amount</Text>
                      <Text style={styles.totalValue}>
                        ${(
                          (parseInt(deliveryQuantity) || 0) * 
                          (pricing[acceptedRequests.find(r => r.id === currentDeliveryId)?.gasType || 'Medium Cylinder'] || 7500)
                        ).toFixed(2)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={handleMarkDelivered}
                      disabled={submitting}
                      style={[
                        styles.confirmButton,
                        submitting && styles.confirmButtonDisabled
                      ]}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.confirmButtonText}>Complete Delivery</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  deliveryDetails: {
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    marginBottom: 12,
  },
  quantityContainer: {
    marginBottom: 20,
  },
  quantityLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  quantityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  quantityInput: {
    width: 80,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 16,
    color: '#333',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 16,
    color: '#333',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6200ee',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  confirmButtonDisabled: {
    backgroundColor: '#a5d6a7',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  driverSummaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  
  statBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  
  statTextBox: {
    marginLeft: 8,
  },
  
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  
  dividerVertical: {
    width: 1,
    height: '100%',
    backgroundColor: '#eee',
    marginHorizontal: 12,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200ee',
    paddingBottom: 16,
    paddingHorizontal: 16,
    position: 'relative',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    zIndex: 10,
  },
  headerIconLeft: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: [{ translateY: -12 }],
    padding: 10
  },
  
  headerIconRight: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -14 }],
    padding: 10
    
    
  },
  headerTitle: {
    color: '#fff',
    fontSize: 25,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4, // Or whatever spacing looks best visually
  },
  
  langSwitcher: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -12 }],
  },
  container: {
    flex: 1,
    backgroundColor: '#f6f6f6',
  },
  mapContainer: {
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    width: '100%',
    height: screen.height * 0.35,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  loadingText: {
    marginTop: 10,
    color: '#555',
    fontSize: 16,
  },
  centerButton: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    backgroundColor: 'white',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  fitButton: {
    position: 'absolute',
    bottom: 160,
    right: 16,
    backgroundColor: 'white',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  customMarker: {
    backgroundColor: 'white',
    padding: 5,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#eee',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  requestCountContainer: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  requestCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cardList: {
    paddingHorizontal: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 16,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  deliveryCard: {
    backgroundColor: '#fff',
    marginBottom: 12,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#6200ee',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    marginRight: 8,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  etaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  totalText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00a86b',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginHorizontal: 16,
  },
  cardContent: {
    padding: 16,
    paddingTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  cardInfo: {
    fontSize: 14,
    color: '#444',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    justifyContent: 'space-between',
  },
  navigationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#6200ee',
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  navigationButtonText: {
    color: '#6200ee',
    fontWeight: '600',
    marginLeft: 6,
  },
  deliveredButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
  },
  deliveredButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
  },
  bottomPadding: {
    height: 20,
  },
  offlineBanner: {
    backgroundColor: '#ff4444',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  } as const,
  
  offlineText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
  } as const,
  modalContent: {
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
});