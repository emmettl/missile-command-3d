import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  INTERCEPTOR_ARC_RATIO,
  INTERCEPTOR_ARC_SPEED,
  SLBM_FIRST_WAVE,
  slbmCountForWave,
  subCountForWave,
} from './constants'
import { makeArc, newSlbm, newSubmarine, stepSubmarine } from './slbm'
import type { IncomingMissile } from './types'

// How an SLBM wave actually paces, simulated rather than guessed at.
//
// The mode's whole premise is that you can see the shot coming and the difficulty is
// judging where it will be — which only works if a warhead is in the air long enough to
// read, and if the wave lasts long enough to learn anything from. Both of those are
// emergent: they fall out of the boats' cycle, the salvo spacing, the count and the
// speed, and no single constant states them. So they are measured here, and these are
// the numbers that break if someone retunes one of the constants in isolation.

const STEP = 1 / 60

interface WaveStats {
  /** Seconds from the wave beginning to the last warhead landing. */
  duration: number
  /** Seconds each warhead spent in the air. */
  flights: number[]
  launched: number
}

function simulateWave(wave: number, seed = 0.5): WaveStats {
  // A fixed draw for every random choice, so the figures are the midpoint of the design
  // rather than one sample of it.
  const rng = () => seed
  const subCount = subCountForWave(wave)
  const subs = Array.from({ length: subCount }, (_, i) => newSubmarine(i, subCount, rng))
  const toSpawn = slbmCountForWave(wave)

  const live: IncomingMissile[] = []
  const flights: number[] = []
  let launched = 0
  let t = 0

  // Generous ceiling; the assertions below are what actually bound this.
  for (let frame = 0; frame < 60 * 600; frame++) {
    t += STEP

    for (const sub of subs) {
      if (stepSubmarine(sub, STEP, rng) && launched < toSpawn) {
        launched++
        live.push(newSlbm(wave, sub, 0, 'city-3'))
      }
    }

    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i]
      m.arc!.elapsed += STEP
      if (m.arc!.elapsed >= m.arc!.duration) {
        flights.push(m.arc!.duration)
        live.splice(i, 1)
      }
    }

    if (launched >= toSpawn && live.length === 0) break
  }

  return { duration: t, flights, launched }
}

describe('SLBM pacing', () => {
  const first = simulateWave(SLBM_FIRST_WAVE)

  it('launches everything the wave is owed', () => {
    expect(first.launched).toBe(slbmCountForWave(SLBM_FIRST_WAVE))
    expect(first.flights).toHaveLength(first.launched)
  })

  it('lasts long enough to settle into', () => {
    // This wave ran itself out in 19 seconds when the mode first shipped — over before a
    // player had worked out what they were looking at, let alone learned to lead a lob.
    // Roughly half again as long as a classic wave is the point being held here.
    expect(first.duration).toBeGreaterThan(32)
    expect(first.duration).toBeLessThan(120) // ...but a wave is still a wave
  })

  it('keeps each warhead in the air long enough to read and lead', () => {
    const shortest = Math.min(...first.flights)
    expect(shortest).toBeGreaterThan(6)
  })

  it('leaves room to intercept: the counter-missile is the faster of the two', () => {
    // A shot from a battery to the middle of the field, against a warhead crossing it.
    const battery = new Vector3(0, 0.6, 0)
    const meet = new Vector3(-45, 30, 0)
    const counter = makeArc(battery, meet, INTERCEPTOR_ARC_SPEED, INTERCEPTOR_ARC_RATIO, 2, 26)

    const sub = newSubmarine(0, 1, () => 0.5)
    const warhead = newSlbm(SLBM_FIRST_WAVE, sub, 0, 'city-3')

    // Whatever the player has to lead by, it has to be less than the flight they are
    // leading — otherwise the shot cannot be taken at all.
    expect(counter.duration).toBeLessThan(warhead.arc!.duration / 2)
  })

  it('escalates by pressure rather than by length', () => {
    const late = simulateWave(SLBM_FIRST_WAVE * 3)
    // A later wave puts more boats to sea, so it delivers considerably more warheads
    // without dragging on — denser, not longer. What it must not do is get so brisk
    // that it is back to being over before it registers.
    expect(late.launched).toBeGreaterThan(first.launched * 1.5)
    expect(late.duration).toBeGreaterThan(28)
    expect(late.duration).toBeLessThan(150)
  })

  it('keeps late-wave arcs readable too, however much faster they fly', () => {
    // Speed climbs with the wave; it must not climb so far that the arc stops being
    // something you can watch and judge.
    const late = simulateWave(SLBM_FIRST_WAVE * 4)
    expect(Math.min(...late.flights)).toBeGreaterThan(4.5)
  })
})
