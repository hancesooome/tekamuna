/**
 * MobileBottomNav — fixed bottom bar visible on small screens only.
 * Home · Suriin · Kasaysayan · Tungkol sa Amin
 */

import { NavLink } from "react-router-dom";
import { Home, Search, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/verify", label: "Suriin", Icon: Search, end: false },
  { to: "/kasaysayan", label: "Kasaysayan", Icon: Clock, end: false },
  { to: "/tungkol", label: "Tungkol sa Amin", Icon: Info, end: false },
] as const;

export function MobileBottomNav() {
  const handleClick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={handleClick}
            className={({ isActive }) =>
              cn(
                "tm-interactive flex flex-1 flex-col items-center justify-center gap-1 py-1",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "tm-interactive flex h-8 w-8 items-center justify-center rounded-full",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <span
                  className={cn("text-[10px] leading-none", isActive ? "font-bold" : "font-medium")}
                >
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
