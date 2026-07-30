/**
 * src/providers/AuthProvider.tsx
 *
 * Global auth context for admin authentication via Supabase.
 *
 * - Restores session on page load (Supabase persists to localStorage automatically)
 * - Subscribes to auth state changes (login / logout / token refresh)
 * - Exposes signIn / signOut helpers and auth state via useAuth()
 *
 * Public pages never import this hook — the guard only activates inside
 * <AdminRoute>, so the public fact-checking UX is completely unaffected.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Current Supabase session, or null if logged out. */
  session: Session | null;
  /** True while the initial session check is in progress — show a loader. */
  loading: boolean;
  /** Non-null when sign-in fails or access is denied. */
  error: string | null;
  /** Call this from the login page. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Call this from a logout button anywhere in the admin area. */
  signOut: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  /**
   * Apply a session update: store it in state.
   */
  const applySession = useCallback((sess: Session | null) => {
    setSession(sess);
    setError(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Restore any existing session from localStorage
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      applySession(data.session);
      setLoading(false);
    });

    // 2. Keep state in sync for future sign-ins / sign-outs / token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      applySession(sess);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  // ── Public helpers ──────────────────────────────────────────────────────────

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await supabase.auth.signInWithPassword({ email, password });
    if (res.error) {
      setError(res.error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Returns the current auth state and helpers.
 * Must be used inside <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthProvider>. Check your component tree.");
  }
  return ctx;
}
