// Type declarations for modules without types

declare module '@expo/vector-icons' {
  import { ComponentType } from 'react';
  import { TextStyle, ViewStyle, StyleProp } from 'react-native';

  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle | ViewStyle>;
  }

  export const Ionicons: ComponentType<IconProps>;
  export const MaterialIcons: ComponentType<IconProps>;
  export const FontAwesome: ComponentType<IconProps>;
  export const Feather: ComponentType<IconProps>;
  export const MaterialCommunityIcons: ComponentType<IconProps>;
}
