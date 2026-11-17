// Logic tests for the Cloud Functions, run against an in-memory Firestore/Auth fake.
// Run:  cd functions && npm run build && npm test
// These verify business rules (workflow, stock integrity, roles). They do NOT test
// security rules or a live Firebase project - see README "Testing" section.
const Module = require('module');
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const fake = require('./fakeAdmin');

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-admin/app') return fake.appModule;
  if (request === 'firebase-admin/firestore') return fake.firestoreModule;
  if (request === 'firebase-admin/auth') return fake.authModule;
  return realLoad.apply(this, arguments);
};
const fns = require('../lib/index.js');

const WORKER = { uid: 'w1', role: 'worker' };
const MAINT = { uid: 'm1', role: 'maintenance' };
const WH = { uid: 'h1', role: 'warehouse' };

const call = (fn, who, data) =>
  fns[fn].run({ data, auth: who ? { uid: who.uid, token: { role: who.role } } : undefined, rawRequest: {}, acceptsStreaming: false });
const doc = (p) => fake.store.get(p)?.data;
const col = (name) => [...fake.store].filter(([p]) => p.startsWith(name + '/')).map(([, v]) => v.data);
const expectCode = async (promise, code) => {
  await assert.rejects(promise, (e) => { assert.equal(e.code, code, `expected ${code} but got ${e.code}: ${e.message}`); return true; });
};

function seed() {
  fake.reset();
  const put = (p, data) => fake.store.set(p, { data, version: 1 });
  put('users/w1', { uid: 'w1', badgeId: 'FW-01', name: 'Alex Rivera', email: 'a@x.io', role: 'worker' });
  put('users/w2', { uid: 'w2', badgeId: 'FW-02', name: 'Other Worker', email: 'b@x.io', role: 'worker' });
  put('users/m1', { uid: 'm1', badgeId: 'MT-01', name: 'Jordan Vance', email: 'm@x.io', role: 'maintenance' });
  put('users/h1', { uid: 'h1', badgeId: 'WM-01', name: 'Elena Rostova', email: 'h@x.io', role: 'warehouse' });
  for (const [id, name] of [['M-101', 'Cutting Machine'], ['M-102', 'Drilling Machine'], ['M-103', 'Hydraulic Press']]) {
    put(`machines/${id}`, { machineId: id, name, status: 'Operational' });
  }
  put('sparePartsInventory/SP-04', { partId: 'SP-04', name: 'Replacement Drive Motor', category: 'Electrical', availableQuantity: 6, minThreshold: 2, unit: 'pcs', unitPrice: 520, supplier: 'S' });
  put('sparePartsInventory/SP-02', { partId: 'SP-02', name: 'Spindle Ceramic Bearing', category: 'Mechanical', availableQuantity: 6, minThreshold: 5, unit: 'pcs', unitPrice: 140, supplier: 'S' });
  put('otherItemsInventory/MF-01', { itemId: 'MF-01', name: 'Gear Shaft', category: 'Manufactured Assembly', availableQuantity: 48, minThreshold: 15, unit: 'units', unitPrice: 65, supplier: 'In-House' });
}
beforeEach(seed);

const notifsFor = (uid) => col('notifications').filter((n) => n.recipientUid === uid);

