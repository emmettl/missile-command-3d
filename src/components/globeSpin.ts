// Turning the attract globe by hand.
//
// The globe idles at a slow drift and can be dragged; letting go of a fast drag leaves
// it spinning on, shedding the flick until it settles back to the drift. Tilt is dragged
// the same way but clamped, because a globe that can be rolled past its own poles stops
// reading as a planet.

/** Radians per second the globe turns when nobody is touching it. */
export const IDLE_SPIN = 0.12

/**
 * Resting tilt. Positive brings the north pole towards the camera, which is where this
 * wants to sit: the great circle between any two northern capitals runs over the Arctic,
 * so the pole is where the exchange actually happens.
 */
export const TILT_DEFAULT = 0.48
/** Far enough either way to look under the equator or down onto the pole, no further. */
export const TILT_MIN = -0.35
export const TILT_MAX = 1.25

export const YAW_PER_PIXEL = 0.0062
export const TILT_PER_PIXEL = 0.0046

/** Ceiling on the spin a release can carry, so a fast swipe doesn't blur the globe. */
export const FLICK_MAX = 3.2
/** Seconds for a flick to shed most of itself. */
export const FLICK_DECAY = 0.62

export interface Spin {
  /** Yaw velocity on top of the idle drift, in radians per second. */
  velocity: number
  tilt: number
}

export function newSpin(): Spin {
  return { velocity: 0, tilt: TILT_DEFAULT }
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high)
}

/**
 * Apply a pointer movement. Tilt is adjusted in place; the yaw is returned rather than
 * stored, because it is added straight onto the globe's rotation and never accumulates
 * here. Dragging right turns the near face right, dragging down brings the pole over —
 * the globe follows the finger.
 */
export function dragBy(spin: Spin, dxPixels: number, dyPixels: number): number {
  spin.tilt = clamp(spin.tilt + dyPixels * TILT_PER_PIXEL, TILT_MIN, TILT_MAX)
  return dxPixels * YAW_PER_PIXEL
}

/** Remember how fast the globe was being turned, so releasing mid-drag carries on. */
export function setFlick(spin: Spin, yawThisFrame: number, dt: number): void {
  if (dt <= 0) return
  spin.velocity = clamp(yawThisFrame / dt, -FLICK_MAX, FLICK_MAX)
}

/**
 * The idle drift plus whatever is left of a flick, as a yaw delta for this frame. Decays
 * in place, frame-rate independently.
 */
export function settle(spin: Spin, dt: number): number {
  spin.velocity *= Math.exp(-dt / FLICK_DECAY)
  if (Math.abs(spin.velocity) < 1e-4) spin.velocity = 0
  return (IDLE_SPIN + spin.velocity) * dt
}
