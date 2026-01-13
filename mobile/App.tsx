import { StatusBar } from 'expo-status-bar';
import { View, AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { secureStorage } from './src/storage/SecureStorage';

// Import screens
import WelcomeScreen from './src/screens/WelcomeScreen';
import CreateAccountScreen from './src/screens/CreateAccountScreen';
import SeedPhraseScreen from './src/screens/SeedPhraseScreen';
import RecoverAccountScreen from './src/screens/RecoverAccountScreen';
import AppLockScreen from './src/screens/AppLockScreen';

// Import main navigator with all screens
import MainNavigator from './src/navigation/MainNavigator';

import { AuthStackParamList } from './src/types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  const { colors } = useTheme();
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="CreateAccount" component={CreateAccountScreen} />
      <AuthStack.Screen name="SeedPhrase" component={SeedPhraseScreen} />
      <AuthStack.Screen name="RecoverAccount" component={RecoverAccountScreen} />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors } = useTheme();
  const [isLocked, setIsLocked] = useState(false);
  const [isCheckingLock, setIsCheckingLock] = useState(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Check if app lock is enabled on initial load
  useEffect(() => {
    checkAppLock();
  }, [isAuthenticated]);

  // Listen for app state changes (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const checkAppLock = async () => {
    if (!isAuthenticated) {
      setIsCheckingLock(false);
      setIsLocked(false);
      return;
    }

    try {
      const settings = await secureStorage.getAppLockSettings();
      if (settings.enabled) {
        setIsLocked(true);
      }
    } catch (err) {
      console.log('Error checking app lock:', err);
    }
    setIsCheckingLock(false);
  };

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // When app comes back to foreground from background
    if (
      appStateRef.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // Check if we should lock the app
      const settings = await secureStorage.getAppLockSettings();
      if (settings.enabled) {
        setIsLocked(true);
      }
    }
    appStateRef.current = nextAppState;
  };

  const handleUnlock = () => {
    setIsLocked(false);
  };

  if (isLoading || isCheckingLock) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  // Show lock screen if app is locked and user is authenticated
  if (isLocked && isAuthenticated) {
    return <AppLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

function AppContent() {
  const { isDark, colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
