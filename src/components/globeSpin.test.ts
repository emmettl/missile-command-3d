import { describe, expect, it } from 'vitest'
import {
  FLICK_MAX,
  IDLE_SPIN,
  TILT_DEFAULT,
  TILT_MAX,
  TILT_MIN,
  dragBy,
  newSpin,
  setFlick,
  settle,
} from './globeSpin'

describe('globe spin', () => {
  it('rests tilted towards the north pole', () => {
    // Where the exchange happens: a great circle between northern capitals runs over
    // the Arctic, so the pole has to be in view for the arcs to make sense.
    expect(newSpin().tilt).toBe(TILT_DEFAULT)
    expect(TILT_DEFAULT).toBeGreaterThan(0)
  })

  it('drifts on its own', () => {
    const spin = newSpin()
    expect(settle(spin, 1)).toBeCloseTo(IDLE_SPIN, 3)
  })

  describe('dragging', () => {
    it('follows the pointer both ways', () => {
      const spin = newSpin()
      expect(dragBy(spin, 40, 0)).toBeGreaterThan(0)
      expect(dragBy(spin, -40, 0)).toBeLessThan(0)
    })

    it('brings the pole over when dragged down, and away when dragged up', () => {
      const spin = newSpin()
      dragBy(spin, 0, 30)
      expect(spin.tilt).toBeGreaterThan(TILT_DEFAULT)
      const after = spin.tilt
      dragBy(spin, 0, -60)
      expect(spin.tilt).toBeLessThan(after)
    })

    it('cannot be rolled past its own poles', () => {
      const spin = newSpin()
      for (let i = 0; i < 200; i++) dragBy(spin, 0, 50)
      expect(spin.tilt).toBe(TILT_MAX)
      for (let i = 0; i < 400; i++) dragBy(spin, 0, -50)
      expect(spin.tilt).toBe(TILT_MIN)
    })

    it('leaves yaw to the caller rather than accumulating it', () => {
      const spin = newSpin()
      const a = dragBy(spin, 25, 0)
      const b = dragBy(spin, 25, 0)
      expect(b).toBeCloseTo(a) // same movement, same answer — no internal drift
    })
  })

  describe('letting go', () => {
    it('carries the spin on, then settles back to the drift', () => {
      const spin = newSpin()
      setFlick(spin, 0.05, 1 / 60) // a brisk drag

      const justAfter = settle(spin, 1 / 60) * 60
      expect(justAfter).toBeGreaterThan(IDLE_SPIN * 2)

      // Perceptibly settled within a couple of seconds; fully zeroed a few after that.
      for (let i = 0; i < 60 * 2; i++) settle(spin, 1 / 60)
      expect(Math.abs(spin.velocity)).toBeLessThan(IDLE_SPIN)
      for (let i = 0; i < 60 * 8; i++) settle(spin, 1 / 60)
      expect(spin.velocity).toBe(0)
      expect(settle(spin, 1)).toBeCloseTo(IDLE_SPIN, 3)
    })

    it('caps how fast a swipe can throw it', () => {
      const spin = newSpin()
      setFlick(spin, 40, 1 / 120) // an absurd flick
      expect(spin.velocity).toBe(FLICK_MAX)
      setFlick(spin, -40, 1 / 120)
      expect(spin.velocity).toBe(-FLICK_MAX)
    })

    it('can be thrown backwards, and still comes back to drifting forwards', () => {
      const spin = newSpin()
      setFlick(spin, -0.08, 1 / 60)
      expect(settle(spin, 1 / 60)).toBeLessThan(0) // going the other way for now
      for (let i = 0; i < 60 * 5; i++) settle(spin, 1 / 60)
      expect(settle(spin, 1 / 60)).toBeGreaterThan(0)
    })

    it('decays at the same rate however often it is sampled', () => {
      const coarse = newSpin()
      const fine = newSpin()
      setFlick(coarse, 0.05, 1 / 60)
      setFlick(fine, 0.05, 1 / 60)
      for (let i = 0; i < 30; i++) settle(coarse, 1 / 30)
      for (let i = 0; i < 240; i++) settle(fine, 1 / 240)
      expect(coarse.velocity).toBeCloseTo(fine.velocity, 4)
    })

    it('ignores a frame with no time in it', () => {
      const spin = newSpin()
      setFlick(spin, 0.05, 0)
      expect(spin.velocity).toBe(0)
    })
  })
})
