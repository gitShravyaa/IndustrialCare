import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { callFunction } from './functionsClient';
import { byDateDesc, mapDoc } from './mappers';
import type { ErrorHandler, Role, Unsubscribe } from './types';

/** Spare part / material requests. Workers only see their own; maintenance & warehouse see all. */
export function subscribeRequests(
  role: Role,
  uid: string,
  cb: (rows: any[]) => void,
  onError: ErrorHandler
): Unsubscribe {
  if (!db) return () => undefined;
  const base = collection(db, 'sparePartRequests');
  const q = role === 'worker' ? query(base, where('requestedByUid', '==', uid)) : base;
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => mapDoc(d, ['createdAt', 'updatedAt', 'processedAt']));
      rows.sort(byDateDesc('createdAt'));
      cb(rows);
    },
    (err) => onError(err)
  );
}

export interface CreateRequestInput {
  machineId: string;
  relatedComplaintId: string;
  partId: string;
  requestedQty: number;
  reason: string;
}

export const createMaterialRequest = (input: CreateRequestInput) =>
  callFunction('createMaterialRequest', input);

/** Warehouse decision. "Issued" atomically deducts stock inside a Firestore transaction on the server. */
export const processMaterialRequest = (requestId: string, decision: 'Issued' | 'Rejected') =>
  callFunction('processMaterialRequest', { requestId, decision });
