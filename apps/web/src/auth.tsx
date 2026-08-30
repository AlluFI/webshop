import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";

type User = {
  id: string;
  email: string;
  displayName: string | null;
  totpEnabled: boolean;
  role: string;
};

type AuthContextValue = {
  accessToken: string | null;
  user: User | null;
  ready: boolean;
  setSession: (accessToken: string) => Promise<void>;
  refreshSession: () => Promise<boolean>;
  reloadUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const loadMe = useCallback(async (token: string) => {
    const profile = await api<User>("/auth/me", { token });
    setUser(profile);
    setAccessToken(token);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const result = await api<{ accessToken: string }>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadMe(result.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      setUser(null);
      return false;
    }
  }, [loadMe]);

  const setSession = useCallback(
    async (token: string) => {
      await loadMe(token);
    },
    [loadMe],
  );

  const reloadUser = useCallback(async () => {
    if (!accessToken) return;
    await loadMe(accessToken);
  }, [accessToken, loadMe]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({}),
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
    setAccessToken(null);
    setUser(null);
  }, [accessToken]);

  useEffect(() => {
    void refreshSession().finally(() => setReady(true));
  }, [refreshSession]);

  const value = useMemo(
    () => ({ accessToken, user, ready, setSession, refreshSession, reloadUser, logout }),
    [accessToken, user, ready, setSession, refreshSession, reloadUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
