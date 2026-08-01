/**
 * src/router/index.tsx
 *
 * React Router v7 route configuration.
 *
 * Route map:
 *   /                    → HomePage
 *   /verify              → VerifyPage
 *   /result              → ResultPage
 *   /result/sources      → SourceComparisonPage
 *   /check               → CheckPage
 *   /kasaysayan          → HistoryPage
 *   /tungkol             → AboutPage
 *   /dashboard           → redirects to /admin/dashboard (backward compat)
 *   /admin/login         → AdminLoginPage  (public, standalone — no shell)
 *   /admin               → AdminRoute guard (layout route)
 *   /admin/dashboard     → DashboardPage   (protected)
 *   /maintenance         → MaintenancePage (standalone)
 *   *                    → redirect → /
 *
 * All pages are lazy-loaded to keep the initial bundle small.
 */

import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { RootLayout } from "@/layouts/RootLayout";
import { PageLoader } from "@/components/shared/PageLoader";
import { AdminRoute } from "@/components/shared/AdminRoute";

// ── Lazy-loaded public pages ──────────────────────────────────────────────────
const HomePage             = lazy(() => import("@/pages/HomePage"));
const VerifyPage           = lazy(() => import("@/pages/VerifyPage"));
const ResultPage           = lazy(() => import("@/pages/ResultPage"));
const CheckPage            = lazy(() => import("@/pages/CheckPage"));
const SourceComparisonPage = lazy(() => import("@/pages/SourceComparisonPage"));
const HistoryPage          = lazy(() => import("@/pages/HistoryPage"));
const AboutPage            = lazy(() => import("@/pages/AboutPage"));
const MaintenancePage      = lazy(() => import("@/pages/MaintenancePage"));

// ── Lazy-loaded admin pages ───────────────────────────────────────────────────
const DashboardPage      = lazy(() => import("@/pages/DashboardPage"));
const AdminLoginPage     = lazy(() => import("@/pages/admin/AdminLoginPage"));
const PostTemplatesPage  = lazy(() => import("@/pages/admin/PostTemplatesPage"));

// ── Helper: wrap any lazy page with a Suspense loading fallback ───────────────
function withSuspense(Page: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

// ── Route tree ────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // ── Public shell routes (Navbar + Footer) ──────────────────────────────────
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true,              element: withSuspense(HomePage) },           // /
      { path: "verify",           element: withSuspense(VerifyPage) },         // /verify
      { path: "result",           element: withSuspense(ResultPage) },         // /result
      { path: "result/sources",   element: withSuspense(SourceComparisonPage) }, // /result/sources
      { path: "check",            element: withSuspense(CheckPage) },          // /check
      { path: "kasaysayan",       element: withSuspense(HistoryPage) },        // /kasaysayan
      { path: "tungkol",          element: withSuspense(AboutPage) },          // /tungkol
      // Backward-compat alias — old bookmarks still work
      { path: "dashboard",        element: <Navigate to="/admin/dashboard" replace /> },
      { path: "*", element: <Navigate to="/" replace /> },                    // 404
    ],
  },

  // ── Admin: login page (standalone — no Navbar/Footer) ──────────────────────
  {
    path: "/admin/login",
    element: withSuspense(AdminLoginPage),
  },

  // ── Admin: protected routes (require session) ───────────────────────────────
  // AdminRoute is the layout element — it checks auth before rendering <Outlet>.
  // Add more admin pages here as children without touching the guard logic.
  {
    path: "/admin",
    element: <AdminRoute />,
    children: [
      { index: true,             element: <Navigate to="/admin/dashboard" replace /> },
      { path: "dashboard",       element: withSuspense(DashboardPage) },
      { path: "post-templates",  element: withSuspense(PostTemplatesPage) },
    ],
  },

  // ── Standalone maintenance page ─────────────────────────────────────────────
  {
    path: "/maintenance",
    element: withSuspense(MaintenancePage),
  },
]);

// ── Export ────────────────────────────────────────────────────────────────────
export function AppRouter() {
  return <RouterProvider router={router} />;
}
