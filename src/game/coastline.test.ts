import { describe, expect, it } from 'vitest'
import { BATTERIES, SEA } from './constants'
import {
  CONTOUR_OFFSETS,
  SHORE_HALF_LENGTH,
  SHORE_WANDER,
  SHORE_X,
  coastPath,
  contourPaths,
  islandPaths,
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
