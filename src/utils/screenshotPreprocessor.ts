/**
 * src/utils/screenshotPreprocessor.ts
 *
 * Platform-agnostic screenshot preprocessing module.
 *
 * Responsibilities:
 *   1. Load an image File into an HTMLImageElement (browser Canvas API)
 *   2. Detect which social media platform the screenshot is from
 *   3. Ask the matching platform detector for content regions to OCR
 *   4. Crop each region to a separate Blob (JPEG, quality 0.92)
 *   5. Return cropped Blobs in reading order, ready to send to OCR.Space
 *
 * If no platform is detected, the original file is returned unchanged so
 * the pipeline degrades gracefully to full-image OCR.
 *
 * Extensibility:
 *   To support a new platform (TikTok, X, Instagram, YouTube):
 *     1. Create src/utils/platforms/<name>.ts
 *     2. Implement PlatformDetector
 *     3. Register it in PLATFORM_DETECTORS below — no other changes needed.
 *
 * Canvas usage note:
 *   We use OffscreenCanvas when available (Chrome 69+, Firefox 105+) and fall
 *   back to a regular <canvas> element. This avoids layout-thrashing on the
 *   main thread and works in Web Workers if needed in the future.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A rectangular region of the image to OCR, in pixels relative to the
 * top-left corner of the original image (not scaled).
 */
export interface ImageRegion {
  /** Unique name for logging / debugging. */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Priority for reading order (lower = earlier in merged output).
   * Regions with the same priority are sorted top-to-bottom by their y coord.
   */
  priority: number;
}

/**
 * A cropped image blob paired with its source region metadata.
 */
export interface CroppedRegion {
  label:  string;
  blob:   Blob;
  region: ImageRegion;
  /** Dimensions of the cropped blob (after any upscaling). */
  width:  number;
  height: number;
}

/**
 * What a platform detector must implement.
 * Each platform module exports a single object of this type.
 */
export interface PlatformDetector {
  /** Short name used in log messages. */
  readonly name: string;

  /**
   * Returns true when this image looks like a screenshot from this platform.
   * Receives the decoded image and its raw dimensions — no pixel inspection,
   * only aspect-ratio and dimension heuristics (fast, no canvas reads).
   */
  detect(img: HTMLImageElement): boolean;

  /**
   * Returns content regions to OCR, in reading order, based purely on
   * the image's dimensions and known layout proportions for this platform.
   * Must never return regions that extend outside [0, 0, w, h].
   */
  getRegions(img: HTMLImageElement): ImageRegion[];
}

/**
 * Result returned by preprocessScreenshot().
 */
export interface PreprocessResult {
  /** The platform that was detected, or "unknown". */
  platform: string;
  /**
   * Cropped blobs in reading order, ready to POST to OCR.Space one by one.
   * Empty array means no preprocessing happened — use the original file.
   */
  regions: CroppedRegion[];
  /** Original image dimensions. */
  imageWidth:  number;
  imageHeight: number;
  /** How long preprocessing took (ms). Useful for timing comparisons. */
  preprocessingMs: number;
}

// ── Platform registry ─────────────────────────────────────────────────────────
// Import detectors here. Evaluated in order — first match wins.

import { facebookDetector } from "./platforms/facebook";

const PLATFORM_DETECTORS: PlatformDetector[] = [
  facebookDetector,
  // tiktokDetector,    ← add here when ready
  // twitterDetector,
  // instagramDetector,
  // youtubeDetector,
];

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Minimum region dimension in pixels.
 * Regions smaller than this are likely degenerate and are skipped.
 */
const MIN_REGION_PX = 20;

/**
 * Target minimum height for a cropped region sent to OCR.Space.
 * If a region is shorter than this we upscale it so Tesseract has enough
 * pixels to work with — small text is the #1 cause of OCR errors.
 */
const MIN_OCR_HEIGHT_PX = 100;

/**
 * JPEG quality for cropped region blobs.
 * 0.92 keeps file size small while preserving legible text.
 */
const CROP_JPEG_QUALITY = 0.92;

// ── Image loader ──────────────────────────────────────────────────────────────

/**
 * Decode a File into an HTMLImageElement.
 * The object URL is revoked immediately after load to free memory.
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to decode image.")); };
    img.src = url;
  });
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

/**
 * Create a canvas (OffscreenCanvas when available, else <canvas>).
 * Returns a { canvas, ctx } pair ready to draw into.
 */
