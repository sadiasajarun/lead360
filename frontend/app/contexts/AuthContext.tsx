import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchMe, login as loginApi, logout as logoutApi } from '~/services/httpServices/authService';
import { setUser, clearUser } from '~/redux/features/authSlice';
import { UserRole } from '~/enums/role.enum';
import type { AuthUser } from '~/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  status: string;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const { user, status } = useAppSelector((s) => s.auth);

  useEffect(() => {
    // Validate the session on app load (httpOnly cookie).
    dispatch(fetchMe());
  }, [dispatch]);

  const value: AuthContextValue = {
    user,
    status,
    login: async (email, password) => {
      const u = await loginApi(email, password);
      dispatch(setUser(u));
      return u;
    },
    logout: async () => {
      await logoutApi();
      dispatch(clearUser());
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getHomeRouteForRole(role?: UserRole): string {
  // Sales/PM home is the Leads list, which is the index route ('/') — there is no bare '/leads'.
  return role === UserRole.ADMIN ? '/overview' : '/';
}
