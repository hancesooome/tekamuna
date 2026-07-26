/**
 * src/components/shared/PageContainer.tsx
 *
 * Purpose:
 *   Standard padded page wrapper with a max-width constraint.
 *   All pages that do not need full-bleed sections should use this.
 *
 * Usage:
 *   <PageContainer className="pb-12">...</PageContainer>
 *
 * Dependencies: src/lib/utils.ts (cn)
 */

import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1040px] px-5 sm:px-6 lg:px-0 pt-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
