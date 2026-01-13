import { Dimensions, PixelRatio, Platform } from 'react-native';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 11 - 375 x 812)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

// Scale based on screen width
export const scaleWidth = (size: number): number => {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Scale based on screen height
export const scaleHeight = (size: number): number => {
  const scale = SCREEN_HEIGHT / BASE_HEIGHT;
  const newSize = size * scale;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Moderate scale - for elements that should scale but not too much
// factor: 0.5 means 50% of the scaling will be applied
export const moderateScale = (size: number, factor: number = 0.5): number => {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size + (size * (scale - 1) * factor);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Scale font size - accounts for device font scaling settings
export const scaleFontSize = (size: number): number => {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;

  // Clamp font scaling to prevent extremes
  const minScale = 0.85;
  const maxScale = 1.3;
  const clampedScale = Math.min(Math.max(scale, minScale), maxScale);

  return Math.round(PixelRatio.roundToNearestPixel(size * clampedScale));
};

// Check if small screen (< 375 width)
export const isSmallScreen = SCREEN_WIDTH < 375;

// Check if large screen (> 414 width, like iPhone Plus/Max or tablets)
export const isLargeScreen = SCREEN_WIDTH > 414;

// Check if tablet
export const isTablet = SCREEN_WIDTH >= 768;

// Get responsive value based on screen size
export const getResponsiveValue = <T>(options: {
  small?: T;
  default: T;
  large?: T;
  tablet?: T;
}): T => {
  if (isTablet && options.tablet !== undefined) return options.tablet;
  if (isLargeScreen && options.large !== undefined) return options.large;
  if (isSmallScreen && options.small !== undefined) return options.small;
  return options.default;
};

// Screen dimensions
export const screen = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmall: isSmallScreen,
  isLarge: isLargeScreen,
  isTablet: isTablet,
};

// Shorthand aliases
export const sw = scaleWidth;
export const sh = scaleHeight;
export const ms = moderateScale;
export const sf = scaleFontSize;
