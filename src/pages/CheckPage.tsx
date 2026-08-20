/**
 * CheckPage — stateless shareable fact-check page.
 *
 * URL format: /check?c=<base64url-encoded-claim>
 *
 * Flow:
 *   1. On mount, read ?c= param and decode the claim.
 *   2. If invalid → show friendly error with link to /verify.
 *   3. If valid   → auto-fire the fact-check immediately (no button needed).
 *   4. Show loading animation while the API call is in progress.
 *   5. Render the full result inline (shared UI with ResultPage).
 *   6. Share button generates a new /check URL for the same claim.
 */

import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, XCircle, Share2, BarChart2, ChevronRight, Loader2 } from "lucide-react";
import { useMutation }       from "@tanstack/react-query";
import { Button }            from "@/components/ui/button";
import { PageContainer }     from "@/components/shared/PageContainer";
import { verifyClaim } from "@/services/api";
import type { ApiServiceError } from "@/services/api";
import { appendToHistory }   from "@/services/historyService";
import { decodeClaim } from "@/utils/shareUrl";
import ShareButton from "@/components/shared/ShareButton";
import ShareCardButton from "@/components/shared/ShareCardButton";
import { stripMarkdown } from "@/utils/stripMarkdown";
import type { VerifyResult } from "@/types";
import {
  ClaimBanner,
  ConfidencePanel,
  VerdictCard,
  VerdictTabs,
  VerdictLoadingView,
} from "@/components/result";

// ─── Error states ──────────────────────────────────────────────────────────────

function InvalidClaimError() {
  return (
    <PageContainer className="max-w-[850px] pb-12">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">Invalid na Link</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            May mali o walang laman ang link na ito. Subukang magsuri ng bagong claim.
          </p>
        </div>
        <Button asChild>
          <Link to="/verify"><Search className="h-4 w-4" /> Suriin ang Claim</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

function ApiErrorView({ claim, message, onRetry }: { claim: string; message: string; onRetry: () => void }) {
  return (
    <PageContainer className="max-w-[850px] pb-12">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">May nangyaring error</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">{message}</p>
          <p className="mt-3 text-xs text-muted-foreground italic">Claim: "{claim}"</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onRetry}>
            <Loader2 className="h-4 w-4" /> Subukan Ulit
          </Button>
          <Button asChild>
            <Link to="/verify"><Search className="h-4 w-4" /> Magsuri Muli</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

// ─── Result view (inline, shared layout with ResultPage) ───────────────────────

function ResultView({ result }: { result: VerifyResult }) {
  const actions = (
    <>
      <Button variant="outline" size="sm" className="text-xs" asChild>
        <Link to="/result/sources" state={{ result }}>
          <BarChart2 className="h-3.5 w-3.5" /> Ikumpara ang Sources
        </Link>
      </Button>
      <ShareButton result={result} />
      <ShareCardButton result={result} />
    </>
  );

  const buod = (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-white/55 p-4">
        <h3 className="text-sm font-black text-foreground mb-3">Buod ng Pagsusuri</h3>
        <p className="text-sm text-foreground leading-relaxed">{stripMarkdown(result.explanation)}</p>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-xs font-black text-amber-800 mb-2">✨ Ano ang Totoo</p>
        <p className="text-sm text-amber-900 leading-relaxed">{stripMarkdown(result.truthStatement)}</p>
      </div>
    </div>
  );

  return (
    <PageContainer className="animate-page-in max-w-[850px] pb-12">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 pt-8 pb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-foreground">Shared Check</span>
      </nav>

      {/* Shared-link notice */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 mb-5 text-xs text-primary font-semibold">
        <Share2 className="h-4 w-4 shrink-0" />
        Ito ay isang shared fact-check link. Ang resultang ito ay sariwang kinuha ngayon gamit ang pinakabagong data.
      </div>

      {/* Claim banner */}
      <ClaimBanner claim={result.claim} />

      {/* Two-column: verdict + confidence */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_270px] gap-5 mb-6">
        <VerdictCard result={result} titleId="shared-ai-verdict-title" actions={actions} />
        <ConfidencePanel result={result} />
      </div>

      {/* Tabs */}
      <VerdictTabs result={result} buod={buod} />

      {/* Bottom actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-border">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link to="/verify">Suriin ang Bagong Claim</Link>
        </Button>
        <Button className="w-full sm:w-auto" asChild>
          <Link to="/kasaysayan">Tingnan ang Kasaysayan</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckPage() {
  const [searchParams] = useSearchParams();

  // Decode claim once on mount
  const encoded = searchParams.get("c") ?? "";
  const claim   = decodeClaim(encoded);

  const { mutate, isPending, data, error, reset } = useMutation<
    VerifyResult,
    ApiServiceError,
    { claim: string }
  >({
    mutationFn: ({ claim: c }) => verifyClaim({ claim: c }),
    onSuccess: (result) => {
      appendToHistory(result);
    },
  });

  // Auto-fire on mount if claim is valid
  useEffect(() => {
    if (claim) {
      mutate({ claim });
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invalid URL
  if (!claim) return <InvalidClaimError />;

  // Loading
  if (isPending) return <VerdictLoadingView claim={claim} />;

  // API error
  if (error) return (
    <ApiErrorView
      claim={claim}
      message={error.message}
      onRetry={() => { reset(); mutate({ claim }); }}
    />
  );

  // Success
  if (data) return <ResultView result={data} />;

  // Initial render before effect fires (extremely brief)
  return <VerdictLoadingView claim={claim} />;
}
