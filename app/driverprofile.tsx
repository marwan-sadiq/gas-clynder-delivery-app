import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/firebaseConfig';

interface DriverData {
  name: string;
  phone: string;
  carNumber: string;
  code: string;
  profileImage?: string;
}

export default function DriverProfileScreen() {
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user?.phoneNumber) throw new Error('User not authenticated');

      console.log('📱 Firebase Auth Phone:', user.phoneNumber);

      const driverQuery = query(
        collection(db, 'drivers'),
        where('phone', '==', user.phoneNumber)
      );

      const driverSnap = await getDocs(driverQuery);
      if (driverSnap.empty) throw new Error('Driver profile not found');

      const driverData = driverSnap.docs[0].data() as DriverData;
      setDriver(driverData);

      const deliveryQuery = query(
        collection(db, 'deliveryRequests'),
        where('driverId', '==', driverSnap.docs[0].id),
        where('status', '==', 'delivered')
      );
      const deliverySnap = await getDocs(deliveryQuery);
      const deliveries = deliverySnap.docs.map(doc => doc.data());

      const total = deliveries.reduce((sum, item: any) => sum + (item.total || 0), 0);

      setTotalDeliveries(deliveries.length);
      setTotalEarnings(total);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to load driver data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={{ marginTop: 10 }}>Loading profile...</Text>
      </View>
    );
  }

  if (!driver) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#f44336" />
        <Text style={{ marginTop: 10 }}>No driver profile found</Text>
        <TouchableOpacity style={styles.button} onPress={fetchData}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileHeader}>
        <Ionicons name="person-circle" size={80} color="#6200ee" />
        <Text style={styles.driverName}>{driver.name}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Phone:</Text>
        <Text style={styles.value}>{driver.phone}</Text>

        <Text style={styles.label}>Car Number:</Text>
        <Text style={styles.value}>{driver.carNumber}</Text>

        <Text style={styles.label}>Driver Code:</Text>
        <Text style={styles.value}>{driver.code}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Total Deliveries:</Text>
        <Text style={styles.value}>{totalDeliveries}</Text>

        <Text style={styles.label}>Total Earnings:</Text>
        <Text style={styles.value}>${totalEarnings.toFixed(2)}</Text>
      </View>

      <TouchableOpacity style={styles.supportButton} onPress={() => Alert.alert('Support', 'Email: support@gascompany.com')}>
        <Ionicons name="help-circle-outline" size={20} color="#fff" />
        <Text style={styles.supportButtonText}>Contact Support</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  driverName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  value: {
    fontSize: 16,
    color: '#222',
    fontWeight: '500',
  },
  supportButton: {
    flexDirection: 'row',
    backgroundColor: '#6200ee',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  supportButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#6200ee',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});