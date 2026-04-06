import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, AuthUser } from '../types';
import { apiFetch } from '../services/api';
import { clearStoredSession, getStoredToken, getStoredUser, persistSession } from '../services/session';
import { disconnectSocket } from '../services/socket';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applyStoredSession(session: AuthResponse, setUser: (user: AuthUser | null) => void, setToken: (token: string | null) => void) {
  persistSession(session.token, session.user);
  setUser(session.user);
  setToken(session.token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiFetch<{ user: AuthUser }>('/api/auth/me')
      .then((response) => {
        if (cancelled) {
          return;
        }

        persistSession(token, response.user);
        setUser(response.user);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        clearStoredSession();
        disconnectSocket();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    const session = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, { auth: false });

    applyStoredSession(session, setUser, setToken);
  };

  const register = async (name: string, email: string, password: string) => {
    const session = await apiFetch<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }, { auth: false });

    applyStoredSession(session, setUser, setToken);
  };

  const logout = () => {
    clearStoredSession();
    disconnectSocket();
    setUser(null);
    setToken(null);
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    isLoading,
    login,
    register,
    logout,
  }), [user, token, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}