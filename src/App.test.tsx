/**
 * UI wiring tests: the real App.tsx is rendered; only the Firebase service layer is mocked.
 * They check that dashboards render live data and that user actions call the right backend service.
 * (They do not talk to Firebase.)
 */
import React from 'react';
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const state: any = vi.hoisted(() => ({
  configured: true,
  machines: [] as any[],
  complaints: [] as any[],
  requests: [] as any[],
  spare: [] as any[],
  other: [] as any[]
}));

const accounts: Record<string, any> = vi.hoisted(() => ({
  'worker@x.io': { uid: 'w1', badgeId: 'FW-01', name: 'Alex Rivera', email: 'worker@x.io', role: 'worker' },
  'maint@x.io': { uid: 'm1', badgeId: 'MT-01', name: 'Jordan Vance', email: 'maint@x.io', role: 'maintenance' },
  'wh@x.io': { uid: 'h1', badgeId: 'WM-01', name: 'Elena Rostova', email: 'wh@x.io', role: 'warehouse' }
}));

const svc = vi.hoisted(() => ({
  submitComplaint: vi.fn(async () => ({ complaintId: 'CMP-5001' })),
  updateRepair: vi.fn(async () => ({ ok: true })),
  processMaterialRequest: vi.fn(() => new Promise((r) => setTimeout(() => r({ ok: true }), 30))),
  createMaterialRequest: vi.fn(async () => ({ requestId: 'REQ-301' })),
  registerFactoryWorker: vi.fn(async (i: any) => ({ uid: 'new', badgeId: i.badgeId, name: i.name, email: i.email, role: 'worker' })),
  uploadComplaintPhoto: vi.fn(async () => 'complaints/w1/1_photo.png'),
  addMachine: vi.fn(async () => ({})),
  updateMachine: vi.fn(async () => ({})),
  signOutUser: vi.fn(async () => undefined)
}));

