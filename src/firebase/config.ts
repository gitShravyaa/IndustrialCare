/**
 * Firebase client configuration.
 * All values come from VITE_FIREBASE_* environment variables (see .env.example).
 * No credentials are hard-coded here.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

const env = import.meta.env;

const useEmulators = String(env.VITE_USE_FIREBASE_EMULATORS || '').toLowerCase() === 'true';

const rawConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || ''
};

// In emulator mode only a project id is really needed; fill harmless placeholders for the rest.
const firebaseConfig = useEmulators
  ? {
      apiKey: rawConfig.apiKey || 'emulator-api-key',
      authDomain: rawConfig.authDomain || 'localhost',
      projectId: rawConfig.projectId || 'demo-industrialcare',
      storageBucket: rawConfig.storageBucket || 'demo-industrialcare.appspot.com',
      messagingSenderId: rawConfig.messagingSenderId || '000000000000',
      appId: rawConfig.appId || '1:000000000000:web:emulator'
    }
  : rawConfig;

const REQUIRED_KEYS: Array<[keyof typeof rawConfig, string]> = [
  ['apiKey', 'VITE_FIREBASE_API_KEY'],
  ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'VITE_FIREBASE_PROJECT_ID'],
  ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'VITE_FIREBASE_APP_ID']
];

/** Names of any required environment variables that are still empty. */
export const missingConfigKeys: string[] = useEmulators
  ? []
  : REQUIRED_KEYS.filter(([k]) => !String(rawConfig[k] || '').trim()).map(([, name]) => name);

export const isFirebaseConfigured = missingConfigKeys.length === 0;
export const isUsingEmulators = useEmulators;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app, env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');

  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
}

export { app, auth, db, storage, functions };
