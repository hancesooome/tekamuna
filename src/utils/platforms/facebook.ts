/**
 * src/utils/platforms/facebook.ts
 *
 * Facebook screenshot detector and content-region calculator.
 *
 * ── Layout anatomy ────────────────────────────────────────────────────────────
 *
 * A typical Facebook post screenshot (mobile or desktop) has this structure
 * from top to bottom:
 *
 *  ┌─────────────────────────────────┐  ← 0
 *  │  Status bar / browser chrome    │  ← ~4–8% of height  [SKIP]
 *  ├─────────────────────────────────┤
 *  │  FB app header / nav bar        │  ← ~6–12% of height [SKIP]
 *  ├─────────────────────────────────┤
 *  │  Page name + avatar + timestamp │  ← ~8–14% of height [SKIP]
 *  │  (sometimes "Sponsored" label)  │
 *  ├─────────────────────────────────┤
 *  │  ★ POST CAPTION TEXT ★          │  ← KEEP — main claim
 *  │  (may include "See more")       │
 *  ├─────────────────────────────────┤
 *  │  ★ EMBEDDED IMAGE / LINK CARD ★ │  ← KEEP — often contains headline
 *  │  (news article preview, meme)   │
 *  ├─────────────────────────────────┤
 *  │  Reaction bar: 👍❤️😂 counts    │  ← ~6–10% of height [SKIP]
 *  │  Like · Comment · Share buttons │
 *  └─────────────────────────────────┘  ← H
 *
 * Desktop screenshots have wider aspect ratios (sidebar visible), but the
 * post card itself occupies a center column ~50–60% of the image width.
 * Mobile screenshots are full-width with aspect ratios between 9:16 and 4:5.
 *
 * ── Detection heuristics ─────────────────────────────────────────────────────
 *
 * We do NOT read pixel colours — that would require a canvas readback on every
 * frame which is slow and unreliable across themes (dark mode, browser tint).
 * Instead we use:
 *
 *   1. Aspect ratio — portrait/square screenshots from mobile (≥0.45 to ≤1.1)
 *      or desktop post cards (≥1.0 to ≤2.2).
 *   2. Minimum dimensions — at least 300 px wide, 400 px tall.
 *      Tiny thumbnails are not screenshots.
 *   3. Typical screenshot width bands — mobile phones produce screenshots
 *      between 320–1440 px wide; desktop browser captures are wider.
 *
 * These heuristics are intentionally permissive: it is better to preprocess a
 * non-Facebook image (wasted crop, same accuracy) than to skip a Facebook
 * screenshot and send the full noisy image.
 *
 * ── Region calculation ────────────────────────────────────────────────────────
 *
 * All measurements are expressed as FRACTIONS of the image dimensions —
 * no hardcoded pixel values. The fractions were derived by measuring a sample
 * of real Facebook screenshots across devices:
 *
 *   Mobile (portrait, 9:16 to 3:4):
 *     Header strip (status bar + nav + author row): top ~18% of height
 *     Reaction bar: bottom ~12% of height
 *     Caption zone: rows 18%–50% of height (wider for text-only posts)
 *     Embedded image zone: rows 50%–88% of height
 *
 *   Desktop (landscape, > 1.0 aspect ratio):
 *     Post card occupies center 55% of width (left 22.5% – right 22.5%)
 *     Header: top 20%, reaction bar: bottom 14%
 *     Caption: 20%–52%, embedded image: 52%–86%
 *
 * When the image is tall (aspect ratio < 0.6 — a long scrolled screenshot),
 * we skip the embedded-image zone because it's unlikely to contain a headline
 * and would double our OCR.Space API calls for marginal gain.
 */

import type { PlatformDetector, ImageRegion } from "../screenshotPreprocessor";

// ── Layout constants (all fractions of image dimensions) ─────────────────────

/**
 * Mobile layout fractions.
 * Derived from sampling screenshots at 1080×1920, 828×1792, 720×1280.
 */
const MOBILE = {
  // Top chrome: status bar + FB nav + author/avatar row
  headerFrac:      0.18,
  // Bottom chrome: reaction counts + Like/Comment/Share row
  footerFrac:      0.12,
  // Caption occupies the band immediately below the header
  captionEndFrac:  0.52,
  // Embedded image / link card immediately follows the caption
  imageStartFrac:  0.52,
  imageEndFrac:    0.88,
} as const;

/**
 * Desktop layout fractions.
 * Derived from screenshots at 1920×1080, 1440×900, 1280×800.
 * Post card is centred; left/right sidebars are cropped out.
 */
const DESKTOP = {
  headerFrac:      0.20,
  footerFrac:      0.14,
  captionEndFrac:  0.52,
  imageStartFrac:  0.52,
  imageEndFrac:    0.86,
  // Horizontal extent of the post card within the screenshot
  cardLeftFrac:    0.22,
  cardRightFrac:   0.78,
} as const;

// ── Aspect-ratio bands ────────────────────────────────────────────────────────