vi.mock('./firebase/config', () => ({
  get isFirebaseConfigured() { return state.configured; },
  get missingConfigKeys() { return state.configured ? [] : ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID']; },
  isUsingEmulators: false
}));

vi.mock('./services', () => {
  const sub = (key: string) => (...args: any[]) => {
    const cb = args.find((a) => typeof a === 'function');
    cb(state[key]);
    return () => undefined;
  };
  return {
    watchAuthState: (cb: any) => { cb(null); return () => undefined; },
    loadProfile: vi.fn(),
    signInUser: vi.fn(async (email: string, password: string) => {
      if (password !== 'correct-horse') throw new Error('Invalid email or password.');
      return accounts[email];
    }),
    sendResetEmail: vi.fn(async () => undefined),
    errorMessage: (e: any) => e?.message || 'error',
    getPhotoUrl: vi.fn(async () => 'https://example.test/photo.png'),
    markAllRead: vi.fn(async () => undefined),
    subscribeMachines: sub('machines'),
    subscribeComplaints: (_role: string, _uid: string, cb: any) => { cb(state.complaints); return () => undefined; },
    subscribeRequests: (_role: string, _uid: string, cb: any) => { cb(state.requests); return () => undefined; },
    subscribeSpareParts: sub('spare'),
    subscribeOtherItems: sub('other'),
    subscribeNotifications: (_uid: string, cb: any) => { cb([]); return () => undefined; },
    subscribeMaintenanceRecords: (cb: any) => { cb([]); return () => undefined; },
    subscribeStockAlerts: (cb: any) => { cb([]); return () => undefined; },
    subscribeTransactions: (cb: any) => { cb([]); return () => undefined; },
    saveInventoryItem: vi.fn(),
    deleteInventoryItem: vi.fn(),
    adjustStock: vi.fn(),
    ...svc
  };
});

import App from './App';

const TS = '2026-11-14T10:00:00.000Z';

beforeEach(() => {
  state.configured = true;
  state.machines = [
    { machineId: 'M-101', name: 'Cutting Machine', status: 'Operational', lastUpdated: TS },
    { machineId: 'M-102', name: 'Drilling Machine', status: 'Operational', lastUpdated: TS },
    { machineId: 'M-103', name: 'Hydraulic Press', status: 'Under Maintenance', lastUpdated: TS }
  ];
  state.complaints = [
    {
      complaintId: 'CMP-5012', machineId: 'M-103', machineName: 'Hydraulic Press', category: 'Hydraulic System',
      description: 'Oil pressure dropping.', priority: 'High', status: 'New', reportedByUid: 'w1',
      reportedByName: 'Alex Rivera (FW-01)', createdAt: TS, updatedAt: TS, photoPath: 'complaints/w1/a.png',
      history: [{ status: 'New', note: 'Reported', timestamp: TS }]
    }
  ];
  state.requests = [
    {
      requestId: 'REQ-301', machineId: 'M-103', machineName: 'Hydraulic Press', relatedComplaintId: 'CMP-5012',
      partId: 'SP-01', partName: 'Hydraulic Seal Kit', requestedQty: 2, reason: 'Seals worn', requestedBy: 'Jordan Vance (MT-01)',
      status: 'Pending', createdAt: TS
    }
  ];
  state.spare = [{ partId: 'SP-01', name: 'Hydraulic Seal Kit', category: 'Hydraulics', availableQuantity: 14, minThreshold: 5, unit: 'kits', unitPrice: 85, supplier: 'Bosch', lastUpdated: TS }];
  state.other = [];
  Object.values(svc).forEach((m: any) => m.mockClear?.());
});
afterEach(cleanup);

async function signIn(email: string, roleLabel: string) {
  const user = userEvent.setup();
  await screen.findByText('Employee Sign In');
  await user.selectOptions(screen.getAllByRole('combobox')[0], roleLabel);
  await user.type(screen.getByPlaceholderText('name@industrialcare.io'), email);
  await user.type(screen.getByPlaceholderText('Enter password'), 'correct-horse');
  await user.click(screen.getByRole('button', { name: 'Sign In' }));
  return user;
}

describe('startup + authentication UI', () => {
  it('shows a clear setup screen when Firebase env variables are missing', async () => {
    state.configured = false;
    render(<App />);
    expect(await screen.findByText('Firebase configuration needed')).toBeTruthy();
    expect(screen.getByText('VITE_FIREBASE_API_KEY')).toBeTruthy();
  });

  it('has no sample credentials: quick-select only picks a role and leaves fields empty', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Employee Sign In');
    expect(screen.queryByText(/Password123/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Maintenance' }));
    expect((screen.getByPlaceholderText('name@industrialcare.io') as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText('Enter password') as HTMLInputElement).value).toBe('');
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('maintenance');
  });

  it('sign-up locks the role to Factory Worker', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Create an account'));
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('worker');
    expect(screen.getByText(/Maintenance Team and Warehouse/)).toBeTruthy();
  });

  it('sign-up sends only name/badge/email/password (never a role) to the backend', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Create an account'));
    await user.type(screen.getByPlaceholderText('e.g. Sam Carter'), 'Sam Carter');
    await user.type(screen.getByPlaceholderText('e.g. FW-02'), 'fw-02');
    await user.type(screen.getByPlaceholderText('name@industrialcare.io'), 'sam@x.io');
    await user.type(screen.getByPlaceholderText('Enter password'), 'Str0ngPass!');
    await user.type(screen.getByPlaceholderText('Re-enter password'), 'Str0ngPass!');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(svc.registerFactoryWorker).toHaveBeenCalledTimes(1));
    expect(svc.registerFactoryWorker).toHaveBeenCalledWith({ name: 'Sam Carter', badgeId: 'FW-02', email: 'sam@x.io', password: 'Str0ngPass!' });
    expect(await screen.findByText('FACTORY FLOOR CONTROL PANEL')).toBeTruthy();
  });

  it('rejects a role mismatch with the original Access Denied message and signs out', async () => {
    render(<App />);
    await signIn('maint@x.io', 'Factory Worker');
    expect(await screen.findByText(/Access Denied: This account is registered as Maintenance Team, not Factory Worker/)).toBeTruthy();
    expect(svc.signOutUser).toHaveBeenCalled();
  });

  it('shows backend authentication errors', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Employee Sign In');
    await user.type(screen.getByPlaceholderText('name@industrialcare.io'), 'worker@x.io');
    await user.type(screen.getByPlaceholderText('Enter password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByText('Invalid email or password.')).toBeTruthy();
  });
});

