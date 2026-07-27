import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  FIELD,
  SEA,
  SLBM_APEX_MAX,
  SLBM_APEX_MIN,
  SUB_SALVO_INTERVAL,
  SUB_SURFACING_TIME,
  modeForWave,
  slbmWarningDue,
  subCountForWave,
} from './constants'
import {
  EXPOSED_THRESHOLD,
  arcLift,
  arcPointAt,
  arcVelocityAt,
  exposure,
  isExposed,
  makeArc,
  newSlbm,
  newSubmarine,
  positionAfter,
  salvoRemaining,
  station,
  stepSubmarine,
} from './slbm'
import type { Submarine } from './types'

const v = () => new Vector3()

describe('modeForWave', () => {
  it('opens classic and turns the war offshore every third wave from the third', () => {
    // Wave 5 is the gun's slot; the full rotation is pinned in bombers.test.ts.
    expect([1, 2, 3, 4, 6, 7, 8, 9].map(modeForWave)).toEqual([
      'classic',
      'classic',
      'slbm',
      'classic',
      'slbm',
      'classic',
      'classic',
      'slbm',
    ])
  })

  it('warns through the tail of the wave before an attack, and only then', () => {
    // Wave 2 leads into the first SLBM wave; warn once it has nothing left to launch.
    expect(slbmWarningDue(2, 12, 12)).toBe(true)
    expect(slbmWarningDue(2, 13, 12)).toBe(true) // stragglers still in the air
    expect(slbmWarningDue(2, 5, 12)).toBe(false) // still mid-fight
    // Wave 1 is two waves out — too early to be shouting about it.
    expect(slbmWarningDue(1, 10, 10)).toBe(false)
    // ...and never during the attack itself.
    expect(slbmWarningDue(3, 9, 9)).toBe(false)
    expect(slbmWarningDue(5, 18, 18)).toBe(true) // wave 6 is offshore
    expect(slbmWarningDue(4, 16, 16)).toBe(false)
  })

  it('does not warn before a wave has been set up', () => {
    expect(slbmWarningDue(2, 0, 0)).toBe(false)
  })

  it('sends more boats as the waves climb, up to a limit', () => {
    expect(subCountForWave(3)).toBe(2)
    expect(subCountForWave(12)).toBeGreaterThan(subCountForWave(3))
    expect(subCountForWave(60)).toBeLessThanOrEqual(5)
  })
})

describe('ballistic arcs', () => {
  const start = new Vector3(-80, 1, 0)
  const target = new Vector3(16, 0.4, 0)

  it('lifts nothing at either end and the full apex at the top', () => {
    expect(arcLift(40, 0)).toBe(0)
    expect(arcLift(40, 1)).toBe(0)
    expect(arcLift(40, 0.5)).toBe(40)
    expect(arcLift(40, 0.25)).toBeCloseTo(arcLift(40, 0.75)) // symmetric
  })

  it('starts at the launcher and ends on the target', () => {
    const arc = makeArc(start, target, 15)
    expect(arcPointAt(start, target, arc.apex, 0, v()).distanceTo(start)).toBeCloseTo(0)
    expect(arcPointAt(start, target, arc.apex, 1, v()).distanceTo(target)).toBeCloseTo(0)
  })

  it('climbs well clear of the straight line between them', () => {
    const arc = makeArc(start, target, 15)
    const mid = arcPointAt(start, target, arc.apex, 0.5, v())
    const chord = v().lerpVectors(start, target, 0.5)
    expect(mid.y - chord.y).toBeCloseTo(arc.apex)
    // High enough to read as ballistic against a sky that tops out at FIELD.skyY.
    expect(mid.y).toBeGreaterThan(FIELD.skyY)
  })

  it('holds the apex within its limits however long or short the shot', () => {
    const far = makeArc(new Vector3(-118, 1, 0), new Vector3(22, 0, 0), 15)
    const near = makeArc(new Vector3(-40, 1, 0), new Vector3(-34, 0, 0), 15)
    expect(far.apex).toBeLessThanOrEqual(SLBM_APEX_MAX)
    expect(near.apex).toBeGreaterThanOrEqual(SLBM_APEX_MIN)
    expect(far.apex).toBeGreaterThan(near.apex)
  })

  it('takes longer over a longer range at the same speed', () => {
    const far = makeArc(new Vector3(-118, 1, 0), target, 15)
    const near = makeArc(new Vector3(-50, 1, 0), target, 15)
    expect(far.duration).toBeGreaterThan(near.duration)
    expect(near.duration).toBeCloseTo(new Vector3(-50, 1, 0).distanceTo(target) / 15)
  })

  it('clamps rather than flying off the end of the arc', () => {
    const arc = makeArc(start, target, 15)
    expect(arcPointAt(start, target, arc.apex, 2, v()).distanceTo(target)).toBeCloseTo(0)
    expect(arcPointAt(start, target, arc.apex, -1, v()).distanceTo(start)).toBeCloseTo(0)
  })

  it('rises, levels off and falls', () => {
    const arc = makeArc(start, target, 15)
    const climb = arcVelocityAt(start, target, arc, 0.1, v()).y
    const top = arcVelocityAt(start, target, arc, 0.5, v()).y
    expect(climb).toBeGreaterThan(0)
    expect(arcVelocityAt(start, target, arc, 0.9, v()).y).toBeLessThan(0)
    // Levelling off at the top — not exactly zero, since the target sits below the
    // launcher and the whole arc is tilted down by that much.
    expect(Math.abs(top)).toBeLessThan(Math.abs(climb) / 10)
    // Ground track is unaffected by the lift.
    const early = arcVelocityAt(start, target, arc, 0.1, v())
    const late = arcVelocityAt(start, target, arc, 0.9, v())
    expect(early.x).toBeCloseTo(late.x)
  })
})

