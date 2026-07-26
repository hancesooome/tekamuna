/**
 * MobileBottomNav — fixed bottom bar visible on small screens only.
 * Home · Suriin (primary CTA) · History · Tungkol
 */

import { NavLink } from "react-router-dom";
import { Home, Search, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/",          label: "Home",     Icon: Home,   end: true  },
  { to: "/kasaysayan", label: "Kasaysayan", Icon: Clock,  end: false },
  { to: "/tungkol",   label: "Tungkol",  Icon: Info,   end: false },
] as const;

export function MobileBottomNav() {
  const handleClick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around px-2 py-2 max-w-md mx-auto">

        {/* Home */}
        {NAV_ITEMS.slice(0, 1).map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={handleClick}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  isActive ? "bg-primary/10" : "",
                )}>
                  <Icon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <span className={cn(
                  "text-[10px] leading-none",
                  isActive ? "font-bold" : "font-medium",
                )}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        {/* Suriin — prominent center CTA */}
        <NavLink
          to="/verify"
          end={false}
          onClick={handleClick}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95"
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-all",
                isActive
                  ? "bg-primary scale-110 shadow-primary/30"
                  : "bg-primary/90 hover:bg-primary",
              )}>
                <Search className="h-5 w-5 text-white stroke-[2.5]" />
              </div>
              <span className={cn(
                "text-[10px] leading-none",
                isActive ? "font-black text-primary" : "font-bold text-primary",
              )}>
                Suriin
              </span>
            </>
          )}
        </NavLink>

        {/* Kasaysayan + Tungkol */}
        {NAV_ITEMS.slice(1).map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={handleClick}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  isActive ? "bg-primary/10" : "",
                )}>
                  <Icon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <span className={cn(
                  "text-[10px] leading-none",
                  isActive ? "font-bold" : "font-medium",
                )}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}

      </div>
    </nav>
  );
}
