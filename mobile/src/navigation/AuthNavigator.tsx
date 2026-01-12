import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../types';
import WelcomeScreen from '../screens/WelcomeScreen';
import CreateAccountScreen from '../screens/CreateAccountScreen';
import SeedPhraseScreen from '../screens/SeedPhraseScreen';
import RecoverAccountScreen from '../screens/RecoverAccountScreen';
import { colors } from '../utils/theme';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
      <Stack.Screen name="SeedPhrase" component={SeedPhraseScreen} />
      <Stack.Screen name="RecoverAccount" component={RecoverAccountScreen} />
    </Stack.Navigator>
  );
}
