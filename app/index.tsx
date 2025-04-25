import React, { useState } from 'react';
import { View, Button } from 'react-native';
import LoginScreen from './login';
import HomeScreen from './home';
import DriverScreen from './driver';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isDriverView, setIsDriverView] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {isLoggedIn ? (
          isDriverView ? <DriverScreen /> : <HomeScreen />
        ) : (
          <LoginScreen />
        )}
        {isLoggedIn && (
          <View style={{ position: 'absolute', top: 80, right: 20  }}>
            <Button
              title={isDriverView ? 'Switch to Customer' : 'Switch to Driver'}
              onPress={() => setIsDriverView(!isDriverView)}
            />
          </View>
        )}
      </View>
      <Toast />
    </GestureHandlerRootView>
  );
}