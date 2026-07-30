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

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { PageLoader } from "@/components/shared/PageLoader";

export function AdminRoute() {
  const { session, loading } = useAuth();

  // Still resolving session from localStorage — don't redirect prematurely
  if (loading) return <PageLoader />;

  // Not authenticated → send to login
  if (!session) return <Navigate to="/admin/login" replace />;

  // Authenticated admin → render the child page
  return <Outlet />;
}
