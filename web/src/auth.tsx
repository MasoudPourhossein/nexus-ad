import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

export interface Me {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  credits: number | null;
  plan: { id: number; name: string } | null;
  planExpiresAt: string | null;
  sessionLimit: number | null;
  sessions: number;
  webhookUrl: string | null;
  optOutKeywords: string[];
  optOutReply: string | null;
}

interface AuthCtx {
  me: Me | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  async function refresh() {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      setMe(await api<Me>('/me'));
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function login(email: string, password: string) {
    const res = await api<{ token: string }>('/auth/login', { body: { email, password } });
    setToken(res.token);
    await refresh();
  }
  function logout() {
    setToken(null);
    setMe(null);
  }
  return <Ctx.Provider value={{ me, ready, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