test('full 15-step workflow: complaint -> accept -> request motor -> issue -> use -> resolve -> verify', async () => {
  // 1-4 worker reports M-101
  const { complaintId } = await call('submitComplaint', WORKER, {
    machineId: 'M-101', category: 'Electrical', priority: 'High', description: 'Drive motor overheating and stalling.'
  });
  assert.equal(complaintId, 'CMP-5001');
  assert.equal(doc(`complaints/${complaintId}`).status, 'New');
  assert.equal(doc(`complaints/${complaintId}`).reportedByUid, 'w1');
  assert.equal(doc('machines/M-101').status, 'Under Maintenance');
  assert.ok(notifsFor('w1').some((n) => /Received/.test(n.title)), 'worker told complaint was received');
  assert.ok(notifsFor('m1').some((n) => /New Machine Issue/.test(n.title)), 'maintenance sees new complaint');

  // 6 accept
  await call('updateComplaintStatus', MAINT, { complaintId, status: 'Accepted', note: 'On it.' });
  assert.equal(doc(`complaints/${complaintId}`).status, 'Accepted');
  assert.equal(doc(`complaints/${complaintId}`).acceptedByUid, 'm1');
  assert.ok(notifsFor('w1').some((n) => /Accepted/.test(n.title)));

  // machine can NOT be manually flagged Operational while the repair is open
  await expectCode(call('updateMachine', MAINT, { machineId: 'M-101', status: 'Operational' }), 'failed-precondition');

  // 7-8 request spare motor
  const { requestId } = await call('createMaterialRequest', MAINT, {
    machineId: 'M-101', relatedComplaintId: complaintId, partId: 'SP-04', requestedQty: 1, reason: 'Replace burnt drive motor'
  });
  assert.equal(doc(`sparePartRequests/${requestId}`).status, 'Pending');
  assert.equal(doc(`sparePartRequests/${requestId}`).partName, 'Replacement Drive Motor'); // from server data, not client
  assert.equal(doc(`sparePartRequests/${requestId}`).section, 'spareParts');
  assert.ok(notifsFor('h1').some((n) => /New Material Request/.test(n.title)));
  await call('updateComplaintStatus', MAINT, { complaintId, status: 'Waiting for Parts', note: 'Motor requested' });

  // 9-10 warehouse issues, stock decreases exactly once
  await call('processMaterialRequest', WH, { requestId, decision: 'Issued' });
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 5);
  assert.equal(doc(`sparePartRequests/${requestId}`).status, 'Issued');
  assert.equal(doc(`sparePartRequests/${requestId}`).issuedQty, 1);
  const ledger = col('inventoryTransactions');
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, 'Material Issued');
  assert.equal(ledger[0].balanceAfter, 5);
  assert.ok(notifsFor('m1').some((n) => /Issued/.test(n.title)), 'maintenance told parts were issued');

  // duplicate issue attempt is rejected and does not deduct again
  await expectCode(call('processMaterialRequest', WH, { requestId, decision: 'Issued' }), 'failed-precondition');
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 5);

  // 11 record parts actually used: must not touch warehouse stock
  await call('updateComplaintStatus', MAINT, {
    complaintId, status: 'In Progress', note: 'Motor swapped, testing.', partsUsed: [{ requestId, qty: 1 }]
  });
  assert.equal(doc(`sparePartRequests/${requestId}`).usedQty, 1);
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 5, 'usage recording must NOT deduct stock again');
  assert.equal(col('inventoryTransactions').length, 1, 'no extra ledger entry for usage');

  // cannot claim to have used more than was issued
  await expectCode(
    call('updateComplaintStatus', MAINT, { complaintId, status: 'In Progress', partsUsed: [{ requestId, qty: 2 }] }),
    'invalid-argument'
  );

  // 12 cannot verify before the repair is resolved
  await expectCode(call('updateComplaintStatus', MAINT, { complaintId, status: 'Verified' }), 'failed-precondition');

  // resolve: repair completed, but machine is NOT Operational yet
  await call('updateComplaintStatus', MAINT, { complaintId, status: 'Resolved', note: 'Replaced motor, ran 30 min test.' });
  assert.equal(doc('machines/M-101').status, 'Under Maintenance');
  assert.ok(notifsFor('w1').some((n) => /Repair Completed/.test(n.title)));
  const rec = col('maintenanceRecords')[0];
  assert.equal(rec.finalStatus, 'Resolved');
  assert.match(rec.partsUsedSummary, /Replacement Drive Motor \(1\)/);

  // 12-13 verify -> machine Operational
  await call('updateComplaintStatus', MAINT, { complaintId, status: 'Verified', note: 'Verified by maintenance.' });
  assert.equal(doc('machines/M-101').status, 'Operational');
  assert.equal(doc(`complaints/${complaintId}`).status, 'Verified');
  // 14 worker notified, 15 appears in history
  assert.ok(notifsFor('w1').some((n) => /Repair Verified/.test(n.title)));
  const records = col('maintenanceRecords');
  assert.equal(records.length, 1);
  assert.equal(records[0].finalStatus, 'Verified');
  assert.equal(records[0].machineId, 'M-101');
  assert.equal(doc(`complaints/${complaintId}`).history.length >= 6, true);

  // closed complaints cannot be reopened
  await expectCode(call('updateComplaintStatus', MAINT, { complaintId, status: 'In Progress' }), 'failed-precondition');
});

test('cannot skip acceptance; cannot report a machine already under maintenance', async () => {
  const { complaintId } = await call('submitComplaint', WORKER, { machineId: 'M-102', category: 'Mechanical', priority: 'Medium', description: 'Strange noise from spindle' });
  await expectCode(call('updateComplaintStatus', MAINT, { complaintId, status: 'Resolved' }), 'failed-precondition');
  await expectCode(
    call('submitComplaint', { uid: 'w2', role: 'worker' }, { machineId: 'M-102', category: 'Mechanical', priority: 'Low', description: 'Same machine again' }),
    'failed-precondition'
  );
});

