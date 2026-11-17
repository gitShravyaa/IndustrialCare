import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

export { registerFactoryWorker } from './auth';
export { addMachine, updateMachine } from './machines';
export { submitComplaint, updateComplaintStatus } from './complaints';
export { createMaterialRequest, processMaterialRequest } from './requests';
export { saveInventoryItem, deleteInventoryItem, adjustStock } from './inventory';
