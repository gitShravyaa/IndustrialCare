export type Role = 'worker' | 'maintenance' | 'warehouse';
export type InventorySection = 'spareParts' | 'otherInventoryItems';

export interface UserProfile {
  uid: string;
  badgeId: string;
  name: string;
  email: string;
  role: Role;
}

export type Unsubscribe = () => void;
export type ErrorHandler = (err: Error) => void;
