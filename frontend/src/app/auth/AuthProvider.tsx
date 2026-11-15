/**
 * Who is signed in, and the one sign-in dialog. Visitors can look around the demo farm, which is read-only; an
 * account is needed to add a farm, draw fields or save runs (the backend enforces this in app/access.py).
 * `requireAccount(then, reason)` runs `then` straight away when signed in, otherwise asks the visitor to create an
 * account first and runs it once they have.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "./authApi";
import { AuthDialog, type AuthMode } from "./AuthDialog";
import type { User } from "./types";

export interface AuthRequest {
  mode?: AuthMode;
  /** One line saying why an account is needed here. */
  reason?: string;
  /** Runs after a successful sign-up (not after sign-in, which reopens the user's own farms). */
  then?: () => void;
}

export interface Auth {
  /** null when nobody is signed in. */
  user: User | null;
  /** True until the first /api/auth/me answers. */
  loading: boolean;
  openAuth: (r?: AuthRequest) => void;
  requireAccount: (then: () => void, reason?: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<AuthRequest | null>(null);

  useEffect(() => {
    authApi.me().then(setUser, () => setUser(null)).finally(() => setLoading(false));
  }, []);

  const openAuth = useCallback((r: AuthRequest = {}) => setRequest(r), []);
  const requireAccount = useCallback((then: () => void, reason?: string) => {
    if (user) then();
    else setRequest({ mode: "signup", reason, then });
  }, [user]);
  const signOut = useCallback(async () => {
    try {
      await authApi.signOut();
    } finally {
      setUser(null);
    }
  }, []);

  const done = (u: User, mode: AuthMode) => {
    const then = request?.then;
    setUser(u);
    setRequest(null);
    // After the farm list has followed the new account (app/farm.tsx), so `then` sees it.
    if (mode === "signup" && then) setTimeout(then, 0);
  };

  const value = useMemo(() => ({ user, loading, openAuth, requireAccount, signOut }), [user, loading, openAuth, requireAccount, signOut]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {request && <AuthDialog initialMode={request.mode ?? "signin"} reason={request.reason} onDone={done} onClose={() => setRequest(null)} />}
    </Ctx.Provider>
  );
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}
