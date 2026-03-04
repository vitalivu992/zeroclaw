import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import React from 'react';
import {
  getToken as readToken,
  setToken as writeToken,
  clearToken as removeToken,
  isAuthenticated as checkAuth,
  TOKEN_STORAGE_KEY,
} from '../lib/auth';
import { pair as apiPair, pamLogin as apiPamLogin, getPublicHealth } from '../lib/api';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AuthState {
  /** The current bearer token, or null if not authenticated. */
  token: string | null;
  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;
  /** True while the initial auth check is in progress. */
  loading: boolean;
  /** Pair with the agent using a pairing code. Stores the token on success. */
  pair: (code: string) => Promise<void>;
  /** Authenticate with Linux PAM credentials. Stores the token on success. */
  pamLogin: (username: string, password: string) => Promise<void>;
  /** Whether the server has PAM auth enabled (from /health). */
  pamEnabled: boolean;
  /** Whether libpam is available on the server (from /health). */
  pamAvailable: boolean;
  /** Clear the stored token and sign out. */
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setTokenState] = useState<string | null>(readToken);
  const [authenticated, setAuthenticated] = useState<boolean>(checkAuth);
  const [loading, setLoading] = useState<boolean>(!checkAuth());
  const [pamEnabled, setPamEnabled] = useState<boolean>(false);
  const [pamAvailable, setPamAvailable] = useState<boolean>(false);

  // On mount: check if server requires pairing at all, and PAM status
  useEffect(() => {
    if (checkAuth()) return; // already have a token, no need to check
    let cancelled = false;
    getPublicHealth()
      .then((health) => {
        if (cancelled) return;
        if (!health.require_pairing) {
          setAuthenticated(true);
        }
        setPamEnabled(health.pam_enabled ?? false);
        setPamAvailable(health.pam_available ?? false);
      })
      .catch(() => {
        // health endpoint unreachable — fall back to showing pairing dialog
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep state in sync if token storage is changed from another browser context.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        const t = readToken();
        setTokenState(t);
        setAuthenticated(t !== null && t.length > 0);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const pair = useCallback(async (code: string): Promise<void> => {
    const { token: newToken } = await apiPair(code);
    writeToken(newToken);
    setTokenState(newToken);
    setAuthenticated(true);
  }, []);

  const pamLogin = useCallback(async (username: string, password: string): Promise<void> => {
    const { token: newToken } = await apiPamLogin(username, password);
    writeToken(newToken);
    setTokenState(newToken);
    setAuthenticated(true);
  }, []);

  const logout = useCallback((): void => {
    removeToken();
    setTokenState(null);
    setAuthenticated(false);
  }, []);

  const value: AuthState = {
    token,
    isAuthenticated: authenticated,
    loading,
    pair,
    pamLogin,
    pamEnabled,
    pamAvailable,
    logout,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the authentication state from any component inside `<AuthProvider>`.
 * Throws if used outside the provider.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
