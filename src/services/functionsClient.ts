import { auth } from '../firebase/config';

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const errorMessage = (err: any): string => {
  if (!err) return 'Something went wrong.';
  return err.message || 'Something went wrong.';
};

/** Calls the Express API. Authenticated operations send the current Firebase ID token. */
export async function callFunction<TReq = any, TRes = any>(name: string, data?: TReq): Promise<TRes> {
  if (!API_BASE) throw new Error('Backend URL is missing. Set VITE_API_BASE_URL in your .env file.');
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
    if (err instanceof TypeError) throw new Error('Cannot reach the backend. Check your connection and backend URL.');
    throw new Error(errorMessage(err));
  }
}
