"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@veyra/types";
import { api } from "./api";
import { DEMO_USER } from "./demo-data";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isDemo: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("veyra_demo") === "true") {
        setUser(DEMO_USER);
        setIsDemo(true);
        setIsLoading(false);
        return;
      }

      const token = api.getToken();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      const data = await api.get<{ user: User }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
      localStorage.removeItem("veyra_token");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ user: User; token: string }>("/api/auth/login", {
      email,
      password,
    });
    localStorage.setItem("veyra_token", data.token);
    api.setToken(data.token);
    setUser(data.user);
  };

  const loginDemo = () => {
    localStorage.setItem("veyra_demo", "true");
    setUser(DEMO_USER);
    setIsDemo(true);
    router.push("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("veyra_token");
    localStorage.removeItem("veyra_demo");
    api.setToken(null);
    setUser(null);
    setIsDemo(false);
    router.push("/auth/login");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isDemo, login, loginDemo, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
