import { Vector3 } from 'three'
import { latLonDir } from './earth'

// Missile exchanges for the attract screen: warheads tracing great circles between real
// places while the globe turns. Nobody is playing, so this is pure theatre — but it is
// the theatre that says what the game is before you have pressed anything.

/** Real places, so the exchange traces routes that look like routes. */
const SITES: [number, number][] = [
  [40.7, -74.0], // New York
  [34.0, -118.2], // Los Angeles
  [51.5, -0.1], // London
  [48.9, 2.4], // Paris
  [52.5, 13.4], // Berlin
  [55.8, 37.6], // Moscow
  [55.0, 82.9], // Novosibirsk
  [39.9, 116.4], // Beijing
  [35.7, 139.7], // Tokyo
  [28.6, 77.2], // Delhi
  [-33.9, 151.2], // Sydney
  [-23.5, -46.6], // São Paulo
  [-33.9, 18.4], // Cape Town
  [45.4, -75.7], // Ottawa
  [37.6, 126.9], // Seoul
  [19.4, -99.1], // Mexico City
]

const DIRS = SITES.map(([lat, lon]) => latLonDir(lat, lon))

export interface Exchange {
  from: Vector3
  to: Vector3
  /** 0..1 along the arc; negative while the launcher waits its turn. */
  progress: number
  /** Seconds the whole flight takes. */
  duration: number
  /** Seconds the impact flash stays up after arrival. */
  flash: number
}

export const ARC_SEGMENTS = 40
/** How far off the surface the arc bellies out, as a fraction of the globe radius. */
export const ARC_LIFT = 0.22

type Rng = () => number

/**
 * Great-circle interpolation between two unit directions. Written out rather than gone
 * via quaternions because the degenerate case — two nearly identical points — needs to
 * fall back rather than divide by a sine of nearly zero.
 */
const _axis = new Vector3()
const _perp = new Vector3()

export function slerpDir(a: Vector3, b: Vector3, u: number, out: Vector3): Vector3 {
  const dot = Math.min(1, Math.max(-1, a.dot(b)))
  const theta = Math.acos(dot)
  if (theta < 1e-4) return out.copy(b)
  const s = Math.sin(theta)
  if (s < 1e-6) {
    // Antipodal, or near enough that dividing by sin(theta) would blow up: the two
    // points are joined by infinitely many great circles and the weighted sum cancels
    // to nothing. Any one of those circles will do, so pick a perpendicular and swing
    // around it. Two cities on opposite sides of the world is a shot the game should
    // be able to draw.
    _axis.set(Math.abs(a.x) < 0.9 ? 1 : 0, Math.abs(a.x) < 0.9 ? 0 : 1, 0)
    _perp.copy(_axis).cross(a).normalize()
    return out.copy(a).applyAxisAngle(_perp, theta * u)
  }
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - u) * theta) / s)
    .addScaledVector(b, Math.sin(u * theta) / s)
}

/** A point on the flight path, lifted off the surface by a sine bulge. */
export function arcPoint(
  from: Vector3,
  to: Vector3,
  u: number,
  radius: number,
  out: Vector3,
): Vector3 {
  const t = Math.min(1, Math.max(0, u))
  slerpDir(from, to, t, out).normalize()
  // Longer shots arc higher, exactly as they do in the game proper.
  const reach = Math.acos(Math.min(1, Math.max(-1, from.dot(to)))) / Math.PI
  return out.multiplyScalar(radius * (1 + ARC_LIFT * reach * Math.sin(Math.PI * t)))
}

/** A fresh exchange between two different places, staggered so they don't all fly at once. */
export function newExchange(rng: Rng = Math.random): Exchange {
  const a = Math.floor(rng() * DIRS.length)
  let b = Math.floor(rng() * DIRS.length)
  if (b === a) b = (b + 1 + Math.floor(rng() * (DIRS.length - 1))) % DIRS.length
  return {
    from: DIRS[a],
    to: DIRS[b],
    progress: -rng() * 6, // waiting to launch
    duration: 3.4 + rng() * 3.6,
    flash: 0,
  }
}

/**
 * Advance one exchange. Returns true on the frame it lands, so the caller can set off
 * the flash. Recycles itself into a new pair of cities once the flash has burned out.
 */
export function stepExchange(ex: Exchange, dt: number, rng: Rng = Math.random): boolean {
  if (ex.flash > 0) {
    ex.flash -= dt
    if (ex.flash <= 0) Object.assign(ex, newExchange(rng))
    return false
  }
  const before = ex.progress
  ex.progress += dt / ex.duration
  if (before < 1 && ex.progress >= 1) {
    ex.progress = 1
    ex.flash = 1.1
    return true
  }
  return false
}

/** In flight — before this it is still on the pad, after it has already landed. */
export function inFlight(ex: Exchange): boolean {
  return ex.progress > 0 && ex.progress < 1
}
