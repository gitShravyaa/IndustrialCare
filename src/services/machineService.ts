import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { callFunction } from './functionsClient';
import { mapDoc } from './mappers';
import type { ErrorHandler, Unsubscribe } from './types';

/** Real-time listener on all registered machines (every role may read them). */
export function subscribeMachines(cb: (rows: any[]) => void, onError: ErrorHandler): Unsubscribe {
  if (!db) return () => undefined;
  return onSnapshot(
    collection(db, 'machines'),
    (snap) => {
      const rows = snap.docs.map((d) => mapDoc(d, ['lastUpdated', 'createdAt']));
      rows.sort((a, b) => String(a.machineId).localeCompare(String(b.machineId)));
      cb(rows);
    },
    (err) => onError(err)
  );
}

export const addMachine = (m: { machineId: string; name: string; status: string }) =>
  callFunction('addMachine', m);

export const updateMachine = (m: { machineId: string; name?: string; status?: string }) =>
  callFunction('updateMachine', m);
