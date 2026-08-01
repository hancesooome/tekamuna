/**
 * VerifyPage — "I-Verify ang Claim"
 *
 * Card 1: Claim textarea
 * Card 2: Single-image upload with live AI Vision extraction
 * Card 3: Kategorya chips + checkboxes + submit
 * Sidebar: Tips + Example claims
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Search, ImagePlus, X, Loader2, AlertCircle, ChevronDown,
  ScanText, CheckCircle2,
} from "lucide-react";
import { Button }         from "@/components/ui/button";
import { Textarea }       from "@/components/ui/textarea";
import { PageContainer }  from "@/components/shared/PageContainer";
import { useVerify }      from "@/hooks/useVerify";
import { extractTextFromImageBrowser, OCR_MAX_FILE_BYTES, OCR_ALLOWED_MIME } from "@/services/ocrService";
import { shouldRunVerificationPipeline } from "@/utils/intent";
import { cn }             from "@/lib/utils";
import { useLocation }    from "react-router-dom";
import thinkImage from "../assets/think.png";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHARS = 500;

const ALLOWED_MIME = OCR_ALLOWED_MIME as readonly string[];
// OCR.Space free tier cap is 1 MB
const MAX_FILE_MB  = OCR_MAX_FILE_BYTES / (1024 * 1024);

const CATEGORIES = [
  "Pulitika", "Kalusugan", "Ekonomiya", "Teknolohiya",
  "Kalikasan", "Edukasyon", "Krimen", "Internasyonal",
] as const;
type Category = (typeof CATEGORIES)[number];

const EXAMPLE_CLAIMS: { claim: string; category: Category }[] = [
  { claim: "Libre ang COVID vaccine sa lahat ng Pilipino",                   category: "Kalusugan" },
  { claim: "Ang Pilipinas ay may pinakamataas na unemployment rate sa ASEAN", category: "Ekonomiya" },
  { claim: "Ipinagbawal na ang social media para sa mga menor de edad",       category: "Pulitika"  },
  { claim: "Ang Maynila ay ang pinaka-polluted na lungsod sa buong mundo",    category: "Kalikasan" },
];

const TIPS = [
  "Gamitin ang buong sentence, hindi lang keywords",
  "Maaaring mag-paste ng headline mula sa balita",
  "I-specify ang lugar at petsa kung available",
  "I-check din ang konteksto ng statement",
];

// ── Loading overlay (verify in progress) ─────────────────────────────────────

const LOADING_STEPS = [
  "Nire-receive ang inyong claim...",
  "Naghahanap ng mga pinagkukunan...",
  "Sinusuri ang mga ebidensya...",
  "Kinakalkula ang verdict...",
];

function LoadingOverlay() {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setStepIdx((i) => (i + 1) % LOADING_STEPS.length),
      1200,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-white/92 backdrop-blur-sm">
      <div className="relative">
        <div className="h-14 w-14 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 h-14 w-14 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <Search className="absolute inset-0 m-auto h-5 w-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-black text-foreground">Sinusuri ang iyong claim...</p>
        <p className="mt-1 text-xs text-muted-foreground animate-pulse">{LOADING_STEPS[stepIdx]}</p>
      </div>
    </div>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({
  id, label, checked, disabled, onChange,
}: {
  id: string; label: string; checked: boolean;
  disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2.5 select-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <div
        className={cn(
          "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
          checked ? "bg-primary border-primary shadow-sm" : "border-border bg-white",
        )}
        onClick={() => !disabled && onChange(!checked)}
      >
        {checked && (
          <svg viewBox="0 0 10 8" className="h-3 w-3 fill-none stroke-white stroke-[2.5]">
            <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <input type="checkbox" id={id} checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </label>
  );
}

// ── Image Upload Card (OCR-powered text extraction) ───────────────────────────

interface ImageUploadProps {
  disabled: boolean;
  onClaim:  (claim: string) => void;
}

function ImageUploadCard({ disabled, onClaim }: ImageUploadProps) {
  const inputRef                            = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]             = useState(false);
  const [preview, setPreview]               = useState<string | null>(null);
  const [fileName, setFileName]             = useState<string | null>(null);
  const [fileSize, setFileSize]             = useState<string | null>(null);
  const [isExtracting, setIsExtracting]     = useState(false);
  const [ocrError, setOcrError]             = useState<string | null>(null);
  const [ocrSuccess, setOcrSuccess]         = useState(false);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const processFile = useCallback(async (file: File) => {
    if (disabled) return;
    if (!ALLOWED_MIME.includes(file.type.toLowerCase())) {
      setOcrError("Hindi supportado ang format na ito. Gamitin ang JPG, PNG, o WebP.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setOcrError(`File ay masyadong malaki (${formatSize(file.size)}). Maximum ay ${MAX_FILE_MB} MB para sa OCR.`);
      return;
    }

    // Show preview immediately
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setFileSize(formatSize(file.size));
    setOcrError(null);
    setOcrSuccess(false);

    // Run OCR + claim extraction directly in the browser (no Worker round-trip)
    setIsExtracting(true);
    try {
      const result = await extractTextFromImageBrowser(file);
      if (result.success) {
        const fill = (result.suggestedClaim?.trim() || result.text?.trim()) ?? "";
        if (fill) {
          onClaim(fill);
          setOcrSuccess(true);
        } else {
          setOcrError("Walang nahanap na teksto sa larawan. Subukan ang mas malinaw na screenshot.");
        }
      } else {
        setOcrError(
          result.error ??
          "Hindi nakuha ang teksto mula sa larawan. Subukan ang ibang larawan o i-type na lang ang claim.",
        );
      }
    } catch (err) {
      setOcrError(
        err instanceof Error
          ? err.message
          : "Hindi ma-konekta sa OCR service. Subukang muli.",
      );
    } finally {
      setIsExtracting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, preview, onClaim]);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    void processFile(list[0]);
  }, [processFile]);

  const handleRemove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    setOcrError(null);
    setOcrSuccess(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Dropzone (no image yet) ──────────────────────────────────────────────
  if (!preview) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "w-full rounded-xl border-2 border-dashed py-7 flex flex-col items-center gap-3 text-center transition-all duration-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            dragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/40 hover:bg-muted/30",
          )}
        >
          <div className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center transition-colors",
            dragging ? "bg-primary/15" : "bg-muted",
          )}>
            <ScanText className={cn("h-5 w-5", dragging ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              I-drag &amp; drop o mag-<span className="text-primary underline">click</span> para pumili
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WebP · max {MAX_FILE_MB} MB · isang larawan lamang
            </p>          </div>
        </button>

        {/* OCR info notice */}
        <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <ScanText className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            <span className="font-bold">OCR Text Extraction.</span>{" "}
            Awtomatikong mababasa ang teksto mula sa larawan o screenshot at ilalagay sa claim box para ma-edit mo bago suriin.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>
    );
  }

  // ── Image preview (uploaded) ─────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border-2 border-border overflow-hidden">

        {/* Preview row */}
        <div className="flex items-center gap-4 p-4 bg-muted/30">
          <img
            src={preview}
            alt="Uploaded preview"
            className="h-20 w-20 rounded-lg object-cover shrink-0 border border-border shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fileSize}</p>

            {/* Status line below file info */}
            {isExtracting && (
              <div className="flex items-center gap-1.5 mt-2">
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                <p className="text-xs text-primary font-medium">Binabasa ang teksto...</p>
              </div>
            )}
            {!isExtracting && ocrSuccess && (
              <div className="flex items-center gap-1.5 mt-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-700 font-medium">Nakuha ang teksto — makikita sa claim box.</p>
              </div>
            )}
            {!isExtracting && !ocrSuccess && !ocrError && (
              <p className="text-xs text-muted-foreground mt-1.5 italic">
                Naghihintay ng OCR result...
              </p>
            )}
          </div>

          {/* Remove button — disabled while OCR is running */}
          {!disabled && !isExtracting && (
            <button
              type="button"
              onClick={handleRemove}
              className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Alisin ang larawan"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* OCR error strip */}
        {ocrError && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border-t border-red-200">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-800 leading-relaxed">{ocrError}</p>
              <button
                type="button"
                onClick={handleRemove}
                className="mt-1.5 text-xs font-bold text-red-600 hover:underline"
              >
                Subukan ang ibang larawan
              </button>
            </div>
          </div>
        )}

        {/* Success strip */}
        {ocrSuccess && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border-t border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-800">
              <span className="font-bold">Tagumpay!</span> I-edit ang teksto sa claim box kung kinakailangan, pagkatapos ay pindutin ang Suriin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Collapsible Image Upload ──────────────────────────────────────────────────

function ImageUploadCollapsible({
  disabled,
  onClaim,
}: {
  disabled: boolean;
  onClaim: (claim: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border-2 border-border bg-white shadow-sm overflow-hidden">
      {/* Toggle header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ImagePlus className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold text-foreground">
            Mag-upload ng Larawan o Screenshot{" "}
            <span className="font-normal text-muted-foreground">(opsyonal)</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
            <ScanText className="h-2.5 w-2.5" />
            OCR
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="px-6 pb-6 border-t border-border">
          <div className="pt-5">
            <ImageUploadCard disabled={disabled} onClaim={onClaim} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const location = useLocation();
  const [claim, setClaim]                       = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [optionsOpen, setOptionsOpen]           = useState(false);
  const [opts, setOpts]                         = useState({
    crossReference:    true,
    checkSocialMedia:  false,
    includeHistorical: true,
  });
  const [intentError, setIntentError]           = useState<string | null>(null);

  const { mutate, isPending, error, reset } = useVerify();

  // Pre-fill claim from HomePage search bar navigation
  useEffect(() => {
    const state = location.state as { claim?: string; autoSubmit?: boolean } | null;
    if (state?.claim && state.claim.trim().length > 0) {
      const filled = state.claim.trim().slice(0, MAX_CHARS);
      setClaim(filled);
      // Clear the router state so a page refresh doesn't re-fill
      window.history.replaceState({}, "");
      // Auto-submit if the home page Suriin button was clicked
      if (state.autoSubmit && filled.trim().length >= 10) {
        const detection = shouldRunVerificationPipeline(filled);
        if (detection.shouldVerify) {
          setIntentError(null);
          mutate({ claim: filled.trim(), category: undefined });
        } else {
          setIntentError(detection.reason);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = claim.trim().length >= 10 && !isPending;
  const charsLeft = MAX_CHARS - claim.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const detection = shouldRunVerificationPipeline(claim.trim());
    if (!detection.shouldVerify) {
      setIntentError(detection.reason);
      return;
    }

    setIntentError(null);
    reset();
    mutate({ claim: claim.trim(), category: selectedCategory ?? undefined });
  };

  const fillExample = (exClaim: string, exCategory: Category) => {
    if (isPending) return;
    setClaim(exClaim);
    setSelectedCategory(exCategory);
    reset();
  };

  /** Called by ImageUploadCard when AI extracts a claim from image. */
  const handleImageClaim = useCallback((extracted: string) => {
    if (extracted.length <= MAX_CHARS) {
      setClaim(extracted);
      reset();
    } else {
      setClaim(extracted.slice(0, MAX_CHARS));
      reset();
    }
  }, [reset]);

  return (
    <div className="animate-page-in">
      <PageContainer className="max-w-[850px] pb-12">

        {/* ── Page header ── */}
        <div className="flex flex-col items-center text-center pt-12 pb-10 gap-4">
        <img
            src={thinkImage}
            alt="Teka thinking"
            className="h-16 w-16 object-contain"
            referrerPolicy="no-referrer"
          />
          <h1 className="text-3xl sm:text-[36px] font-black text-foreground tracking-tight">
            I-Verify ang Claim
          </h1>
          <p className="text-base leading-relaxed max-w-xl">
            <span className="text-muted-foreground">
              I-type o i-paste ang claim, o mag-upload ng larawan/screenshot.
            </span>
          </p>
        </div>

        {/* ── Verify error banner ── */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-5">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-700">May nangyaring error</p>
              <p className="text-xs text-red-600 mt-0.5">{error.message}</p>
            </div>
            <button type="button" onClick={reset} className="text-red-400 hover:text-red-600 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {intentError && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800">Hindi ito mukhang fact-check</p>
              <p className="text-xs text-amber-900 mt-0.5">{intentError}</p>
            </div>
            <button type="button" onClick={() => setIntentError(null)} className="text-amber-500 hover:text-amber-700 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px] gap-6">

          {/* ══ LEFT ══════════════════════════════════════════════════════ */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Card 1 — Claim textarea */}
            <div className="relative rounded-2xl border border-[#d9e4ff] bg-[#f8faff] p-6 shadow-sm">
              {isPending && <LoadingOverlay />}
              <p className="text-base font-black text-foreground mb-4">
                Ang Claim o Statement
              </p>
              <div className="relative">
                <Textarea
                  value={claim}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CHARS) {
                      setClaim(e.target.value);
                      if (intentError) setIntentError(null);
                    }
                  }}
                  rows={7}
                  disabled={isPending}
                  placeholder="Halimbawa: Ang Pilipinas ay may pinaka-mababang unemployment rate sa ASEAN ngayong 2026..."
                  className="w-full resize-none text-sm placeholder:text-muted-foreground/50 disabled:opacity-60 rounded-lg border-2"
                  aria-label="Ilagay ang claim na gusto mong suriin"
                />
                <span className={cn(
                  "absolute bottom-4 right-4 text-xs font-bold tabular-nums",
                  charsLeft <= 50 ? "text-red-500" : "text-muted-foreground",
                )}>
                  {claim.length}/{MAX_CHARS}
                </span>
              </div>
            </div>

            {/* Card 2 — Single image upload (collapsible) */}
            <ImageUploadCollapsible disabled={isPending} onClaim={handleImageClaim} />

            {/* Card 3 — Kategorya + checkboxes (collapsible) */}
            <div className="rounded-2xl border-2 border-border bg-white shadow-sm overflow-hidden">
              {/* Toggle header */}
              <button
                type="button"
                onClick={() => setOptionsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">
                    Kategorya at mga Opsyon{" "}
                    <span className="font-normal text-muted-foreground">(opsyonal)</span>
                  </span>
                  {!optionsOpen && selectedCategory && (
                    <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {selectedCategory}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    optionsOpen && "rotate-180",
                  )}
                />
              </button>

              {/* Collapsible body */}
              {optionsOpen && (
                <div className="px-6 pb-6 border-t border-border flex flex-col gap-5">
                  <div className="pt-5">
                    <p className="text-sm font-bold text-foreground mb-3">Kategorya</p>
                    <div className="flex flex-wrap gap-2.5">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat} type="button" disabled={isPending}
                          onClick={() => setSelectedCategory((p) => (p === cat ? null : cat))}
                          className={cn(
                            "rounded-lg border-2 px-4 py-2 text-sm font-bold transition-all",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedCategory === cat
                              ? "bg-primary border-primary text-white shadow-md"
                              : "border-border bg-white text-foreground hover:border-primary/50 hover:bg-primary/5",
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Checkbox id="cross-reference"    label="Cross-reference sources"
                      checked={opts.crossReference}    disabled={isPending}
                      onChange={(v) => setOpts((p) => ({ ...p, crossReference:    v }))} />
                    <Checkbox id="check-social"        label="Check social media"
                      checked={opts.checkSocialMedia}  disabled={isPending}
                      onChange={(v) => setOpts((p) => ({ ...p, checkSocialMedia:  v }))} />
                    <Checkbox id="include-historical"  label="Include historical data"
                      checked={opts.includeHistorical} disabled={isPending}
                      onChange={(v) => setOpts((p) => ({ ...p, includeHistorical: v }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Submit — always visible, outside the collapsibles */}
            <Button
              type="submit" disabled={!canSubmit}
              className="w-full rounded-xl py-4 text-base font-black shadow-lg hover:shadow-xl transition-all"
            >
              {isPending
                ? <><Loader2 className="h-5 w-5 animate-spin" /> Sinusuri...</>
                : <><Search  className="h-5 w-5" /> Suriin Ngayon</>}
            </Button>

            {/* Mobile examples */}
            <div className="lg:hidden rounded-xl border-2 border-border bg-white p-6 shadow-sm">
              <p className="text-base font-black text-foreground mb-4">Subukan ang mga ito:</p>
              <div className="flex flex-col gap-3">
                {EXAMPLE_CLAIMS.map(({ claim: ex, category }) => (
                  <button
                    key={ex} type="button" disabled={isPending}
                    onClick={() => fillExample(ex, category)}
                    className="text-left rounded-lg border-2 border-border p-4 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                  >
                    <p className="text-sm font-bold text-primary leading-snug">{ex}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{category}</p>
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* ══ RIGHT sidebar ══════════════════════════════════════════════ */}
          <aside className="hidden lg:flex flex-col gap-5">

            {/* Tips */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-xl leading-none">💡</span>
                <span className="text-base font-black text-amber-900">Mga Tips</span>
              </div>
              <ul className="space-y-3">
                {TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2.5 text-sm text-amber-900 leading-relaxed">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Examples */}
            <div className="rounded-2xl border border-[#d9e4ff] bg-[#f8faff] p-5 shadow-sm">
              <p className="text-base font-black text-foreground mb-4">Subukan ang mga ito:</p>
              <div className="flex flex-col gap-3">
                {EXAMPLE_CLAIMS.map(({ claim: ex, category }) => (
                  <button
                    key={ex} type="button" disabled={isPending}
                    onClick={() => fillExample(ex, category)}
                    className={cn(
                      "text-left rounded-lg border-2 border-border bg-white p-4",
                      "hover:border-primary/50 hover:bg-primary/5 hover:shadow-md transition-all duration-300",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <p className="text-sm font-bold text-primary leading-snug">{ex}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{category}</p>
                  </button>
                ))}
              </div>
            </div>

          </aside>
        </div>
      </PageContainer>
    </div>
  );
}
