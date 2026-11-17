import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  COLLECTIONS, db, FieldValue, Section,
  queueNotifications, reqEnum, reqInt, reqString, requireRole, reserveId, syncStockAlert, uidsByRole, who
} from './common';

const GENERAL = 'General Floor Request';

/** Maintenance Team (and Factory Workers via the existing UI) request spare parts / materials. */
export const createMaterialRequestHandler = async (req: CallableRequest<any>) => {
  const user = await requireRole(req, ['maintenance', 'worker']);
  const machineId = reqString(req.data?.machineId, 'Machine', 3, 12).toUpperCase();
  const partId = reqString(req.data?.partId, 'Item', 5, 5).toUpperCase();
  const requestedQty = reqInt(req.data?.requestedQty, 'Quantity', 1, 100000);
  const reason = reqString(req.data?.reason, 'Reason', 3, 500);
  const relatedRaw = typeof req.data?.relatedComplaintId === 'string' ? req.data.relatedComplaintId.trim() : '';
  const relatedComplaintId = relatedRaw && relatedRaw !== GENERAL ? relatedRaw : GENERAL;

  const warehouseUids = await uidsByRole('warehouse');

  const requestId = await db.runTransaction(async (tx) => {
    const machine = await tx.get(db.doc(`machines/${machineId}`));
    if (!machine.exists) throw new HttpsError('not-found', 'Machine not found.');

    // item can be in either inventory section (IDs are unique across both)
    const spare = await tx.get(db.doc(`${COLLECTIONS.spareParts}/${partId}`));
    let section: Section = 'spareParts';
    let item = spare;
    if (!spare.exists) {
      const other = await tx.get(db.doc(`${COLLECTIONS.otherInventoryItems}/${partId}`));
      if (!other.exists) throw new HttpsError('not-found', 'Inventory item not found.');
      section = 'otherInventoryItems';
      item = other;
    }

    if (relatedComplaintId !== GENERAL) {
      const cSnap = await tx.get(db.doc(`complaints/${relatedComplaintId}`));
      if (!cSnap.exists) throw new HttpsError('not-found', 'Related complaint not found.');
      if (user.role === 'worker' && cSnap.get('reportedByUid') !== user.uid) {
        throw new HttpsError('permission-denied', 'You can only link your own complaints.');
      }
    }

    const ctr = await reserveId(tx, 'requests', 'REQ', 301);
    ctr.save();

    tx.set(db.doc(`sparePartRequests/${ctr.id}`), {
      requestId: ctr.id,
      machineId,
      machineName: machine.get('name'),
      relatedComplaintId,
      partId,
      partName: item.get('name'),
      section,
      requestedQty,
      issuedQty: 0,
      usedQty: null,
      reason,
      requestedBy: who(user),
      requestedByUid: user.uid,
      requestedByRole: user.role,
      status: 'Pending',
      processedBy: null,
      processedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    queueNotifications(tx, warehouseUids, {
      title: 'New Material Request',
      message: `${ctr.id}: ${requestedQty}x ${item.get('name')} requested by ${user.name}.`,
      type: 'request-new',
      refId: ctr.id
    });
    return ctr.id;
  });

  return { requestId };
};
export const createMaterialRequest = onCall(createMaterialRequestHandler);

/**
 * Warehouse Manager approves + issues, or rejects, a request.
 * Issuing runs in ONE Firestore transaction that:
 *   - re-reads the request and refuses anything that is not still "Pending"  (no duplicate deduction)
 *   - re-reads current stock and refuses if it is insufficient               (no negative inventory)
 *   - decrements stock, writes the ledger entry, updates the alert           (atomic)
 * Quantity ISSUED is stored on the request (issuedQty), separate from quantity USED
 * (usedQty), which Maintenance records later without touching stock again.
 */
export const processMaterialRequestHandler = async (req: CallableRequest<any>) => {
  const user = await requireRole(req, ['warehouse']);
  const requestId = reqString(req.data?.requestId, 'Request', 3, 30);
  const decision = reqEnum(req.data?.decision, 'Decision', ['Issued', 'Rejected']);
  const warehouseUids = await uidsByRole('warehouse');

  const result = await db.runTransaction(async (tx) => {
    const rRef = db.doc(`sparePartRequests/${requestId}`);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) throw new HttpsError('not-found', 'Request not found.');
    const r = rSnap.data() as any;
    if (r.status !== 'Pending') {
      throw new HttpsError('failed-precondition', `Request ${requestId} was already ${String(r.status).toLowerCase()}.`);
    }

    if (decision === 'Rejected') {
      tx.update(rRef, {
        status: 'Rejected',
        processedBy: who(user),
        processedByUid: user.uid,
        processedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      queueNotifications(tx, [r.requestedByUid], {
        title: 'Material Request Rejected',
        message: `${requestId} (${r.partName} x${r.requestedQty}) was rejected by Warehouse.`,
        type: 'request-update',
        refId: requestId
      });
      return { status: 'Rejected' };
    }

    const section: Section = r.section === 'otherInventoryItems' ? 'otherInventoryItems' : 'spareParts';
    const itemRef = db.doc(`${COLLECTIONS[section]}/${r.partId}`);
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists) throw new HttpsError('not-found', 'Inventory item no longer exists.');
    const alertSnap = await tx.get(db.doc(`stockAlerts/ALT-${r.partId}`));
    const txCtr = await reserveId(tx, 'transactions', 'TX', 1001);

    const available = itemSnap.get('availableQuantity') as number;
    if (available < r.requestedQty) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient stock: ${available} available, ${r.requestedQty} requested.`
      );
    }
    const newQty = available - r.requestedQty;
    const threshold = itemSnap.get('minThreshold') as number;

    tx.update(itemRef, { availableQuantity: newQty, lastUpdated: FieldValue.serverTimestamp() });
    tx.update(rRef, {
      status: 'Issued',
      issuedQty: r.requestedQty,
      processedBy: who(user),
      processedByUid: user.uid,
      processedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    txCtr.save();
    tx.set(db.doc(`inventoryTransactions/${txCtr.id}`), {
      txId: txCtr.id,
      itemId: r.partId,
      itemName: r.partName,
      section,
      type: 'Material Issued',
      quantity: r.requestedQty,
      balanceAfter: newQty,
      requestId,
      machineId: r.machineId,
      userResponsible: who(user),
      userUid: user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
    syncStockAlert(
      tx,
      alertSnap,
      { id: r.partId, name: itemSnap.get('name'), section, qty: newQty, threshold },
      warehouseUids
    );
    queueNotifications(tx, [r.requestedByUid], {
      title: 'Material Request Issued',
      message: `${requestId} (${r.partName} x${r.requestedQty}) was issued by Warehouse.`,
      type: 'request-update',
      refId: requestId
    });
    return { status: 'Issued', newQty };
  });

  return result;
};
export const processMaterialRequest = onCall(processMaterialRequestHandler);
