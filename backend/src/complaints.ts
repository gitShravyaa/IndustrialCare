import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  CATEGORIES, db, FieldValue, PRIORITIES, REPAIR_STATUSES, Timestamp,
  optString, queueNotifications, reqEnum, reqInt, reqString, requireRole, reserveId, uidsByRole, who
} from './common';

/** Factory Worker submits a machine complaint (photo is uploaded to Storage by the client first). */
export const submitComplaintHandler = async (req: CallableRequest<any>) => {
  const user = await requireRole(req, ['worker']);
  const machineId = reqString(req.data?.machineId, 'Machine', 3, 12).toUpperCase();
  const category = reqEnum(req.data?.category, 'Category', CATEGORIES);
  const priority = reqEnum(req.data?.priority, 'Priority', PRIORITIES);
  const description = reqString(req.data?.description, 'Problem description', 5, 2000);
  const photoPath = optString(req.data?.photoPath, 'Photo', 300);
  if (photoPath && !photoPath.startsWith(`complaints/${user.uid}/`)) {
    throw new HttpsError('invalid-argument', 'Invalid photo reference.');
  }

  const maintenanceUids = await uidsByRole('maintenance');

  const complaintId = await db.runTransaction(async (tx) => {
    const mRef = db.doc(`machines/${machineId}`);
    const machine = await tx.get(mRef);
    if (!machine.exists) throw new HttpsError('not-found', 'Machine not found.');
    if (machine.get('status') === 'Under Maintenance') {
      throw new HttpsError('failed-precondition', 'This machine is already under maintenance.');
    }
    const ctr = await reserveId(tx, 'complaints', 'CMP', 5001);
    ctr.save();

    const now = Timestamp.now();
    const machineName = machine.get('name') as string;
    const newMachineStatus =
      priority === 'Critical' || machine.get('status') === 'Breakdown' ? 'Breakdown' : 'Under Maintenance';

    tx.set(db.doc(`complaints/${ctr.id}`), {
      complaintId: ctr.id,
      machineId,
      machineName,
      category,
      description,
      priority,
      status: 'New',
      photoPath: photoPath || null,
      reportedByUid: user.uid,
      reportedByName: who(user),
      acceptedByUid: null,
      acceptedByName: null,
      maintenanceRecordId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      history: [
        { status: 'New', note: `Issue reported by ${who(user)}.`, timestamp: now, by: user.uid }
      ]
    });
    tx.update(mRef, { status: newMachineStatus, lastUpdated: FieldValue.serverTimestamp() });

    queueNotifications(tx, [user.uid], {
      title: `Complaint ${ctr.id} Received`,
      message: `Your report for ${machineName} (${machineId}) has been received by Maintenance.`,
      type: 'complaint-received',
      refId: ctr.id
    });
    queueNotifications(tx, maintenanceUids, {
      title: 'New Machine Issue Reported',
      message: `${ctr.id} on ${machineName} (${machineId}) – ${priority} priority`,
      type: 'complaint-new',
      refId: ctr.id
    });
    return ctr.id;
  });

  return { complaintId };
};
export const submitComplaint = onCall(submitComplaintHandler);

/**
 * Maintenance workflow: Accepted -> In Progress / Waiting for Parts -> Resolved -> Verified.
 *  - "Resolved" = repair work completed (machine stays Under Maintenance, awaiting verification).
 *  - "Verified" = repair completion verified by Maintenance. ONLY then is the machine set to Operational.
 *  - partsUsed records what was actually consumed. It NEVER touches warehouse stock
 *    (stock was already deducted when the Warehouse issued the parts).
 * This is a software workflow only; it does not replace on-site industrial safety procedures.
 */
