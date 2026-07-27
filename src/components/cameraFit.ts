import { FIELD, SEA, SLBM_APEX_MAX, SLBM_CAMERA_YAW } from '../game/constants'
import type { WaveMode } from '../game/types'

// The battlefield is a wide, short world (~52 x 28 units). A fixed camera distance
// only frames it correctly at one aspect ratio: on a narrow screen the horizontal
// field of view shrinks and the outer cities fall off the sides. So the camera
// distance is derived from the viewport instead — always far enough back that the
// whole playfield fits, whatever the shape of the screen.
//
// An SLBM wave frames a far larger theatre — the coast plus a hundred units of open
// ocean — and does it from an angle, swinging the camera round so the cities compress
// against the right of the screen and the water recedes away to the left. Same solve,
// a different box to fit and a yaw to fit it from.

export const CAMERA_FOV = 50 // vertical, degrees

// What must stay on screen, with a little breathing room.
// Missiles spawn clamped to ±FIELD.maxX, so that plus a small margin is all that
// must be framed — keeping it tight matters on narrow screens, where this figure
// drives how far the camera has to retreat.
const HALF_WIDTH = Math.max(Math.abs(FIELD.minX), Math.abs(FIELD.maxX)) + 1.5
const VERTICAL_SPAN = 36 // from below the grid horizon up past the missile spawn line
const VERTICAL_CENTER = 10

interface Framing {
  /** The volume that must stay on screen. */
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Half the z extent — only the offshore view is deep enough for this to matter. */
  halfDepth: number
  /** Camera swing about world Y. Zero looks straight down -z, as the classic view does. */
  yaw: number
  /** Height the camera aims at. The box is solved about this, not about its own middle. */
  lookY: number
  /** cameraY = base + distance * rise; the gap to lookY is what tilts the view down. */
  cameraBase: number
  rise: number
  /** Slack on the solved distance. */
  margin: number
  /**
   * Solve the distance by projecting the box through the real camera basis rather than
   * with the flat formula. A head-on camera can be solved in closed form; a swung and
   * tilted one cannot — the near corner of the coast sits at half the depth of the far
   * ocean and subtends more than twice the angle, which no cos(yaw) factor captures.
   */
  exact?: boolean
}

const FRAMING: Record<WaveMode, Framing> = {
  // Chosen so the solve below reproduces the original head-on framing exactly: the box
  // is symmetric about the look height, 18 units either side, as VERTICAL_SPAN was.
  classic: {
    minX: -HALF_WIDTH,
    maxX: HALF_WIDTH,
    minY: VERTICAL_CENTER * 0.85 - VERTICAL_SPAN / 2,
    maxY: VERTICAL_CENTER * 0.85 + VERTICAL_SPAN / 2,
    halfDepth: 0,
    yaw: 0,
    lookY: VERTICAL_CENTER * 0.85,
    cameraBase: VERTICAL_CENTER,
    rise: 0.09,
    margin: 1,
  },
  // A hundred units of open ocean plus the coast, seen from off to one side and from
  // high up, so the water reads as a surface with depth rather than a line the missiles
  // crawl along. The top of the box is the highest a warhead can arc.
  slbm: {
    minX: SEA.minX - 8,
    maxX: FIELD.maxX + 6,
    minY: -2,
    maxY: SLBM_APEX_MAX + 2,
    halfDepth: SEA.halfDepth,
    yaw: SLBM_CAMERA_YAW,
    lookY: 29,
    cameraBase: 29,
    rise: 0.35,
    margin: 1.04,
    exact: true,
  },
}

// --- Exact fit ---------------------------------------------------------------------