describe('leading a shot', () => {
  it('says where a warhead will be, which is where it then is', () => {
    const sub = newSubmarine(0, 1, () => 0.5)
    const m = newSlbm(3, sub, 16, 'city-5')
    m.arc!.elapsed = m.arc!.duration * 0.3

    const lead = 1.4
    const predicted = positionAfter(m, lead, v())

    // Fly the missile on by that much and it arrives where the prediction said.
    m.arc!.elapsed += lead
    const actual = arcPointAt(m.start, m.target, m.arc!.apex, m.arc!.elapsed / m.arc!.duration, v())
    expect(predicted.distanceTo(actual)).toBeCloseTo(0)
  })

  it('is somewhere else entirely from where the warhead is now', () => {
    const sub = newSubmarine(0, 1, () => 0.5)
    const m = newSlbm(3, sub, 16, 'city-5')
    m.arc!.elapsed = m.arc!.duration * 0.5
    // The whole mechanic: aim at the missile and you miss it.
    expect(positionAfter(m, 1.5, v()).distanceTo(m.pos)).toBeGreaterThan(5)
  })
})

describe('submarines', () => {
  // A submarine that always draws the midpoint of every random range.
  const rng = () => 0.5

  function surfaced(): Submarine {
    const sub = newSubmarine(0, 1, rng)
    sub.phase = 'firing'
    sub.salvoLeft = 3
    sub.timer = Infinity
    return sub
  }

  it('stations boats out at sea, spread through the water', () => {
    const spots = [0, 1, 2].map((i) => station(i, 3, Math.random))
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(SEA.minX)
      expect(s.x).toBeLessThanOrEqual(SEA.maxX)
      expect(Math.abs(s.z)).toBeLessThanOrEqual(SEA.halfDepth)
    }
    expect(spots[0].x).toBeLessThan(spots[2].x) // spread along the band, not stacked
  })

  it('cannot be touched while it is running deep', () => {
    const sub = newSubmarine(0, 1, rng)
    expect(sub.phase).toBe('submerged')
    expect(exposure(sub)).toBe(0)
    expect(isExposed(sub)).toBe(false)
  })

  it('becomes killable partway through breaching, not only once fully up', () => {
    const sub = newSubmarine(0, 1, rng)
    sub.phase = 'surfacing'
    sub.timer = SUB_SURFACING_TIME * (1 - EXPOSED_THRESHOLD) - 0.01
    expect(isExposed(sub)).toBe(true)
    sub.timer = SUB_SURFACING_TIME // only just started to rise
    expect(isExposed(sub)).toBe(false)
  })

  it('runs the whole cycle: surfaces, empties a salvo, dives and moves on', () => {
    const sub = newSubmarine(0, 1, rng)
    sub.timer = 0.01

    const phases: string[] = []
    let shots = 0
    for (let i = 0; i < 4000; i++) {
      if (stepSubmarine(sub, 1 / 60, rng)) shots++
      if (phases[phases.length - 1] !== sub.phase) phases.push(sub.phase)
      if (phases.length >= 4) break
    }

    expect(phases).toEqual(['surfacing', 'firing', 'diving', 'submerged'])
    expect(shots).toBeGreaterThanOrEqual(2)
    expect(shots).toBeLessThanOrEqual(3)
  })

  it('spaces the shots of a salvo out', () => {
    const sub = surfaced()
    let firstShot = -1
    let secondShot = -1
    for (let i = 0; i < 600; i++) {
      if (stepSubmarine(sub, 1 / 60, rng)) {
        if (firstShot < 0) firstShot = i
        else if (secondShot < 0) secondShot = i
      }
    }
    expect((secondShot - firstShot) / 60).toBeCloseTo(SUB_SALVO_INTERVAL, 1)
  })

  it('slips away to a new station while it is out of sight', () => {
    const sub = newSubmarine(0, 1, Math.random)
    sub.phase = 'diving'
    sub.timer = 0.01
    const before = sub.pos.clone()
    stepSubmarine(sub, 1 / 60, Math.random)
    expect(sub.phase).toBe('submerged')
    expect(sub.pos.distanceTo(before)).toBeGreaterThan(0)
    expect(sub.pos.x).toBeGreaterThanOrEqual(SEA.minX)
    expect(sub.pos.x).toBeLessThanOrEqual(SEA.maxX)
  })

  it('owes the wave nothing once it is dead', () => {
    const sub = surfaced()
    expect(salvoRemaining(sub)).toBe(3)
    sub.alive = false
    expect(stepSubmarine(sub, 1, rng)).toBe(false)
    sub.phase = 'submerged'
    expect(salvoRemaining(sub)).toBe(0)
  })
})

describe('newSlbm', () => {
  it('launches from the boat and lands on the coast, in the engagement plane', () => {
    const sub = newSubmarine(0, 1, () => 0.9)
    const m = newSlbm(6, sub, 11, 'city-4')
    expect(m.kind).toBe('slbm')
    expect(m.subId).toBe(sub.id)
    expect(m.start.x).toBeCloseTo(sub.pos.x)
    expect(m.start.z).toBeCloseTo(sub.pos.z)
    expect(m.target.x).toBe(11)
    // Whatever depth the boat sits at, the shot converges on the plane the player aims in.
    expect(m.target.z).toBe(0)
    expect(m.arc).toBeDefined()
  })

  it('flies faster in later waves', () => {
    const sub = newSubmarine(0, 1, () => 0.5)
    const early = newSlbm(3, sub, 0, 'c')
    const late = newSlbm(12, sub, 0, 'c')
    expect(late.speed).toBeGreaterThan(early.speed)
    expect(late.arc!.duration).toBeLessThan(early.arc!.duration)
  })
})
