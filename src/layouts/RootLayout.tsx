/**
 * RootLayout — shell that wraps every page.
 *
 * Structure:
 *   <header> Navbar
 *   <main>   <Outlet /> (page content)
 *   <footer> Footer
 *   <nav>    MobileBottomNav (visible only on small screens)
 */

import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export function RootLayout() {
  const { pathname } = useLocation();

  // Scroll to top on every route change
  // (React Router v7 doesn't do this by default)
  const key = pathname;

  return (
    <div className="flex min-h-screen flex-col bg-background" key={key}>
      <Navbar />

      {/*
       * <main> is intentionally unconstrained here — each page owns its own
       * container / full-bleed treatment. Pages that need the standard
       * max-w-7xl gutter wrap their content in a <PageContainer>.
       */}
      <main className="flex-1 w-full pb-20 md:pb-0">
        <Outlet />
      </main>

      <Footer />

      {/* Visible only on < md */}
      <MobileBottomNav />
    </div>
  );
}