interface Vec3 {
  x: number
  y: number
  z: number
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
function norm3(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

function poseAt(f: Framing, distance: number, centerX: number) {
  const eye: Vec3 = {
    x: centerX + Math.sin(f.yaw) * distance,
    y: f.cameraBase + distance * f.rise,
    z: Math.cos(f.yaw) * distance,
  }
  const forward = norm3(sub3({ x: centerX, y: f.lookY, z: 0 }, eye))
  // Camera right is forward x worldUp; up completes the basis.
  const right = norm3({ x: -forward.z, y: 0, z: forward.x })
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  }
  return { eye, forward, right, up }
}

/** Whether every corner of the box projects inside the frustum at this distance. */
function boxFits(f: Framing, distance: number, centerX: number, aspect: number, t: number) {
  const { eye, forward, right, up } = poseAt(f, distance, centerX)
  for (const x of [f.minX, f.maxX]) {
    for (const y of [f.minY, f.maxY]) {
      for (const z of [-f.halfDepth, f.halfDepth]) {
        const rel = sub3({ x, y, z }, eye)
        const depth = dot3(rel, forward)
        if (depth <= 0) return false
        if (Math.abs(dot3(rel, up)) > t * depth) return false
        if (Math.abs(dot3(rel, right)) > t * aspect * depth) return false
      }
    }
  }
  return true
}

const SOLVE_MAX_DISTANCE = 4000

/** Smallest distance at which the whole box is on screen, by bisection. */
function solveExact(f: Framing, centerX: number, aspect: number, t: number): number {
  if (!boxFits(f, SOLVE_MAX_DISTANCE, centerX, aspect, t)) return SOLVE_MAX_DISTANCE
  let lo = 1
  let hi = SOLVE_MAX_DISTANCE
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (boxFits(f, mid, centerX, aspect, t)) hi = mid
    else lo = mid
  }
  return hi
}

export interface CameraFit {
  distance: number
  cameraY: number
  lookY: number
  fogNear: number
  fogFar: number
  /** Radians about world Y; 0 is the classic head-on view. */
  yaw: number
  /** The x the camera orbits and looks at. */
  centerX: number
}

export function computeCameraFit(aspect: number, mode: WaveMode = 'classic'): CameraFit {
  const f = FRAMING[mode]
  const halfFov = (CAMERA_FOV * Math.PI) / 180 / 2
  const t = Math.tan(halfFov)
  const centerX = (f.minX + f.maxX) / 2

  // Vertical: the frustum is centred on the look height, not on the middle of the box,
  // so whichever side of the look axis reaches further is what has to be fitted.
  const halfHeight = Math.max(f.maxY - f.lookY, f.lookY - f.minY)
  // Horizontal: swinging the camera round foreshortens the x extent by cos(yaw) but
  // swings the depth of the box into view by sin(yaw), so both contribute.
  const halfWidth =
    ((f.maxX - f.minX) / 2) * Math.cos(f.yaw) + f.halfDepth * Math.sin(f.yaw)

  const forHeight = halfHeight / t
  const forWidth = aspect > 0 ? halfWidth / (t * aspect) : forHeight
  const flat = Math.max(forHeight, forWidth)
  const distance = (f.exact && aspect > 0 ? solveExact(f, centerX, aspect, t) : flat) * f.margin

  return {
    distance,
    // Keep the same gentle downward tilt at every distance.
    cameraY: f.cameraBase + distance * f.rise,
    lookY: f.lookY,
    yaw: f.yaw,
    centerX,
    // Fog has to track the camera, or pulling back would bury the scene in it.
    fogNear: distance * 0.75,
    fogFar: distance * 3.2,
  }
}

/**
 * The volume a mode promises to keep on screen. Derived from the same framing table the
 * solve uses, so the framing tests can't drift away from what the camera actually does.
 */
export function framedBox(mode: WaveMode) {
  const { minX, maxX, minY, maxY, halfDepth } = FRAMING[mode]
  return { minX, maxX, minY, maxY, halfDepth }
}

/** Where the camera sits for a fit, written into `out`. */
export function cameraPosition(fit: CameraFit, out: { x: number; y: number; z: number }) {
  out.x = fit.centerX + Math.sin(fit.yaw) * fit.distance
  out.y = fit.cameraY
  out.z = Math.cos(fit.yaw) * fit.distance
  return out
}