function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get OffscreenCanvas 2D context.");
    return { canvas, ctx };
  }

  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get Canvas 2D context.");
  return { canvas, ctx };
}

/**
 * Convert a canvas to a JPEG Blob.
 * Works for both HTMLCanvasElement and OffscreenCanvas.
 */
async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas.toBlob returned null."));
      },
      "image/jpeg",
      quality,
    );
  });
}

// ── Region cropper ────────────────────────────────────────────────────────────

/**
 * Crop a single region from an image and return a JPEG Blob.
 *
 * If the cropped region is shorter than MIN_OCR_HEIGHT_PX, the canvas is
 * scaled up proportionally so Tesseract has enough pixels to recognize text.
 *
 * @param img     Decoded image element.
 * @param region  Pixel coordinates relative to the full image.
 */
export async function cropRegion(
  img: HTMLImageElement,
  region: ImageRegion,
): Promise<CroppedRegion> {
  // Clamp to image bounds to be safe
  const x = Math.max(0, Math.round(region.x));
  const y = Math.max(0, Math.round(region.y));
  const w = Math.min(Math.round(region.width),  img.naturalWidth  - x);
  const h = Math.min(Math.round(region.height), img.naturalHeight - y);

  if (w < MIN_REGION_PX || h < MIN_REGION_PX) {
    throw new Error(
      `Region "${region.label}" is too small (${w}×${h}px). Minimum is ${MIN_REGION_PX}px.`,
    );
  }

  // Scale up short regions for better OCR accuracy
  const scale = h < MIN_OCR_HEIGHT_PX ? MIN_OCR_HEIGHT_PX / h : 1;
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const { canvas, ctx } = createCanvas(outW, outH);
  ctx.drawImage(img, x, y, w, h, 0, 0, outW, outH);

  const blob = await canvasToBlob(canvas, CROP_JPEG_QUALITY);

  return { label: region.label, blob, region, width: outW, height: outH };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * preprocessScreenshot
 *
 * Entry point for the preprocessing pipeline.
 *
 * 1. Decodes the image.
 * 2. Tries each registered platform detector.
 * 3. If a match is found, computes content regions and crops them.
 * 4. Returns cropped blobs in reading order.
 *
 * If detection fails or cropping fails for all regions, returns an empty
 * `regions` array — the caller should fall back to full-image OCR.
 *
 * @param file  The original image File from the browser input.
 */
export async function preprocessScreenshot(file: File): Promise<PreprocessResult> {
  const t0 = performance.now();

  // ── 1. Decode image ───────────────────────────────────────────────────────
  let img: HTMLImageElement;
  try {
    img = await loadImageFromFile(file);
  } catch {
    return {
      platform: "unknown", regions: [],
      imageWidth: 0, imageHeight: 0,
      preprocessingMs: performance.now() - t0,
    };
  }

  const { naturalWidth: W, naturalHeight: H } = img;

  // ── 2. Detect platform ────────────────────────────────────────────────────
  const detector = PLATFORM_DETECTORS.find((d) => d.detect(img));

  if (!detector) {
    return {
      platform: "unknown", regions: [],
      imageWidth: W, imageHeight: H,
      preprocessingMs: performance.now() - t0,
    };
  }

  // ── 3. Get content regions ────────────────────────────────────────────────
  const rawRegions = detector.getRegions(img);

  if (rawRegions.length === 0) {
    return {
      platform: detector.name, regions: [],
      imageWidth: W, imageHeight: H,
      preprocessingMs: performance.now() - t0,
    };
  }

  // Sort by priority then by y position (reading order)
  const sortedRegions = [...rawRegions].sort(
    (a, b) => a.priority - b.priority || a.y - b.y,
  );

  // ── 4. Crop each region ───────────────────────────────────────────────────
  const croppedRegions: CroppedRegion[] = [];

  for (const region of sortedRegions) {
    try {
      const cropped = await cropRegion(img, region);
      croppedRegions.push(cropped);
    } catch {
      // Skip regions that fail to crop — others will still be used
    }
  }

  const preprocessingMs = performance.now() - t0;

  return {
    platform: detector.name,
    regions:  croppedRegions,
    imageWidth:  W,
    imageHeight: H,
    preprocessingMs,
  };
}
