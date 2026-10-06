import appletConfig from '../../firebase-applet-config.json';

const env = (import.meta.env || {}) as Record<string, string | undefined>;

/**
 * Resolves an optional Vite environment variable while ignoring empty strings or template placeholders.
 */
function resolveConfigValue(envValue: string | undefined, defaultValue: string): string {
  const trimmed = envValue?.trim();
  if (
    !trimmed ||
    trimmed.startsWith('YOUR_') ||
    trimmed.startsWith('your-') ||
    trimmed === '(default)'
  ) {
    return defaultValue;
  }
  return trimmed;
}

/**
 * Single source of truth for Firebase client configuration (`firebase-applet-config.json`):
 * - Project ID: perfect-impulse-t6rpq
 * - Firestore Database ID: ai-studio-splitzy-a2b7f5c3-1978-4c45-8090-dc38a0bf10d5
 */
export const firebaseConfig = {
  projectId: resolveConfigValue(env.VITE_FIREBASE_PROJECT_ID, appletConfig.projectId),
  appId: resolveConfigValue(env.VITE_FIREBASE_APP_ID, appletConfig.appId),
  apiKey: resolveConfigValue(env.VITE_FIREBASE_API_KEY, appletConfig.apiKey),
  authDomain: resolveConfigValue(env.VITE_FIREBASE_AUTH_DOMAIN, appletConfig.authDomain),
  firestoreDatabaseId: resolveConfigValue(
    env.VITE_FIREBASE_DATABASE_ID,
    appletConfig.firestoreDatabaseId
  ),
  storageBucket: resolveConfigValue(env.VITE_FIREBASE_STORAGE_BUCKET, appletConfig.storageBucket),
  messagingSenderId: resolveConfigValue(
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appletConfig.messagingSenderId
  ),
  measurementId: resolveConfigValue(
    env.VITE_FIREBASE_MEASUREMENT_ID,
    appletConfig.measurementId || ''
  ),
};



