import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  ARC_LIFT,
  type Exchange,
  arcPoint,
  inFlight,
  newExchange,
  slerpDir,
  stepExchange,
} from './globeArcs'

const R = 6
const v = () => new Vector3()
// Deterministic stand-in for Math.random, cycling through fixed draws.
function seq(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('slerpDir', () => {
  it('walks the great circle from one point to the other', () => {
    const a = new Vector3(1, 0, 0)
    const b = new Vector3(0, 0, 1)
    expect(slerpDir(a, b, 0, v()).distanceTo(a)).toBeCloseTo(0)
    expect(slerpDir(a, b, 1, v()).distanceTo(b)).toBeCloseTo(0)
    const mid = slerpDir(a, b, 0.5, v())
    expect(mid.length()).toBeCloseTo(1) // stays on the sphere
    expect(mid.angleTo(a)).toBeCloseTo(mid.angleTo(b))
  })

  it('falls back rather than dividing by nothing for coincident points', () => {
    const a = new Vector3(1, 0, 0)
    const out = slerpDir(a, a.clone(), 0.5, v())
    expect(Number.isFinite(out.x)).toBe(true)
    expect(out.distanceTo(a)).toBeCloseTo(0)
  })

  it('still draws a path between opposite sides of the world', () => {
    // Antipodal points are joined by infinitely many great circles, and the weighted
    // sum cancels to nothing — a real pair of cities can land close enough to this.
    for (const a of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0.3, -0.5, 0.81).normalize()]) {
      const b = a.clone().negate()
      const mid = slerpDir(a, b, 0.5, v())
      expect(mid.length()).toBeCloseTo(1)
      expect(mid.angleTo(a)).toBeCloseTo(Math.PI / 2)
      expect(slerpDir(a, b, 1, v()).distanceTo(b)).toBeCloseTo(0, 4)
    }
  })
})

describe('arcPoint', () => {
  const from = new Vector3(1, 0, 0)
  const to = new Vector3(0, 0, 1)

  it('starts and ends on the surface', () => {
    expect(arcPoint(from, to, 0, R, v()).length()).toBeCloseTo(R)
    expect(arcPoint(from, to, 1, R, v()).length()).toBeCloseTo(R)
  })

  it('lifts clear of the surface in between', () => {
    const mid = arcPoint(from, to, 0.5, R, v())
    expect(mid.length()).toBeGreaterThan(R)
    expect(mid.length()).toBeLessThanOrEqual(R * (1 + ARC_LIFT))
  })

  it('arcs higher the further it has to go', () => {
    const near = arcPoint(from, new Vector3(1, 0.2, 0).normalize(), 0.5, R, v()).length()
    const far = arcPoint(from, from.clone().negate(), 0.5, R, v()).length()
    expect(far).toBeGreaterThan(near)
  })

  it('clamps instead of running off the end', () => {
    expect(arcPoint(from, to, 2, R, v()).distanceTo(arcPoint(from, to, 1, R, v()))).toBeCloseTo(0)
  })
})

describe('exchanges', () => {
  it('always picks two different places', () => {
    for (let i = 0; i < 200; i++) {
      const ex = newExchange()
      expect(ex.from.distanceTo(ex.to)).toBeGreaterThan(0.01)
    }
  })

  it('holds on the pad before launching, so they do not all fly at once', () => {
    const ex = newExchange(seq(0.1, 0.9, 0.5))
    expect(ex.progress).toBeLessThanOrEqual(0)
    expect(inFlight(ex)).toBe(false)
  })

  it('reports the frame it lands, once', () => {
    const ex: Exchange = { from: new Vector3(1, 0, 0), to: new Vector3(0, 0, 1), progress: 0.9, duration: 1, flash: 0 }
    expect(stepExchange(ex, 0.05)).toBe(false)
    expect(stepExchange(ex, 0.2)).toBe(true) // crosses 1
    expect(stepExchange(ex, 0.05)).toBe(false) // now burning its flash
    expect(ex.progress).toBe(1)
    expect(ex.flash).toBeGreaterThan(0)
  })

  it('recycles into a new pair once the flash burns out', () => {
    const ex: Exchange = { from: new Vector3(1, 0, 0), to: new Vector3(0, 0, 1), progress: 1, duration: 1, flash: 0.1 }
    stepExchange(ex, 0.2)
    expect(ex.flash).toBeLessThanOrEqual(0)
    expect(ex.progress).toBeLessThanOrEqual(0) // waiting to launch again
  })

  it('runs indefinitely without stalling', () => {
    const ex = newExchange()
    let landings = 0
    for (let i = 0; i < 20000; i++) if (stepExchange(ex, 1 / 60)) landings++
    expect(landings).toBeGreaterThan(10)
  })
})
