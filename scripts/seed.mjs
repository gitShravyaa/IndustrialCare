// Initial data seed. SAFE TO RE-RUN: documents are only created when missing (never overwritten).
//   npm run seed                 -> 3 machines + starter inventory
//   npm run seed -- --no-inventory -> machines only
import { db, projectId, usingEmulator } from './_admin.mjs';
import { FieldValue } from 'firebase-admin/firestore';

const skipInventory = process.argv.includes('--no-inventory');

const MACHINES = [
  { machineId: 'M-101', name: 'Cutting Machine' },
  { machineId: 'M-102', name: 'Drilling Machine' },
  { machineId: 'M-103', name: 'Hydraulic Press' }
];

// Starter inventory (clearly demo data - edit or delete in the Warehouse dashboard any time)
const SPARE_PARTS = [
  { partId: 'SP-01', name: 'Hydraulic Seal Kit', category: 'Hydraulics', availableQuantity: 14, minThreshold: 5, unit: 'kits', unitPrice: 85, supplier: 'Bosch Rexroth' },
  { partId: 'SP-02', name: 'Spindle Ceramic Bearing', category: 'Mechanical', availableQuantity: 4, minThreshold: 5, unit: 'pcs', unitPrice: 140, supplier: 'SKF Industrial' },
  { partId: 'SP-03', name: '24V Proximity Sensor', category: 'Electrical', availableQuantity: 22, minThreshold: 8, unit: 'pcs', unitPrice: 45, supplier: 'Omron Automation' },
  { partId: 'SP-04', name: 'Replacement Drive Motor', category: 'Electrical', availableQuantity: 6, minThreshold: 2, unit: 'pcs', unitPrice: 520, supplier: 'Siemens Drives' }
];
const OTHER_ITEMS = [
  { itemId: 'MF-01', name: 'Precision Steel Gear Shaft', category: 'Manufactured Assembly', availableQuantity: 48, minThreshold: 15, unit: 'units', unitPrice: 65, supplier: 'In-House Production Line' },
  { itemId: 'MF-02', name: 'CNC Machined Valve Housing', category: 'Manufactured Assembly', availableQuantity: 30, minThreshold: 10, unit: 'units', unitPrice: 110, supplier: 'In-House Production Line' }
];

async function createIfMissing(path, data) {
  try {
    await db.doc(path).create(data);
    console.log(`  + created ${path}`);
    return true;
  } catch (err) {
    if (err.code === 6 || /already exists/i.test(err.message)) {
      console.log(`  = exists  ${path} (left untouched)`);
      return false;
    }
    throw err;
  }
}

console.log(`Seeding project "${projectId}"${usingEmulator ? ' (emulator)' : ''} ...`);

console.log('Machines:');
for (const m of MACHINES) {
  await createIfMissing(`machines/${m.machineId}`, {
    ...m,
    status: 'Operational',
    createdBy: 'seed-script',
    createdAt: FieldValue.serverTimestamp(),
    lastUpdated: FieldValue.serverTimestamp()
  });
}

if (!skipInventory) {
  let tx = 0;
  const ledger = async (section, id, name, qty) => {
    tx += 1;
    await createIfMissing(`inventoryTransactions/TX-SEED-${id}`, {
      txId: `TX-SEED-${id}`, itemId: id, itemName: name, section, type: 'Initial Stock',
      quantity: qty, balanceAfter: qty, userResponsible: 'Initial setup script', userUid: 'seed-script',
      timestamp: FieldValue.serverTimestamp()
    });
  };
  const alertIfLow = async (section, id, name, qty, threshold) => {
    if (qty <= threshold) {
      await createIfMissing(`stockAlerts/ALT-${id}`, {
        alertId: `ALT-${id}`, itemId: id, itemName: name, section, currentQty: qty,
        minThreshold: threshold, resolved: false, resolvedAt: null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
    }
  };

  console.log('Spare parts:');
  for (const p of SPARE_PARTS) {
    const created = await createIfMissing(`sparePartsInventory/${p.partId}`, {
      ...p, createdBy: 'seed-script', createdAt: FieldValue.serverTimestamp(), lastUpdated: FieldValue.serverTimestamp()
    });
    if (created) {
      await ledger('spareParts', p.partId, p.name, p.availableQuantity);
      await alertIfLow('spareParts', p.partId, p.name, p.availableQuantity, p.minThreshold);
    }
  }
  console.log('Other inventory:');
  for (const o of OTHER_ITEMS) {
    const created = await createIfMissing(`otherItemsInventory/${o.itemId}`, {
      ...o, createdBy: 'seed-script', createdAt: FieldValue.serverTimestamp(), lastUpdated: FieldValue.serverTimestamp()
    });
    if (created) {
      await ledger('otherInventoryItems', o.itemId, o.name, o.availableQuantity);
      await alertIfLow('otherInventoryItems', o.itemId, o.name, o.availableQuantity, o.minThreshold);
    }
  }
}

console.log('\nDone. Next: create Maintenance / Warehouse accounts with  npm run create-staff');
