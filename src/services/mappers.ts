import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

/** Firestore Timestamp (or anything date-like) -> ISO string, which is what the UI already formats. */
export const toIso = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
};

/** Convert known timestamp fields of a document (and history[] entries) to ISO strings. */
export const mapDoc = (d: QueryDocumentSnapshot<DocumentData>, tsFields: string[] = []) => {
  const data: any = { ...d.data() };
  for (const f of tsFields) data[f] = toIso(data[f]);
  if (Array.isArray(data.history)) {
    data.history = data.history.map((h: any) => ({ ...h, timestamp: toIso(h.timestamp) }));
  }
  return data;
};

export const byDateDesc = (field: string) => (a: any, b: any) =>
  String(b[field] || '9999').localeCompare(String(a[field] || '9999'));
