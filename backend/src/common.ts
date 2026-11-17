import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'industrialcare';
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId });
  } else {
    // Local development: uses gcloud ADC created by `gcloud auth application-default login`.
    initializeApp({ credential: applicationDefault(), projectId });
  }
}

export const db = getFirestore();
export { FieldValue, Timestamp };

export type Role = 'worker' | 'maintenance' | 'warehouse';
export type Section = 'spareParts' | 'otherInventoryItems';

export interface Profile {
  uid: string;
  badgeId: string;
  name: string;
  email: string;
  role: Role;
}

export const COLLECTIONS: Record<Section, string> = {
  spareParts: 'sparePartsInventory',
  otherInventoryItems: 'otherItemsInventory'
};
export const ID_KEY: Record<Section, 'partId' | 'itemId'> = {
  spareParts: 'partId',
  otherInventoryItems: 'itemId'
};

export const MACHINE_STATUSES = ['Operational', 'Under Maintenance', 'Breakdown'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const CATEGORIES = ['Mechanical', 'Electrical', 'Hydraulic System', 'Sensor / Calibration'];
export const REPAIR_STATUSES = ['Accepted', 'In Progress', 'Waiting for Parts', 'Resolved', 'Verified'];

/**
 * Trusted role check. The role must be present in the custom claim on the ID token
 * AND match the server-written users/{uid} document.
 */
export async function requireRole(req: CallableRequest<any>, roles: Role[]): Promise<Profile> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in to continue.');
  const claim = req.auth.token.role as Role | undefined;
  if (!claim || !roles.includes(claim)) {
    throw new HttpsError('permission-denied', 'Your role is not allowed to perform this action.');
  }
  const snap = await db.doc(`users/${req.auth.uid}`).get();
  if (!snap.exists || snap.get('role') !== claim) {
    throw new HttpsError('permission-denied', 'Your account role could not be verified.');
  }
  const d = snap.data() as any;
  return { uid: req.auth.uid, badgeId: d.badgeId, name: d.name, email: d.email, role: claim };
}

export const who = (p: Profile) => `${p.name} (${p.badgeId})`;

// ---------- validation helpers ----------
export function reqString(v: unknown, field: string, min = 1, max = 200): string {
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${field} is required.`);
  const s = v.trim();
  if (s.length < min || s.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be between ${min} and ${max} characters.`);
  }
  return s;
}

export function optString(v: unknown, field: string, max = 200): string {
  if (v === undefined || v === null || v === '') return '';
  return reqString(v, field, 0, max);
}

export function reqInt(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpsError('invalid-argument', `${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function reqEnum(v: unknown, field: string, allowed: string[]): string {
  if (typeof v !== 'string' || !allowed.includes(v)) {
    throw new HttpsError('invalid-argument', `${field} is invalid.`);
  }
  return v;
}

export function reqSection(v: unknown): Section {
  if (v !== 'spareParts' && v !== 'otherInventoryItems') {
    throw new HttpsError('invalid-argument', 'Inventory section is invalid.');
  }
  return v;
}

export const ITEM_ID_REGEX = /^[A-Z]{2}-[0-9]{2}$/;

// ---------- readable sequential IDs (CMP-5001, REQ-401 ...) ----------
/** Must be called with the other reads, BEFORE any write in the transaction. */
export async function reserveId(tx: Transaction, counter: string, prefix: string, start: number) {
  const ref = db.doc(`counters/${counter}`);
  const snap = await tx.get(ref);
  const next = (snap.exists ? (snap.get('value') as number) : start - 1) + 1;
  return { id: `${prefix}-${next}`, save: () => tx.set(ref, { value: next }) };
}

// ---------- notifications ----------
export async function uidsByRole(role: Role): Promise<string[]> {
  const snap = await db.collection('users').where('role', '==', role).get();
  return snap.docs.map((d) => d.id);
}

export function queueNotifications(
  tx: Transaction,
  recipients: string[],
  n: { title: string; message: string; type: string; refId?: string }
) {
  for (const uid of new Set(recipients)) {
    tx.set(db.collection('notifications').doc(), {
      recipientUid: uid,
      title: n.title,
      message: n.message,
      type: n.type,
      refId: n.refId || null,
      read: false,
      timestamp: FieldValue.serverTimestamp()
    });
  }
}

// ---------- low-stock alert maintenance ----------
/**
 * Keeps stockAlerts/ALT-<itemId> in sync with the stock level.
 * `existing` must have been read earlier in the same transaction.
 */
export function syncStockAlert(
  tx: Transaction,
  existing: FirebaseFirestore.DocumentSnapshot,
  item: { id: string; name: string; section: Section; qty: number; threshold: number },
  warehouseUids: string[]
) {
  const ref = db.doc(`stockAlerts/ALT-${item.id}`);
  const wasActive = existing.exists && existing.get('resolved') === false;
  if (item.qty <= item.threshold) {
    tx.set(ref, {
      alertId: `ALT-${item.id}`,
      itemId: item.id,
      itemName: item.name,
      section: item.section,
      currentQty: item.qty,
      minThreshold: item.threshold,
      resolved: false,
      resolvedAt: null,
      createdAt: wasActive ? existing.get('createdAt') : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    if (!wasActive) {
      queueNotifications(tx, warehouseUids, {
        title: 'Low Stock Alert',
        message: `${item.name} (${item.id}) is at ${item.qty}, threshold is ${item.threshold}.`,
        type: 'low-stock',
        refId: item.id
      });
    }
  } else if (existing.exists && !existing.get('resolved')) {
    tx.update(ref, {
      resolved: true,
      currentQty: item.qty,
      minThreshold: item.threshold,
      resolvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }
}
