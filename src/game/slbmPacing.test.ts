import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  BATTERIES,
  CITIES,
  EXPLOSION_MAX_RADIUS,
  FIELD,
  INTERCEPTOR_ARC_RATIO,
  INTERCEPTOR_ARC_SPEED,
  SEA,
  SLBM_FIRST_WAVE,
  SUB_STRIKE_SPEED,
  slbmCountForWave,
  subCountForWave,
} from './constants'
import { arcPointAt, isExposed, makeArc, newSlbm, newSubmarine, stepSubmarine } from './slbm'
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

  // How far ahead of a warhead you have to aim, measured in blast radii, which is the
  // only unit in which the question means anything: a lead of one radius means aiming
  // straight at the target still clips it, and a lead of four means the shot you would
  // naturally take cannot possibly connect.
  function leadInBlasts(wave: number): { median: number; worst: number } {
    const leads: number[] = []
    const point = (m: IncomingMissile, u: number) =>
      arcPointAt(m.start, m.target, m.arc!.apex, u, new Vector3())

    for (const draw of [0.15, 0.5, 0.85]) {
      const sub = newSubmarine(0, 1, () => draw)
      for (const city of CITIES) {
        const warhead = newSlbm(wave, sub, 0, city.id)
        // Engaged at four points along the arc, from early climb to late descent.
        for (const u of [0.25, 0.4, 0.55, 0.7]) {
          const at = point(warhead, u)
          const battery = BATTERIES.reduce((a, b) =>
            Math.abs(b.x - at.x) < Math.abs(a.x - at.x) ? b : a,
          )
          const counter = makeArc(
            new Vector3(battery.x, FIELD.groundY + 0.6, 0),
            at,
            INTERCEPTOR_ARC_SPEED,
            INTERCEPTOR_ARC_RATIO,
            2,
            26,
          )
          const moved = point(warhead, u + counter.duration / warhead.arc!.duration)
          leads.push(moved.distanceTo(at) / EXPLOSION_MAX_RADIUS)
        }
      }
    }
    leads.sort((a, b) => a - b)
    return { median: leads[leads.length >> 1], worst: leads[leads.length - 1] }
  }

  it('asks for a lead you could plausibly judge', () => {
    // At the speed this mode shipped with, the median lead was 3.7 blast radii and the
    // worst near seven: aiming at a warhead was a certain miss, and the aim that would
    // have worked had to be right to within a quarter of itself. Under two radii, a
    // shot taken straight at the target is a near miss rather than nothing, and a rough
    // lead connects — which is the difference between judging a trajectory and guessing.
    const { median, worst } = leadInBlasts(SLBM_FIRST_WAVE)
    expect(median).toBeLessThan(2.2)
    expect(worst).toBeLessThan(4.2)
    // ...but leading is the mode. Too fast and you may as well point at the thing.
    expect(median).toBeGreaterThan(1.2)
  })

  it('still asks for one when the warheads speed up later on', () => {
    expect(leadInBlasts(SLBM_FIRST_WAVE * 3).median).toBeGreaterThan(
      leadInBlasts(SLBM_FIRST_WAVE).median,
    )
  })

  /**
   * The shortest window a boat is ever killable for, stepped through the real state
   * machine rather than worked out from the constants — which is the point, since the
   * window is the sum of four of them and no one of them states it.
   */
  function shortestExposedWindow(): number {
    // The bottom of every random range: the briefest surfacing the design allows.
    const sub = newSubmarine(0, 1, () => 0)
    let exposedFor = 0
    let seen = false
    for (let frame = 0; frame < 60 * 120; frame++) {
      stepSubmarine(sub, STEP, () => 0)
      if (isExposed(sub)) {
        exposedFor += STEP
        seen = true
      } else if (seen) break
    }
    return exposedFor
  }

  /** The longest torpedo run: the far corner of the sea from the nearest battery. */
  function longestStrikeRun(): number {
    let longest = 0
    for (const x of [SEA.minX, SEA.maxX]) {
      for (const z of [-SEA.halfDepth, SEA.halfDepth]) {
        const at = new Vector3(x, 0, z)
        const battery = BATTERIES.reduce((a, b) =>
          Math.abs(b.x - at.x) < Math.abs(a.x - at.x) ? b : a,
        )
        const start = new Vector3(battery.x, FIELD.groundY + 0.6, 0)
        // Apex has no bearing on duration, so the arc's shape parameters do not matter.
        longest = Math.max(longest, makeArc(start, at, SUB_STRIKE_SPEED).duration)
      }
    }
    return longest
  }

  it('gives you time to actually sink a boat that surfaces', () => {
    // The slack is what is left of the window once the torpedo's flight is paid for: the
    // time a player has to notice the boat, choose the weapon and aim. At the speed the
    // mode shipped with, the longest run took 2.6 seconds out of a window as short as
    // 3.3, leaving less than a human reaction — the far boats could not be sunk at all,
    // however well you read them. A second and a half is the floor being held here.
    const slack = shortestExposedWindow() - longestStrikeRun()
    expect(slack).toBeGreaterThan(1.5)
    // And it is still a window, not an open invitation.
    expect(shortestExposedWindow()).toBeLessThan(7)
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
