import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { callFunction } from './functionsClient';
import { byDateDesc, mapDoc } from './mappers';
import type { ErrorHandler, Unsubscribe } from './types';

export function subscribeMaintenanceRecords(
  cb: (rows: any[]) => void,
  onError: ErrorHandler
): Unsubscribe {
  if (!db) return () => undefined;
  return onSnapshot(
    collection(db, 'maintenanceRecords'),
    (snap) => {
      const rows = snap.docs.map((d) =>
        mapDoc(d, ['startDate', 'completionDate', 'verifiedAt', 'updatedAt'])
      );
      rows.sort(byDateDesc('completionDate'));
      cb(rows);
    },
    (err) => onError(err)
  );
}

export interface UpdateRepairInput {
  complaintId: string;
  status: string;
  note?: string;
  /** Parts actually consumed during repair. This never changes warehouse stock. */
  partsUsed?: Array<{ requestId: string; qty: number }>;
}

export const updateRepair = (input: UpdateRepairInput) => callFunction('updateComplaintStatus', input);