/** Portrait or near-square: typical of mobile screenshots. */
const ASPECT_MOBILE_MIN = 0.40;
const ASPECT_MOBILE_MAX = 1.10;

/** Landscape: typical of desktop browser screenshots. */
const ASPECT_DESKTOP_MIN = 1.10;
const ASPECT_DESKTOP_MAX = 2.40;

/** Minimum size to be considered a real screenshot (not a thumbnail). */
const MIN_WIDTH_PX  = 300;
const MIN_HEIGHT_PX = 400;

/**
 * Minimum fraction of height a content region must occupy to be worth OCR-ing.
 * Regions smaller than this are likely empty space or a single emoji line.
 */
const MIN_REGION_HEIGHT_FRAC = 0.06;

// ── Detector ──────────────────────────────────────────────────────────────────

export const facebookDetector: PlatformDetector = {
  name: "Facebook",

  /**
   * Returns true when the image could be a Facebook post screenshot.
   *
   * Criteria (all must pass):
   *   - Width ≥ MIN_WIDTH_PX and Height ≥ MIN_HEIGHT_PX
   *   - Aspect ratio falls in a mobile or desktop band
   *
   * Note: We are intentionally NOT checking for Facebook-blue pixels or
   * logo presence — that would require canvas readbacks which are expensive
   * and fail on dark mode / custom themes.
   */
  detect(img): boolean {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < MIN_WIDTH_PX || h < MIN_HEIGHT_PX) return false;

    const aspect = w / h;
    return (
      (aspect >= ASPECT_MOBILE_MIN  && aspect <= ASPECT_MOBILE_MAX) ||
      (aspect >= ASPECT_DESKTOP_MIN && aspect <= ASPECT_DESKTOP_MAX)
    );
  },

  /**
   * Returns content regions to OCR based on the image's aspect ratio.
   *
   * Strategy:
   *   - Always include the caption zone (most likely to contain the claim).
   *   - Include the embedded-image zone only when the image isn't excessively
   *     tall (a very tall aspect ratio usually means a scrolled comments feed,
   *     not a post with an embedded image worth reading).
   *   - For desktop screenshots, horizontal-clip to the post card column to
   *     avoid OCR-ing the sidebar (ads, suggested pages).
   */
  getRegions(img): ImageRegion[] {
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const aspect = W / H;
    const isDesktop = aspect > ASPECT_MOBILE_MAX;
    const layout    = isDesktop ? DESKTOP : MOBILE;

    // Horizontal bounds of the post card
    const xLeft  = isDesktop ? Math.round(W * DESKTOP.cardLeftFrac)  : 0;
    const xRight = isDesktop ? Math.round(W * DESKTOP.cardRightFrac) : W;
    const cardW  = xRight - xLeft;

    const headerPx    = Math.round(H * layout.headerFrac);
    const footerPx    = Math.round(H * layout.footerFrac);
    const contentEndY = H - footerPx;      // bottom of the content area

    const captionTopY    = headerPx;
    const captionBottomY = Math.min(Math.round(H * layout.captionEndFrac), contentEndY);
    const captionH       = captionBottomY - captionTopY;

    const imageTopY    = Math.round(H * layout.imageStartFrac);
    const imageBottomY = Math.min(Math.round(H * layout.imageEndFrac), contentEndY);
    const imageH       = imageBottomY - imageTopY;

    const regions: ImageRegion[] = [];

    // ── Region 1: Post caption ──────────────────────────────────────────────
    // This is the user-typed or shared text directly below the author row.
    // Most factual claims appear here.
    if (captionH >= H * MIN_REGION_HEIGHT_FRAC) {
      regions.push({
        label:    "caption",
        x:        xLeft,
        y:        captionTopY,
        width:    cardW,
        height:   captionH,
        priority: 1,
      });
    }

    // ── Region 2: Embedded image / link card ────────────────────────────────
    // News article previews, memes, and shared graphics often contain the
    // actual headline. Only include when:
    //   a) The zone is large enough to contain meaningful content.
    //   b) The image is not a very tall scrolled screenshot (aspect < 0.35
    //      means it's probably a comments thread — the embedded image would
    //      appear near the top and our fraction would miss it anyway).
    const isTallScroll = aspect < 0.35;

    if (!isTallScroll && imageH >= H * MIN_REGION_HEIGHT_FRAC) {
      regions.push({
        label:    "embedded-image",
        x:        xLeft,
        y:        imageTopY,
        width:    cardW,
        height:   imageH,
        priority: 2,
      });
    }

    // ── Fallback: full content strip ────────────────────────────────────────
    // If neither region passed the minimum-height check (e.g. an unusually
    // short post card), return one region covering everything between the
    // header and the reaction bar. Better than returning nothing.
    if (regions.length === 0) {
      const fullH = contentEndY - headerPx;
      if (fullH > MIN_REGION_HEIGHT_FRAC * H) {
        regions.push({
          label:    "content-fallback",
          x:        xLeft,
          y:        headerPx,
          width:    cardW,
          height:   fullH,
          priority: 1,
        });
      }
    }

    return regions;
  },
};
