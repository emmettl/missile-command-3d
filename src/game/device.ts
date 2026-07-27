// Device capability detection, resolved once at startup. Used to scale rendering
// cost down on phones — the reflective floor in particular re-renders the scene to
// a texture every frame, which a mobile GPU cannot afford.

function query(q: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q).matches
    : false
}

const coarsePointer = query('(pointer: coarse)')
const smallScreen =
  typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) < 820 : false

/** Touch-first device on a phone/small-tablet screen. */
export const isMobile = coarsePointer && smallScreen

/** Touch input available at all (includes large tablets). */
export const isTouch = coarsePointer

export const quality = {
  /** Screen-space reflections are the single most expensive effect; desktop only. */
  reflections: !isMobile,
  // The device pixel ratio is capped too, but it depends on the current window size
  // rather than the device alone — see renderScale.ts / useRenderDpr.ts.
  starCount: isMobile ? 220 : 600,
  bloomIntensity: isMobile ? 0.7 : 0.9,
  /** Sparks are cheap, but fewer of them keeps overdraw down on tiled GPUs. */
  sparkCount: isMobile ? 16 : 26,
}
