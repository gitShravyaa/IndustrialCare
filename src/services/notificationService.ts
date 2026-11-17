import { collection, onSnapshot, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { byDateDesc, mapDoc } from './mappers';
import type { ErrorHandler, Unsubscribe } from './types';

/** Real-time notifications addressed to this user (created by Cloud Functions). */
export function subscribeNotifications(
  uid: string,
  cb: (rows: any[]) => void,
  onError: ErrorHandler
): Unsubscribe {
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, 'notifications'), where('recipientUid', '==', uid)),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...mapDoc(d, ['timestamp']) }));
      rows.sort(byDateDesc('timestamp'));
      cb(rows);
    },
    (err) => onError(err)
  );
}

/** Security rules only allow the recipient to flip the "read" flag. */
export async function markAllRead(notifications: Array<{ id: string; read: boolean }>): Promise<void> {
  if (!db) return;
  const unread = notifications.filter((n) => !n.read).slice(0, 450);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db!, 'notifications', n.id), { read: true }));
  await batch.commit();
}
