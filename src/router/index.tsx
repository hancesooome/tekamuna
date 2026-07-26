/**
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
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { RootLayout } from "@/layouts/RootLayout";
import { PageLoader } from "@/components/shared/PageLoader";

const HomePage = lazy(() => import("@/pages/HomePage"));
const VerifyPage = lazy(() => import("@/pages/VerifyPage"));
const ResultPage = lazy(() => import("@/pages/ResultPage"));
const CheckPage = lazy(() => import("@/pages/CheckPage"));
const SourceComparisonPage = lazy(() => import("@/pages/SourceComparisonPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));

function withSuspense(Page: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: withSuspense(HomePage) },
      { path: "verify", element: withSuspense(VerifyPage) },
      { path: "result", element: withSuspense(ResultPage) },
      { path: "result/sources", element: withSuspense(SourceComparisonPage) },
      { path: "check", element: withSuspense(CheckPage) },
      { path: "kasaysayan", element: withSuspense(HistoryPage) },
      { path: "tungkol", element: withSuspense(AboutPage) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
