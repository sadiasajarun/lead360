import { useEffect, useState } from 'react';

const KEY = 'lead360:nav-collapsed';

/**
 * Persisted sidebar collapse state. Initialises expanded (SSR-safe, no hydration mismatch), then
 * hydrates the saved preference on mount. Returns [collapsed, toggle].
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === '1') setCollapsed(true);
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });

  return [collapsed, toggle];
}
