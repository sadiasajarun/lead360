import type { UserRole } from '~/enums/role.enum';

// Personal defaults stored on the user (GET /auth/me → preferences, PATCH /auth/me/preferences).
// All optional — the backend only stores keys the user has set.
export interface UserPreferences {
  defaultTemplate?: string;
  defaultCurrency?: string;
  proposalTheme?: string;
  language?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // Relative path (e.g. "/auth/me/avatar?v=…") or null when unset. Prefix with the API base
  // render via ~/lib/avatar useAvatarUrl() (the endpoint needs the auth cookie).
  avatarUrl?: string | null;
  preferences?: UserPreferences;
}

export interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
}
