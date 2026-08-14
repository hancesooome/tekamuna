/**
 * Navbar — sticky top bar matching the Figma design.
 *
 * Left:   Logo (mascot circle + "Teka Muna" wordmark + "AI FACT-CHECKER" sub)
 * Center: Nav links (Home · Suriin · Kasaysayan · Tungkol Sa Amin)
 * Right:  Settings icon + yellow "Suriin →" pill button
 */

import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { LOGO_ICON_URL } from "@/constants";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/verify", label: "Suriin", end: false },
  { to: "/kasaysayan", label: "Kasaysayan", end: false },
  { to: "/tungkol", label: "Tungkol Sa Amin", end: false },
] as const;

export function Navbar() {
  const navigate = useNavigate();
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
        "sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm transition-[border-color,box-shadow] duration-150",
        scrolled ? "border-b border-border shadow-[0_1px_8px_rgba(15,23,42,0.05)]" : "border-b border-transparent",
      )}
    >
      <div className="max-w-[1100px] mx-auto px-5 sm:px-6 lg:px-0">
        <div className="flex h-16 items-center justify-between">

          {/* ── Logo ── */}
          <button
            onClick={() => { void navigate("/"); handleNavClick(); }}
            className="tm-interactive group flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none"
            aria-label="Teka Muna — bumalik sa Home"
          >
            <img
              src={LOGO_ICON_URL}
              alt="Teka Muna logo"
              className="h-9 w-9 object-contain drop-shadow-sm"
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
          <nav className="hidden items-center gap-1.5 md:flex" aria-label="Pangunahing navigation">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    "tm-interactive flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-muted hover:text-primary",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* ── Mobile hamburger ── */}
          <button
            className="tm-interactive flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
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
        <div className="animate-content-in border-t border-border bg-white px-5 pb-6 pt-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] md:hidden">
          <div className="space-y-2">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    "tm-interactive flex min-h-12 w-full items-center rounded-md px-5 py-3 text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
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
