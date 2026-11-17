import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, reqString } from './common';

/**
 * Factory Worker self-registration.
 * The role is ALWAYS "worker" and is set here on the server (custom claim + users doc).
 * Clients can never choose a role. Maintenance Team / Warehouse Manager accounts are
 * created by an administrator with scripts/create-staff.mjs.
 */
export const registerFactoryWorker = onCall(async (req) => {
  const name = reqString(req.data?.name, 'Full name', 2, 80);
  const badgeId = reqString(req.data?.badgeId, 'Employee ID', 5, 5).toUpperCase();
  const email = reqString(req.data?.email, 'Email', 5, 120).toLowerCase();
  const password = reqString(req.data?.password, 'Password', 8, 128);

  if (!/^[A-Z]{2}-[0-9]{2}$/.test(badgeId)) {
    throw new HttpsError('invalid-argument', 'Employee ID must be two letters, a dash and two numbers (e.g. FW-02).');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  }

  // Atomically reserve the employee ID (create() fails if it already exists).
  const badgeRef = db.doc(`badgeIds/${badgeId}`);
  try {
    await badgeRef.create({ createdAt: FieldValue.serverTimestamp() });
  } catch {
    throw new HttpsError('already-exists', 'This Employee ID is already registered.');
  }

  const auth = getAuth();
  let uid: string | null = null;
  try {
    const user = await auth.createUser({ email, password, displayName: name });
    uid = user.uid;
    await auth.setCustomUserClaims(uid, { role: 'worker' });
    await db.doc(`users/${uid}`).set({
      uid,
      badgeId,
      name,
      email,
      role: 'worker',
      createdAt: FieldValue.serverTimestamp()
    });
    await badgeRef.set({ uid, createdAt: FieldValue.serverTimestamp() });
    return { ok: true };
  } catch (err: any) {
    // roll back everything created so far
    if (uid) await auth.deleteUser(uid).catch(() => undefined);
    await badgeRef.delete().catch(() => undefined);
    if (err?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account with this email already exists.');
    }
    if (err?.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'Password is too weak (minimum 8 characters).');
    }
    if (err instanceof HttpsError) throw err;
    console.error('registerFactoryWorker failed', err);
    throw new HttpsError('internal', 'Could not create the account. Please try again.');
  }
});
