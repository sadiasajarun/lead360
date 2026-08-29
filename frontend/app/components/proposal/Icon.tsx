/**
 * Icon — injects the inline SVG that was resolved at generation time
 * (devicon → simple-icons → lucide) and passed down via IconMapContext.
 * Falls back to a neutral placeholder for any unresolved name.
 */
import { createContext } from 'react';

export const IconMapContext = createContext<Record<string, string>>({});

export function IconProvider({ map, children }: { map?: Record<string, string>; children: React.ReactNode }) {
  return <IconMapContext.Provider value={map ?? {}}>{children}</IconMapContext.Provider>;
}

export function Icon({ name, size = 20 }: { name?: string; size?: number }) {
  return (
    <IconMapContext.Consumer>
      {(map) => {
        const svg = name ? map[name] : undefined;
        if (svg) {
          return (
            <span
              className="ic-svg"
              style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center' }}
              // trusted content: SVGs come from bundled icon packs, resolved server-side
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          );
        }
        return (
          <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        );
      }}
    </IconMapContext.Consumer>
  );
}
