// How large a frame the renderer is allowed to draw, expressed as a device pixel ratio.
//
// Cost here is dominated by fill rate rather than geometry: every canvas pixel is
// touched by the reflection pass, then the main pass, then the bloom mip chain. That
// cost grows linearly with window area and with the *square* of the pixel ratio, so a
// maximised window on a scaled 4K laptop panel asks for ~8M pixels a frame where a
// 1080p window asks for 2M. On the integrated graphics in a typical laptop that is the
// difference between a smooth 60fps and a slideshow — and it is why the game can feel
// fine in a small window and crawl once that same window is pulled out to full screen.
//
// So `devicePixelRatio` is treated as a request, not an instruction. The canvas opens at
// the highest ratio that keeps a frame inside a fixed pixel budget, and the browser
// scales the result up to fill the window. A neon scene under heavy bloom hides the
// softening well; dropped frames are far more noticeable than slightly softer edges.
//
// The budget is only a guess at the GPU, though, and a wrong guess costs either frames
// or sharpness. So it is the opening bid rather than the last word: once frames are
// actually being measured (see components/AdaptiveRenderScale.tsx) the ratio walks down
// towards DPR_FLOOR on a machine that can't keep up, or back up towards the display's
// native ratio on one that was never the problem.

/**
 * Device pixels the renderer may shade per frame. ~2.6M sits between 1080p (2.07M) and
 * 1440p (3.69M) — comfortably inside what integrated graphics can fill at 60fps with
 * this scene's reflection and bloom passes layered on top.
 */
export const PIXEL_BUDGET = 2_600_000

/**
 * Never render above this, however dense the display. Past 2× the extra pixels buy
 * almost nothing visible in a scene this soft, and cost four times a 1× frame.
 */
export const DPR_CEILING = { desktop: 2, mobile: 1.5 }

/**
 * ...and never below this, however large the window. Upscaling from much under 0.6
 * starts to break up the thin neon geometry — trails, grid lines, city outlines.
 */
export const DPR_FLOOR = 0.6

// Ratios are quantised to this step, so that dragging a window edge doesn't make the
// renderer reallocate its buffers for every intermediate pixel of width.
const DPR_STEP = 0.05

export interface ViewportMetrics {
  /** Canvas width in CSS pixels (`window.innerWidth`). */
  width: number
  /** Canvas height in CSS pixels (`window.innerHeight`). */
  height: number
  /** What the display asks for (`window.devicePixelRatio`). */
  devicePixelRatio: number
  /** Phone-class device — a tighter ceiling, since the screen is small anyway. */
  mobile?: boolean
}

function quantise(dpr: number): number {
  return Number((Math.round(dpr / DPR_STEP) * DPR_STEP).toFixed(2))
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high)
}

export interface RenderScaleBounds {
  /** Where rendering starts: the most the pixel budget affords at this window size. */
  cap: number
  /** The most this display could ever want — its own ratio, held to the ceiling. */
  top: number
}

/**
 * The range the renderer may move within on this viewport, from the budget's opening
 * guess up to what the display actually asks for. The budget is only a guess at what
 * the GPU can fill; measured frame rate decides where in the range to settle.
 */
export function resolveRenderBounds({
  width,
  height,
  devicePixelRatio,
  mobile = false,
}: ViewportMetrics): RenderScaleBounds {
  const ceiling = mobile ? DPR_CEILING.mobile : DPR_CEILING.desktop
  const requested =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1

  // Budget is width * height * dpr^2, so the affordable ratio is the square root of
  // the budget over the CSS-pixel area. A viewport with no area (a hidden tab, a
  // zero-size test harness) carries no information, so leave the request alone.
  const area = width * height
  const affordable =
    Number.isFinite(area) && area > 0 ? Math.sqrt(PIXEL_BUDGET / area) : requested

  const cap = quantise(clamp(Math.min(requested, ceiling, affordable), DPR_FLOOR, ceiling))
  return { cap, top: Math.max(quantise(Math.min(requested, ceiling)), cap) }
}

/**
 * The pixel ratio to render this viewport at before any measurement: the display's own
 * ratio, capped by the ceiling and by whatever the pixel budget affords here.
 */
export function resolveRenderDpr(metrics: ViewportMetrics): number {
  return resolveRenderBounds(metrics).cap
}

/**
 * Where the ladder starts. Matches drei's `PerformanceMonitor` initial factor, so the
 * first frame is drawn at the budget cap and measurement moves out from there.
 */
export const START_FACTOR = 0.5

/**
 * Turn a measured performance factor into a pixel ratio. The factor arrives from
 * `PerformanceMonitor` in 0..1, and the midpoint is the budget's opening guess: above
 * it the machine has shown headroom and earns its way back up towards the display's
 * native ratio, below it the machine is dropping frames and gives ground down to the
 * floor. Rendering sharper than `cap` is only ever the result of measurement, never an
 * assumption.
 */
export function dprForFactor({ cap, top }: RenderScaleBounds, factor: number): number {
  const t = clamp(Number.isFinite(factor) ? factor : START_FACTOR, 0, 1)
  const dpr =
    t >= START_FACTOR
      ? cap + (top - cap) * ((t - START_FACTOR) / (1 - START_FACTOR))
      : DPR_FLOOR + (cap - DPR_FLOOR) * (t / START_FACTOR)
  return quantise(clamp(dpr, DPR_FLOOR, top))
}
