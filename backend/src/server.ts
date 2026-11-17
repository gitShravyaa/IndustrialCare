
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';

import { registerFactoryWorkerHandler } from './auth';
import { addMachineHandler, updateMachineHandler } from './machines';
import {
  submitComplaintHandler,
  updateComplaintStatusHandler,
} from './complaints';
import {
  createMaterialRequestHandler,
  processMaterialRequestHandler,
} from './requests';
import {
  saveInventoryItemHandler,
  deleteInventoryItemHandler,
  adjustStockHandler,
} from './inventory';

import './common';

const app = express();
const port = Number(process.env.PORT || 8080);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS.'));
    },
  })
);

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'industrialcare-api',
  });
});

// Available backend operations
const handlers: Record<string, (req: any) => Promise<any>> = {
  registerFactoryWorker: registerFactoryWorkerHandler,
  addMachine: addMachineHandler,
  updateMachine: updateMachineHandler,
  submitComplaint: submitComplaintHandler,
  updateComplaintStatus: updateComplaintStatusHandler,
  createMaterialRequest: createMaterialRequestHandler,
  processMaterialRequest: processMaterialRequestHandler,
  saveInventoryItem: saveInventoryItemHandler,
  deleteInventoryItem: deleteInventoryItemHandler,
  adjustStock: adjustStockHandler,
};

// HTTP status codes corresponding to Firebase errors
const statusForCode: Record<string, number> = {
  unauthenticated: 401,
  'permission-denied': 403,
  'invalid-argument': 400,
  'already-exists': 409,
  'not-found': 404,
  'failed-precondition': 409,
  'resource-exhausted': 429,
  unavailable: 503,
};

// Verify Firebase Authentication ID token
async function authenticate(req: Request) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);

  if (!match) {
    return null;
  }

  return getAuth().verifyIdToken(match[1]);
}

// API endpoint
app.post(
  '/api/:operation',
  async (req: Request, res: Response) => {
    // Normalize the route parameter to a string
    const operationParam = req.params.operation;

    const operation = Array.isArray(operationParam)
      ? operationParam[0]
      : operationParam;

    const handler = handlers[operation];

    if (!handler) {
      return res.status(404).json({
        error: 'API operation not found.',
      });
    }

    try {
      // Registration is the only unauthenticated operation.
      const isRegistration = operation === 'registerFactoryWorker';

      const decoded = isRegistration
        ? null
        : await authenticate(req);

      if (!isRegistration && !decoded) {
        return res.status(401).json({
          error: 'Please sign in to continue.',
        });
      }

      const callableRequest = {
        data: req.body || {},
        auth: decoded
          ? {
              uid: decoded.uid,
              token: decoded,
            }
          : undefined,
        rawRequest: req,
        acceptsStreaming: false,
      } as any;

      const result = await handler(callableRequest);

      return res.json(result ?? { ok: true });
    } catch (err: any) {
      if (err instanceof HttpsError) {
        return res
          .status(statusForCode[err.code] || 500)
          .json({
            error: err.message,
            code: err.code,
          });
      }

      console.error('IndustrialCare API error:', err);

      return res.status(500).json({
        error: 'The server could not complete this request.',
      });
    }
  }
);

// Global error handler
app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(err);

    return res.status(400).json({
      error: 'Invalid request.',
    });
  }
);

// Start server
app.listen(port, () => {
  console.log(`IndustrialCare API listening on ${port}`);
});
