# IndustrialCare — Firebase + Express (No Blaze)

IndustrialCare is a React/Vite industrial machine maintenance and warehouse inventory application. This edition keeps Firebase Authentication and Cloud Firestore, and runs the business backend as an Express API so Firebase Cloud Functions are not deployed.

## Architecture
- Frontend: React + Vite, deployable to Firebase Hosting on the Spark plan within free quotas.
- Authentication: Firebase Authentication; the frontend sends Firebase ID tokens to the API.
- Database: Cloud Firestore; existing `firestore.rules` and indexes are retained.
- Backend: Express + Firebase Admin SDK in `backend/`.
- Hosting: Render free web service for the API (free services may sleep after inactivity).
- Photo uploads: disabled for now because Firebase Storage requires Blaze for this project. Complaints can still be submitted without photos.

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for exact local and deployment steps.

## Local development
1. Copy `.env.example` to `.env` and fill in the Firebase Web App values from Firebase Console.
2. Set `VITE_API_BASE_URL=http://localhost:8080`.
3. Install dependencies: `npm install` and `npm --prefix backend install`.
4. Authenticate local Admin SDK using ADC: `gcloud auth application-default login`.
5. Terminal 1: `npm --prefix backend run dev`.
6. Terminal 2: `npm run dev`.
7. Check `http://localhost:8080/health`.

## Build checks
- Frontend: `npm run build`
- Backend: `npm run backend:build`
- Existing backend-logic tests: `npm run test:functions` (these use an in-memory Firestore fake; they are not live Firebase integration tests).

## Security
- The Express API verifies Firebase ID tokens for every authenticated operation.
- Server-side role checks, validation and Firestore transactions are retained from the original backend logic.
- Keep Firestore rules restrictive. Never put Admin SDK credentials in frontend variables or commit credential files.
- Configure `ALLOWED_ORIGINS` on Render to the exact deployed frontend origin.
