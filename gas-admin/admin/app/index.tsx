import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, 
  Dimensions, ScrollView, RefreshControl, SafeAreaView, Platform,
  KeyboardAvoidingView, Switch, TouchableWithoutFeedback, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  addDoc,
  getDoc,
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { db } from './firebase/firebaseConfig';
import MapViewTab from './views/mapview';
import StatsView from './views/stats';


const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 768; // Tablet breakpoint

interface Driver {
  id: string;
  name: string;
  phone: string;
  code: string;
  carNumber: string;
  password: string;
  
  lastLocation?: { lat: number; lng: number };
  totalDeliveries?: number;
  totalEarnings?: number;
  customers?: { name: string; phone: string }[];
  status?: 'active' | 'inactive';
}

interface Delivery {
  id: string;
  customerName: string;
  phone: string;
  gasType: string;
  total: number;
  driverName: string;
  deliveredAt: any;
}

export default function AdminTabletScreen() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [newDriver, setNewDriver] = useState({
    name: '', 
    phone: '', 
    code: '', 
    carNumber: '', 
    password: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [selectedNav, setSelectedNav] = useState<'drivers' | 'map' | 'stats'>('drivers');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSidebar, setCollapsedSidebar] = useState(isSmallScreen);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [isGasAvailable, setIsGasAvailable] = useState(true);
  const [gasPrice, setGasPrice] = useState(0);

  const fetchDrivers = async () => {
    setRefreshing(true);
    try {
      const snapshot = await getDocs(collection(db, 'drivers'));
      const baseDrivers = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        status: Math.random() > 0.3 ? 'active' : 'inactive', // Simulated status for demonstration
      })) as Driver[];

      const enriched = await Promise.all(baseDrivers.map(async (driver) => {
        const q = query(collection(db, 'deliveryRequests'), where('driverId', '==', driver.id), where('status', '==', 'delivered'));
        const snap = await getDocs(q);
        let total = 0;
        const customers: { name: string; phone: string }[] = [];

        snap.forEach(doc => {
          const data = doc.data();
          total += data.total || 0;
          if (data.customerName && data.phone) {
            customers.push({ name: data.customerName, phone: data.phone });
          }
        });

        return {
          ...driver,
          totalDeliveries: snap.size,
          totalEarnings: total,
          customers,
        };
      }));

      setDrivers(enriched);
      setFilteredDrivers(enriched);
    } catch (error) {
      Alert.alert('Error', 'Failed to load drivers data.');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchDeliveries = async () => {
    try {
      const q = query(collection(db, 'deliveryRequests'), where('status', '==', 'delivered'));
      const snapshot = await getDocs(q);
      const all = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Delivery[];
      setDeliveries(all);
    } catch (error) {
      Alert.alert('Error', 'Failed to load delivery data.');
    }
  };

  const fetchConfig = async () => {
    try {
      const configRef = doc(db, 'config', 'pricing');
      const configSnap = await getDoc(configRef);
      
      if (configSnap.exists()) {
        const data = configSnap.data();
        setIsGasAvailable(data.isGasAvailable !== false);
        setGasPrice(data.mediumCylinder || data.price || 0);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const addDriver = async () => {
    const { name, phone, code, carNumber, password } = newDriver;
    if (!name || !phone || !code || !carNumber || !password) {
      return Alert.alert('Validation Error', 'Please fill all required fields.');
    }
    
    try {
      await addDoc(collection(db, 'drivers'), { 
        name, 
        phone, 
        code, 
        carNumber, 
        password,
        status: 'available', 
        createdAt: new Date()
      });
      setNewDriver({ name: '', phone: '', code: '', carNumber: '', password: '' });
      setShowModal(false);
      fetchDrivers();
      Alert.alert('Success', 'Driver added successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to add driver.');
    }
  };

  const deleteDriver = async (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this driver? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'drivers', id));
              fetchDrivers();
              Alert.alert('Success', 'Driver deleted successfully!');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete driver.');
            }
          }
        }
      ]
    );
  };

  const onRefresh = useCallback(() => {
    fetchDrivers();
    fetchDeliveries();
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchDrivers();
    fetchDeliveries();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      const filtered = drivers.filter(driver => 
        driver.name.toLowerCase().includes(lowercaseQuery) ||
        driver.phone.includes(searchQuery) ||
        driver.code.toLowerCase().includes(lowercaseQuery) ||
        driver.carNumber.toLowerCase().includes(lowercaseQuery)
      );
      setFilteredDrivers(filtered);
    } else {
      setFilteredDrivers(drivers);
    }
  }, [searchQuery, drivers]);

  const handleDriverPress = (driver: Driver) => {
    setSelectedDriver(selectedDriver?.id === driver.id ? null : driver);
  };

  const toggleSidebar = () => {
    setCollapsedSidebar(!collapsedSidebar);
  };

  const toggleGasAvailability = async (value: boolean) => {
    try {
      setIsGasAvailable(value);
      const configRef = doc(db, 'config', 'pricing');
      await updateDoc(configRef, { isGasAvailable: value });
      Alert.alert(
        'Gas Availability Updated', 
        `Gas delivery is now ${value ? 'available' : 'unavailable'} to customers`
      );
    } catch (error) {
      console.error('Error updating gas availability:', error);
      Alert.alert('Error', 'Failed to update gas availability');
      // Revert UI state on error
      setIsGasAvailable(!value);
    }
  };

  const renderDriversList = () => (
    <ScrollView
      style={styles.scrollContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3f51b5']} />
      }
    >
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Drivers Management</Text>
        
        <View style={styles.gasControlContainer}>
          <View style={styles.gasAvailabilityCard}>
            <View style={styles.gasCardHeader}>
              <Ionicons 
                name={isGasAvailable ? "flame" : "flame-outline"} 
                size={24} 
                color={isGasAvailable ? "#4caf50" : "#f44336"} 
              />
              <Text style={styles.gasCardTitle}>Gas Availability</Text>
            </View>
            <View style={styles.gasToggleRow}>
              <Text style={styles.gasAvailabilityText}>
                {isGasAvailable ? "Available" : "Unavailable"}
              </Text>
              <Switch
                trackColor={{ false: "#ccc", true: "#ceefce" }}
                thumbColor={isGasAvailable ? "#4caf50" : "#f44336"}
                ios_backgroundColor="#ccc"
                onValueChange={toggleGasAvailability}
                value={isGasAvailable}
              />
            </View>
            {gasPrice > 0 && (
              <Text style={styles.gasPriceText}>
                Current Price: {gasPrice.toLocaleString()} IQD
              </Text>
            )}
          </View>
        </View>
      
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search drivers..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      
      {filteredDrivers.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="people" size={60} color="#ddd" />
          <Text style={styles.emptyStateText}>
            {searchQuery ? "No drivers match your search" : "No drivers found"}
          </Text>
        </View>
      ) : (
        filteredDrivers.map(driver => (
          <TouchableOpacity 
            key={driver.id} 
            style={[
              styles.driverCard,
              selectedDriver?.id === driver.id && styles.selectedDriverCard
            ]}
            onPress={() => handleDriverPress(driver)}
            activeOpacity={0.7}
          >
            <View style={styles.driverCardHeader}>
              <View style={styles.driverNameContainer}>
                <View style={[
                  styles.statusIndicator, 
                  {backgroundColor: driver.status === 'active' ? '#4caf50' : '#ff9800'}
                ]} />
                <Text style={styles.driverName}>{driver.name}</Text>
              </View>
              <View style={styles.driverActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="create-outline" size={22} color="#3f51b5" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => deleteDriver(driver.id)}
                >
                  <Ionicons name="trash-outline" size={22} color="#f44336" />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.driverCardContent}>
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Ionicons name="call-outline" size={16} color="#666" />
                  <Text style={styles.infoText}>{driver.phone}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="car-outline" size={16} color="#666" />
                  <Text style={styles.infoText}>{driver.carNumber}</Text>
                </View>
              </View>
              
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Ionicons name="key-outline" size={16} color="#666" />
                  <Text style={styles.infoText}>Code: {driver.code}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="shield-outline" size={16} color="#666" />
                  <Text style={styles.infoText}>••••••••</Text>
                </View>
              </View>
            </View>
            
            {selectedDriver?.id === driver.id && (
              <View style={styles.expandedContent}>
                <View style={styles.statsContainer}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{driver.totalDeliveries || 0}</Text>
                    <Text style={styles.statLabel}>Deliveries</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>${driver.totalEarnings?.toFixed(2) || '0.00'}</Text>
                    <Text style={styles.statLabel}>Earnings</Text>
                  </View>
                </View>
                
                {driver.customers && driver.customers.length > 0 && (
                  <View style={styles.customersContainer}>
                    <Text style={styles.sectionTitle}>Recent Customers</Text>
                    {driver.customers.slice(0, 3).map((customer, index) => (
                      <View key={index} style={styles.customerItem}>
                        <Ionicons name="person-circle-outline" size={20} color="#3f51b5" />
                        <Text style={styles.customerName}>{customer.name}</Text>
                        <Text style={styles.customerPhone}>{customer.phone}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView style={styles.container}>
          {/* Sidebar */}
          <View style={[
            styles.sidebar, 
            collapsedSidebar && styles.collapsedSidebar
          ]}>
            <View style={styles.sidebarHeader}>
              {!collapsedSidebar && <Text style={styles.logo}>🚚 Fuel Admin</Text>}
              <TouchableOpacity onPress={toggleSidebar} style={styles.toggleButton}>
                <Ionicons 
                  name={collapsedSidebar ? "chevron-forward" : "chevron-back"} 
                  size={24} 
                  color="#fff" 
                />
              </TouchableOpacity>
            </View>
            
            <View style={styles.sidebarContent}>
              <TouchableOpacity 
                style={[
                  styles.navItem, 
                  selectedNav === 'drivers' && styles.activeNavItem
                ]} 
                onPress={() => setSelectedNav('drivers')}
              >
                <Ionicons name="people" size={24} color="#fff" />
                {!collapsedSidebar && <Text style={styles.navText}>Drivers</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.navItem, 
                  selectedNav === 'map' && styles.activeNavItem
                ]} 
                onPress={() => setSelectedNav('map')}
              >
                <Ionicons name="map" size={24} color="#fff" />
                {!collapsedSidebar && <Text style={styles.navText}>Map View</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.navItem, 
                  selectedNav === 'stats' && styles.activeNavItem
                ]} 
                onPress={() => setSelectedNav('stats')}
              >
                <Ionicons name="stats-chart" size={24} color="#fff" />
                {!collapsedSidebar && <Text style={styles.navText}>Stats</Text>}
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.addDriverButton} 
              onPress={() => setShowModal(true)}
            >
              <Ionicons name="add-circle" size={24} color="#fff" />
              {!collapsedSidebar && <Text style={styles.addDriverText}>Add Driver</Text>}
            </TouchableOpacity>
          </View>

          {/* Main Content Area */}
          <View style={styles.mainArea}>
            {selectedNav === 'drivers' ? (
              renderDriversList()
            ) : selectedNav === 'map' ? (
              <MapViewTab drivers={drivers} />
            ) : (
              <StatsView deliveries={deliveries} />
            )}
          </View>

          {/* Add Driver Modal */}
          {showModal && (
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add New Driver</Text>
                  <TouchableOpacity onPress={() => setShowModal(false)}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.modalBody}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full Name</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter driver's full name"
                        value={newDriver.name}
                        onChangeText={text => setNewDriver(prev => ({...prev, name: text}))}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Phone Number</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter phone number"
                        keyboardType="phone-pad"
                        value={newDriver.phone}
                        onChangeText={text => setNewDriver(prev => ({...prev, phone: text}))}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Driver Code</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="barcode-outline" size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter unique code"
                        value={newDriver.code}
                        onChangeText={text => setNewDriver(prev => ({...prev, code: text}))}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Car Number</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="car-outline" size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter car number"
                        value={newDriver.carNumber}
                        onChangeText={text => setNewDriver(prev => ({...prev, carNumber: text}))}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter password"
                        secureTextEntry
                        value={newDriver.password}
                        onChangeText={text => setNewDriver(prev => ({...prev, password: text}))}
                      />
                    </View>
                  </View>
                </ScrollView>
                
                <View style={styles.modalFooter}>
                  <TouchableOpacity 
                    style={styles.cancelButton} 
                    onPress={() => setShowModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.saveButton} 
                    onPress={addDriver}
                  >
                    <Text style={styles.saveButtonText}>Save Driver</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
  },
  sidebar: {
    width: isSmallScreen ? 220 : width * 0.22,
    maxWidth: 280,
    backgroundColor: '#3f51b5',
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
    paddingHorizontal: 0,
    justifyContent: 'space-between',
    flexDirection: 'column',
  },
  collapsedSidebar: {
    width: 60,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  logo: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  toggleButton: {
    padding: 5,
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 20,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 5,
  },
  activeNavItem: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  navText: {
    color: '#fff',
    marginLeft: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  addDriverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff9800',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 0,
    justifyContent: 'center',
  },
  addDriverText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
  },
  mainArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flex: 1,
  },
  headerContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#333',
  },
  driverCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectedDriverCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#3f51b5',
  },
  driverCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  driverActions: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingHorizontal: 8,
  },
  driverCardContent: {
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  infoText: {
    marginLeft: 6,
    color: '#666',
    fontSize: 14,
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#3f51b5',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  divider: {
    width: 1,
    backgroundColor: '#eee',
  },
  customersContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  customerName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
  },
  customerPhone: {
    fontSize: 13,
    color: '#666',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    width: isSmallScreen ? '90%' : 520,
    maxHeight: height * 0.8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  modalBody: {
    padding: 16,
    maxHeight: height * 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  inputIcon: {
    padding: 10,
  },
  input: {
    flex: 1,
    height: 44,
    paddingRight: 10,
    fontSize: 15,
    color: '#333',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#3f51b5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 30,
  },
  gasControlContainer: {
    marginBottom: 16,
  },
  gasAvailabilityCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  gasCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  gasCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    color: '#333',
  },
  gasToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gasAvailabilityText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  gasPriceText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
});