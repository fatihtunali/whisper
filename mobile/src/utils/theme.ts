export const colors = {
  // Primary colors
  primary: '#6366f1',      // Indigo-500
  primaryDark: '#4f46e5',  // Indigo-600
  primaryLight: '#818cf8', // Indigo-400

  // Background colors
  background: '#030712',   // Gray-950
  surface: '#111827',      // Gray-900
  surfaceLight: '#1f2937', // Gray-800

  // Text colors
  text: '#ffffff',
  textSecondary: '#9ca3af', // Gray-400
  textMuted: '#6b7280',     // Gray-500

  // Border colors
  border: '#374151',        // Gray-700
  borderLight: '#4b5563',   // Gray-600

  // Status colors
  success: '#22c55e',       // Green-500
  error: '#ef4444',         // Red-500
  warning: '#f59e0b',       // Amber-500

  // Message bubble colors
  messageSent: '#6366f1',   // Indigo-500
  messageReceived: '#1f2937', // Gray-800
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
