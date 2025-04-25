import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function AdminHome() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <Text style={styles.sidebarTitle}>Admin Panel</Text>
        <TouchableOpacity style={styles.sidebarButton}>
          <Ionicons name="person-outline" size={20} color="#fff" />
          <Text style={styles.sidebarButtonText}>Drivers</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>Drivers</Text>
        {/* Later we will render list of drivers here */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 200,
    backgroundColor: '#6200ee',
    paddingTop: 50,
    paddingHorizontal: 12,
  },
  sidebarTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  sidebarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sidebarButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f9f9f9',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
});