export const updateComplaintStatusHandler = async (req: CallableRequest<any>) => {
  const user = await requireRole(req, ['maintenance']);
  const complaintId = reqString(req.data?.complaintId, 'Complaint', 3, 30);
  const status = reqEnum(req.data?.status, 'Status', REPAIR_STATUSES);
  const note = optString(req.data?.note, 'Note', 1000);

  const rawParts = req.data?.partsUsed;
  const partsUsed: Array<{ requestId: string; qty: number }> = [];
  if (rawParts !== undefined && rawParts !== null) {
    if (!Array.isArray(rawParts) || rawParts.length > 30) {
      throw new HttpsError('invalid-argument', 'partsUsed is invalid.');
    }
    for (const p of rawParts) {
      partsUsed.push({
        requestId: reqString(p?.requestId, 'Request', 3, 30),
        qty: reqInt(p?.qty, 'Quantity used', 0, 100000)
      });
    }
  }

  const noteText = note || `Status updated to ${status}.`;
  const workerUidHolder: { uid: string; machineName: string } = { uid: '', machineName: '' };

  await db.runTransaction(async (tx) => {
    // ---------- reads ----------
    const cRef = db.doc(`complaints/${complaintId}`);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists) throw new HttpsError('not-found', 'Complaint not found.');
    const c = cSnap.data() as any;
    const current: string = c.status;

    const mRef = db.doc(`machines/${c.machineId}`);
    const mSnap = await tx.get(mRef);

    const reqSnap = await tx.get(
      db.collection('sparePartRequests').where('relatedComplaintId', '==', complaintId)
    );
    const issuedRequests = reqSnap.docs.filter((d) => d.get('status') === 'Issued');

    let otherOpen = false;
    if (status === 'Verified') {
      const others = await tx.get(db.collection('complaints').where('machineId', '==', c.machineId));
      otherOpen = others.docs.some((d) => d.id !== complaintId && d.get('status') !== 'Verified');
    }

    const wantsRecord = status === 'Resolved' || status === 'Verified';
    let recordId: string | null = c.maintenanceRecordId || null;
    let recordSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let newRecordCounter: Awaited<ReturnType<typeof reserveId>> | null = null;
    if (wantsRecord) {
      if (recordId) recordSnap = await tx.get(db.doc(`maintenanceRecords/${recordId}`));
      else {
        newRecordCounter = await reserveId(tx, 'maintenanceRecords', 'MNT', 9001);
        recordId = newRecordCounter.id;
      }
    }

    // ---------- validation ----------
    if (current === 'Verified') {
      throw new HttpsError('failed-precondition', 'This complaint is already verified and closed.');
    }
    if (current === 'New' && status !== 'Accepted') {
      throw new HttpsError('failed-precondition', 'Accept the complaint first before changing its repair status.');
    }
    if (status === 'Verified' && current !== 'Resolved') {
      throw new HttpsError(
        'failed-precondition',
        'Mark the repair as Resolved first. Verification can only follow a completed repair.'
      );
    }
    if (status === 'Accepted' && current !== 'New' && current !== 'Accepted') {
      throw new HttpsError('failed-precondition', 'This complaint has already been accepted.');
    }

    // Parts actually used: validated against what the Warehouse really issued for THIS complaint.
    const usedByRequest = new Map<string, number>();
    for (const p of partsUsed) {
      const rq = issuedRequests.find((d) => d.id === p.requestId);
      if (!rq) {
        throw new HttpsError(
          'failed-precondition',
          `Request ${p.requestId} has not been issued for this complaint.`
        );
      }
      const issued = (rq.get('issuedQty') as number) || 0;
      if (p.qty > issued) {
        throw new HttpsError(
          'invalid-argument',
          `Used quantity for ${p.requestId} cannot exceed the ${issued} issued.`
        );
      }
      usedByRequest.set(p.requestId, p.qty);
    }

    // ---------- writes ----------
    const now = Timestamp.now();
    for (const [requestId, qty] of usedByRequest) {
      // Only records consumption. Inventory quantity is NOT touched here.
      tx.update(db.doc(`sparePartRequests/${requestId}`), {
        usedQty: qty,
        usedRecordedBy: user.uid,
        usedRecordedAt: FieldValue.serverTimestamp()
      });
    }

    const complaintUpdate: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({ status, note: noteText, timestamp: now, by: user.uid })
    };
    if (status === 'Accepted' && current === 'New') {
      complaintUpdate.acceptedByUid = user.uid;
      complaintUpdate.acceptedByName = who(user);
    }
    if (wantsRecord) complaintUpdate.maintenanceRecordId = recordId;
    tx.update(cRef, complaintUpdate);

    // machine status follows the workflow; Operational ONLY after Verified
    if (mSnap.exists) {
      const machineStatus = status === 'Verified' && !otherOpen ? 'Operational' : 'Under Maintenance';
      tx.update(mRef, { status: machineStatus, lastUpdated: FieldValue.serverTimestamp() });
    }

    if (wantsRecord && recordId) {
      const usedList = issuedRequests
        .map((d) => {
          const qty = usedByRequest.has(d.id) ? usedByRequest.get(d.id)! : ((d.get('usedQty') as number) || 0);
          return {
            requestId: d.id,
            partId: d.get('partId'),
            partName: d.get('partName'),
            issuedQty: d.get('issuedQty') || 0,
            usedQty: qty
          };
        })
        .filter((p) => p.usedQty > 0);

      const base = {
        recordId,
        machineId: c.machineId,
        machineName: c.machineName,
        complaintId,
        problemDescription: c.description,
        partsUsed: usedList,
        partsUsedSummary: usedList.map((p) => `${p.partName} (${p.usedQty})`).join(', '),
        startDate: c.createdAt,
        finalStatus: status,
        updatedAt: FieldValue.serverTimestamp()
      };
      if (status === 'Resolved') {
        tx.set(db.doc(`maintenanceRecords/${recordId}`), {
          ...base,
          repairActions: noteText,
          completionDate: FieldValue.serverTimestamp(),
          completedBy: user.uid,
          completedByName: who(user),
          verifiedAt: null,
          verifiedByName: null
        });
      } else if (recordSnap && recordSnap.exists) {
        tx.update(db.doc(`maintenanceRecords/${recordId}`), {
          partsUsed: base.partsUsed,
          partsUsedSummary: base.partsUsedSummary,
          finalStatus: 'Verified',
          verificationNote: noteText,
          verifiedAt: FieldValue.serverTimestamp(),
          verifiedBy: user.uid,
          verifiedByName: who(user),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        // defensive: verified without an earlier record
        tx.set(db.doc(`maintenanceRecords/${recordId}`), {
          ...base,
          repairActions: noteText,
          completionDate: FieldValue.serverTimestamp(),
          verificationNote: noteText,
          verifiedAt: FieldValue.serverTimestamp(),
          verifiedBy: user.uid,
          verifiedByName: who(user)
        });
      }
      newRecordCounter?.save();
    }

    workerUidHolder.uid = c.reportedByUid;
    workerUidHolder.machineName = c.machineName;

    // notify the worker who reported the issue
    let title = `Complaint ${complaintId} Updated`;
    let message = `${c.machineName}: ${status} – ${noteText}`;
    if (status === 'Accepted') {
      title = `Complaint ${complaintId} Accepted`;
      message = `Maintenance accepted your report for ${c.machineName} (${c.machineId}).`;
    } else if (status === 'Resolved') {
      title = `Repair Completed – ${complaintId}`;
      message = `${c.machineName}: repair work completed, awaiting verification by Maintenance.`;
    } else if (status === 'Verified') {
      title = `Repair Verified – ${complaintId}`;
      message = otherOpen
        ? `${c.machineName}: repair verified. Other complaints are still open on this machine.`
        : `${c.machineName}: repair verified by Maintenance and machine status set to Operational.`;
    }
    queueNotifications(tx, [c.reportedByUid], { title, message, type: 'complaint-update', refId: complaintId });
  });

  return { ok: true };
};
export const updateComplaintStatus = onCall(updateComplaintStatusHandler);