test('critical complaint sets machine to Breakdown', async () => {
  await call('submitComplaint', WORKER, { machineId: 'M-103', category: 'Hydraulic System', priority: 'Critical', description: 'Oil leak, press is stuck' });
  assert.equal(doc('machines/M-103').status, 'Breakdown');
});

test('machine stays Under Maintenance on verify while another complaint is still open', async () => {
  const a = await call('submitComplaint', WORKER, { machineId: 'M-103', category: 'Electrical', priority: 'Critical', description: 'First problem here' });
  const b = await call('submitComplaint', { uid: 'w2', role: 'worker' }, { machineId: 'M-103', category: 'Mechanical', priority: 'Medium', description: 'Second problem here' }).catch((e) => e);
  // M-103 is Breakdown, so a second report is allowed
  assert.ok(b.complaintId, 'second report accepted for Breakdown machine');
  for (const s of ['Accepted', 'Resolved', 'Verified']) await call('updateComplaintStatus', MAINT, { complaintId: a.complaintId, status: s });
  assert.equal(doc('machines/M-103').status, 'Under Maintenance');
});

test('role-based access is enforced on the backend', async () => {
  await expectCode(call('processMaterialRequest', WORKER, { requestId: 'REQ-301', decision: 'Issued' }), 'permission-denied');
  await expectCode(call('processMaterialRequest', MAINT, { requestId: 'REQ-301', decision: 'Issued' }), 'permission-denied');
  await expectCode(call('saveInventoryItem', MAINT, { section: 'spareParts', isEdit: false, form: {} }), 'permission-denied');
  await expectCode(call('adjustStock', WORKER, { section: 'spareParts', id: 'SP-04', type: 'Stock In', qty: 5 }), 'permission-denied');
  await expectCode(call('addMachine', WORKER, { machineId: 'M-999', name: 'Nope' }), 'permission-denied');
  await expectCode(call('updateComplaintStatus', WORKER, { complaintId: 'CMP-1', status: 'Accepted' }), 'permission-denied');
  await expectCode(call('submitComplaint', MAINT, { machineId: 'M-101', category: 'Mechanical', priority: 'Low', description: 'maintenance cannot file' }), 'permission-denied');
  await expectCode(call('addMachine', null, { machineId: 'M-999', name: 'Nope' }), 'unauthenticated');
  // claim says warehouse but the trusted users doc says otherwise -> denied
  await expectCode(call('adjustStock', { uid: 'm1', role: 'warehouse' }, { section: 'spareParts', id: 'SP-04', type: 'Stock In', qty: 1 }), 'permission-denied');
  // worker cannot link another worker's complaint to a request
  const { complaintId } = await call('submitComplaint', WORKER, { machineId: 'M-101', category: 'Mechanical', priority: 'Low', description: 'Belongs to worker one' });
  await expectCode(
    call('createMaterialRequest', { uid: 'w2', role: 'worker' }, { machineId: 'M-101', relatedComplaintId: complaintId, partId: 'SP-04', requestedQty: 1, reason: 'not mine' }),
    'permission-denied'
  );
});

test('rejecting a request does not touch stock', async () => {
  const { requestId } = await call('createMaterialRequest', MAINT, { machineId: 'M-101', relatedComplaintId: 'General Floor Request', partId: 'SP-04', requestedQty: 2, reason: 'Spare for shelf' });
  await call('processMaterialRequest', WH, { requestId, decision: 'Rejected' });
  assert.equal(doc(`sparePartRequests/${requestId}`).status, 'Rejected');
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 6);
  await expectCode(call('processMaterialRequest', WH, { requestId, decision: 'Issued' }), 'failed-precondition');
});

test('issuing more than available is refused (no negative stock)', async () => {
  const { requestId } = await call('createMaterialRequest', MAINT, { machineId: 'M-101', relatedComplaintId: 'General Floor Request', partId: 'SP-04', requestedQty: 7, reason: 'Too many' });
  await expectCode(call('processMaterialRequest', WH, { requestId, decision: 'Issued' }), 'failed-precondition');
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 6);
  assert.equal(doc(`sparePartRequests/${requestId}`).status, 'Pending');
});

