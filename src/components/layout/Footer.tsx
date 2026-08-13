/**
 * Footer — minimal, brand-complementary.
 * pb-20 on mobile clears the fixed MobileBottomNav (h ~56px + safe area).
 */

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-white pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-5 flex flex-col sm:flex-row items-center justify-between gap-1">
        <p className="text-xs font-semibold text-muted-foreground tracking-wide">
          &copy; {new Date().getFullYear()} Teka Muna &middot; Built for Every Juan
        </p>
        <p className="text-xs text-muted-foreground">
          Developed by{" "}
          <span className="font-bold text-primary">Hance Dagondon</span>
        </p>
      </div>
    </footer>
  );
}
