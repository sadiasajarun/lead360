import { httpService } from '../httpService';

// Response interceptor: on a 401, try refreshing the token ONCE, then retry the request.
// The _retry flag prevents an infinite refresh loop (RULE-I1).
httpService.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {};
    const isAuthCall = typeof original.url === 'string' && original.url.includes('/auth/');
    if (error.response && error.response.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await httpService.post('/auth/refresh');
        return httpService(original);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || 'Something went wrong. Please try again.';
}