describe('Factory Worker dashboard', () => {
  it('lists machines from Firestore and submits a complaint (with photo) through the backend', async () => {
    render(<App />);
    const user = await signIn('worker@x.io', 'Factory Worker');
    expect(await screen.findByText('FACTORY FLOOR CONTROL PANEL')).toBeTruthy();
    expect(screen.getAllByText('Cutting Machine').length).toBeGreaterThan(0);
    expect(screen.getByText('Already Under Maintenance')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Report Issue' })[0]);
    await user.selectOptions(screen.getByDisplayValue('Mechanical'), 'Electrical');
    await user.selectOptions(screen.getByDisplayValue('Medium'), 'High');
    await user.type(screen.getByPlaceholderText('Describe the machine issue...'), 'Motor overheating');
    const file = new File(['x'], 'fault.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }));

    await waitFor(() => expect(svc.submitComplaint).toHaveBeenCalledTimes(1));
    expect(svc.uploadComplaintPhoto).toHaveBeenCalledWith('w1', file);
    expect(svc.submitComplaint).toHaveBeenCalledWith({
      machineId: 'M-101', category: 'Electrical', priority: 'High', description: 'Motor overheating', photoPath: 'complaints/w1/1_photo.png'
    });
  });

  it('shows the worker their own complaints with the repair timeline', async () => {
    render(<App />);
    const user = await signIn('worker@x.io', 'Factory Worker');
    await user.click(await screen.findByRole('button', { name: /My Complaints/ }));
    await user.click(await screen.findByText('View Timeline →'));
    expect(await screen.findByText('Complaint CMP-5012 Timeline')).toBeTruthy();
    expect(screen.getByText('Reported')).toBeTruthy();
  });
});

describe('Maintenance Team dashboard', () => {
  it('accepts a complaint through the backend workflow and shows the reported photo', async () => {
    render(<App />);
    const user = await signIn('maint@x.io', 'Maintenance Team');
    expect(await screen.findByText('MAINTENANCE CONTROL PANEL')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Manage Repair' }));
    expect(await screen.findByText('Manage Repair – CMP-5012')).toBeTruthy();
    expect(await screen.findByAltText('Reported fault')).toBeTruthy();
    expect((screen.getByDisplayValue('Accepted') as HTMLSelectElement).value).toBe('Accepted');
    await user.type(screen.getByPlaceholderText('Document repair steps or parts replaced...'), 'Inspecting seals');
    await user.click(screen.getByRole('button', { name: 'Save Update' }));
    await waitFor(() => expect(svc.updateRepair).toHaveBeenCalledTimes(1));
    expect(svc.updateRepair).toHaveBeenCalledWith({ complaintId: 'CMP-5012', status: 'Accepted', note: 'Inspecting seals', partsUsed: [] });
  });

  it('lets maintenance record parts actually used from issued requests, then sends them with the update', async () => {
    state.complaints[0].status = 'In Progress';
    state.requests = [{ ...state.requests[0], status: 'Issued', issuedQty: 2, usedQty: null }];
    render(<App />);
    const user = await signIn('maint@x.io', 'Maintenance Team');
    await user.click(await screen.findByRole('button', { name: 'Manage Repair' }));
    expect(await screen.findByText(/Parts Actually Used/)).toBeTruthy();
    const qty = screen.getByPlaceholderText('Used');
    fireEvent.change(qty, { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: 'Save Update' }));
    await waitFor(() => expect(svc.updateRepair).toHaveBeenCalled());
    expect((svc.updateRepair.mock.calls[0] as any)[0].partsUsed).toEqual([{ requestId: 'REQ-301', qty: 1 }]);
  });

  it('displays backend rejections inside the modal (e.g. verifying too early)', async () => {
    svc.updateRepair.mockRejectedValueOnce(new Error('Mark the repair as Resolved first.'));
    render(<App />);
    const user = await signIn('maint@x.io', 'Maintenance Team');
    await user.click(await screen.findByRole('button', { name: 'Manage Repair' }));
    await user.click(screen.getByRole('button', { name: 'Save Update' }));
    expect(await screen.findByText('Mark the repair as Resolved first.')).toBeTruthy();
  });

  it('can register a new machine through the backend', async () => {
    render(<App />);
    const user = await signIn('maint@x.io', 'Maintenance Team');
    await user.click(await screen.findByRole('button', { name: /Machine Management/ }));
    await user.click(await screen.findByRole('button', { name: /Add Machine/ }));
    await user.type(screen.getByPlaceholderText('e.g. M-104'), 'm-104');
    await user.type(screen.getByPlaceholderText('e.g. CNC Milling Center'), 'CNC Milling Center');
    await user.click(screen.getByRole('button', { name: 'Save Machine' }));
    await waitFor(() => expect(svc.addMachine).toHaveBeenCalledWith({ machineId: 'M-104', name: 'CNC Milling Center', status: 'Operational' }));
  });
});

describe('Warehouse Manager dashboard', () => {
  it('shows the pending request and ignores double-clicks while issuing (single backend call)', async () => {
    render(<App />);
    const user = await signIn('wh@x.io', 'Warehouse Manager');
    expect(await screen.findByText('WAREHOUSE INVENTORY CONTROL PANEL')).toBeTruthy();
    expect(screen.getByText(/Incoming Material Requests \(1\)/)).toBeTruthy();
    const btn = screen.getAllByRole('button', { name: /Accept & Subtract Stock/ })[0];
    await user.dblClick(btn);
    await waitFor(() => expect(svc.processMaterialRequest).toHaveBeenCalled());
    expect(svc.processMaterialRequest).toHaveBeenCalledTimes(1);
    expect(svc.processMaterialRequest).toHaveBeenCalledWith('REQ-301', 'Issued');
  });

  it('keeps the two separate inventory sections', async () => {
    render(<App />);
    await signIn('wh@x.io', 'Warehouse Manager');
    expect(await screen.findByText('Spare Parts Inventory')).toBeTruthy();
    expect(screen.getByText('Other Inventory (Manufactured)')).toBeTruthy();
  });
});
