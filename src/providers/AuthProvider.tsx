/**
 * src/providers/AuthProvider.tsx
 *
 * Global auth context for admin authentication via Supabase.
 *
 * - Restores session on page load (Supabase persists to localStorage automatically)
 * - Subscribes to auth state changes (login / logout / token refresh)
 * - Enforces admin-email allowlist: any signed-in user whose email does NOT
 *   match VITE_ADMIN_EMAIL is immediately signed out
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

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Only this email may access the admin area.
 * Set VITE_ADMIN_EMAIL=you@example.com in .env.
 * If the env var is missing we fall back to blocking everyone (fail-safe).
 */
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase().trim() ?? "";

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  /** Returns true if the session belongs to the allowed admin email. */
  function isAdminEmail(sess: Session | null): boolean {
    if (!sess) return false;
    return sess.user.email?.toLowerCase().trim() === ADMIN_EMAIL;
  }

  /**
   * Apply a session update: if it passes the allowlist check, store it.
   * Otherwise sign the user out immediately and set an error message.
   */
  const applySession = useCallback(async (sess: Session | null) => {
    console.log("[AuthProvider] applySession called with details:", {
      email: sess?.user?.email,
      confirmed_at: sess?.user?.email_confirmed_at,
      last_sign_in: sess?.user?.last_sign_in_at,
      role: sess?.user?.role,
    });
    if (sess && !isAdminEmail(sess)) {
      console.warn("[AuthProvider] Access denied for email:", sess.user.email, "Expected admin email:", ADMIN_EMAIL);
      // Wrong account — sign out and refuse access
      await supabase.auth.signOut();
      setSession(null);
      setError("Access denied. This account is not authorised to access the admin area.");
      return;
    }
    console.log("[AuthProvider] Setting session to:", sess ? "active" : "null");
    setSession(sess);
    setError(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let mounted = true;

    // 1. Restore any existing session from localStorage
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      console.log("[AuthProvider] getSession returned email:", data.session?.user?.email);
      // Log storage keys
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith("sb-"));
      console.log("[AuthProvider] Current localStorage sb- keys:", sbKeys);
      void applySession(data.session).finally(() => {
        if (mounted) {
          console.log("[AuthProvider] getSession finished, setting loading to false");
          setLoading(false);
        }
      });
    });

    // 2. Keep state in sync for future sign-ins / sign-outs / token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;
      console.log("[AuthProvider] onAuthStateChange fired event:", event, "with email:", sess?.user?.email);
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith("sb-"));
      console.log("[AuthProvider] onAuthStateChange localStorage sb- keys:", sbKeys);
      void applySession(sess);
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
    console.log("[AuthProvider] signInWithPassword returned:", {
      success: !res.error,
      error: res.error?.message,
      email: res.data?.user?.email,
      session: !!res.data?.session
    });
    if (res.error) {
      setError(res.error.message);
    }
    // Session update is handled by onAuthStateChange → applySession
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // onAuthStateChange fires with null → applySession clears state
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
