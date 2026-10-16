// ─── Constants ────────────────────────────────────────────────────────────────

export const FRAME_W_PX = 1920;
export const FRAME_H_PX = 1080;
/** Sub-pixel tolerance for overflow / overlap detection. */
export const TOLERANCE_PX = 0.5;
/**
 * Point conversion: 1pt = 1/72 inch; at 96dpi → 1px = 0.75pt.
 * Authoring is px at 1920×1080; the validator reports 1440×810pt.
 * (PPTX export is separate: it places the raster full-bleed on a
 * LAYOUT_WIDE 13.333in×7.5in = 960×540pt canvas — see export/pptx.ts.)
 */
export const PX_TO_PT = 0.75;

/**
 * Validator hard gate: fail only below 18px. The design doctrine floor for
 * body text is 28px (see design-doctrine.md §7) — the gap is intentional so
 * captions/labels between 18–27px pass the gate while doctrine still pushes
 * generated body text to ≥28px.
 */
export const MIN_FONT_SIZE_PX = 18;
/** Timeout for document.fonts.ready await inside page.evaluate (ms). */
export const FONTS_READY_TIMEOUT_MS = 10_000;
/** Timeout for page navigation (ms). */
export const PAGE_LOAD_TIMEOUT_MS = 30_000;
