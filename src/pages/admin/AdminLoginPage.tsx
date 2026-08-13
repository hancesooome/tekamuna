/**
 * src/pages/admin/AdminLoginPage.tsx
 *
 * Standalone admin login page (no Navbar / Footer).
 * Accessible at /admin/login.
 *
 * - If already logged in → auto-redirects to /admin/dashboard
 * - On successful login → redirects to /admin/dashboard
 * - On error → shows inline error from Supabase or the admin-email guard
 */

import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogIn, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";

export default function AdminLoginPage() {
  const { session, loading, error, signIn } = useAuth();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  // Already logged in → skip to dashboard
  useEffect(() => {
    if (!loading && session) {
      void navigate("/admin/dashboard", { replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } finally {
      setSubmitting(false);
    }
  }

  // While resolving session don't flash the form
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Background glow — matches the app's hero aesthetic */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-xl p-8 space-y-6">

          {/* Header */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground">
                Admin Access
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Sign in with your authorised admin account
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="admin-email"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="admin-password"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="admin-login-submit"
              type="submit"
              disabled={submitting || !email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-[11px] text-muted-foreground/60">
            This page is not accessible to the public.
            <br />
            <a
              href="/"
              className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
            >
              Return to Teka Muna ↗
            </a>
          </p>
        </div>

        {/* Branding */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-4 tracking-widest uppercase">
          Teka Muna · Admin
        </p>
      </div>
    </div>
  );
}