test('CONCURRENCY: the same request issued 6x at once deducts stock exactly once', async () => {
  const { requestId } = await call('createMaterialRequest', MAINT, { machineId: 'M-101', relatedComplaintId: 'General Floor Request', partId: 'SP-04', requestedQty: 2, reason: 'Race test' });
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => call('processMaterialRequest', WH, { requestId, decision: 'Issued' })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 4);
  assert.equal(col('inventoryTransactions').length, 1);
});

test('CONCURRENCY: 5 different requests vs. only 3 in stock -> exactly 3 issued, never negative', async () => {
  fake.store.get('sparePartsInventory/SP-04').data.availableQuantity = 3;
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await call('createMaterialRequest', MAINT, { machineId: 'M-101', relatedComplaintId: 'General Floor Request', partId: 'SP-04', requestedQty: 1, reason: `Req ${i}` });
    ids.push(r.requestId);
  }
  const results = await Promise.allSettled(ids.map((requestId) => call('processMaterialRequest', WH, { requestId, decision: 'Issued' })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 2);
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 0);
  assert.equal(col('inventoryTransactions').length, 3);
  assert.equal(col('sparePartRequests').filter((r) => r.status === 'Issued').length, 3);
  assert.equal(col('sparePartRequests').filter((r) => r.status === 'Pending').length, 2);
  // unique transaction IDs under contention
  assert.equal(new Set(col('inventoryTransactions').map((t) => t.txId)).size, 3);
});

test('CONCURRENCY: simultaneous manual stock-outs never go negative', async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => call('adjustStock', WH, { section: 'spareParts', id: 'SP-04', type: 'Stock Out', qty: 1 })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 6);
  assert.equal(doc('sparePartsInventory/SP-04').availableQuantity, 0);
});

test('low-stock alerts are created at threshold and resolved on replenishment', async () => {
  await call('adjustStock', WH, { section: 'spareParts', id: 'SP-02', type: 'Stock Out', qty: 2 }); // 6 -> 4 (<= 5)
  assert.equal(doc('stockAlerts/ALT-SP-02').resolved, false);
  assert.equal(doc('stockAlerts/ALT-SP-02').currentQty, 4);
  assert.ok(notifsFor('h1').some((n) => /Low Stock/.test(n.title)));
  await call('adjustStock', WH, { section: 'spareParts', id: 'SP-02', type: 'Stock In', qty: 5 }); // 9
  assert.equal(doc('stockAlerts/ALT-SP-02').resolved, true);
  await expectCode(call('adjustStock', WH, { section: 'spareParts', id: 'SP-02', type: 'Stock Out', qty: 100 }), 'failed-precondition');
  assert.equal(doc('sparePartsInventory/SP-02').availableQuantity, 9);
});

test('issuing a request that drops stock to the threshold raises an alert', async () => {
  const { requestId } = await call('createMaterialRequest', MAINT, { machineId: 'M-101', relatedComplaintId: 'General Floor Request', partId: 'SP-04', requestedQty: 4, reason: 'Big job' });
  await call('processMaterialRequest', WH, { requestId, decision: 'Issued' }); // 6 -> 2 (== threshold)
  assert.equal(doc('stockAlerts/ALT-SP-04').resolved, false);
});

test('inventory add/edit/delete: validation, cross-section unique IDs, ledgering', async () => {
  const form = { id: 'SP-09', name: 'Test Part', category: 'Mechanical', availableQuantity: 10, minThreshold: 3, unit: 'pcs', unitPrice: 12, supplier: 'ACME' };
  await call('saveInventoryItem', WH, { section: 'spareParts', isEdit: false, form });
  assert.equal(doc('sparePartsInventory/SP-09').availableQuantity, 10);
  assert.equal(col('inventoryTransactions')[0].type, 'Initial Stock');
  await expectCode(call('saveInventoryItem', WH, { section: 'spareParts', isEdit: false, form }), 'already-exists');
  await expectCode(call('saveInventoryItem', WH, { section: 'otherInventoryItems', isEdit: false, form }), 'already-exists'); // ID unique across sections
  await expectCode(call('saveInventoryItem', WH, { section: 'spareParts', isEdit: false, form: { ...form, id: 'BAD' } }), 'invalid-argument');
  await expectCode(call('saveInventoryItem', WH, { section: 'spareParts', isEdit: false, form: { ...form, id: 'SP-10', availableQuantity: -5 } }), 'invalid-argument');
  await call('saveInventoryItem', WH, { section: 'spareParts', isEdit: true, form: { ...form, availableQuantity: 15 } });
  assert.equal(doc('sparePartsInventory/SP-09').availableQuantity, 15);
  assert.ok(col('inventoryTransactions').some((t) => t.type === 'Manual Adjustment' && t.delta === 5));
  // cannot delete while a request is pending for it
  const { requestId } = await call('createMaterialRequest', MAINT, { machineId: 'M-101', relatedComplaintId: 'General Floor Request', partId: 'SP-09', requestedQty: 1, reason: 'x y z' });
  await expectCode(call('deleteInventoryItem', WH, { section: 'spareParts', id: 'SP-09' }), 'failed-precondition');
  await call('processMaterialRequest', WH, { requestId, decision: 'Rejected' });
  await call('deleteInventoryItem', WH, { section: 'spareParts', id: 'SP-09' });
  assert.equal(doc('sparePartsInventory/SP-09'), undefined);
});

