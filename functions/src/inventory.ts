import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  COLLECTIONS, db, FieldValue, ID_KEY, ITEM_ID_REGEX, reqEnum, reqInt, reqSection, reqString, optString,
  requireRole, reserveId, syncStockAlert, uidsByRole, who
} from './common';

/** Add or edit an inventory item (Spare Parts or Other Items). Quantity changes are ledgered. */
export const saveInventoryItem = onCall(async (req) => {
  const user = await requireRole(req, ['warehouse']);
  const section = reqSection(req.data?.section);
  const isEdit = req.data?.isEdit === true;
  const f = req.data?.form || {};
  const id = reqString(f.id, 'Item ID', 5, 5).toUpperCase();
  if (!ITEM_ID_REGEX.test(id)) {
    throw new HttpsError('invalid-argument', 'Item ID must be two letters, a dash and two digits (e.g. SP-04).');
  }
  const name = reqString(f.name, 'Item name', 1, 120);
  const category = optString(f.category, 'Category', 60) || 'General';
  const unit = optString(f.unit, 'Unit', 20) || 'pcs';
  const supplier = optString(f.supplier, 'Supplier', 120) || 'Approved Vendor';
  const qty = reqInt(f.availableQuantity, 'Quantity', 0, 1_000_000);
  const threshold = reqInt(f.minThreshold, 'Minimum threshold', 0, 1_000_000);
  const unitPrice = Number(f.unitPrice ?? 0);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100_000_000) {
    throw new HttpsError('invalid-argument', 'Unit price is invalid.');
  }
  const warehouseUids = await uidsByRole('warehouse');

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTIONS[section]}/${id}`);
    const snap = await tx.get(ref);
    const otherSection = section === 'spareParts' ? 'otherInventoryItems' : 'spareParts';
    const otherSnap = isEdit ? null : await tx.get(db.doc(`${COLLECTIONS[otherSection]}/${id}`));
    const alertSnap = await tx.get(db.doc(`stockAlerts/ALT-${id}`));
    const txCtr = await reserveId(tx, 'transactions', 'TX', 1001);

    if (isEdit && !snap.exists) throw new HttpsError('not-found', 'Item not found.');
    if (!isEdit && (snap.exists || (otherSnap && otherSnap.exists))) {
      throw new HttpsError('already-exists', 'This ID already exists in the warehouse.');
    }

    const idKey = ID_KEY[section];
    const record = {
      [idKey]: id,
      name,
      category,
      availableQuantity: qty,
      minThreshold: threshold,
      unit,
      unitPrice,
      supplier,
      lastUpdated: FieldValue.serverTimestamp()
    };
    if (isEdit) tx.update(ref, record);
    else tx.set(ref, { ...record, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });

    const previous = isEdit ? (snap.get('availableQuantity') as number) : 0;
    const delta = qty - previous;
    if (delta !== 0) {
      txCtr.save();
      tx.set(db.doc(`inventoryTransactions/${txCtr.id}`), {
        txId: txCtr.id,
        itemId: id,
        itemName: name,
        section,
        type: isEdit ? 'Manual Adjustment' : 'Initial Stock',
        quantity: Math.abs(delta),
        delta,
        balanceAfter: qty,
        userResponsible: who(user),
        userUid: user.uid,
        timestamp: FieldValue.serverTimestamp()
      });
    }
    syncStockAlert(tx, alertSnap, { id, name, section, qty, threshold }, warehouseUids);
  });
  return { ok: true };
});

export const deleteInventoryItem = onCall(async (req) => {
  const user = await requireRole(req, ['warehouse']);
  const section = reqSection(req.data?.section);
  const id = reqString(req.data?.id, 'Item ID', 5, 5).toUpperCase();

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTIONS[section]}/${id}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Item not found.');
    const pending = await tx.get(
      db.collection('sparePartRequests').where('partId', '==', id).where('status', '==', 'Pending')
    );
    if (!pending.empty) {
      throw new HttpsError('failed-precondition', 'This item has pending requests. Process them before deleting it.');
    }
    const alertSnap = await tx.get(db.doc(`stockAlerts/ALT-${id}`));
    const txCtr = await reserveId(tx, 'transactions', 'TX', 1001);

    tx.delete(ref);
    if (alertSnap.exists) tx.delete(alertSnap.ref);
    txCtr.save();
    tx.set(db.doc(`inventoryTransactions/${txCtr.id}`), {
      txId: txCtr.id,
      itemId: id,
      itemName: snap.get('name'),
      section,
      type: 'Item Removed',
      quantity: snap.get('availableQuantity'),
      balanceAfter: 0,
      userResponsible: who(user),
      userUid: user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

/** Manual Stock In / Stock Out. Transactional; stock can never go negative. */
export const adjustStock = onCall(async (req) => {
  const user = await requireRole(req, ['warehouse']);
  const section = reqSection(req.data?.section);
  const id = reqString(req.data?.id, 'Item ID', 5, 5).toUpperCase();
  const type = reqEnum(req.data?.type, 'Type', ['Stock In', 'Stock Out']);
  const qty = reqInt(req.data?.qty, 'Quantity', 1, 1_000_000);
  const warehouseUids = await uidsByRole('warehouse');

  const newQty = await db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTIONS[section]}/${id}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Item not found.');
    const alertSnap = await tx.get(db.doc(`stockAlerts/ALT-${id}`));
    const txCtr = await reserveId(tx, 'transactions', 'TX', 1001);

    const current = snap.get('availableQuantity') as number;
    const next = type === 'Stock In' ? current + qty : current - qty;
    if (next < 0) {
      throw new HttpsError('failed-precondition', `Cannot remove ${qty}: only ${current} in stock.`);
    }
    tx.update(ref, { availableQuantity: next, lastUpdated: FieldValue.serverTimestamp() });
    txCtr.save();
    tx.set(db.doc(`inventoryTransactions/${txCtr.id}`), {
      txId: txCtr.id,
      itemId: id,
      itemName: snap.get('name'),
      section,
      type,
      quantity: qty,
      balanceAfter: next,
      userResponsible: who(user),
      userUid: user.uid,
      timestamp: FieldValue.serverTimestamp()
    });
    syncStockAlert(
      tx,
      alertSnap,
      { id, name: snap.get('name'), section, qty: next, threshold: snap.get('minThreshold') },
      warehouseUids
    );
    return next;
  });
  return { newQty };
});
