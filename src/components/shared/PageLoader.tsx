/**
 * Full-page loading skeleton shown while lazy route chunks are fetching.
 */

import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="Naglo-load..."
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Sandali lang...</span>
      </div>
    </div>
  );
}
