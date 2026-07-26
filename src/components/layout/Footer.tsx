/**
 * Footer — minimal, brand-complementary.
 */

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-white pb-16 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground tracking-wide">
          Built for Every Juan
        </p>
        <p className="text-xs text-muted-foreground">
          Developed by{" "}
          <span className="font-bold text-primary">Hance Dagondon</span>
        </p>
      </div>
    </footer>
  );
}
