import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase/config', () => ({ auth: null }));

let callFunction: typeof import('./functionsClient').callFunction;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_API_BASE_URL', 'https://industrialcare-api.onrender.com');
  vi.stubGlobal('fetch', vi.fn());
  vi.resetModules();
  ({ callFunction } = await import('./functionsClient'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('callFunction registration connectivity', () => {
  it('retries health checks but sends a failed registration POST only once', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Registration failed.' }),
      } as Response);

    const request = callFunction('registerFactoryWorker', { email: 'worker@example.com' });
    const rejection = expect(request).rejects.toThrow('Registration failed.');
    await vi.runAllTimersAsync();

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://industrialcare-api.onrender.com/health');
    expect(fetchMock.mock.calls[1][0]).toBe('https://industrialcare-api.onrender.com/health');
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://industrialcare-api.onrender.com/api/registerFactoryWorker'
    );
    expect(fetchMock.mock.calls[2][1]?.method).toBe('POST');
  });

  it('does not send registration if the backend never becomes healthy', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    const request = callFunction('registerFactoryWorker', { email: 'worker@example.com' });
    const rejection = expect(request).rejects.toThrow(
      'Your registration was not submitted; please try again shortly.'
    );
    await vi.runAllTimersAsync();

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/health'))).toBe(true);
  });

  it('does not retry a registration when the POST result cannot be confirmed', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockRejectedValueOnce(new TypeError('Network failure'));

    const request = callFunction('registerFactoryWorker', { email: 'worker@example.com' });
    const rejection = expect(request).rejects.toThrow(
      'The registration result could not be confirmed, and it was not retried.'
    );
    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://industrialcare-api.onrender.com/health');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://industrialcare-api.onrender.com/api/registerFactoryWorker'
    );
  });
});
