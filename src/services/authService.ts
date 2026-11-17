import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { callFunction } from './functionsClient';
import type { Role, UserProfile } from './types';

const authErrorMessage = (err: any): string => {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    default:
      return err?.message || 'Authentication failed.';
  }
};

/**
 * Loads the signed-in user's profile. The role comes from the trusted custom claim
 * and must match the server-written users/{uid} record.
 */
export async function loadProfile(user: User): Promise<UserProfile> {
  if (!db) throw new Error('Firebase is not configured.');
  const token = await user.getIdTokenResult(true);
  const claimRole = token.claims.role as Role | undefined;
  if (!claimRole) {
    throw new Error('Your account has no role assigned yet. Please contact your administrator.');
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) {
    throw new Error('Your employee profile was not found. Please contact your administrator.');
  }
  const d = snap.data();
  if (d.role !== claimRole) {
    throw new Error('Your account role could not be verified. Please contact your administrator.');
  }
  return { uid: user.uid, badgeId: d.badgeId, name: d.name, email: d.email, role: claimRole };
}

export async function signInUser(email: string, password: string): Promise<UserProfile> {
  if (!auth) throw new Error('Firebase is not configured.');
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return await loadProfile(cred.user);
  } catch (err: any) {
    if (auth.currentUser) await signOut(auth).catch(() => undefined);
    throw new Error(authErrorMessage(err));
  }
}

/** Factory Worker self-registration. The role is fixed to "worker" by the backend, never by the client. */
export async function registerFactoryWorker(input: {
  name: string;
  badgeId: string;
  email: string;
  password: string;
}): Promise<UserProfile> {
  await callFunction('registerFactoryWorker', input);
  return signInUser(input.email, input.password);
}

export async function signOutUser(): Promise<void> {
  if (auth) await signOut(auth);
}

export async function sendResetEmail(email: string): Promise<void> {
  if (!auth) throw new Error('Firebase is not configured.');
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err: any) {
    // Do not reveal whether the account exists.
    if (err?.code === 'auth/user-not-found') return;
    throw new Error(authErrorMessage(err));
  }
}

/** Restores the session after a page refresh. */
export function watchAuthState(
  cb: (user: User | null) => void
): () => void {
  if (!auth) {
    cb(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, cb);
}
