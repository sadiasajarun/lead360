import { useEffect, useState } from 'react';
import { httpService } from '~/services/httpService';

// The avatar endpoint is authenticated (httpOnly cookie). A plain `<img src="…/auth/me/avatar">` is
// a cross-origin request the browser may send WITHOUT the cookie — it 401s and renders as a broken
// image. So we fetch the bytes through the same axios client everything else uses (cookies +
// 401-refresh) and hand the <img> an object URL, exactly as KB file downloads do.

/**
 * Resolve an authenticated avatar path into a usable <img> src. Returns null while loading, on
 * error, or when the user has no photo — callers fall back to initials.
 */
export function useAvatarUrl(avatarUrl?: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarUrl) {
      setSrc(null);
      return;
    }
    // Absolute URLs (e.g. a future CDN) need no auth — use them as-is.
    if (/^https?:\/\//i.test(avatarUrl)) {
      setSrc(avatarUrl);
      return;
    }

    let cancelled = false;
    let objectUrl = '';
    httpService
      .get(avatarUrl, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null); // fall back to initials rather than show a broken image
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarUrl]);

  return src;
}
