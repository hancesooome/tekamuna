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
import { useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export function RootLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      {/*
       * <main> is intentionally unconstrained here — each page owns its own
       * container / full-bleed treatment. Pages that need the standard
       * max-w-7xl gutter wrap their content in a <PageContainer>.
       */}
      <main className="flex-1 w-full pb-20 md:pb-0">
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>

      <Footer />

      {/* Visible only on < md */}
      <MobileBottomNav />
    </div>
  );
}
