import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { RootStackParamList, MainTabParamList } from '../types';
import { colors, fontSize } from '../utils/theme';

// Screens
import ChatsScreen from '../screens/ChatsScreen';
import ChatScreen from '../screens/ChatScreen';
import ContactsScreen from '../screens/ContactsScreen';
import AddContactScreen from '../screens/AddContactScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import MyQRScreen from '../screens/MyQRScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import ChildSafetyScreen from '../screens/ChildSafetyScreen';
import AboutScreen from '../screens/AboutScreen';
import ForwardMessageScreen from '../screens/ForwardMessageScreen';
import VideoCallScreen from '../screens/VideoCallScreen';
import CallScreen from '../screens/CallScreen';
// Group screens
import CreateGroupScreen from '../screens/CreateGroupScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import AddGroupMemberScreen from '../screens/AddGroupMemberScreen';
// Settings screens
import SetupPinScreen from '../screens/SetupPinScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Tab icons
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    ChatsTab: focused ? '💬' : '💭',
    ContactsTab: focused ? '👥' : '👤',
    SettingsTab: focused ? '⚙️' : '⚙',
  };

  return (
    <View style={styles.tabIconContainer}>
      <Text style={styles.tabIcon}>{icons[name] || '•'}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen
        name="ChatsTab"
        component={ChatsScreen}
        options={{ tabBarLabel: 'Chats' }}
      />
      <Tab.Screen
        name="ContactsTab"
        component={ContactsScreen}
        options={{ tabBarLabel: 'Contacts' }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="AddContact"
        component={AddContactScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="MyQR"
        component={MyQRScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Privacy"
        component={PrivacyScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="ChildSafety"
        component={ChildSafetyScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="ForwardMessage"
        component={ForwardMessageScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="VideoCall"
        component={VideoCallScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      />
      {/* Group screens */}
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="GroupInfo"
        component={GroupInfoScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="AddGroupMember"
        component={AddGroupMemberScreen}
        options={{ presentation: 'modal' }}
      />
      {/* Settings screens */}
      <Stack.Screen
        name="SetupPin"
        component={SetupPinScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 20,
    paddingTop: 10,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 24,
  },
});
