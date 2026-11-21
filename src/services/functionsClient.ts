import { auth } from '../firebase/config';

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const HEALTH_CHECK_ATTEMPTS = 5;
const HEALTH_CHECK_TIMEOUT_MS = 10000;

export const errorMessage = (err: any): string => {
  if (!err) return 'Something went wrong.';
  return err.message || 'Something went wrong.';
};

async function waitForBackend(): Promise<void> {
  if (!API_BASE) throw new Error('Backend URL is missing. Set VITE_API_BASE_URL in your deployment environment.');

  for (let attempt = 1; attempt <= HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    let healthy = false;

    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      healthy = response.ok;
    } catch {
      healthy = false;
    } finally {
      clearTimeout(timeout);
    }

    if (healthy) return;
    if (attempt < HEALTH_CHECK_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(
    'The backend did not become available after 5 health checks. Your registration was not submitted; please try again shortly.'
  );
}

/** Calls the Express API. Authenticated operations send the current Firebase ID token. */
export async function callFunction<TReq = any, TRes = any>(name: string, data?: TReq): Promise<TRes> {
  if (!API_BASE) throw new Error('Backend URL is missing. Set VITE_API_BASE_URL in your .env file.');
  if (name === 'registerFactoryWorker') await waitForBackend();

  const user = auth?.currentUser;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  try {
    const response = await fetch(`${API_BASE}/api/${encodeURIComponent(name)}`, {
      method: 'POST', headers, body: JSON.stringify(data ?? {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Backend request failed (${response.status}).`);
    return payload as TRes;
  } catch (err: any) {
    if (err instanceof TypeError && name === 'registerFactoryWorker') {
      throw new Error(
        'The registration result could not be confirmed, and it was not retried. Try signing in or ask an administrator to check the account before submitting again.'
      );
    }
    if (err instanceof TypeError) throw new Error('Cannot reach the backend. Check your connection and backend URL.');
    throw new Error(errorMessage(err));
  }
}
