import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deckshot.app',
  appName: 'DECKSHOT',
  webDir: 'dist',
  backgroundColor: '#07090d',
  android: { allowMixedContent: true },
};

export default config;