test('machines: add (maintenance only), duplicate rejected, rename', async () => {
  await call('addMachine', MAINT, { machineId: 'm-104', name: 'CNC Milling Center', status: 'Operational' });
  assert.equal(doc('machines/M-104').name, 'CNC Milling Center');
  await expectCode(call('addMachine', MAINT, { machineId: 'M-104', name: 'Dup', status: 'Operational' }), 'already-exists');
  await expectCode(call('addMachine', MAINT, { machineId: 'BAD ID', name: 'x y', status: 'Operational' }), 'invalid-argument');
  await call('updateMachine', MAINT, { machineId: 'M-104', name: 'CNC Mill 2' });
  assert.equal(doc('machines/M-104').name, 'CNC Mill 2');
});

test('registration: role is ALWAYS worker (client cannot choose), no password stored, duplicates rejected', async () => {
  const r = await call('registerFactoryWorker', null, { name: 'Sam Carter', badgeId: 'fw-07', email: 'Sam@x.io', password: 'Str0ngPass!', role: 'maintenance' });
  assert.equal(r.ok, true);
  const u = [...fake.users.values()].find((x) => x.email === 'sam@x.io');
  assert.deepEqual(u.claims, { role: 'worker' });
  const profile = doc(`users/${u.uid}`);
  assert.equal(profile.role, 'worker');
  assert.equal(profile.badgeId, 'FW-07');
  assert.equal(JSON.stringify(profile).includes('Str0ngPass'), false, 'password must never be stored in Firestore');
  assert.equal('password' in profile, false);
  await expectCode(call('registerFactoryWorker', null, { name: 'Dup Email', badgeId: 'FW-08', email: 'sam@x.io', password: 'Str0ngPass!' }), 'already-exists');
  assert.equal(doc('badgeIds/FW-08'), undefined, 'badge reservation rolled back after failure');
  await expectCode(call('registerFactoryWorker', null, { name: 'Dup Badge', badgeId: 'FW-07', email: 'new@x.io', password: 'Str0ngPass!' }), 'already-exists');
  await expectCode(call('registerFactoryWorker', null, { name: 'Weak', badgeId: 'FW-09', email: 'w@x.io', password: 'short' }), 'invalid-argument');
});

test('input validation on complaints', async () => {
  await expectCode(call('submitComplaint', WORKER, { machineId: 'M-101', category: 'Hacking', priority: 'High', description: 'valid description' }), 'invalid-argument');
  await expectCode(call('submitComplaint', WORKER, { machineId: 'M-101', category: 'Mechanical', priority: 'Urgent!', description: 'valid description' }), 'invalid-argument');
  await expectCode(call('submitComplaint', WORKER, { machineId: 'M-101', category: 'Mechanical', priority: 'Low', description: 'x' }), 'invalid-argument');
  await expectCode(call('submitComplaint', WORKER, { machineId: 'M-404', category: 'Mechanical', priority: 'Low', description: 'machine missing' }), 'not-found');
  await expectCode(call('submitComplaint', WORKER, { machineId: 'M-101', category: 'Mechanical', priority: 'Low', description: 'photo path of someone else', photoPath: 'complaints/w2/a.jpg' }), 'invalid-argument');
  const ok = await call('submitComplaint', WORKER, { machineId: 'M-101', category: 'Mechanical', priority: 'Low', description: 'with my own photo', photoPath: 'complaints/w1/1_a.jpg' });
  assert.equal(doc(`complaints/${ok.complaintId}`).photoPath, 'complaints/w1/1_a.jpg');
});
