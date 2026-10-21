import 'react-native';

// react-native-web ajoute le survol et le focus à l'état de Pressable (absents sur natif).
declare module 'react-native' {
  interface PressableStateCallbackType {
    readonly hovered?: boolean;
    readonly focused?: boolean;
  }
}
