import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { callFunction } from './functionsClient';
import { byDateDesc, mapDoc } from './mappers';
import type { ErrorHandler, InventorySection, Unsubscribe } from './types';

const sub = (
  name: string,
  tsFields: string[],
  sorter: (a: any, b: any) => number,
  cb: (rows: any[]) => void,
  onError: ErrorHandler
): Unsubscribe => {
  if (!db) return () => undefined;
  return onSnapshot(
    collection(db, name),
    (snap) => {
      const rows = snap.docs.map((d) => mapDoc(d, tsFields));
      rows.sort(sorter);
      cb(rows);
    },
    (err) => onError(err)
  );
};

export const subscribeSpareParts = (cb: (r: any[]) => void, e: ErrorHandler) =>
  sub('sparePartsInventory', ['lastUpdated', 'createdAt'], (a, b) => String(a.partId).localeCompare(String(b.partId)), cb, e);

export const subscribeOtherItems = (cb: (r: any[]) => void, e: ErrorHandler) =>
  sub('otherItemsInventory', ['lastUpdated', 'createdAt'], (a, b) => String(a.itemId).localeCompare(String(b.itemId)), cb, e);

export const subscribeStockAlerts = (cb: (r: any[]) => void, e: ErrorHandler) =>
  sub('stockAlerts', ['createdAt', 'updatedAt', 'resolvedAt'], byDateDesc('createdAt'), cb, e);

export const subscribeTransactions = (cb: (r: any[]) => void, e: ErrorHandler) =>
  sub('inventoryTransactions', ['timestamp'], byDateDesc('timestamp'), cb, e);

export const saveInventoryItem = (section: InventorySection, form: any, isEdit: boolean) =>
  callFunction('saveInventoryItem', { section, form, isEdit });

export const deleteInventoryItem = (section: InventorySection, id: string) =>
  callFunction('deleteInventoryItem', { section, id });

export const adjustStock = (
  section: InventorySection,
  id: string,
  type: 'Stock In' | 'Stock Out',
  qty: number
) => callFunction('adjustStock', { section, id, type, qty });
