import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { callFunction } from './functionsClient';
import { byDateDesc, mapDoc } from './mappers';
import type { ErrorHandler, Role, Unsubscribe } from './types';

const TS = ['createdAt', 'updatedAt'];

/**
 * Real-time complaints. Maintenance sees all complaints; Factory Workers only their own
 * (this is also enforced by Firestore security rules).
 */
export function subscribeComplaints(
  role: Role,
  uid: string,
  cb: (rows: any[]) => void,
  onError: ErrorHandler
): Unsubscribe {
  if (!db) return () => undefined;
  const base = collection(db, 'complaints');
  const q = role === 'worker' ? query(base, where('reportedByUid', '==', uid)) : base;
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => mapDoc(d, TS));
      rows.sort(byDateDesc('createdAt'));
      cb(rows);
    },
    (err) => onError(err)
  );
}

export interface SubmitComplaintInput {
  machineId: string;
  category: string;
  priority: string;
  description: string;
  photoPath?: string | null;
}

export const submitComplaint = (input: SubmitComplaintInput) =>
  callFunction<SubmitComplaintInput, { complaintId: string }>('submitComplaint', input);
