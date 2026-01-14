import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

// Navigation ref for navigating from outside React components
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Navigate to a screen from anywhere
export function navigate(name: keyof RootStackParamList, params?: object) {
  if (navigationRef.isReady()) {
    // @ts-ignore - Navigation params typing is complex
    navigationRef.navigate(name, params);
  } else {
    console.warn('[Navigation] Navigation not ready, cannot navigate to', name);
  }
}
