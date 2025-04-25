import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router'; // <-- we use Tabs now 🚀
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const [isDriverMode, setIsDriverMode] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();

  const handleLogin = async () => {
    if (!phone || !password) {
      Alert.alert('Missing Info', 'Please enter phone number and password.');
      return;
    }

    if (isDriverMode) {
      if (!name || !code) {
        Alert.alert('Missing Info', 'Please enter your name and driver code.');
        return;
      }

      try {
        const q = query(
          collection(db, 'drivers'),
          where('phone', '==', phone),
          where('password', '==', password),
          where('code', '==', code),
          where('name', '==', name)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          Alert.alert('Unauthorized', 'Invalid driver credentials. Please check your information.');
          return;
        }

        const driverDoc = snap.docs[0];
        const driverData = {
          id: driverDoc.id,
          ...driverDoc.data()
        };

        // Store driver data in AsyncStorage
        await AsyncStorage.setItem('driverData', JSON.stringify(driverData));
        
        console.log('🚗 Logged in driver:', driverData);
        router.push('/driver');
      } catch (error) {
        console.error('Login error:', error);
        Alert.alert('Error', 'Failed to log in. Try again.');
      }
    } else {
      router.push('/(tabs)/home');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Toggle Mode */}
      <Pressable style={styles.driverToggle} onPress={() => setIsDriverMode(!isDriverMode)}>
        <Ionicons
          name={isDriverMode ? 'person-outline' : 'car-sport'}
          size={20}
          color="#6200ee"
        />
        <Text style={styles.toggleText}>
          {isDriverMode ? 'Switch to Customer' : 'Driver Login'}
        </Text>
      </Pressable>

      {/* Login Card */}
      <View style={styles.card}>
        <Text style={styles.logo}>Gasify</Text>
        <Text style={styles.title}>
          {isDriverMode ? 'Driver Access' : 'Welcome Back'}
        </Text>

        {isDriverMode && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              placeholder="Driver Code"
              value={code}
              onChangeText={setCode}
              placeholderTextColor="#aaa"
            />
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholderTextColor="#aaa"
        />

        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={20}
              color="#888"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>
            {isDriverMode ? 'Login as Driver' : 'Continue as Customer'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2',
    padding: 24,
  },
  driverToggle: {
    flexDirection: 'row',
    position: 'absolute',
    top: 40,
    right: 24,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    elevation: 3,
  },
  toggleText: {
    marginLeft: 6,
    color: '#6200ee',
    fontWeight: '600',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 20,
    marginTop: 140,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  logo: {
    fontSize: 30,
    color: '#6200ee',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 20,
  },
  button: {
    backgroundColor: '#6200ee',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});