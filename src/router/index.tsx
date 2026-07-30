/**
 * src/router/index.tsx
 *
 * React Router v7 route configuration.
 *
 * Route map:
 *   /              → HomePage     (Hero + features + recent checks)
 *   /verify        → VerifyPage   (ClaimInput form)
 *   /result        → ResultPage   (VerifyResult display)
 *   /kasaysayan    → HistoryPage  (ProfilePage — saved checks)
 *   /tungkol       → AboutPage    (AboutUs)
 *   *              → 404 redirect → /
 *
 * All pages are lazy-loaded to keep the initial bundle small.
 */

import { lazy, Suspense } from "react";
// lazy()    → tells React to load a component only when it's first needed
//             (code-splitting: each page becomes its own JS chunk)
// Suspense  → shows a fallback UI (spinner) while lazy components are loading

import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
// createBrowserRouter → creates the router from a plain array of route objects
// RouterProvider      → the React component that provides routing context to the whole tree
// Navigate            → a component that immediately redirects to another route

import { RootLayout } from "@/layouts/RootLayout";
// RootLayout is the shared shell: Navbar + Footer + <Outlet /> (where pages render)

import { PageLoader } from "@/components/shared/PageLoader";
// PageLoader is a spinner/skeleton shown while a lazy page chunk is downloading

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
// Each import() call tells the bundler to split this into a separate JS file.
// The page code is only downloaded when the user first visits that URL.
const HomePage             = lazy(() => import("@/pages/HomePage"));
const VerifyPage           = lazy(() => import("@/pages/VerifyPage"));
const ResultPage           = lazy(() => import("@/pages/ResultPage"));
const CheckPage            = lazy(() => import("@/pages/CheckPage"));
const SourceComparisonPage = lazy(() => import("@/pages/SourceComparisonPage"));
const HistoryPage          = lazy(() => import("@/pages/HistoryPage"));
const AboutPage            = lazy(() => import("@/pages/AboutPage"));
const MaintenancePage      = lazy(() => import("@/pages/MaintenancePage"));
const DashboardPage        = lazy(() => import("@/pages/DashboardPage"));

// ── Helper: wrap any lazy page with a Suspense loading fallback ──────────────
// Instead of repeating <Suspense fallback={...}> for every route, we wrap once.
// React.ComponentType means "any React component (class or function)".
function withSuspense(Page: React.ComponentType) {
  return (
    // Suspense waits for the lazy Page bundle to download.
    // While downloading, it renders <PageLoader /> (our spinner).
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

// ── Route tree ───────────────────────────────────────────────────────────────
// createBrowserRouter uses the browser History API (pushState) for clean URLs.
// The tree is nested: RootLayout wraps all child routes.
const router = createBrowserRouter([
  {
    path: "/",                      // Root path — all children render inside RootLayout
    element: <RootLayout />,        // Shared shell: Navbar + <Outlet /> + Footer
    children: [
      { index: true, element: withSuspense(HomePage) },               // /
      { path: "verify",             element: withSuspense(VerifyPage) },           // /verify
      { path: "result",             element: withSuspense(ResultPage) },           // /result
      { path: "result/sources",     element: withSuspense(SourceComparisonPage) }, // /result/sources
      { path: "check",              element: withSuspense(CheckPage) },            // /check
      { path: "kasaysayan",         element: withSuspense(HistoryPage) },          // /kasaysayan
      { path: "tungkol",            element: withSuspense(AboutPage) },            // /tungkol
      { path: "dashboard",          element: withSuspense(DashboardPage) },        // /dashboard
      { path: "*", element: <Navigate to="/" replace /> },            // 404 → redirect home
      // "replace" means the redirect URL replaces the 404 in browser history,
      // so the user can't press Back and land on a broken 404 page.
    ],
  },
  // ── Standalone routes (no Navbar / Footer shell) ──────────────────────
  {
    path: "/maintenance",
    element: withSuspense(MaintenancePage),
  },
]);

// ── Export ───────────────────────────────────────────────────────────────────
// AppRouter is used in main.tsx as the top-level routing component.
export function AppRouter() {
  // RouterProvider connects our router config to the React component tree.
  // All child components can now use useNavigate(), useParams(), etc.
  return <RouterProvider router={router} />;
}
