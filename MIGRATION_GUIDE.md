# IndustrialCare: no-Blaze Express backend migration

This version keeps the existing React/Vite frontend, Firebase Authentication, Firestore data model, Firestore rules, and business logic. It exposes the existing server operations through an Express API instead of deploying Firebase Cloud Functions.

## Important limits
- Firebase Authentication, Firestore and Firebase Hosting can remain on Spark within their free quotas.
- The Express API can be deployed on Render's free web service. Free services sleep after inactivity and may take time to wake.
- Firebase Storage photo uploads are not guaranteed on Spark. Treat photos as disabled until a no-cost storage provider is configured. Complaint submission without a photo remains supported.
- Render needs a Firebase Admin service-account credential. Store the complete JSON contents as the private `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable in Render. Never commit it or put it in the frontend `.env`.

## Local setup
1. Keep the root `.env` with your Firebase web app configuration and set `VITE_API_BASE_URL=http://localhost:8080`.
2. Install root dependencies: `npm install`.
3. Install API dependencies: `npm --prefix backend install`.
4. In PowerShell, configure local ADC (already done on your computer): `gcloud auth application-default login`.
5. Start API in terminal 1: `npm --prefix backend run dev`.
6. Start frontend in terminal 2: `npm run dev`.
7. Check API health at `http://localhost:8080/health`.

## Render deployment
1. Push this project to a private GitHub repository.
2. In Render, create a Web Service from the repository and use `backend` as Root Directory.
3. Build command: `npm install && npm run build`; Start command: `npm start`.
4. Set `FIREBASE_PROJECT_ID=industrialcare`.
5. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full service-account JSON contents (secret environment variable).
6. Set `ALLOWED_ORIGINS` to your deployed frontend origin (for example `https://YOUR-SITE.web.app`).
7. After Render deploys, copy its HTTPS service URL.
8. In the frontend `.env`, set `VITE_API_BASE_URL` to that URL, then run `npm run build` and deploy Hosting with Firebase CLI.

## Security notes
- The API verifies Firebase ID tokens on every authenticated operation.
- The original role checks, Firestore transactions, and validation remain in the backend handlers.
- Do not make Firestore rules permissive. Do not expose service-account credentials through `VITE_` variables.
- The `registerFactoryWorker` operation is intentionally unauthenticated, as in the original callable flow; consider App Check / rate limiting before public production use.

## Verification
Run `npm run build` and `npm run backend:build`. Then test `/health`, login, worker registration, complaint submission, maintenance transitions, material request issuance, inventory adjustments, and notifications using real test accounts. A successful TypeScript build alone does not prove live Firebase permissions or hosting configuration.
