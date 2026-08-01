/**
 * src/components/shared/AdminRoute.tsx
 *
 * Protected route wrapper for admin-only pages.
 *
 * Render this as a layout route in the router (with <Outlet />).
 * Any child route will be protected automatically.
 *
 * Behaviour:
 *   - Loading  → shows <PageLoader /> (avoids flash of login page)
 *   - Logged in → renders <Outlet /> (the actual admin page)
 *   - Logged out → redirects to /admin/login
 */

import { Navigate, Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { PageLoader } from "@/components/shared/PageLoader";
import { LogOut, Shield, LayoutDashboard, ImagePlay } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/admin/dashboard",       label: "Dashboard",       icon: LayoutDashboard },
  { to: "/admin/post-templates",  label: "Post Templates",  icon: ImagePlay       },
] as const;

export function AdminRoute() {
  const { session, loading, signOut } = useAuth();

  // Still resolving session from localStorage — don't redirect prematurely
  if (loading) return <PageLoader />;

  // Not authenticated → send to login
  if (!session) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Admin Navbar */}
      <header className="border-b border-border bg-card/65 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="font-black text-sm tracking-wider uppercase">Teka Muna Admin</span>
          </div>

          {/* Nav tabs */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:inline-block">
              {session.user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Area */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
