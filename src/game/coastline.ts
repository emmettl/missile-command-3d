import { FIELD, SEA } from './constants'

// The offshore view is a chart, so it wants a chart's furniture: a coastline drawn as a
// vector outline, a couple of depth contours stepping out into deep water, and a few
// islands. All of it is generated rather than drawn by hand, but generated *the same way
// every time* — the shore has to be in the same place on every wave and in every session,
// or it stops reading as a place.
//
// The shore runs along z, with the sea to -x and the land (batteries, cities) to +x. It
// is a plain function of z, which is what keeps it from ever folding back over itself.

/** Where the water meets the land, seaward of the outermost battery. */
export const SHORE_X = -31
/** How far the shore wanders either side of that. Bounded, and the bounds are tested: */
export const SHORE_WANDER = 4.5
/** Far enough along z to run past the edge of frame at any aspect ratio. */
export const SHORE_HALF_LENGTH = 230
const SHORE_STEP = 2.4 // metres between vertices
const SHORE_PERIOD = 46 // metres per unit of noise; bay-to-bay distance

const SEED = 0x5c0a57

export interface CoastPoint {
  x: number
  z: number
}

// --- Deterministic value noise ------------------------------------------------------

function hash01(i: number, seed: number): number {
  let h = Math.imul(i ^ seed, 2654435761)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function noise1(t: number, seed: number): number {
  const i = Math.floor(t)
  const f = t - i
  const u = f * f * (3 - 2 * f) // smoothstep, so the shore has no corners
  return hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u
}

/** Summed octaves in 0..1: broad bays with headlands and inlets cut into them. */
function fbm(t: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += noise1(t * freq, seed + o * 1013) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.07
  }
  return sum / norm
}

// --- The shore ----------------------------------------------------------------------

/**
 * A line at a given remove from the coast: the shore itself at `offset` 0, depth
 * contours at increasing negative offsets. Contours are noisier and slacker than the
 * shore, the way real ones are.
 */
export function coastPath(offset = 0, seed = SEED, wander = SHORE_WANDER): CoastPoint[] {
  const points: CoastPoint[] = []
  const detail = offset === 0 ? 4 : 3
  for (let z = -SHORE_HALF_LENGTH; z <= SHORE_HALF_LENGTH; z += SHORE_STEP) {
    const n = fbm(z / SHORE_PERIOD, seed, detail) - 0.5
    points.push({ x: SHORE_X + offset + n * 2 * wander, z })
  }
  return points
}

/** Depth contours stepping out into deep water, seaward of the shore. */
export const CONTOUR_OFFSETS = [-9, -21, -37] as const

export function contourPaths(): CoastPoint[][] {
  return CONTOUR_OFFSETS.map((offset, i) =>
    // Each contour gets its own seed, so they wander independently instead of reading
    // as three copies of the same line.
    coastPath(offset, SEED + 7919 * (i + 1), SHORE_WANDER * (1.4 + i * 0.5)),
  )
}

// --- Islands ------------------------------------------------------------------------

const ISLAND_COUNT = 5
/** Kept clear of the shore and of the water the boats work in. */
const ISLAND_MIN_X = SEA.minX + 14
const ISLAND_MAX_X = SHORE_X - 24

/** Closed outlines, roughly circular with a noisy edge. */
export function islandPaths(): CoastPoint[][] {
  const islands: CoastPoint[][] = []
  for (let i = 0; i < ISLAND_COUNT; i++) {
    const cx = ISLAND_MIN_X + hash01(i * 31 + 1, SEED) * (ISLAND_MAX_X - ISLAND_MIN_X)
    const cz = (hash01(i * 31 + 2, SEED) - 0.5) * 2 * (SHORE_HALF_LENGTH * 0.55)
    const radius = 3.5 + hash01(i * 31 + 3, SEED) * 7
    const seed = SEED + i * 977
    const steps = 26
    const ring: CoastPoint[] = []
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2
      // Noise sampled around the circle, wrapping so the ring closes cleanly.
      const wobble = 0.62 + fbm((Math.cos(a) + 1.7) * 1.9 + Math.sin(a) * 1.3, seed, 3) * 0.8
      ring.push({ x: cx + Math.cos(a) * radius * wobble, z: cz + Math.sin(a) * radius * wobble })
    }
    islands.push(ring)
  }
  return islands
}

/** The furthest inland the generated shore can reach — nothing may be built seaward. */
export const SHORE_LANDWARD_LIMIT = FIELD.minX

/** Far enough inland to run off the back of the frame. */
export const LAND_FAR_X = 260

/** How far the coastal glow bleeds out into the water. */
export const GLOW_WIDTH = 15

/**
 * A band of light running seaward from the shore, as a triangle strip with a companion
 * alpha per vertex: opaque along the coast, nothing at the outer edge.
 *
 * This is the thing that makes a chart of this kind read the way it does. The outline on
 * its own is a hard line between two flat fills; the light bleeding off it into the
 * water is what gives the coast a glow to sit in, and the water something to be lit by.
 */
export function coastGlowStrip(shore: CoastPoint[] = coastPath()): {
  positions: Float32Array
  alphas: Float32Array
} {
  const positions = new Float32Array(shore.length * 2 * 3)
  const alphas = new Float32Array(shore.length * 2)
  let i = 0
  let a = 0
  for (const p of shore) {
    positions[i++] = p.x
    positions[i++] = 0
    positions[i++] = p.z
    alphas[a++] = 1
    positions[i++] = p.x - GLOW_WIDTH
    positions[i++] = 0
    positions[i++] = p.z
    alphas[a++] = 0
  }
  return { positions, alphas }
}

/**
 * The land as a triangle strip: the shore on one edge, off the back of the map on the
 * other. Filling it is what makes the outline read as a coast rather than as a line
 * drawn on the sea — the grid stops at the water's edge.
 */
export function landStrip(shore: CoastPoint[] = coastPath()): Float32Array {
  const verts = new Float32Array(shore.length * 2 * 3)
  let i = 0
  for (const p of shore) {
    verts[i++] = p.x
    verts[i++] = 0
    verts[i++] = p.z
    verts[i++] = LAND_FAR_X
    verts[i++] = 0
    verts[i++] = p.z
  }
  return verts
}
