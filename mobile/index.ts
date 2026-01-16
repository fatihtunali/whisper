import { registerRootComponent } from 'expo';

// Import background notification handler EARLY - must be in module scope
// This registers the background task before the app loads
import './src/services/BackgroundNotificationHandler';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
