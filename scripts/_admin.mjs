
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID;

if (!projectId) {
  console.error(
    'FIREBASE_PROJECT_ID is not configured.'
  );
  process.exit(1);
}

initializeApp(
  usingEmulator
    ? { projectId }
    : {
        projectId,
        credential: applicationDefault()
      }
);

export const db = getFirestore();
export const auth = getAuth();

export { projectId, usingEmulator };
