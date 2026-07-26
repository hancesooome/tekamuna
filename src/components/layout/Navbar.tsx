/**
 * Navbar — sticky top bar matching the Figma design.
 *
 * Left:   Logo (mascot circle + "Teka Muna" wordmark + "AI FACT-CHECKER" sub)
 * Center: Nav links (Home · I-Verify · Kasaysayan · Tungkol Sa Amin)
 * Right:  Settings icon + yellow "Suriin →" pill button
 */

import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { LOGO_ICON_URL } from "@/constants";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/verify", label: "I-Verify", end: false },
  { to: "/kasaysayan", label: "Kasaysayan", end: false },
  { to: "/tungkol", label: "Tungkol Sa Amin", end: false },
] as const;

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = () => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm transition-all duration-200",
        scrolled ? "border-b border-border shadow-sm" : "border-b border-transparent",
      )}
    >
      <div className="max-w-[1100px] mx-auto px-5 sm:px-6 lg:px-0">
        <div className="flex h-[56px] items-center justify-between">

          {/* ── Logo ── */}
          <button
            onClick={() => { window.location.href = "/"; handleNavClick(); }}
            className="flex items-center gap-2 group focus:outline-none"
            aria-label="Teka Muna — bumalik sa Home"
          >
            <img
              src={LOGO_ICON_URL}
              alt="Teka Muna logo"
              className="h-9 w-9 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col leading-none">
              <span className="text-[20px] font-black tracking-tight text-primary">Teka Muna</span>
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                AI Fact-Checker
              </span>
            </div>
          </button>

          {/* ── Desktop nav ── */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Pangunahing navigation">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-foreground hover:bg-muted hover:text-primary",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* ── Desktop right controls — intentionally empty ── */}
          <div className="hidden md:flex items-center gap-3" />

          {/* ── Mobile hamburger ── */}
          <button
            className="md:hidden p-2.5 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="I-toggle ang menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-white px-5 pb-6 pt-4 shadow-xl">
          <div className="space-y-2">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    "block w-full rounded-xl px-5 py-3.5 text-base font-bold transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-foreground hover:bg-muted",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
