import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { clearToken, getToken, setToken, setUnauthorizedHandler } from "../utils/apiClient";

type AuthContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();
  const [tokenState, setTokenState] = useState<string | null>(() => getToken());

  const login = useCallback((token: string) => {
    setToken(token);
    setTokenState(token);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  useEffect(() => {
    const cleanup = setUnauthorizedHandler(() => {
      clearToken();
      setTokenState(null);
      navigate("/login", { replace: true });
    });
    return cleanup;
  }, [navigate]);

  const value = useMemo(
    () => ({
      token: tokenState,
      isAuthenticated: Boolean(tokenState),
      login,
      logout,
    }),
    [tokenState, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
