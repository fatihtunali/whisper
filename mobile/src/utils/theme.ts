import { moderateScale, scaleFontSize } from './responsive';

// Dark theme colors (original theme)
export const darkColors = {
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

// Light theme colors
export const lightColors = {
  // Primary colors
  primary: '#6366f1',      // Indigo-500
  primaryDark: '#4f46e5',  // Indigo-600
  primaryLight: '#818cf8', // Indigo-400

  // Background colors
  background: '#f9fafb',   // Gray-50
  surface: '#ffffff',      // White
  surfaceLight: '#f3f4f6', // Gray-100

  // Text colors
  text: '#111827',         // Gray-900
  textSecondary: '#4b5563', // Gray-600
  textMuted: '#6b7280',     // Gray-500

  // Border colors
  border: '#e5e7eb',        // Gray-200
  borderLight: '#d1d5db',   // Gray-300

  // Status colors
  success: '#22c55e',       // Green-500
  error: '#ef4444',         // Red-500
  warning: '#f59e0b',       // Amber-500

  // Message bubble colors
  messageSent: '#6366f1',   // Indigo-500
  messageReceived: '#e5e7eb', // Gray-200
};

// Type for colors object
export type ThemeColors = typeof darkColors;

// Default export for backward compatibility (dark theme)
export const colors = darkColors;

export const spacing = {
  xs: moderateScale(4),
  sm: moderateScale(8),
  md: moderateScale(16),
  lg: moderateScale(24),
  xl: moderateScale(32),
  xxl: moderateScale(48),
};

export const fontSize = {
  xs: scaleFontSize(12),
  sm: scaleFontSize(14),
  md: scaleFontSize(16),
  lg: scaleFontSize(18),
  xl: scaleFontSize(20),
  xxl: scaleFontSize(24),
  xxxl: scaleFontSize(32),
};

export const borderRadius = {
  sm: moderateScale(8),
  md: moderateScale(12),
  lg: moderateScale(16),
  xl: moderateScale(24),
  full: 9999,
};

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
