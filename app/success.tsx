import React, { useEffect } from 'react';
import { View, StyleSheet, Modal, Text, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';

interface SuccessModalProps {
  visible: boolean;
  onClose: () => void;
}

const { width } = Dimensions.get('window');

export default function SuccessModal({ visible, onClose }: SuccessModalProps) {
  // Add auto-dismiss functionality
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000); // Auto-dismiss after 2 seconds
      
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <LottieView
            source={require('../assets/success.json')}
            autoPlay
            loop={false}
            style={styles.animation}
          />
          <Text style={styles.successText}>Request Sent!</Text>
          <Text style={styles.subText}>Connecting you with the driver...</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    width: width * 0.8,
    maxWidth: 320,
  },
  animation: {
    width: 150,
    height: 150,
  },
  successText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#6200ee',
    marginTop: 10,
  },
  subText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
  },
});