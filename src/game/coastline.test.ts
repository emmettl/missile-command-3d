import { describe, expect, it } from 'vitest'
import { BATTERIES, SEA } from './constants'
import {
  CONTOUR_OFFSETS,
  GLOW_WIDTH,
  coastGlowStrip,
  SHORE_HALF_LENGTH,
  SHORE_WANDER,
  SHORE_X,
  coastPath,
  contourPaths,
  islandPaths,
  landStrip,
  stripIndices,
} from './coastline'

describe('coastline', () => {
  const shore = coastPath()

  it('is the same coastline every time it is generated', () => {
    // A shore that moved between waves would stop reading as a place.
    expect(coastPath()).toEqual(shore)
    expect(islandPaths()).toEqual(islandPaths())
  })

  it('runs the length of the frame without folding back on itself', () => {
    expect(shore.length).toBeGreaterThan(100)
    expect(shore[0].z).toBe(-SHORE_HALF_LENGTH)
    expect(shore[shore.length - 1].z).toBeGreaterThanOrEqual(SHORE_HALF_LENGTH - 3)
    for (let i = 1; i < shore.length; i++) {
      expect(shore[i].z).toBeGreaterThan(shore[i - 1].z)
    }
  })

  it('wanders, but stays inside its band', () => {
    const xs = shore.map((p) => p.x)
    const min = Math.min(...xs)
    const max = Math.max(...xs)
    expect(min).toBeGreaterThanOrEqual(SHORE_X - SHORE_WANDER)
    expect(max).toBeLessThanOrEqual(SHORE_X + SHORE_WANDER)
    // ...and actually wanders, rather than being a straight line with extra vertices.
    expect(max - min).toBeGreaterThan(SHORE_WANDER)
  })

  it('never washes over the batteries or out into the boats’ water', () => {
    for (const p of shore) {
      // Land stays land: the outermost battery must not end up offshore.
      expect(p.x).toBeLessThan(Math.min(...BATTERIES.map((b) => b.x)))
      // ...and the shore must not reach the water the submarines work in.
      expect(p.x).toBeGreaterThan(SEA.maxX)
    }
  })

  it('has no visible corners', () => {
    // Smoothstep interpolation, so consecutive vertices should never jump.
    for (let i = 1; i < shore.length; i++) {
      expect(Math.abs(shore[i].x - shore[i - 1].x)).toBeLessThan(1.5)
    }
  })

  describe('depth contours', () => {
    const contours = contourPaths()

    it('step out to sea in order, seaward of the shore', () => {
      expect(contours).toHaveLength(CONTOUR_OFFSETS.length)
      const means = contours.map((c) => c.reduce((s, p) => s + p.x, 0) / c.length)
      const shoreMean = shore.reduce((s, p) => s + p.x, 0) / shore.length
      expect(means[0]).toBeLessThan(shoreMean)
      for (let i = 1; i < means.length; i++) expect(means[i]).toBeLessThan(means[i - 1])
    })

    it('wander independently rather than tracing the shore', () => {
      const [first] = contours
      const offsets = first.map((p, i) => p.x - shore[i].x)
      const spread = Math.max(...offsets) - Math.min(...offsets)
      expect(spread).toBeGreaterThan(2)
    })
  })

  describe('coastal glow', () => {
    const { positions, alphas } = coastGlowStrip(shore)

    it('runs seaward from the shore and fades out', () => {
      expect(alphas.length).toBe(shore.length * 2)
      for (let i = 0; i < shore.length; i++) {
        const inner = i * 2
        const outer = inner + 1
        expect(alphas[inner]).toBe(1) // lit against the coast
        expect(alphas[outer]).toBe(0) // nothing at the outer edge
        // Seaward, meaning -x, and exactly the band width.
        expect(positions[outer * 3]).toBeCloseTo(positions[inner * 3] - GLOW_WIDTH)
        expect(positions[outer * 3 + 2]).toBeCloseTo(positions[inner * 3 + 2])
      }
    })

    it('hugs the shore rather than a straight line beside it', () => {
      const innerXs = shore.map((_, i) => positions[i * 2 * 3])
      expect(Math.max(...innerXs) - Math.min(...innerXs)).toBeGreaterThan(1)
      // Same line, to within what a Float32Array can hold.
      innerXs.forEach((x, i) => expect(x).toBeCloseTo(shore[i].x, 4))
    })

    it('never reaches the water the boats work in', () => {
      for (let i = 0; i < alphas.length; i++) {
        expect(positions[i * 3]).toBeGreaterThan(SEA.minX)
      }
    })
  })

  describe('filled strips', () => {
    // Both fills are drawn with the default FrontSide material and looked at from above,
    // so a strip wound the wrong way is not a subtly wrong shade — it is invisible, from
    // every camera, in every mode. The land was exactly that for as long as it existed:
    // it read as "the land is drawn dark" until the sea grid started showing through it.
    const upwardNormals = (verts: Float32Array) => {
      const index = stripIndices(verts.length / 3)
      const at = (i: number) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]] as const
      let up = 0
      for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [at(index[t]), at(index[t + 1]), at(index[t + 2])]
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        // y component of u x v; positive is a face you can see from above.
        if (u[2] * v[0] - u[0] * v[2] > 0) up++
      }
      return { up, total: index.length / 3 }
    }

    it('faces the land up, or it is culled and the grid runs over it', () => {
      const { up, total } = upwardNormals(landStrip(shore))
      expect(total).toBeGreaterThan(100)
      expect(up).toBe(total)
    })

    it('faces the coastal glow up too', () => {
      const { up, total } = upwardNormals(coastGlowStrip(shore).positions)
      expect(up).toBe(total)
    })
  })

  describe('islands', () => {
    const islands = islandPaths()

    it('are closed rings out in open water', () => {
      expect(islands.length).toBeGreaterThan(0)
      for (const ring of islands) {
        const first = ring[0]
        const last = ring[ring.length - 1]
        expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeCloseTo(0, 5)
      }
    })

    it('sit clear of the shore, and of where the boats sit', () => {
      const shoreMin = Math.min(...shore.map((p) => p.x))
      for (const ring of islands) {
        for (const p of ring) {
          expect(p.x).toBeLessThan(shoreMin)
          expect(p.x).toBeGreaterThan(SEA.minX)
        }
      }
    })
  })
})
