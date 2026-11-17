import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, MACHINE_STATUSES, reqEnum, reqString, requireRole, who
} from './common';

const MACHINE_ID_REGEX = /^[A-Z]{1,4}-[0-9]{1,5}$/;

export const addMachine = onCall(async (req) => {
  const user = await requireRole(req, ['maintenance']);
  const machineId = reqString(req.data?.machineId, 'Machine ID', 3, 12).toUpperCase();
  const name = reqString(req.data?.name, 'Machine name', 2, 80);
  const status = reqEnum(req.data?.status ?? 'Operational', 'Status', MACHINE_STATUSES);
  if (!MACHINE_ID_REGEX.test(machineId)) {
    throw new HttpsError('invalid-argument', 'Machine ID must look like M-104.');
  }
  try {
    await db.doc(`machines/${machineId}`).create({
      machineId,
      name,
      status,
      createdBy: user.uid,
      createdByName: who(user),
      createdAt: FieldValue.serverTimestamp(),
      lastUpdated: FieldValue.serverTimestamp()
    });
  } catch {
    throw new HttpsError('already-exists', 'Machine ID already exists.');
  }
  return { machineId };
});

export const updateMachine = onCall(async (req) => {
  const user = await requireRole(req, ['maintenance']);
  const machineId = reqString(req.data?.machineId, 'Machine ID', 3, 12).toUpperCase();
  const patch: Record<string, unknown> = {};
  if (req.data?.name !== undefined) patch.name = reqString(req.data.name, 'Machine name', 2, 80);
  if (req.data?.status !== undefined) patch.status = reqEnum(req.data.status, 'Status', MACHINE_STATUSES);

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`machines/${machineId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Machine not found.');

    // A machine may not be flagged Operational while a repair is still open (not yet Verified).
    if (patch.status === 'Operational') {
      const open = await tx.get(db.collection('complaints').where('machineId', '==', machineId));
      const hasOpen = open.docs.some((d) => d.get('status') !== 'Verified');
      if (hasOpen) {
        throw new HttpsError(
          'failed-precondition',
          'This machine still has an open complaint. Resolve and Verify the repair before marking it Operational.'
        );
      }
    }
    tx.update(ref, {
      ...patch,
      lastUpdated: FieldValue.serverTimestamp(),
      updatedBy: user.uid
    });
  });
  return { ok: true };
});
